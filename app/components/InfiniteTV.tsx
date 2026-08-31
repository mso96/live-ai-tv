"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PlaylistItem = { id: string; src: string };

export default function InfiniteTV() {
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const playlistRef = useRef<PlaylistItem[]>([]);
  const activeSlot = useRef(0);
  const currentIndex = useRef(0);
  const mutedByPolicy = useRef(false);
  const [hasPlaylist, setHasPlaylist] = useState(true);
  const [showSound, setShowSound] = useState(false);
  const [visibleSlot, setVisibleSlot] = useState(0);

  const loadPlaylist = useCallback(async () => {
    try {
      const response = await fetch(`/api/playlist?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("playlist unavailable");
      const incoming = (await response.json()) as PlaylistItem[];
      if (!Array.isArray(incoming) || incoming.length === 0) throw new Error("empty playlist");
      const currentId = playlistRef.current[currentIndex.current]?.id;
      playlistRef.current = incoming;
      setHasPlaylist(true);
      if (!currentId) currentIndex.current = Math.floor(Math.random() * incoming.length);
    } catch {
      if (!playlistRef.current.length) setHasPlaylist(false);
    }
  }, []);

  const startChannel = useCallback(async () => {
    const list = playlistRef.current;
    if (!list.length) return;
    const first = videos.current[activeSlot.current];
    const next = videos.current[1 - activeSlot.current];
    if (!first || !next) return;
    const index = currentIndex.current % list.length;
    first.src = list[index].src;
    first.load();
    next.src = list[(index + 1) % list.length].src;
    next.load();
    try {
      first.muted = false;
      await first.play();
    } catch {
      first.muted = true;
      mutedByPolicy.current = true;
      setShowSound(true);
      try { await first.play(); } catch { /* browser still loading */ }
    }
  }, []);

  const advance = useCallback(async (slot: number) => {
    const list = playlistRef.current;
    if (!list.length) return;
    const nextIndex = (currentIndex.current + 1) % list.length;
    const next = videos.current[1 - slot];
    const old = videos.current[slot];
    if (!next || !old) return;
    next.currentTime = 0;
    try { await next.play(); } catch { /* the error handler will skip it */ }
    activeSlot.current = 1 - slot;
    setVisibleSlot(1 - slot);
    currentIndex.current = nextIndex;
    const following = (nextIndex + 1) % list.length;
    old.src = list[following].src;
    old.load();
    if (mutedByPolicy.current) next.muted = false;
  }, []);

  useEffect(() => {
    void loadPlaylist().then(() => void startChannel());
    const poller = window.setInterval(() => void loadPlaylist(), 30000);
    return () => window.clearInterval(poller);
  }, [loadPlaylist, startChannel]);

  const enableSound = async () => {
    const video = videos.current[activeSlot.current];
    if (!video) return;
    video.muted = false;
    mutedByPolicy.current = false;
    setShowSound(false);
    try { await video.play(); } catch { setShowSound(true); }
  };

  return <div className="infinite-tv" aria-label="Continuous Live TV broadcast">
    {!hasPlaylist && <div className="no-signal">NO SIGNAL<br /><small>PLEASE STAND BY</small></div>}
    <video ref={(node) => { videos.current[0] = node; }} className={`channel-video video-a ${visibleSlot === 0 ? "is-visible" : ""}`} muted={false} playsInline preload="auto" onEnded={() => void advance(0)} onError={() => void advance(0)} />
    <video ref={(node) => { videos.current[1] = node; }} className={`channel-video video-b ${visibleSlot === 1 ? "is-visible" : ""}`} muted={false} playsInline preload="auto" onEnded={() => void advance(1)} onError={() => void advance(1)} />
    {showSound && <button className="sound-prompt" onClick={() => void enableSound()}>CLICK FOR SOUND</button>}
  </div>;
}
