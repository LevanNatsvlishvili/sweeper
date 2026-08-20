// VARIANT configs: seed, refill script, combo beats, timing. One object per ad variant.

import type { GridIndex, RefillStep, Special, TypeId } from './types';

export interface ComboBeat {
  readonly text: string;
  readonly scale: number;
  readonly tint: number;
}

/** All durations in seconds (GSAP's unit). Tuned on device during the juice pass. */
export interface Timing {
  /** Total spread of the tile-by-tile pop-in. */
  readonly introStagger: number;
  /** How long "Make a match!" holds after the board lands. */
  readonly promptHold: number;
  /** Idle time before the hint pulse starts. */
  readonly hintDelay: number;
  /** Idle time before the assist plays the swap itself. */
  readonly assistDelay: number;
  /** The tension beat — tiles hesitate mid-swap as if it might not work. */
  readonly wobble: number;
  readonly swapSnap: number;
  readonly clear: number;
  readonly gravity: number;
  readonly refill: number;
  readonly settle: number;
  readonly completeHold: number;
  readonly ctaSlide: number;
}

/**
 * What verifySeed() must observe when the rigged swap is played out. Encoding the
 * expected shape here rather than hard-coding "one match of three" is what lets the
 * Cascade variant reuse the same verifier for a row-clear plus a 3-chain.
 */
export interface SeedExpectation {
  /** Tile count cleared at each match step, in order. Length = number of match steps. */
  readonly clearedPerStep: readonly number[];
}

export interface Variant {
  readonly id: 'classic' | 'cascade';
  /** CELL_COUNT entries, row-major, row 0 at the top. */
  readonly seed: readonly TypeId[];
  readonly specials?: Readonly<Record<GridIndex, Special>>;
  /** One entry per resolution step. An all-empty step means "no refill yet". */
  readonly refills: readonly RefillStep[];
  /** Indexed by combo level: 0 is the swap's own match, 1 the first cascade, and so on. */
  readonly combos: readonly ComboBeat[];
  readonly completionText: string;
  readonly finale: 'stars' | 'coinRain';
  readonly expect: SeedExpectation;
  readonly timing: Timing;
}

const CLASSIC_TIMING: Timing = {
  // Longer intro and a fuller finale put the hands-free idle run at ~13.1s, inside
  // the 12-16s window with headroom on both sides.
  introStagger: 1.2,
  promptHold: 0.8,
  hintDelay: 2.0,
  assistDelay: 8.0,
  wobble: 0.3,
  swapSnap: 0.2,
  clear: 0.45,
  gravity: 0.5,
  refill: 0.6,
  settle: 0.3,
  completeHold: 2.0,
  ctaSlide: 0.6,
};

/**
 * Found by scripts/find-seed.mjs and locked in. The full chain on the 10x5 board:
 *
 *   r0  4 2 4 3 3
 *   r1  1 1 4 4 2
 *   r2  3 3 0 2 2
 *   r3  2 2 0 0 4    swap r5c1 <-> r5c2 makes row 5 read 4 4 1 1 1
 *   r4  2 1 4 3 3    match 1: r5c2..r5c4 type 1
 *   r5  4 1 4 1 1 <- clear + gravity drops row 5 to 4 4 4 3 3
 *   r6  4 2 2 1 4    match 2: r5c0..r5c2 type 4  -> "SWEET! x2"
 *   r7  0 0 3 3 2    clear + gravity leaves 6 holes, refill settles to zero matches
 *   r8  1 4 3 0 0
 *   r9  3 4 1 0 1
 *
 * The two matches between them touch all five columns, so every column shows a fall.
 * This is the ONLY swap of the 85 adjacent pairs that matches anything. Don't hand-edit
 * a cell here — re-run the search tool, because every downstream step depends on it.
 */
export const VARIANT_CLASSIC: Variant = {
  id: 'classic',
  // prettier-ignore
  seed: [
    4, 2, 4, 3, 3,
    1, 1, 4, 4, 2,
    3, 3, 0, 2, 2,
    2, 2, 0, 0, 4,
    2, 1, 4, 3, 3,
    4, 1, 4, 1, 1,
    4, 2, 2, 1, 4,
    0, 0, 3, 3, 2,
    1, 4, 3, 0, 0,
    3, 4, 1, 0, 1,
  ],
  refills: [
    // Step 0 is null on purpose: the cascade has to come from falling tiles alone, so
    // the holes stay open until the combo has played.
    null,
    // Step 1, per column, bottom-first. Column 2 has two holes (r1c2 then r0c2).
    [[1], [4], [2, 2], [2], [1]],
  ],
  combos: [
    { text: 'SWEET!', scale: 1.0, tint: 0xffd166 },
    { text: 'SWEET! x2', scale: 1.28, tint: 0xff8c42 },
  ],
  completionText: 'LEVEL COMPLETE!',
  finale: 'stars',
  expect: { clearedPerStep: [3, 3] },
  timing: CLASSIC_TIMING,
};

export const VARIANTS: Readonly<Record<string, Variant>> = {
  classic: VARIANT_CLASSIC,
};

/** ?variant=cascade selects a variant; anything unrecognised falls back to classic. */
export function selectVariant(search: string): Variant {
  const requested = new URLSearchParams(search).get('variant');
  return (requested && VARIANTS[requested]) || VARIANT_CLASSIC;
}
