import { PlayerQueue, type PlaylistItem } from "./playerQueue.ts";

type Hooks = { visible(slot: number): void; sound(muted: boolean): void; signal(ok: boolean): void; playing(item: PlaylistItem): void };

export function createChannelPlayer(videos: HTMLVideoElement[], hooks: Hooks) {
  const queue = new PlayerQueue();
  const loaded: Array<PlaylistItem | undefined> = [];
  let active = 0;
  let started = false;
  let busy = false;
  let disposed = false;
  let muted = false;
  let immediate: PlaylistItem | undefined;
  let playTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelPlay: (() => void) | undefined;

  function load(slot: number, item: PlaylistItem) {
    if (loaded[slot]?.id === item.id) {
      if (videos[slot].ended) videos[slot].currentTime = 0;
      return;
    }
    videos[slot].pause();
    loaded[slot] = item;
    videos[slot].src = item.src;
    videos[slot].muted = true;
    videos[slot].load();
  }
  function preload() {
    if (disposed || busy || !started) return;
    const item = queue.next();
    if (item) load(1 - active, item);
  }
  async function play(video: HTMLVideoElement, silent = false) {
    video.muted = silent || muted;
    const attempt = async () => {
      try { await video.play(); }
      catch (error) {
        if (disposed || (error as Error)?.name !== "NotAllowedError" || muted) throw error;
        muted = true;
        videos.forEach(v => { v.muted = true; });
        hooks.sound(true);
        await video.play();
      }
    };
    try {
      await Promise.race([attempt(), new Promise<never>((_, reject) => {
        cancelPlay = () => reject(new Error("Playback cancelled"));
        playTimer = setTimeout(() => reject(new Error("Clip load timed out")), 12000);
      })]);
    } finally { clearTimeout(playTimer); cancelPlay = undefined; }
  }
  function flushImmediate() {
    if (disposed || busy || !immediate) return false;
    const item = immediate;
    immediate = undefined;
    void transition(item, true);
    return true;
  }
  async function transition(first?: PlaylistItem, interrupt = false) {
    if (disposed || busy) return;
    busy = true;
    const slot = started ? 1 - active : active;
    let candidate = first || queue.next();
    while (!disposed && candidate) {
      load(slot, candidate);
      try {
        // Start the incoming slot silently so play() cannot overlap two voices.
        await play(videos[slot], started);
        if (disposed) return;
        if (started) { videos[active].muted = true; videos[active].pause(); }
        active = slot;
        videos[active].muted = muted;
        started = true;
        queue.played(candidate);
        hooks.visible(slot);
        hooks.signal(true);
        hooks.playing(candidate);
        busy = false;
        if (!flushImmediate()) preload();
        return;
      } catch {
        if (disposed) return;
        videos[slot].pause();
        queue.fail(candidate);
        loaded[slot] = undefined;
        // A failed urgent report must leave the still-playing broadcast alone.
        if (interrupt && started && !videos[active].ended && !videos[active].error) {
          busy = false;
          if (!flushImmediate()) preload();
          return;
        }
        candidate = queue.next();
      }
    }
    busy = false;
    if (flushImmediate()) return;
    if (!disposed) hooks.signal(false);
  }
  const listeners = videos.map((video, slot) => {
    const ended = () => { if (slot === active) void transition(); };
    const error = () => {
      const item = loaded[slot];
      if (item) queue.fail(item);
      loaded[slot] = undefined;
      if (busy) return;
      // A failed background preload must not cut the active broadcast.
      if (slot === active) void transition(); else preload();
    };
    video.addEventListener("ended", ended);
    video.addEventListener("error", error);
    return () => { video.removeEventListener("ended", ended); video.removeEventListener("error", error); };
  });
  return {
    update(list: PlaylistItem[]) {
      queue.update(list);
      if (!started) void transition(queue.first());
      else if (videos[active].ended || videos[active].error) void transition();
      else preload();
    },
    prioritize(item: PlaylistItem) {
      // The 30s poll may discover the report just before its submit response arrives.
      if (started && queue.current === item.id) { hooks.playing(item); return; }
      queue.prioritize(item);
      // Keep the old picture until play() confirms the new slot can play,
      // then cut immediately, even when the old clip has not ended.
      immediate = item;
      flushImmediate();
    },
    noPlaylist() { if (!started) hooks.signal(false); },
    enableSound() {
      muted = false;
      videos.forEach((video, slot) => { video.muted = !started || slot !== active; });
      hooks.sound(false);
    },
    dispose() {
      disposed = true;
      immediate = undefined;
      clearTimeout(playTimer);
      cancelPlay?.();
      listeners.forEach(remove => remove());
      videos.forEach(video => { video.pause(); video.removeAttribute("src"); video.load(); });
    },
  };
}
