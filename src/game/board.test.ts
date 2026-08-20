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
import { CELL_COUNT, GRID_COLS, GRID_ROWS, indexOf, type TypeId } from './types';
import { VARIANT_CLASSIC } from './variants';

const seed = () => [...VARIANT_CLASSIC.seed] as TypeId[];
const column = (cells: ReturnType<typeof createBoard>['cells'], col: number) =>
  Array.from({ length: GRID_ROWS }, (_, row) => cells[indexOf(row, col)]?.id ?? null);

describe('createBoard', () => {
  it('rejects a seed that is not a full grid', () => {
    expect(() => createBoard([0, 1, 2])).toThrow(/50 tiles/);
  });

  it('gives every tile a distinct id', () => {
    const board = createBoard(seed());
    const ids = new Set(board.cells.map((cell) => cell!.id));

    expect(ids.size).toBe(CELL_COUNT);
  });
});

describe('applyGravity', () => {
  it('compacts a column downward while preserving tile order', () => {
    const board = createBoard(seed());
    const before = column(board.cells, 2);

    clearCells(board, [indexOf(1, 2)]);
    applyGravity(board);

    // The r1 tile is gone, everything above it shifted down one, order intact.
    expect(column(board.cells, 2)).toEqual([null, before[0], ...before.slice(2)]);
  });

  it('reports a move for every tile that actually shifted', () => {
    const board = createBoard(seed());
    clearCells(board, [indexOf(GRID_ROWS - 1, 0)]);

    const moves = applyGravity(board);

    // Clearing the bottom of a column drops the whole stack above it by one row.
    expect(moves).toHaveLength(GRID_ROWS - 1);
    for (const move of moves) {
      expect(move.to - move.from).toBe(GRID_COLS);
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

  it('drops a tile the full height of the board', () => {
    const board = createBoard(seed());
    const top = board.cells[indexOf(0, 3)]!.id;

    // Clear all but the top cell of column 3; the survivor must land on the floor.
    clearCells(
      board,
      Array.from({ length: GRID_ROWS - 1 }, (_, row) => indexOf(row + 1, 3)),
    );
    applyGravity(board);

    expect(board.cells[indexOf(GRID_ROWS - 1, 3)]!.id).toBe(top);
    expect(holesInColumn(board, 3)).toHaveLength(GRID_ROWS - 1);
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
      { tileId: CELL_COUNT, type: 3, to: indexOf(1, 2), dropFromRow: -1 },
      { tileId: CELL_COUNT + 1, type: 2, to: indexOf(0, 2), dropFromRow: -2 },
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
    const board = createBoard(seed(), { [indexOf(6, 1)]: 'stripedRow' });

    const expanded = expandSpecials(board, [indexOf(6, 0), indexOf(6, 1)]);

    expect(expanded).toEqual([30, 31, 32, 33, 34]);
  });

  it('leaves an ordinary clear alone', () => {
    const board = createBoard(seed());

    expect(expandSpecials(board, [30, 31, 32])).toEqual([30, 31, 32]);
  });
});

describe('cloneBoard', () => {
  it('isolates the copy from later mutations', () => {
    const board = createBoard(seed());
    const copy = cloneBoard(board);

    applySwap(board, { a: indexOf(5, 1), b: indexOf(5, 2) });

    expect(typeLayout(copy)).toEqual(seed());
    expect(typeLayout(board)).not.toEqual(seed());
  });
});
