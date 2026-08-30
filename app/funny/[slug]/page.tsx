import Link from "next/link";

const headlines: Record<string, { title: string; text: string }> = {
  "man-accidentally-wins-football-match": { title: "Man accidentally wins football match", text: "A local man has accidentally won a football match after turning up at the wrong pitch and refusing to leave. Officials say the result will stand, although nobody is entirely sure what happened." },
  "cricket-cancelled-after-bat-develops-opinions": { title: "Cricket cancelled after bat develops opinions", text: "Saturday’s cricket has been cancelled after a wooden bat began expressing strong views about the opening partnership. Players were advised to go home and think about what they had done." },
  "tennis-player-blames-trousers": { title: "Tennis player blames trousers", text: "A tennis player has blamed his trousers for a narrow defeat, claiming they were ‘not emotionally ready for the second set’. The trousers have declined to comment." },
  "more-sport-news": { title: "More sport news", text: "There is currently no more sport news. Editors are waiting for a ball to do something unexpected." },
};

export default async function FunnyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = headlines[slug] || headlines["more-sport-news"];
  return <main className="mini-page"><div className="mini-shell"><div className="mini-top">THE MORNING POST &nbsp; | &nbsp; SPORT &nbsp; | &nbsp; Sunday 30 August 2003</div><h1>{story.title}</h1><div className="mini-rule" /><p className="mini-date">Published 23:47 GMT &nbsp; | &nbsp; By our sports correspondent</p><p className="mini-lead">{story.text}</p><p>Witnesses described the events as “technically sporting” but declined to provide further details. The relevant authorities have been notified, although they are not expected to help.</p><p><b>Related:</b> <a href="#">Sport homepage</a> | <a href="#">Return to the front page</a></p><Link className="mini-back" href="/">&lt;&lt; Back to the Morning Post</Link></div></main>;
}
