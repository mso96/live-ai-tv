export type PlaylistItem = { id: string; src: string };

export function parsePlaylist(value: unknown): PlaylistItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid playlist");
  const list = value.filter((item): item is PlaylistItem => !!item && typeof item.id === "string" &&
    typeof item.src === "string" && /^(https?:\/\/|\/[^/])/.test(item.src));
  if (!list.length) throw new Error("Empty playlist");
  return [...new Map(list.map(item => [item.id, item])).values()];
}

/** Priority reports interrupt the order, never the currently playing clip. */
export class PlayerQueue {
  list: PlaylistItem[] = [];
  private known = new Set<string>();
  private priority: PlaylistItem[] = [];
  private failed = new Set<string>();
  private cursor = "";
  current = "";

  update(list: PlaylistItem[]) {
    const initialized = this.list.length > 0;
    for (const item of list) {
      if (initialized && !this.known.has(item.id)) this.priority.push(item);
      this.known.add(item.id);
    }
    // Retain directly delivered reports when an older playlist poll finishes late.
    const missing = this.list.filter(item => !list.some(entry => entry.id === item.id));
    this.list = [...list, ...missing];
    this.failed.clear();
  }
  prioritize(item: PlaylistItem) {
    if (!this.list.some(entry => entry.id === item.id)) this.list.push(item);
    this.known.add(item.id);
    this.failed.delete(item.id);
    if (this.current !== item.id) this.priority = [item, ...this.priority.filter(entry => entry.id !== item.id)];
  }
  first(random = Math.random()): PlaylistItem | undefined { return this.list[Math.floor(random * this.list.length)]; }
  next(): PlaylistItem | undefined {
    const urgent = this.priority.find(item => !this.failed.has(item.id));
    if (urgent) return urgent;
    const start = this.list.findIndex(item => item.id === this.cursor);
    for (let offset = 1; offset <= this.list.length; offset++) {
      const item = this.list[(start + offset) % this.list.length];
      if (!this.failed.has(item.id) && item.id !== this.current) return item;
    }
    return this.list.find(item => !this.failed.has(item.id));
  }
  played(item: PlaylistItem) {
    const wasPriority = this.priority.some(entry => entry.id === item.id);
    this.priority = this.priority.filter(entry => entry.id !== item.id);
    if (!wasPriority) this.cursor = item.id;
    this.current = item.id;
  }
  fail(item: PlaylistItem) { this.failed.add(item.id); }
}
