// The per-move resolution pipeline, plus a headless playthrough that guards the run.

import {
  applyGravity,
  applyRefill,
  applySwap,
  clearCells,
  expandSpecials,
  isFull,
  type Board,
} from './board';
import { generateBoard, hasLegalMove, reshuffle } from './generate';
import { bestSwap, clearedIndices, findMatches } from './matcher';
import { createRng, type Rng } from './rng';
import type { Step, Swap } from './types';
import type { Scoring, Variant } from './variants';

/**
 * Refills are freely random, so in principle a chain could keep feeding itself. In
 * practice chains die out fast; this is the backstop that keeps a bad streak finite.
 */
const MAX_CASCADE_DEPTH = 16;

export interface Resolution {
  readonly steps: readonly Step[];
  readonly points: number;
}

/**
 * Plays one swap out to a settled board, mutating `board`, and returns the steps to
 * animate plus what the move scored. The director awaits one animation per step;
 * verifyRun() drives this very same function headlessly, so the two cannot disagree.
 */
export function resolve(board: Board, swap: Swap, rng: Rng, scoring: Scoring): Resolution {
  const steps: Step[] = [{ kind: 'swap', a: swap.a, b: swap.b }];
  applySwap(board, swap);

  let points = 0;

  for (let comboLevel = 0; ; comboLevel++) {
    const runs = findMatches(board.cells);
    if (runs.length === 0) break;

    if (comboLevel >= MAX_CASCADE_DEPTH) {
      throw new Error(`cascade exceeded ${MAX_CASCADE_DEPTH} levels — refills are feeding the chain`);
    }

    const cleared = expandSpecials(board, clearedIndices(runs));
    // Deeper cascades pay progressively more, up to the cap that stops one lucky
    // runaway chain from clearing the entire goal in a single move.
    const multiplier = Math.min(comboLevel + 1, scoring.maxMultiplier);
    const gained = cleared.length * scoring.perTile * multiplier;
    points += gained;

    clearCells(board, cleared);
    steps.push({ kind: 'match', runs, cleared, comboLevel, points: gained });

    steps.push({ kind: 'gravity', moves: applyGravity(board) });
    steps.push({ kind: 'refill', spawns: applyRefill(board, rng) });
  }

  steps.push({ kind: 'settle' });
  return { steps, points };
}

/** The ad ends once the goal is met AND the player has had a real go at it. */
export function isRunComplete(variant: Variant, score: number, moves: number): boolean {
  return score >= variant.scoreTarget && moves >= variant.minMoves;
}

export interface RunReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
  /** Moves the simulated player needed to reach the target. */
  readonly moves: number;
  readonly score: number;
  readonly reshuffles: number;
}

/** Hard cap on the simulated playthrough, so a broken variant fails instead of hanging. */
const MAX_SIMULATED_MOVES = 200;

/**
 * Plays a whole run headlessly as a competent player would — always take the best legal
 * swap — and checks the ad is actually completable. This is the free-play replacement for
 * the old fixed-seed assertion: with a scripted board there was one chain to verify, but
 * now the promise is "this seed reaches the target, never dead-ends, and always settles".
 *
 * It is a solvability check, not a description of shipped behaviour: nothing plays the
 * game on its own, so a real run depends entirely on the player and will diverge from
 * this one at move one. Read the move count as a pacing sanity check.
 */
export function verifyRun(variant: Variant): RunReport {
  const problems: string[] = [];
  const rng = createRng(variant.rngSeed);

  let board: Board;
  try {
    board = generateBoard(rng);
  } catch (error) {
    return { ok: false, problems: [(error as Error).message], moves: 0, score: 0, reshuffles: 0 };
  }

  if (findMatches(board.cells).length > 0) {
    problems.push('generated board contains a match before the first move');
  }

  let score = 0;
  let moves = 0;
  let reshuffles = 0;

  while (!isRunComplete(variant, score, moves) && moves < MAX_SIMULATED_MOVES) {
    if (!hasLegalMove(board)) {
      reshuffle(board, rng);
      reshuffles++;
      if (!hasLegalMove(board)) {
        problems.push(`reshuffle at move ${moves} still left no legal move`);
        break;
      }
    }

    const swap = bestSwap(board.cells);
    if (!swap) {
      problems.push(`no legal swap at move ${moves} despite the deadlock check passing`);
      break;
    }
    let outcome: Resolution;
    try {
      outcome = resolve(board, swap, rng, variant.scoring);
    } catch (error) {
      problems.push(`move ${moves}: ${(error as Error).message}`);
      break;
    }

    if (outcome.points === 0) {
      problems.push(`move ${moves} was reported legal but scored nothing`);
      break;
    }

    score += outcome.points;
    moves++;

    if (!isFull(board)) {
      problems.push(`board had holes after move ${moves}`);
      break;
    }
    if (findMatches(board.cells).length > 0) {
      problems.push(`board still had a match after move ${moves} settled`);
      break;
    }
  }

  if (score < variant.scoreTarget) {
    problems.push(`only reached ${score} of ${variant.scoreTarget} in ${moves} moves`);
  }
  if (moves < variant.minMoves) {
    problems.push(`finished in ${moves} moves, below the ${variant.minMoves}-move floor`);
  }
  if (moves > variant.expectedMaxMoves) {
    problems.push(`took ${moves} moves, expected at most ${variant.expectedMaxMoves}`);
  }

  return { ok: problems.length === 0, problems, moves, score, reshuffles };
}

/**
 * Dev-only boot guard. Wrapped in import.meta.env.DEV at the call site so the whole
 * verifier tree-shakes out of the shipped single-file ad.
 */
export function assertRun(variant: Variant): RunReport {
  const report = verifyRun(variant);

  if (!report.ok) {
    throw new Error(`verifyRun("${variant.id}") failed:\n  - ${report.problems.join('\n  - ')}`);
  }

  return report;
}
