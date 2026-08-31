"use client";

import { useEffect, useRef, useState } from "react";
import { createChannelPlayer } from "../lib/channelPlayer";
import { parsePlaylist, type PlaylistItem } from "../lib/playerQueue";

export default function InfiniteTV({ priorityClip, onPlaying }: { priorityClip?: PlaylistItem; onPlaying?: (item: PlaylistItem) => void }) {
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const controller = useRef<ReturnType<typeof createChannelPlayer> | null>(null);
  const callback = useRef(onPlaying);
  callback.current = onPlaying;
  const [hasPlaylist, setHasPlaylist] = useState(true);
  const [showSound, setShowSound] = useState(false);
  const [visibleSlot, setVisibleSlot] = useState(0);

  useEffect(() => {
    const player = createChannelPlayer(videos.current as HTMLVideoElement[], {
      visible: setVisibleSlot, sound: setShowSound, signal: setHasPlaylist,
      playing: item => callback.current?.(item),
    });
    controller.current = player;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/playlist?ts=${Date.now()}`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("Playlist unavailable");
        const list = parsePlaylist(await response.json());
        if (!abort.signal.aborted) player.update(list);
      } catch { if (!abort.signal.aborted) player.noPlaylist(); }
      finally { if (!abort.signal.aborted) timer = setTimeout(refresh, 30000); }
    };
    void refresh();
    return () => { abort.abort(); clearTimeout(timer); player.dispose(); controller.current = null; };
  }, []);

  useEffect(() => { if (priorityClip) controller.current?.prioritize(priorityClip); }, [priorityClip]);

  return <div className="infinite-tv" aria-label="Continuous Live TV broadcast">
    {!hasPlaylist && <div className="no-signal">NO SIGNAL<br /><small>PLEASE STAND BY</small></div>}
    <video ref={node => { videos.current[0] = node; }} className={`channel-video video-a ${visibleSlot === 0 ? "is-visible" : ""}`} playsInline preload="auto" />
    <video ref={node => { videos.current[1] = node; }} className={`channel-video video-b ${visibleSlot === 1 ? "is-visible" : ""}`} playsInline preload="auto" />
    {showSound && <button className="sound-prompt" onClick={() => controller.current?.enableSound()}>CLICK FOR SOUND</button>}
  </div>;
}
