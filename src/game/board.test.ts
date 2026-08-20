import { describe, expect, it } from 'vitest';

import {
  applyGravity,
  applyRefill,
  applySwap,
  clearCells,
  cloneBoard,
  createBoard,
  expandSpecials,
  holesInColumn,
  isFull,
  typeLayout,
} from './board';
import { indexOf, type TypeId } from './types';
import { VARIANT_CLASSIC } from './variants';

const seed = () => [...VARIANT_CLASSIC.seed] as TypeId[];

describe('createBoard', () => {
  it('rejects a seed that is not a full grid', () => {
    expect(() => createBoard([0, 1, 2])).toThrow(/25 tiles/);
  });

  it('gives every tile a distinct id', () => {
    const board = createBoard(seed());
    const ids = new Set(board.cells.map((cell) => cell!.id));

    expect(ids.size).toBe(25);
  });
});

describe('applyGravity', () => {
  it('compacts a column downward while preserving tile order', () => {
    const board = createBoard(seed());
    const columnBefore = [0, 1, 2, 3, 4].map((row) => board.cells[indexOf(row, 2)]!.id);

    clearCells(board, [indexOf(1, 2)]);
    applyGravity(board);

    const columnAfter = [0, 1, 2, 3, 4].map((row) => board.cells[indexOf(row, 2)]?.id ?? null);

    // The r1 tile is gone, everything above it shifted down one, order intact.
    expect(columnAfter).toEqual([null, columnBefore[0], columnBefore[2], columnBefore[3], columnBefore[4]]);
  });

  it('reports a move for every tile that actually shifted', () => {
    const board = createBoard(seed());
    clearCells(board, [indexOf(4, 0)]);

    const moves = applyGravity(board);

    expect(moves).toHaveLength(4);
    for (const move of moves) {
      expect(move.to - move.from).toBe(5);
      expect(board.cells[move.to]!.id).toBe(move.tileId);
    }
  });

  it('returns no moves when nothing is cleared', () => {
    expect(applyGravity(createBoard(seed()))).toEqual([]);
  });

  it('keeps tile ids stable across the fall', () => {
    const board = createBoard(seed());
    const survivor = board.cells[indexOf(0, 1)]!.id;

    clearCells(board, [indexOf(3, 1)]);
    applyGravity(board);

    expect(board.cells[indexOf(1, 1)]!.id).toBe(survivor);
  });
});

describe('applyRefill', () => {
  it('fills a column bottom-first and stacks the drop rows above the board', () => {
    const board = createBoard(seed());
    clearCells(board, [indexOf(0, 2), indexOf(1, 2)]);
    applyGravity(board);

    expect(holesInColumn(board, 2)).toEqual([indexOf(1, 2), indexOf(0, 2)]);

    const spawns = applyRefill(board, [[], [], [3, 2], [], []]);

    expect(spawns).toEqual([
      { tileId: 25, type: 3, to: indexOf(1, 2), dropFromRow: -1 },
      { tileId: 26, type: 2, to: indexOf(0, 2), dropFromRow: -2 },
    ]);
    expect(board.cells[indexOf(1, 2)]!.type).toBe(3);
    expect(board.cells[indexOf(0, 2)]!.type).toBe(2);
    expect(isFull(board)).toBe(true);
  });

  it('throws when the script and the holes disagree', () => {
    const board = createBoard(seed());
    clearCells(board, [indexOf(0, 2), indexOf(1, 2)]);
    applyGravity(board);

    expect(() => applyRefill(board, [[], [], [3], [], []])).toThrow(
      /column 2 has 1 tiles but the column has 2 holes/,
    );
  });
});

describe('expandSpecials', () => {
  it('pulls in the whole row of a striped tile caught in the clear', () => {
    const board = createBoard(seed(), { [indexOf(2, 1)]: 'stripedRow' });

    const expanded = expandSpecials(board, [indexOf(2, 0), indexOf(2, 1)]);

    expect(expanded).toEqual([10, 11, 12, 13, 14]);
  });

  it('leaves an ordinary clear alone', () => {
    const board = createBoard(seed());

    expect(expandSpecials(board, [10, 11, 12])).toEqual([10, 11, 12]);
  });
});

describe('cloneBoard', () => {
  it('isolates the copy from later mutations', () => {
    const board = createBoard(seed());
    const copy = cloneBoard(board);

    applySwap(board, { a: indexOf(2, 2), b: indexOf(2, 3) });

    expect(typeLayout(copy)).toEqual(seed());
    expect(typeLayout(board)).not.toEqual(seed());
  });
});
