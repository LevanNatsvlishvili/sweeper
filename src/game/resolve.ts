// The resolution pipeline as one pure function, plus the seed assertion that guards it.

import {
  applyGravity,
  applyRefill,
  applySwap,
  clearCells,
  createBoard,
  expandSpecials,
  isFull,
  type Board,
} from './board';
import { clearedIndices, findMatches, findValidSwaps } from './matcher';
import type { Step, Swap } from './types';
import type { Variant } from './variants';

/** Guards against a mis-scripted refill spinning the cascade loop forever. */
const MAX_RESOLUTION_STEPS = 8;

/**
 * Plays a swap out to a settled board, mutating `board`, and returns the ordered steps
 * to animate. The director awaits one animation per step; verifySeed() runs the very
 * same function headlessly. Because they share this code path they cannot disagree —
 * which is the whole point of asserting the seed at boot.
 */
export function resolve(board: Board, swap: Swap, variant: Variant): Step[] {
  const steps: Step[] = [{ kind: 'swap', a: swap.a, b: swap.b }];
  applySwap(board, swap);

  for (let comboLevel = 0; ; comboLevel++) {
    const runs = findMatches(board.cells);
    if (runs.length === 0) break;

    if (comboLevel >= MAX_RESOLUTION_STEPS) {
      throw new Error(`resolution exceeded ${MAX_RESOLUTION_STEPS} steps — refill script is feeding the cascade`);
    }

    const cleared = expandSpecials(board, clearedIndices(runs));
    clearCells(board, cleared);
    steps.push({ kind: 'match', runs, cleared, comboLevel });

    steps.push({ kind: 'gravity', moves: applyGravity(board) });

    if (comboLevel >= variant.refills.length) {
      throw new Error(`variant "${variant.id}" has no refill script for step ${comboLevel}`);
    }

    // A null script holds the holes open so the next match comes from falling tiles alone.
    const scripted = variant.refills[comboLevel];
    if (scripted) steps.push({ kind: 'refill', spawns: applyRefill(board, scripted) });
  }

  steps.push({ kind: 'settle' });
  return steps;
}

export interface SeedReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
  /** The one rigged swap, when the seed has exactly one. */
  readonly swap: Swap | null;
  readonly steps: readonly Step[];
}

/**
 * Checks a variant's whole deterministic promise: one valid swap, the scripted match
 * chain, and a settled full board with nothing left to match. Returns every problem it
 * finds rather than throwing on the first, so a broken seed reports its full story.
 */
export function verifySeed(variant: Variant): SeedReport {
  const problems: string[] = [];
  const board = createBoard(variant.seed, variant.specials);

  const opening = findMatches(board.cells);
  if (opening.length > 0) {
    problems.push(`seed already contains ${opening.length} match(es) before any swap`);
  }

  const valid = findValidSwaps(board.cells);
  if (valid.length !== 1) {
    problems.push(`expected exactly 1 valid swap, found ${valid.length}`);
    return { ok: false, problems, swap: null, steps: [] };
  }

  const swap = valid[0];
  let steps: Step[];
  try {
    steps = resolve(board, swap, variant);
  } catch (error) {
    problems.push((error as Error).message);
    return { ok: false, problems, swap, steps: [] };
  }

  const matches = steps.filter((step) => step.kind === 'match');
  const { clearedPerStep } = variant.expect;

  if (matches.length !== clearedPerStep.length) {
    problems.push(`expected ${clearedPerStep.length} match step(s), got ${matches.length}`);
  }

  matches.forEach((step, index) => {
    const expected = clearedPerStep[index];
    if (expected === undefined) return;
    if (step.cleared.length !== expected) {
      problems.push(`match step ${index} cleared ${step.cleared.length} tiles, expected ${expected}`);
    }
  });

  if (variant.refills.length !== matches.length) {
    problems.push(`refill script has ${variant.refills.length} step(s) but the chain runs ${matches.length}`);
  }

  if (!isFull(board)) {
    const holes = board.cells.filter((cell) => cell === null).length;
    problems.push(`board settled with ${holes} hole(s) — refill script is short`);
  }

  const leftover = findMatches(board.cells);
  if (leftover.length > 0) {
    problems.push(`settled board still has ${leftover.length} match(es) — refill creates a chain`);
  }

  return { ok: problems.length === 0, problems, swap, steps };
}

/**
 * Dev-only boot guard. Wrapped in import.meta.env.DEV at the call site so the whole
 * verifier tree-shakes out of the shipped single-file ad.
 */
export function assertSeed(variant: Variant): SeedReport {
  const report = verifySeed(variant);

  if (!report.ok) {
    throw new Error(`verifySeed("${variant.id}") failed:\n  - ${report.problems.join('\n  - ')}`);
  }

  return report;
}
