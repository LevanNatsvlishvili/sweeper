import { describe, expect, it } from 'vitest';

import { clearCells, createBoard } from './board';
import { clearedIndices, findMatches, findValidSwaps } from './matcher';
import { indexOf, type TypeId } from './types';
import { VARIANT_CLASSIC } from './variants';

const cellsOf = (layout: TypeId[]) => createBoard(layout).cells;

// Every layout below is the pattern (2*row + col) % 5 with one match planted in it.
// That base never produces a run — neighbours differ by 1 across a row and by 2 down a
// column — so whatever the test plants is provably the only match on the board.

describe('findMatches', () => {
  it('finds a horizontal run of three', () => {
    // prettier-ignore
    const cells = cellsOf([
      1, 1, 1, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'row', type: 1, cells: [0, 1, 2] });
  });

  it('finds a vertical run of three', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 3, 1, 2, 3,
      1, 3, 3, 4, 0,
      3, 4, 0, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'col', type: 3, cells: [6, 11, 16] });
  });

  it('spans the full width as one run, not three overlapping triples', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
      3, 3, 3, 3, 3,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0].cells).toEqual([25, 26, 27, 28, 29]);
  });

  it('finds a vertical run longer than the board is wide', () => {
    // A 10-row column can hold a run of 6 — impossible back when the grid was square.
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 2, 2, 3,
      1, 2, 2, 4, 0,
      3, 4, 2, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 2, 0, 1,
      4, 0, 2, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ dir: 'col', type: 2, cells: [12, 17, 22, 27, 32, 37] });
  });

  it('treats a hole as a break in the line', () => {
    // prettier-ignore
    const cells = cellsOf([
      1, 1, 1, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    expect(findMatches(cells)).toHaveLength(1);

    cells[1] = null;

    expect(findMatches(cells)).toHaveLength(0);
  });

  it('returns nothing for the seeded board', () => {
    expect(findMatches(cellsOf([...VARIANT_CLASSIC.seed] as TypeId[]))).toEqual([]);
  });
});

describe('clearedIndices', () => {
  it('dedupes the shared cell of a T shape', () => {
    // prettier-ignore
    const cells = cellsOf([
      0, 1, 2, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 3, 1, 2,
      0, 3, 3, 3, 4,
      2, 3, 4, 0, 1,
      4, 0, 1, 2, 3,
      1, 2, 3, 4, 0,
      3, 4, 0, 1, 2,
    ]);

    const runs = findMatches(cells);
    expect(runs).toHaveLength(2);

    // Row r5c1..r5c3 and column c2 r3..r5 overlap at r5c2 — five cells clear, not six.
    expect(clearedIndices(runs)).toEqual([17, 22, 26, 27, 28]);
  });
});

describe('findValidSwaps', () => {
  it('finds exactly one swap on the classic seed', () => {
    const cells = cellsOf([...VARIANT_CLASSIC.seed] as TypeId[]);

    const swaps = findValidSwaps(cells);

    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toEqual({ a: indexOf(5, 1), b: indexOf(5, 2) });
  });

  it('leaves the board untouched', () => {
    const cells = cellsOf([...VARIANT_CLASSIC.seed] as TypeId[]);
    const before = cells.slice();

    findValidSwaps(cells);

    expect(cells).toEqual(before);
  });

  it('ignores pairs involving a hole', () => {
    const board = createBoard([...VARIANT_CLASSIC.seed] as TypeId[]);
    clearCells(board, [indexOf(5, 1), indexOf(5, 2)]);

    expect(findValidSwaps(board.cells)).toEqual([]);
  });
});
