"use client";

import { useEffect, useRef, useState } from "react";
import InfiniteTV from "./components/InfiniteTV";
import { parsePlaylist, type PlaylistItem } from "./lib/playerQueue";

type Story = { title: string; standfirst: string; section: string; time: string };

const stories: Story[] = [
  { title: "Government denies moon is becoming too confident", standfirst: "Ministers insist the moon remains a distant, neutral body despite recent reports of swaggering.", section: "NEWS", time: "12 mins ago" },
  { title: "Experts warn trousers could remember previous owners", standfirst: "A leading panel has urged the public to approach second-hand trousers with appropriate caution.", section: "SCIENCE", time: "28 mins ago" },
  { title: "Council launches investigation into aggressive bread", standfirst: "Officials in Kent say a crusty situation has been allowed to escalate beyond all reasonable limits.", section: "LOCAL", time: "41 mins ago" },
  { title: "Seven arrested in nationwide spoon incident", standfirst: "Police have recovered 14 teaspoons and one item described only as ‘deeply suspicious’.", section: "UK", time: "1 hr ago" },
  { title: "Scientists discover Birmingham may be thinking", standfirst: "The city’s thoughts are believed to be slow, regional and possibly about a bus timetable.", section: "SCIENCE", time: "2 hrs ago" },
  { title: "Man claims local roundabout has been following him", standfirst: "David Pike, 43, says the traffic island has appeared outside three separate supermarkets.", section: "STRANGE", time: "3 hrs ago" },
];

export default function Home() {
  const [selected, setSelected] = useState<Story | null>(null);
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [sent, setSent] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [readyClip, setReadyClip] = useState<PlaylistItem>();
  const generation = useRef<AbortController | null>(null);
  useEffect(() => () => generation.current?.abort(), []);
  const visibleStories = stories.filter((story) => story.title.toLowerCase().includes(search.toLowerCase()));

  const openStory = (story: Story) => { setSelected(story); setPlaying(false); window.scrollTo({ top: 0 }); };
  const sendWebsite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (generation.current) return;
    const abort = new AbortController();
    generation.current = abort;
    setSent(true);
    setGenerationStatus("READING WEBSITE — PREPARING A HIGHLY SERIOUS REPORT...");
    try {
      const response = await fetch("/api/generate", { method: "POST", signal: abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ url: siteUrl }) });
      const result = await response.json() as { jobId?: string; error?: string };
      if (!response.ok || !result.jobId) throw new Error(result.error || "Report unavailable");
      const deadline = Date.now() + 10 * 60 * 1000;
      setGenerationStatus("REPORT RECEIVED — WAITING FOR THE NEXT TRANSMISSION...");
      let failures = 0;
      while (!abort.signal.aborted && Date.now() < deadline) {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
          const timer = setTimeout(() => { abort.signal.removeEventListener("abort", cancel); resolve(); }, 2000);
          abort.signal.addEventListener("abort", cancel, { once: true });
        });
        const statusResponse = await fetch(`/api/generate/${result.jobId}`, { cache: "no-store", signal: abort.signal });
        const status = await statusResponse.json() as { status?: string; error?: string; clip?: PlaylistItem };
        if (status.status === "failed") throw new Error("REPORT FAILED — LIVE TV CONTINUES");
        if (!statusResponse.ok) {
          if (++failures < 5 && statusResponse.status >= 500) continue;
          throw new Error(status.error || "REPORT FAILED — LIVE TV CONTINUES");
        }
        failures = 0;
        if (status.status === "ready") {
          const [clip] = parsePlaylist([status.clip]);
          setReadyClip(clip);
          setGenerationStatus("REPORT READY — NEXT ON LIVE TV");
          return;
        }
      }
      throw new Error("REPORT TAKING TOO LONG — LIVE TV CONTINUES");
    } catch (error) {
      if (!abort.signal.aborted) setGenerationStatus(error instanceof Error ? error.message : "REPORT FAILED — LIVE TV CONTINUES");
    } finally {
      if (!abort.signal.aborted) setSent(false);
      generation.current = null;
    }
  };

  return (
    <main className="portal-page">
      <div className="old-noise" aria-hidden="true" />
      <div className="portal-shell">
        <header className="site-header"><button className="wordmark" onClick={() => setSelected(null)}>the<span>morning</span>post<span className="dot">.co.uk</span></button><a className="header-ad powered-ad" href="https://prodia.com/" target="_blank" rel="noreferrer"><img src="/assets/powered-by-prodia-badge.png" alt="Powered by Prodia" /></a></header>
        <nav className="main-nav">{["HOME", "NEWS", "UK", "WORLD", "POLITICS", "BUSINESS", "SPORT", "ENTERTAINMENT", "LIFE"].map((item) => <a href={`#${item.toLowerCase()}`} key={item}>{item}</a>)}</nav>
        <div className="sub-nav"><span>Most Read</span> | Latest News | Video | Blogs | Weather | Horoscopes | Classifieds <label>Search <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /></label></div>

        {selected ? <Article story={selected} playing={playing} setPlaying={setPlaying} onBack={() => setSelected(null)} /> : (
          <div className="portal-grid">
            <aside className="left-col"><ModuleTitle>FUN STUFF</ModuleTitle><div className="fun-box"><div className="fun-icon euro">€</div><a>Buying or selling Euro 2000 tickets?</a><p><a>Click here first!</a></p></div><div className="fun-box"><div className="fun-icon arrow-box">➜<small>TRY THIS!</small></div><a>Find out about online auction payments</a><p>with first-e the internet bank</p></div><ModuleTitle>MUSIC</ModuleTitle><div className="music-box"><b>NOW PLAYING:</b><a> Cameron’s World Mix</a><audio controls src="/assets/cameronsworld.mp3" /></div><div className="side-ad">ADVERTISEMENT<br /><strong>WIN A HOLIDAY<br />TO SLOUGH!</strong><button>CLICK HERE</button></div></aside>
            <section className="centre-col"><h1>Live TV</h1><div className="date-line">Sunday 30 August 2003 &nbsp; | &nbsp; Live from our television studio</div><div className="live-tv"><div className="tv-label">LIVE TV <span>● ON AIR</span></div><InfiniteTV priorityClip={readyClip} onPlaying={clip => { if (clip.id === readyClip?.id) { setGenerationStatus("YOUR REPORT IS NOW ON AIR"); setReadyClip(undefined); } else { setGenerationStatus(status => status === "YOUR REPORT IS NOW ON AIR" ? "REPORT BROADCAST — LIVE TV CONTINUES" : status); } }} /></div><form className="website-submit" onSubmit={sendWebsite}><input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="ENTER WEBSITE ADDRESS" aria-label="Website address" /><button type="submit" disabled={sent}>{sent ? "ADDRESS SENT!" : "SEND WEBSITE"}</button></form><div className="submit-note">{generationStatus || "SEND A WEBSITE TO SEE IT ON TV"}</div></section>
            <aside className="right-col"><RightModule title="Sport Latest"><a href="#">Man accidentally wins football match</a><a href="#">Cricket cancelled after bat develops opinions</a><a href="#">Tennis player blames trousers</a><a href="#">More sport news &gt;&gt;</a></RightModule><RightModule title="Weather"><div className="weather"><b>London</b><strong>17°</strong><span>Cloudy with a chance of nonsense</span></div><a href="#">Five day forecast &gt;&gt;</a></RightModule><RightModule title="Most Read"><a href="#">1. Spoon incident enters second week</a><a href="#">2. Is Birmingham thinking?</a><a href="#">3. Bread: friend or foe?</a></RightModule><RightModule title="Horoscopes"><p className="horoscope">♈ <b>Aries</b> &nbsp; Avoid roundabouts and people named Colin.</p><a href="#">Read your horoscope &gt;&gt;</a></RightModule></aside>
          </div>
        )}
        <footer><span>About us | Contact us | Privacy | Terms & Conditions | Syndication</span><span>© The Morning Post 2003</span></footer>
      </div>
    </main>
  );
}

function ModuleTitle({ children }: { children: React.ReactNode }) { return <h2 className="module-title">{children}</h2>; }
function RightModule({ title, children }: { title: string; children: React.ReactNode }) {
  const openMiniPage = (event: React.MouseEvent<HTMLDivElement>) => {
    if (title !== "Sport Latest") return;
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const slug = link.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sport-news";
    window.open(`/funny/${slug}`, "_blank", "noopener,noreferrer");
  };
  return <section className="right-module"><ModuleTitle>{title}</ModuleTitle><div className="module-body" onClick={openMiniPage}>{children}</div></section>;
}

function Article({ story, playing, setPlaying, onBack }: { story: Story; playing: boolean; setPlaying: (value: boolean) => void; onBack: () => void }) {
  useEffect(() => {
    setPlaying(true);
    const timer = window.setTimeout(() => setPlaying(false), 6000);
    return () => window.clearTimeout(timer);
  }, [setPlaying]);
  return <div className="article-page"><div className="breadcrumb"><a onClick={onBack}>Home</a> &gt; {story.section} &gt; {story.title}</div><div className="article-columns"><article><div className="article-label">{story.section} / SPECIAL REPORT</div><h1>{story.title}</h1><div className="article-date">Sunday 30 August 2003, 23:47 GMT</div><div className={`vhs-player ${playing ? "playing" : ""}`}><img src="/assets/retro-tv.png" alt="Vintage television showing the report" /><div className="vhs-screen"><b>{playing ? "REPORT IN PROGRESS" : "VHS NEWS REPORT"}</b><span>{playing ? "THE TRUTH IS DEVELOPING" : "PRESS PLAY TO VIEW"}</span><button onClick={() => setPlaying(true)}>{playing ? "■ STOP" : "▶ PLAY 6 SECOND REPORT"}</button></div></div><p className="article-intro">{story.standfirst}</p><p>Officials announced the development at a press conference this morning, where several experts appeared to agree that the situation was “not ideal”. The public has been asked to remain calm and avoid making any sudden assumptions.</p><p>“We are taking this extremely seriously,” said a spokesperson, while visibly failing to do so. Further updates are expected after the lunch break.</p><p className="article-note">This is a completely fictional article. Any resemblance to journalism is purely administrative.</p></article><aside className="article-side"><ModuleTitle>RELATED NEWS</ModuleTitle>{stories.slice(0, 4).map((item) => <a key={item.title} onClick={() => setPlaying(false)}>{item.title}</a>)}<div className="side-ad">ADVERTISEMENT<br /><strong>BUY A NEWSPAPER<br />ON THE INTERNET</strong></div></aside></div></div>;
}
