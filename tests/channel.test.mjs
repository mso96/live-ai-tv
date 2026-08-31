import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerQueue, parsePlaylist } from '../app/lib/playerQueue.ts';
import { createChannelPlayer } from '../app/lib/channelPlayer.ts';
import { chooseDirection, buildPrompt } from '../worker/prompt.ts';
import { validateWebsiteUrl, readWebsite } from '../worker/website.ts';

const clips = Array.from({length:7}, (_,i) => ({id:String(i+1),src:`/videos/${i+1}.mp4`}));
const report = {id:'generated-new',src:'/videos/generated-new.mp4'};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('normal seven-clip loop and random entry point', () => {
  const q = new PlayerQueue(); q.update(clips);
  assert.equal(q.first(0.65).id, '5');
  q.played(clips[0]);
  const ids = [];
  for (let i=0;i<14;i++) { const clip=q.next(); ids.push(clip.id); q.played(clip); }
  assert.deepEqual(ids, ['2','3','4','5','6','7','1','2','3','4','5','6','7','1']);
});
test('report goes next, then normal order resumes; polling does not replay priority', () => {
  const q=new PlayerQueue(); q.update(clips); q.played(clips[3]);
  q.prioritize(report); q.update(clips); assert.equal(q.current,'4');
  assert.equal(q.next().id,report.id); q.played(report);
  q.update([...clips,report]); assert.equal(q.next().id,'5');
});
test('priority at the end of normal list is not immediately repeated', () => {
  const q=new PlayerQueue(); q.update(clips); q.played(clips[6]); q.prioritize(report);
  q.played(q.next()); assert.equal(q.next().id,'1');
});
test('newly discovered reports prioritized without interrupting active clip', () => {
  const q=new PlayerQueue(); q.update(clips); q.played(clips[2]);
  q.update([...clips,report]); assert.equal(q.current,'3'); assert.equal(q.next().id,report.id);
  q.fail(report); assert.equal(q.next().id,'4');
});
test('invalid playlist and unsafe media schemes rejected', () => {
  assert.throws(()=>parsePlaylist([{id:'x',src:'javascript:bad'}]));
  assert.throws(()=>parsePlaylist({}));
});

class Video extends EventTarget {
  src=''; muted=false; paused=true; ended=false; currentTime=0; error=null;
  blockSound=false; broken=new Set(); plays=[];
  load() { this.ended=false; this.currentTime=0; this.error=null; }
  pause() { this.paused=true; }
  removeAttribute() { this.src=''; }
  async play() {
    this.plays.push({src:this.src,muted:this.muted});
    if(this.blockSound && !this.muted) throw new DOMException('Autoplay blocked','NotAllowedError');
    if(this.broken.has(this.src)) throw new DOMException('Bad video','NotSupportedError');
    this.paused=false;
  }
  finish() { this.ended=true; this.dispatchEvent(new Event('ended')); }
}
function channel() {
  const videos=[new Video(),new Video()]; const played=[]; const sounds=[];
  let active=0;
  const player=createChannelPlayer(videos,{visible:s=>active=s,sound:s=>sounds.push(s),signal:()=>{},playing:c=>played.push(c.id)});
  return {videos,played,sounds,player,active:()=>active};
}
test('ready report cuts immediately before current ends, then normal sequence resumes with mute policy', async () => {
  const c=channel(); c.videos.forEach(v=>v.blockSound=true);
  c.player.update(clips); await tick();
  const old=c.videos[c.active()]; const before=old.src;
  const normalNext=c.videos[1-c.active()].src;
  c.player.prioritize(report);
  assert.equal(old.src,before); assert.equal(old.paused,false);
  assert.equal(c.videos[1-c.active()].src,report.src);
  await tick();
  assert.equal(old.ended,false); assert.equal(old.paused,true);
  assert.equal(c.played.at(-1),report.id); assert.equal(c.videos[c.active()].muted,true);
  const playCount=c.videos[c.active()].plays.length;
  c.player.prioritize(report); // Late completion notification must not restart a report.
  assert.equal(c.videos[c.active()].plays.length,playCount);
  assert.equal(c.videos[1-c.active()].src,normalNext);
  c.player.enableSound(); c.videos.forEach(v=>v.blockSound=false);
  c.videos[c.active()].finish(); await tick();
  assert.equal(c.videos[c.active()].src,normalNext); assert.equal(c.videos[c.active()].muted,false);
  c.player.dispose();
});
test('inactive preload errors do not cut active playback; failed report is skipped', async () => {
  const c=channel(); c.player.update(clips); await tick();
  const current=c.active(); const id=c.played.at(-1);
  c.videos[1-current].dispatchEvent(new Event('error')); await tick();
  assert.equal(c.active(),current); assert.equal(c.played.at(-1),id);
  c.videos.forEach(v=>v.broken.add(report.src)); c.player.prioritize(report);
  await tick();
  assert.equal(c.active(),current); assert.equal(c.played.at(-1),id);
  assert.equal(c.videos[current].paused,false);
  c.videos[current].finish(); await tick();
  assert.notEqual(c.played.at(-1),report.id); assert.ok(c.played.length>1);
  c.player.dispose();
});
test('urgent report keeps current picture and audio until the new video can actually play', async () => {
  const c=channel(); c.player.update(clips); await tick();
  const previous=c.active(); const old=c.videos[previous];
  const incoming=c.videos[1-previous]; const originalPlay=incoming.play.bind(incoming);
  let release;
  incoming.play=async () => { await new Promise(resolve=>release=resolve); await originalPlay(); };
  c.player.prioritize(report);
  assert.equal(c.active(),previous); assert.equal(old.paused,false);
  release(); await tick();
  assert.equal(c.played.at(-1),report.id); assert.equal(old.paused,true); assert.equal(old.ended,false);
  c.player.dispose();
});
test('completion arriving during an in-flight normal transition is not lost', async () => {
  const c=channel(); c.player.update(clips); await tick();
  const incoming=c.videos[1-c.active()]; const originalPlay=incoming.play.bind(incoming);
  let release;
  incoming.play=async () => { await new Promise(resolve=>release=resolve); await originalPlay(); };
  c.videos[c.active()].finish();
  c.player.prioritize(report);
  release(); await tick();
  assert.equal(c.played.at(-1),report.id);
  c.player.dispose();
});
test('only the active slot is audible, including sound clicks during an immediate cut', async () => {
  const c=channel(); c.player.update(clips); await tick();
  const old=c.videos[c.active()]; const incoming=c.videos[1-c.active()];
  assert.equal(old.muted,false); assert.equal(incoming.muted,true);
  const originalPlay=incoming.play.bind(incoming); let release;
  incoming.play=async () => { await originalPlay(); await new Promise(resolve=>release=resolve); };
  c.player.prioritize(report); await tick();
  assert.equal(old.paused,false); assert.equal(incoming.paused,false);
  assert.equal(incoming.muted,true);
  assert.equal(c.videos.filter(v=>!v.paused&&!v.muted).length,1);
  c.player.enableSound();
  assert.equal(old.muted,false); assert.equal(incoming.muted,true);
  release(); await tick();
  assert.equal(old.paused,true); assert.equal(old.muted,true);
  assert.equal(incoming.muted,false);
  assert.equal(c.videos.filter(v=>!v.paused&&!v.muted).length,1);
  c.player.dispose();
});
test('muted incoming report stays muted after cut until the viewer enables sound', async () => {
  const c=channel(); c.videos.forEach(v=>v.blockSound=true);
  c.player.update(clips); await tick();
  c.player.prioritize(report); await tick();
  assert.equal(c.played.at(-1),report.id);
  assert.ok(c.videos.every(v=>v.muted));
  c.player.enableSound();
  assert.equal(c.videos[c.active()].muted,false);
  assert.equal(c.videos[1-c.active()].muted,true);
  c.player.dispose();
});
test('dispose prevents callbacks from pending play', async () => {
  const c=channel(); c.player.update(clips); c.player.dispose(); await tick();
  assert.deepEqual(c.played,[]); assert.ok(c.videos.every(v=>v.paused));
});
test('public website URLs only, including normalized loopback and credential rejection', () => {
  for (const url of ['file:///etc/passwd','http://localhost','http://127.1','http://2130706433','http://[::1]','https://a.internal','https://user:pass@example.com','https://example.com:444']) {
    assert.throws(()=>validateWebsiteUrl(url),url);
  }
  assert.equal(validateWebsiteUrl('https://www.hetzner.com/#about').href,'https://www.hetzner.com/');
});
test('DNS resolving to private address is rejected before website fetch', async () => {
  const original=globalThis.fetch; const calls=[];
  globalThis.fetch=async url=> {calls.push(url); return Response.json({Answer:[{type:1,data:'10.0.0.1'}]});};
  try { await assert.rejects(readWebsite('https://public-looking.com'),/public internet/); assert.equal(calls.length,2); }
  finally {globalThis.fetch=original;}
});
test('simple scenes avoid recent repetition and use one short exact English narration', () => {
  const history=[];
  for(let i=0;i<30;i++) {
    const direction=chooseDirection(history);
    for(const key of Object.keys(direction)) assert.ok(!history.slice(0,8).some(d=>d[key]===direction[key]));
    assert.ok(!('countdown' in direction)); assert.ok(!('title' in direction));
    history.unshift(direction);
  }
  const source={url:'https://example.com',title:'Widgets',description:'For accountants',passages:['Exact invoice export feature']};
  const prompt=buildPrompt(source,history[0]);
  for(const text of ['Exact invoice export feature','15 seconds','No presenter','No studio','No countdown number','one continuous shot','one visual joke','clear, natural English','VHS effects must not distort speech','untrusted','1990s']) assert.ok(prompt.includes(text),text);
  for(const direction of history) {
    const script=buildPrompt(source,direction);
    const voice=script.match(/Say exactly this sentence once:\n"([^"]+)"/)[1];
    assert.ok(voice.split(/\s+/).length<=10,voice);
    for (const rule of ['Exactly one off-screen British narrator', 'Start at 2 seconds and finish by 7 seconds', 'Silence before and after', 'One voice track only', 'No overlapping voices', 'Everyone on screen stays silent', 'VHS is visual only']) assert.ok(script.includes(rule),rule);
    assert.equal((voice.match(/\./g)||[]).length,1);
    assert.equal((script.match(/SCENE:/g)||[]).length,1);
  }
  assert.ok(buildPrompt(source,{concept:'trees'}).includes('trees have been planted to spell the company name'));
  const legacy={...history[0],countdown:77,title:'OLD COUNTDOWN TITLE'};
  const migrated=buildPrompt(source,legacy);
  assert.ok(!migrated.includes('OLD COUNTDOWN TITLE')); assert.ok(!migrated.includes('"countdown":'));
  const long=buildPrompt({url:'https://example.com/'+ 'a'.repeat(2000),title:'T'.repeat(180),description:'D'.repeat(500),passages:Array(18).fill('specific product detail '.repeat(30))},history[0]);
  assert.ok(long.length<=3200);
});
