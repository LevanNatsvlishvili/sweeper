import { describe, expect, it } from 'vitest';

import { applyStep, createBoard, typeLayout } from './board';
import { findMatches } from './matcher';
import { assertSeed, resolve, verifySeed } from './resolve';
import { indexOf, type Step, type TypeId } from './types';
import { VARIANT_CLASSIC, type Variant } from './variants';

const RIGGED_SWAP = { a: indexOf(2, 2), b: indexOf(2, 3) };

const kinds = (steps: readonly Step[]) => steps.map((step) => step.kind);
const matchSteps = (steps: readonly Step[]) =>
  steps.filter((step): step is Extract<Step, { kind: 'match' }> => step.kind === 'match');

describe('verifySeed(VARIANT_CLASSIC)', () => {
  it('passes with no problems', () => {
    const report = verifySeed(VARIANT_CLASSIC);

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.swap).toEqual(RIGGED_SWAP);
  });

  it('has teeth — a single altered seed cell fails it', () => {
    const tampered: Variant = {
      ...VARIANT_CLASSIC,
      seed: VARIANT_CLASSIC.seed.map((type, index) => (index === 0 ? 3 : type)) as TypeId[],
    };

    const report = verifySeed(tampered);

    expect(report.ok).toBe(false);
    expect(report.problems.length).toBeGreaterThan(0);
  });

  it('rejects a refill script that is one tile short', () => {
    const starved: Variant = {
      ...VARIANT_CLASSIC,
      refills: [VARIANT_CLASSIC.refills[0], [[4], [1], [3], [0], [0]]],
    };

    const report = verifySeed(starved);

    expect(report.ok).toBe(false);
    expect(report.problems.join('\n')).toMatch(/column 2/);
  });
});

describe('assertSeed', () => {
  it('returns the report for a good seed', () => {
    expect(assertSeed(VARIANT_CLASSIC).swap).toEqual(RIGGED_SWAP);
  });

  it('throws listing every problem when the seed is broken', () => {
    const broken: Variant = { ...VARIANT_CLASSIC, expect: { clearedPerStep: [3] } };

    expect(() => assertSeed(broken)).toThrow(/verifySeed\("classic"\) failed/);
  });
});

describe('resolve — the rigged classic chain', () => {
  it('runs swap, match, fall, cascade, fall, refill, settle', () => {
    const board = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);

    const steps = resolve(board, RIGGED_SWAP, VARIANT_CLASSIC);

    // No refill after the first match: the spec's cascade comes from falling tiles alone.
    expect(kinds(steps)).toEqual([
      'swap',
      'match',
      'gravity',
      'match',
      'gravity',
      'refill',
      'settle',
    ]);
  });

  it('clears exactly three tiles in the middle row on the swap', () => {
    const board = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);
    const [first] = matchSteps(resolve(board, RIGGED_SWAP, VARIANT_CLASSIC));

    expect(first.comboLevel).toBe(0);
    expect(first.runs).toHaveLength(1);
    expect(first.runs[0]).toMatchObject({ dir: 'row', type: 3 });
    expect(first.cleared).toEqual([indexOf(2, 0), indexOf(2, 1), indexOf(2, 2)]);
  });

  it('drops falling tiles into exactly one engineered follow-up match', () => {
    const board = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);
    const [, second] = matchSteps(resolve(board, RIGGED_SWAP, VARIANT_CLASSIC));

    expect(second.comboLevel).toBe(1);
    expect(second.runs).toHaveLength(1);
    expect(second.runs[0]).toMatchObject({ dir: 'row', type: 2 });
    expect(second.cleared).toEqual([indexOf(2, 2), indexOf(2, 3), indexOf(2, 4)]);
  });

  it('refills once, after the cascade, filling all six accumulated holes', () => {
    const board = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);
    const steps = resolve(board, RIGGED_SWAP, VARIANT_CLASSIC);
    const refills = steps.filter(
      (step): step is Extract<Step, { kind: 'refill' }> => step.kind === 'refill',
    );

    expect(refills).toHaveLength(1);
    expect(refills[0].spawns).toHaveLength(6);
    // Every incoming tile falls from above the top row, stacked in drop order.
    expect(refills[0].spawns.every((spawn) => spawn.dropFromRow < 0)).toBe(true);
    expect(steps.indexOf(refills[0])).toBeGreaterThan(steps.findIndex((s) => s.kind === 'match'));
  });

  it('settles to the hand-verified board with nothing left to match', () => {
    const board = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);

    resolve(board, RIGGED_SWAP, VARIANT_CLASSIC);

    // prettier-ignore
    expect(typeLayout(board)).toEqual([
      4, 1, 2, 0, 0,
      2, 4, 3, 3, 4,
      1, 4, 3, 4, 1,
      2, 0, 1, 4, 0,
      4, 3, 0, 3, 0,
    ]);
    expect(findMatches(board.cells)).toEqual([]);
  });

  it('is deterministic across runs', () => {
    const run = () => {
      const board = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);
      return { steps: resolve(board, RIGGED_SWAP, VARIANT_CLASSIC), layout: typeLayout(board) };
    };

    expect(run()).toEqual(run());
  });

  it('replays onto a live board through applyStep at each boundary', () => {
    const planned = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);
    const steps = resolve(planned, RIGGED_SWAP, VARIANT_CLASSIC);

    const live = createBoard(VARIANT_CLASSIC.seed, VARIANT_CLASSIC.specials);
    for (const step of steps) applyStep(live, step);

    expect(typeLayout(live)).toEqual(typeLayout(planned));
  });
});
