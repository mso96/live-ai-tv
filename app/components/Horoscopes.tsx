"use client";

import { useState } from "react";

const signs = [
  { name: "Aries", symbol: "♈", lucky: "A damp biscuit", readings: ["Avoid roundabouts and people named Colin.", "A powerful new energy enters your life. It is the meter reader."] },
  { name: "Taurus", symbol: "♉", lucky: "The spare key", readings: ["Someone close to you is hiding something. Check the biscuit tin.", "Venus brings romance. Unfortunately, it is addressed to next door."] },
  { name: "Gemini", symbol: "♊", lucky: "Two teaspoons", readings: ["You will meet your other half. They also owe the council money.", "Two paths lie ahead. Both lead to a closed branch of Woolworths."] },
  { name: "Cancer", symbol: "♋", lucky: "A bus receipt", readings: ["A stranger will change your life by standing in your usual bus spot.", "The universe has a message for you. It was left with a neighbour."] },
  { name: "Leo", symbol: "♌", lucky: "A small crown", readings: ["You are destined for greatness. Start by putting the bins out.", "All eyes are on you. Your dressing gown is caught in the bus door."] },
  { name: "Virgo", symbol: "♍", lucky: "A labelled folder", readings: ["The stars are perfectly aligned. Please stop trying to alphabetise them.", "An unexpected visitor arrives at four. You have already made a spreadsheet."] },
  { name: "Libra", symbol: "♎", lucky: "A wonky shelf", readings: ["Balance is important today. Do not put all the gravy on one side.", "A difficult decision awaits. The meal deal contains two disappointing sandwiches."] },
  { name: "Scorpio", symbol: "♏", lucky: "One black sock", readings: ["Your mysterious aura is attracting attention. It may be the damp coat.", "An old rival returns. It is the self-checkout machine at Tesco."] },
  { name: "Sagittarius", symbol: "♐", lucky: "An A–Z map", readings: ["Adventure beckons. The replacement bus service goes via Swindon.", "Follow your dreams, unless they involve reversing onto the M25."] },
  { name: "Capricorn", symbol: "♑", lucky: "A sturdy mug", readings: ["A promotion is coming. You are now in charge of the office kettle.", "Saturn supports your ambitions. Your wheelie bin has never looked better."] },
  { name: "Aquarius", symbol: "♒", lucky: "A bath plug", readings: ["Think outside the box. Then get back in; it is raining.", "Your revolutionary idea will change everything. Nobody wants tea without milk."] },
  { name: "Pisces", symbol: "♓", lucky: "A fish finger", readings: ["Trust your intuition. That really is your neighbour in the hedge.", "Deep emotional waters lie ahead. Someone has blocked the downstairs loo."] },
];

export default function Horoscopes() {
  const [signIndex, setSignIndex] = useState(0);
  const [readingIndex, setReadingIndex] = useState(0);
  const sign = signs[signIndex];

  return (
    <section className="right-module cosmic-module" aria-labelledby="horoscopes-title">
      <h2 className="module-title" id="horoscopes-title">Horoscopes <span aria-hidden="true">✦</span></h2>
      <div className="cosmic-body">
        <div className="cosmic-exclusive">★ COSMIC EXCLUSIVE ★</div>
        <div className="cosmic-masthead"><span className="cosmic-twinkle" aria-hidden="true">✧</span><strong>YOUR STARS!</strong><span className="cosmic-twinkle" aria-hidden="true">✧</span></div>
        <p className="cosmic-byline">with Mystic Maureen</p>
        <label className="cosmic-label" htmlFor="star-sign">WHAT’S YOUR SIGN?</label>
        <select id="star-sign" value={signIndex} onChange={event => { setSignIndex(Number(event.target.value)); setReadingIndex(0); }}>
          {signs.map((item, index) => <option key={item.name} value={index}>{item.symbol} {item.name}</option>)}
        </select>
        <div className="cosmic-reading" aria-live="polite" aria-atomic="true">
          <div className="cosmic-sign"><span aria-hidden="true">{sign.symbol}</span><b>{sign.name}</b><small>TODAY</small></div>
          <p>{sign.readings[readingIndex]}</p>
          <div className="cosmic-lucky"><b>LUCKY OBJECT:</b> {sign.lucky}</div>
        </div>
        <button className="cosmic-ask" type="button" onClick={() => setReadingIndex(index => (index + 1) % sign.readings.length)}>ASK AGAIN <span aria-hidden="true">»</span></button>
        <small className="cosmic-disclaimer">For entertainment. Even the stars are guessing.</small>
      </div>
    </section>
  );
}
