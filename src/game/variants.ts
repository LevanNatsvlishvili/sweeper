// VARIANT configs: rng seed, score goal, combo beats, timing. One object per ad variant.

export interface ComboBeat {
  readonly text: string;
  readonly scale: number;
  readonly tint: number;
}

export interface Scoring {
  /** Base points per cleared tile, before the combo multiplier. */
  readonly perTile: number;
  /**
   * Ceiling on the cascade multiplier. Uncapped, a lucky runaway chain can clear the
   * whole goal in one move and end the ad before the player has engaged with it.
   */
  readonly maxMultiplier: number;
}

/** All durations in seconds (GSAP's unit). Tuned on device during the juice pass. */
export interface Timing {
  /** Total spread of the tile-by-tile pop-in. */
  readonly introStagger: number;
  /** How long "Make a match!" holds after the board lands. */
  readonly promptHold: number;
  /** Idle time before the hint pulse starts. */
  readonly hintDelay: number;
  readonly swapSnap: number;
  readonly clear: number;
  readonly gravity: number;
  readonly refill: number;
  readonly settle: number;
  /**
   * Fraction knocked off each animation per cascade level, so a long chain accelerates
   * instead of dragging. At a flat rate a five-deep chain took over eight seconds on its
   * own, which is most of an ad's attention budget spent watching one move.
   */
  readonly cascadeSpeedup: number;
  /** Floor on that ramp, so a very deep chain stays readable rather than blurring past. */
  readonly cascadeSpeedFloor: number;
  readonly completeHold: number;
  readonly ctaSlide: number;
  /**
   * Beat between the CTA landing and the whole screen becoming a click target. Without
   * the delay the slide-up itself can eat a stray tap as an accidental clickthrough.
   */
  readonly tapAnywhereDelay: number;
}

export interface Variant {
  readonly id: 'classic' | 'cascade';
  /** Seeds every random draw, so a whole run replays identically from this number. */
  readonly rngSeed: number;
  /** Score that ends the ad. Deliberately not shown to the player as a progress bar. */
  readonly scoreTarget: number;
  /**
   * The CTA cannot fire before this many moves, however well the player does. Without it
   * roughly one run in ten ended on move two off a lucky chain, before the player had
   * engaged at all. Invisible to the player, since no progress is displayed.
   */
  readonly minMoves: number;
  /** Upper bound verifyRun() holds its simulated playthrough to, as a pacing guard. */
  readonly expectedMaxMoves: number;
  readonly scoring: Scoring;
  /**
   * A run of this many tiles leaves a striped leftover behind. `null` means never —
   * Classic plays without specials. Cascade uses 4 because a 5-col board almost never
   * produces a natural 5, and the leftover is how the row-clear actually shows up.
   */
  readonly stripeAt: number | null;
  /**
   * Indexed by combo level. `null` means "no pop" — a plain match should not shout, so
   * only actual cascades get text and the screen stays calm between chains.
   * Levels past the end reuse the last entry.
   */
  readonly combos: readonly (ComboBeat | null)[];
  readonly completionText: string;
  readonly finale: 'stars' | 'coinRain';
  readonly timing: Timing;
}

const CLASSIC_TIMING: Timing = {
  introStagger: 1.2,
  promptHold: 0.8,
  hintDelay: 2.0,
  swapSnap: 0.2,
  clear: 0.36,
  gravity: 0.42,
  refill: 0.46,
  settle: 0.26,
  cascadeSpeedup: 0.16,
  cascadeSpeedFloor: 0.55,
  completeHold: 1.5,
  ctaSlide: 0.6,
  tapAnywhereDelay: 2.0,
};

export const VARIANT_CLASSIC: Variant = {
  id: 'classic',
  // Chosen with verifyRun: finishes hands-free in 4 moves with a big chain on the way.
  rngSeed: 18,
  scoreTarget: 800,
  minMoves: 3,
  expectedMaxMoves: 15,
  scoring: { perTile: 20, maxMultiplier: 4 },
  stripeAt: null,
  combos: [
    null,
    { text: 'SWEET! x2', scale: 1.15, tint: 0xffd166 },
    { text: 'x3 COMBO!', scale: 1.3, tint: 0xff8c42 },
    { text: 'x4 BLAZING!', scale: 1.45, tint: 0xff5c39 },
    { text: 'JACKPOT!', scale: 1.6, tint: 0xff3b6b },
  ],
  completionText: 'LEVEL COMPLETE!',
  finale: 'stars',
  timing: CLASSIC_TIMING,
};

export const VARIANT_CASCADE: Variant = {
  id: 'cascade',
  // Chosen with verifyRun: 4-move finish, six striped leftovers, six row-clears.
  rngSeed: 183,
  scoreTarget: 1400,
  minMoves: 4,
  expectedMaxMoves: 18,
  scoring: { perTile: 20, maxMultiplier: 4 },
  stripeAt: 4,
  combos: [
    null,
    { text: 'SWEET! x2', scale: 1.25, tint: 0xffd166 },
    { text: 'x3 COMBO!', scale: 1.5, tint: 0xff8c42 },
    { text: 'x4 BLAZING!', scale: 1.7, tint: 0xff5c39 },
    { text: 'JACKPOT!', scale: 2.0, tint: 0xff3b6b },
  ],
  completionText: 'JACKPOT!',
  finale: 'coinRain',
  timing: CLASSIC_TIMING,
};

/** Combo text for a cascade level, holding the last beat for anything deeper. */
export function comboBeat(variant: Variant, level: number): ComboBeat | null {
  if (level < variant.combos.length) return variant.combos[level];
  return variant.combos[variant.combos.length - 1];
}

export const VARIANTS: Readonly<Record<string, Variant>> = {
  classic: VARIANT_CLASSIC,
  cascade: VARIANT_CASCADE,
};

/** ?variant=cascade selects a variant; anything unrecognised falls back to classic. */
export function selectVariant(search: string): Variant {
  const requested = new URLSearchParams(search).get('variant');
  return (requested && VARIANTS[requested]) || VARIANT_CLASSIC;
}

/**
 * Capture-only. The shipped ad never auto-plays; `?assist=1` is what lets the
 * portfolio reel drive itself after the hint, the way idle assist used to.
 */
export function wantsIdleAssist(search: string): boolean {
  return new URLSearchParams(search).get('assist') === '1';
}
