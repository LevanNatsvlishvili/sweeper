import { describe, expect, it } from 'vitest';

import { applyStep, cloneBoard, createBoard, isFull, specialLayout, typeLayout } from './board';
import { generateBoard, hasLegalMove, reshuffle } from './generate';
import { bestSwap, findMatches, findValidSwaps } from './matcher';
import { assertRun, isRunComplete, resolve, verifyRun } from './resolve';
import { createRng } from './rng';
import { CELL_COUNT, GRID_COLS, indexOf, type Step, type TypeId } from './types';
import { selectVariant, VARIANT_CASCADE, VARIANT_CLASSIC, wantsIdleAssist, type Variant } from './variants';

const SEEDS = [1, 2, 3, 17, 404, 20260820];
const matchSteps = (steps: readonly Step[]) =>
  steps.filter((step): step is Extract<Step, { kind: 'match' }> => step.kind === 'match');

/** Match-free lattice with zero legal swaps — the dead board the reshuffle must rescue. */
const DEADLOCK: TypeId[] = Array.from(
  { length: CELL_COUNT },
  (_, i) => ((2 * Math.floor(i / GRID_COLS) + (i % GRID_COLS)) % 5) as TypeId,
);

describe('verifyRun(VARIANT_CLASSIC)', () => {
  it('finishes hands-free with no problems', () => {
    const report = verifyRun(VARIANT_CLASSIC);

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(VARIANT_CLASSIC.scoreTarget);
    expect(report.moves).toBeGreaterThanOrEqual(VARIANT_CLASSIC.minMoves);
    expect(report.moves).toBeLessThanOrEqual(VARIANT_CLASSIC.expectedMaxMoves);
  });

  it('keeps the shipped run punchy', () => {
    // The demo seed is picked for pace: a hands-free run should not drag.
    expect(verifyRun(VARIANT_CLASSIC).moves).toBeLessThanOrEqual(6);
  });

  it('reaches the goal from any seed, never dead-ending', () => {
    for (const rngSeed of SEEDS) {
      const report = verifyRun({ ...VARIANT_CLASSIC, rngSeed });
      expect(report.problems, `seed ${rngSeed}`).toEqual([]);
    }
  });

  it('fails a target the run cannot reach in the allowed moves', () => {
    const unreachable: Variant = { ...VARIANT_CLASSIC, scoreTarget: 500_000 };

    const report = verifyRun(unreachable);

    expect(report.ok).toBe(false);
    expect(report.problems.join('\n')).toMatch(/only reached|expected at most/);
  });

  it('fails a pacing bound the run overshoots', () => {
    const impatient: Variant = { ...VARIANT_CLASSIC, expectedMaxMoves: 1 };

    expect(verifyRun(impatient).problems.join('\n')).toMatch(/expected at most 1/);
  });
});

describe('assertRun', () => {
  it('returns the report for a good variant', () => {
    expect(assertRun(VARIANT_CLASSIC).ok).toBe(true);
  });

  it('throws naming the variant when the run cannot finish', () => {
    expect(() => assertRun({ ...VARIANT_CLASSIC, scoreTarget: 500_000 })).toThrow(
      /verifyRun\("classic"\) failed/,
    );
  });
});

describe('isRunComplete', () => {
  it('holds the CTA back until the move floor is met', () => {
    const target = VARIANT_CLASSIC.scoreTarget;

    // A lucky first move that clears the whole goal must still not end the ad.
    expect(isRunComplete(VARIANT_CLASSIC, target * 3, 1)).toBe(false);
    expect(isRunComplete(VARIANT_CLASSIC, target, VARIANT_CLASSIC.minMoves)).toBe(true);
  });

  it('needs the score as well as the moves', () => {
    expect(isRunComplete(VARIANT_CLASSIC, VARIANT_CLASSIC.scoreTarget - 1, 20)).toBe(false);
  });
});

describe('resolve', () => {
  it('always settles to a full board with nothing left to match', () => {
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      const board = generateBoard(rng);

      for (let move = 0; move < 8; move++) {
        if (!hasLegalMove(board)) reshuffle(board, rng);
        const swap = bestSwap(board.cells)!;
        resolve(board, swap, rng, VARIANT_CLASSIC.scoring);

        expect(isFull(board), `seed ${seed} move ${move}`).toBe(true);
        expect(findMatches(board.cells), `seed ${seed} move ${move}`).toEqual([]);
      }
    }
  });

  it('scores each clear by tiles times the capped combo multiplier', () => {
    const { perTile, maxMultiplier } = VARIANT_CLASSIC.scoring;
    const rng = createRng(20260820);
    const board = generateBoard(rng);
    const swap = bestSwap(board.cells)!;

    const { steps, points } = resolve(board, swap, rng, VARIANT_CLASSIC.scoring);
    const matches = matchSteps(steps);

    let expected = 0;
    matches.forEach((step, level) => {
      const multiplier = Math.min(level + 1, maxMultiplier);
      expect(step.comboLevel).toBe(level);
      expect(step.points).toBe(step.cleared.length * perTile * multiplier);
      expected += step.points;
    });

    expect(points).toBe(expected);
    expect(points).toBeGreaterThan(0);
  });

  it('never multiplies beyond the cap, however deep the chain', () => {
    const rng = createRng(123456);
    const board = generateBoard(rng);
    let deepest = 0;

    for (let move = 0; move < 12; move++) {
      if (!hasLegalMove(board)) reshuffle(board, rng);
      const swap = bestSwap(board.cells)!;
      const { steps } = resolve(board, swap, rng, VARIANT_CLASSIC.scoring);

      for (const step of matchSteps(steps)) {
        deepest = Math.max(deepest, step.comboLevel);
        const multiplier = step.points / (step.cleared.length * VARIANT_CLASSIC.scoring.perTile);
        expect(multiplier).toBeLessThanOrEqual(VARIANT_CLASSIC.scoring.maxMultiplier);
      }
    }

    // Guard the guard: this seed must actually reach past the cap to prove anything.
    expect(deepest).toBeGreaterThanOrEqual(VARIANT_CLASSIC.scoring.maxMultiplier);
  });

  it('opens each move with the swap and closes it with settle', () => {
    const rng = createRng(7);
    const board = generateBoard(rng);
    const swap = bestSwap(board.cells)!;

    const { steps } = resolve(board, swap, rng, VARIANT_CLASSIC.scoring);

    expect(steps[0]).toMatchObject({ kind: 'swap', a: swap.a, b: swap.b });
    expect(steps[steps.length - 1]).toEqual({ kind: 'settle' });
  });

  it('replays onto a live board through applyStep, move after move', () => {
    // The director resolves on a clone, then walks the steps onto the live board as it
    // animates. If those two ever drift, gameplay silently diverges from what was
    // planned — and from what verifyRun asserted.
    const plannedRng = createRng(18);
    const liveRng = createRng(18);
    const planned = generateBoard(plannedRng);
    const live = generateBoard(liveRng);

    for (let move = 0; move < 6; move++) {
      const swap = bestSwap(live.cells)!;
      const staged = cloneBoard(live);
      const { steps } = resolve(staged, swap, liveRng, VARIANT_CLASSIC.scoring);
      for (const step of steps) applyStep(live, step);

      resolve(planned, bestSwap(planned.cells)!, plannedRng, VARIANT_CLASSIC.scoring);

      expect(typeLayout(live), `move ${move}`).toEqual(typeLayout(planned));
    }
  });

  it('replays identically from the same seed', () => {
    const run = () => {
      const rng = createRng(4242);
      const board = generateBoard(rng);
      const swap = bestSwap(board.cells)!;
      const outcome = resolve(board, swap, rng, VARIANT_CLASSIC.scoring);
      return { steps: outcome.steps, points: outcome.points, layout: typeLayout(board) };
    };

    expect(run()).toEqual(run());
  });
});

const LATTICE: TypeId[] = Array.from(
  { length: CELL_COUNT },
  (_, i) => ((2 * Math.floor(i / GRID_COLS) + (i % GRID_COLS)) % 5) as TypeId,
);

/** Opening-match-free lattice with a 4-in-a-row sitting behind one swap. */
function fourMatchBoard(): ReturnType<typeof createBoard> {
  const layout = LATTICE.slice();
  layout[indexOf(5, 1)] = 0;
  layout[indexOf(5, 2)] = 1;
  layout[indexOf(5, 3)] = 0;
  layout[indexOf(6, 2)] = 0;
  return createBoard(layout);
}

/** Same lattice, but the swap only completes a 3. */
function threeMatchBoard(): ReturnType<typeof createBoard> {
  const layout = LATTICE.slice();
  layout[indexOf(5, 1)] = 0;
  layout[indexOf(6, 2)] = 0;
  return createBoard(layout);
}

const FOUR_SWAP = { a: indexOf(5, 2), b: indexOf(6, 2) };

describe('striped leftovers', () => {
  it('leaves a striped candy in a 4-match when stripeAt is 4', () => {
    const board = fourMatchBoard();
    expect(findMatches(board.cells)).toEqual([]);

    const { steps } = resolve(board, FOUR_SWAP, createRng(1), VARIANT_CLASSIC.scoring, 4);
    const first = matchSteps(steps)[0];

    expect(first.cleared).toHaveLength(4);
    expect(first.spawned).toHaveLength(1);
    expect(first.spawned[0]).toMatchObject({
      type: 0,
      special: 'stripedRow',
      to: FOUR_SWAP.a,
    });
  });

  it('does not award a stripe for a 3-match', () => {
    const { steps } = resolve(threeMatchBoard(), FOUR_SWAP, createRng(1), VARIANT_CLASSIC.scoring, 4);
    expect(matchSteps(steps)[0].spawned).toEqual([]);
  });

  it('never awards a stripe when stripeAt is null', () => {
    const { steps } = resolve(fourMatchBoard(), FOUR_SWAP, createRng(1), VARIANT_CLASSIC.scoring, null);
    expect(matchSteps(steps)[0].spawned).toEqual([]);
  });

  it('replays leftovers onto a live board without drifting specials', () => {
    const planned = fourMatchBoard();
    const live = fourMatchBoard();
    const { steps } = resolve(planned, FOUR_SWAP, createRng(9), VARIANT_CLASSIC.scoring, 4);
    for (const step of steps) applyStep(live, step);

    expect(typeLayout(live)).toEqual(typeLayout(planned));
    expect(specialLayout(live)).toEqual(specialLayout(planned));
  });
});

describe('verifyRun(VARIANT_CASCADE)', () => {
  it('finishes hands-free with no problems', () => {
    const report = verifyRun(VARIANT_CASCADE);

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(VARIANT_CASCADE.scoreTarget);
    expect(report.moves).toBeGreaterThanOrEqual(VARIANT_CASCADE.minMoves);
    expect(report.moves).toBeLessThanOrEqual(VARIANT_CASCADE.expectedMaxMoves);
  });

  it('keeps the shipped run punchy', () => {
    expect(verifyRun(VARIANT_CASCADE).moves).toBeLessThanOrEqual(6);
  });

  it('produces at least one striped leftover in the simulated run', () => {
    expect(stripesInRun(VARIANT_CASCADE)).toBeGreaterThan(0);
  });
});

describe('selectVariant', () => {
  it('routes ?variant=cascade to the jackpot config', () => {
    expect(selectVariant('?variant=cascade')).toBe(VARIANT_CASCADE);
  });

  it('falls back to classic for anything unrecognised', () => {
    expect(selectVariant('?variant=nope')).toBe(VARIANT_CLASSIC);
    expect(selectVariant('')).toBe(VARIANT_CLASSIC);
  });
});

describe('wantsIdleAssist', () => {
  it('is off unless capture explicitly opts in', () => {
    expect(wantsIdleAssist('?variant=cascade')).toBe(false);
    expect(wantsIdleAssist('?assist=1')).toBe(true);
    expect(wantsIdleAssist('?variant=classic&assist=1')).toBe(true);
  });
});

function stripesInRun(variant: Variant): number {
  const rng = createRng(variant.rngSeed);
  const board = generateBoard(rng);
  let score = 0;
  let moves = 0;
  let stripes = 0;

  while (!isRunComplete(variant, score, moves) && moves < 200) {
    if (!hasLegalMove(board)) reshuffle(board, rng);
    const swap = bestSwap(board.cells);
    if (!swap) break;
    const outcome = resolve(board, swap, rng, variant.scoring, variant.stripeAt);
    for (const step of matchSteps(outcome.steps)) stripes += step.spawned.length;
    score += outcome.points;
    moves++;
  }

  return stripes;
}

describe('reshuffle', () => {
  it('rescues a board with no legal moves', () => {
    const board = createBoard(DEADLOCK);
    expect(hasLegalMove(board)).toBe(false);

    reshuffle(board, createRng(11));

    expect(hasLegalMove(board)).toBe(true);
    expect(findMatches(board.cells)).toEqual([]);
    expect(isFull(board)).toBe(true);
  });

  it('leaves a board the player can immediately act on', () => {
    const board = createBoard(DEADLOCK);
    reshuffle(board, createRng(3));

    expect(findValidSwaps(board.cells).length).toBeGreaterThan(0);
  });
});
