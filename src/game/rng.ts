// Seeded pseudo-random source. Free play needs randomness; the ad still needs to be
// reproducible, so every random draw comes from here rather than Math.random().

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Fisher-Yates, in place, using this stream. */
  shuffle<T>(items: T[]): T[];
}

/**
 * mulberry32 — small, fast, and good enough for tile drops. The point is determinism:
 * the same seed replays the same run, which is what lets verifyRun() assert a whole
 * playthrough headlessly and what makes a bug reproducible from a seed number alone.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(maxExclusive: number): number {
    return Math.floor(next() * maxExclusive);
  }

  return {
    next,
    int,
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}
