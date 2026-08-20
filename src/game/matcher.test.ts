import { describe, expect, it } from 'vitest';

import { clearCells, createBoard } from './board';
import { clearedIndices, findMatches, findValidSwaps } from './matcher';
import { indexOf, type TypeId } from './types';
import { VARIANT_CLASSIC } from './variants';

const cellsOf = (layout: TypeId[]) => createBoard(layout).cells;

describe('findMatches', () => {
  it('finds a horizontal run of three', () => {
    // prettier-ignore
    const cells = cellsOf([
      1, 1, 1, 0, 2,
      0, 2, 0, 1, 3,
      2, 0, 1, 2, 0,
      1, 3, 2, 0, 1,
      0, 1, 3, 2, 3,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'row', type: 1, cells: [0, 1, 2] });
  });

  it('finds a vertical run of three', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      1, 2, 0, 4, 3,
      3, 2, 4, 0, 1,
      4, 2, 1, 3, 0,
      2, 0, 3, 1, 4,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'col', type: 2, cells: [6, 11, 16] });
  });

  it('reports a run of five as one run, not three overlapping triples', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      1, 2, 0, 4, 3,
      3, 3, 3, 3, 3,
      4, 2, 1, 3, 0,
      2, 0, 3, 1, 4,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0].cells).toEqual([10, 11, 12, 13, 14]);
  });

  it('treats a hole as a break in the line', () => {
    // prettier-ignore
    const cells = cellsOf([
      1, 1, 1, 0, 2,
      0, 2, 0, 1, 3,
      2, 0, 1, 2, 0,
      1, 3, 2, 0, 1,
      0, 1, 3, 2, 3,
    ]);

    expect(findMatches(cells)).toHaveLength(1);

    cells[1] = null;

    expect(findMatches(cells)).toHaveLength(0);
  });

  it('returns nothing for a board with no runs', () => {
    expect(findMatches(cellsOf([...VARIANT_CLASSIC.seed] as TypeId[]))).toEqual([]);
  });
});

describe('clearedIndices', () => {
  it('dedupes the shared cell of a T shape', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 4, 4,
      1, 2, 0, 1, 3,
      4, 3, 3, 3, 0,
      2, 0, 3, 1, 4,
      1, 4, 3, 0, 2,
    ]);

    const runs = findMatches(cells);
    expect(runs).toHaveLength(2);

    // Row r2c1..r2c3 and column c2 r2..r4 overlap at r2c2 — five cells clear, not six.
    expect(clearedIndices(runs)).toEqual([11, 12, 13, 17, 22]);
  });
});

describe('findValidSwaps', () => {
  it('finds exactly one swap on the classic seed, at the board centre', () => {
    const cells = cellsOf([...VARIANT_CLASSIC.seed] as TypeId[]);

    const swaps = findValidSwaps(cells);

    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toEqual({ a: indexOf(2, 2), b: indexOf(2, 3) });
  });

  it('leaves the board untouched', () => {
    const cells = cellsOf([...VARIANT_CLASSIC.seed] as TypeId[]);
    const before = cells.slice();

    findValidSwaps(cells);

    expect(cells).toEqual(before);
  });

  it('ignores pairs involving a hole', () => {
    const board = createBoard([...VARIANT_CLASSIC.seed] as TypeId[]);
    clearCells(board, [indexOf(2, 2), indexOf(2, 3)]);

    expect(findValidSwaps(board.cells)).toEqual([]);
  });
});
