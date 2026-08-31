import Link from "next/link";

const headlines: Record<string, { title: string; text: string; section?: string; paragraphs?: string[] }> = {
  "euro-2000-tickets": {
    title: "Euro 2000 tickets still available, insists man at folding table",
    section: "FUN STUFF",
    text: "A ticket office in Reading is refusing to acknowledge that Euro 2000 has finished. Its proprietor, Derek, says the tournament is merely experiencing a longer than usual half-time.",
    paragraphs: [
      "For £45, supporters receive a numbered chair in Derek’s conservatory, an orange segment and a promise that Portugal will be along shortly. Restricted-view seats face the airing cupboard.",
      "One customer has been waiting since June. ‘The atmosphere is excellent,’ he said. ‘Derek’s wife has asked us to leave six times.’",
      "Refunds are available on presentation of the original ticket and written confirmation from the year 2000. The office closes at five, or whenever Derek is called in for his tea.",
    ],
  },
  "online-auction-payments": {
    title: "Internet bank admits all payments are carried by one pigeon",
    section: "FUN STUFF",
    text: "First-e, the internet bank, has unveiled its revolutionary online payment system: a pigeon called Malcolm with a small envelope attached to his ankle.",
    paragraphs: [
      "Customers simply click PAY NOW. A man in Swindon then prints the internet, folds the relevant bit and explains the transaction to Malcolm. Payments usually clear within three working days, provided nobody nearby is eating chips.",
      "The system went offline on Tuesday after Malcolm entered a church and refused to discuss a £4.20 bread-bin purchase. A spokesperson described this as ‘scheduled maintenance of the bird’.",
      "For added security, all passwords must contain one capital letter, one number and a convincing impression of a pigeon. Please do not send money. Malcolm is already carrying quite enough.",
    ],
  },
  "man-accidentally-wins-football-match": { title: "Man accidentally wins football match", text: "A local man has accidentally won a football match after turning up at the wrong pitch and refusing to leave. Officials say the result will stand, although nobody is entirely sure what happened." },
  "cricket-cancelled-after-bat-develops-opinions": { title: "Cricket cancelled after bat develops opinions", text: "Saturday’s cricket has been cancelled after a wooden bat began expressing strong views about the opening partnership. Players were advised to go home and think about what they had done." },
  "tennis-player-blames-trousers": { title: "Tennis player blames trousers", text: "A tennis player has blamed his trousers for a narrow defeat, claiming they were ‘not emotionally ready for the second set’. The trousers have declined to comment." },
  "more-sport-news": { title: "More sport news", text: "There is currently no more sport news. Editors are waiting for a ball to do something unexpected." },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = headlines[slug] || headlines["more-sport-news"];
  const title = `${story.title} | The Morning Post`;
  return {
    title,
    description: story.text,
    openGraph: { title, description: story.text, type: "article", images: [] },
    twitter: { card: "summary", title, description: story.text, images: [] },
  };
}

export default async function FunnyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = headlines[slug] || headlines["more-sport-news"];
  const paragraphs = story.paragraphs || ["Witnesses described the events as “technically sporting” but declined to provide further details. The relevant authorities have been notified, although they are not expected to help."];
  return <main className="mini-page"><div className="mini-shell"><div className="mini-top">THE MORNING POST &nbsp; | &nbsp; {story.section || "SPORT"} &nbsp; | &nbsp; Sunday 30 August 2003</div><h1>{story.title}</h1><div className="mini-rule" /><p className="mini-date">Published 23:47 GMT &nbsp; | &nbsp; By our {story.section ? "very special" : "sports"} correspondent</p><p className="mini-lead">{story.text}</p>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<p><b>Related:</b> <Link href="/funny/euro-2000-tickets">Euro 2000 tickets</Link> | <Link href="/funny/online-auction-payments">Online auction payments</Link></p><Link className="mini-back" href="/">&lt;&lt; Back to the Morning Post</Link></div></main>;
}
