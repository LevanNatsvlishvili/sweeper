import { describe, expect, it } from 'vitest';

import {
  applyGravity,
  applyRefill,
  applyStep,
  applySwap,
  clearCells,
  cloneBoard,
  createBoard,
  expandSpecials,
  holesInColumn,
  isFull,
  placeSpawns,
  replaceAll,
  typeLayout,
} from './board';
import { findMatches } from './matcher';
import { createRng } from './rng';
import { CELL_COUNT, GRID_COLS, GRID_ROWS, indexOf, type TypeId } from './types';

// (2*row + col) % 5 — neighbours differ by 1 across a row and by 2 down a column, so the
// pattern is provably match-free and makes a stable fixture for gravity and refill.
const BASE_LAYOUT: TypeId[] = Array.from(
  { length: CELL_COUNT },
  (_, i) => ((2 * Math.floor(i / GRID_COLS) + (i % GRID_COLS)) % 5) as TypeId,
);

const board = () => createBoard(BASE_LAYOUT);
const column = (cells: ReturnType<typeof createBoard>['cells'], col: number) =>
  Array.from({ length: GRID_ROWS }, (_, row) => cells[indexOf(row, col)]?.id ?? null);

describe('createBoard', () => {
  it('rejects a layout that is not a full grid', () => {
    expect(() => createBoard([0, 1, 2])).toThrow(/50 tiles/);
  });

  it('gives every tile a distinct id', () => {
    expect(new Set(board().cells.map((cell) => cell!.id)).size).toBe(CELL_COUNT);
  });

  it('starts from a match-free fixture', () => {
    expect(findMatches(board().cells)).toEqual([]);
  });
});

describe('applyGravity', () => {
  it('compacts a column downward while preserving tile order', () => {
    const b = board();
    const before = column(b.cells, 2);

    clearCells(b, [indexOf(1, 2)]);
    applyGravity(b);

    expect(column(b.cells, 2)).toEqual([null, before[0], ...before.slice(2)]);
  });

  it('reports a move for every tile that actually shifted', () => {
    const b = board();
    clearCells(b, [indexOf(GRID_ROWS - 1, 0)]);

    const moves = applyGravity(b);

    expect(moves).toHaveLength(GRID_ROWS - 1);
    for (const move of moves) {
      expect(move.to - move.from).toBe(GRID_COLS);
      expect(b.cells[move.to]!.id).toBe(move.tileId);
    }
  });

  it('returns no moves when nothing is cleared', () => {
    expect(applyGravity(board())).toEqual([]);
  });

  it('drops a tile the full height of the board', () => {
    const b = board();
    const top = b.cells[indexOf(0, 3)]!.id;

    clearCells(
      b,
      Array.from({ length: GRID_ROWS - 1 }, (_, row) => indexOf(row + 1, 3)),
    );
    applyGravity(b);

    expect(b.cells[indexOf(GRID_ROWS - 1, 3)]!.id).toBe(top);
    expect(holesInColumn(b, 3)).toHaveLength(GRID_ROWS - 1);
  });
});

describe('applyRefill', () => {
  it('fills every hole and stacks the drop rows above the board', () => {
    const b = board();
    const rng = createRng(42);
    clearCells(b, [indexOf(0, 2), indexOf(1, 2), indexOf(4, 2), indexOf(9, 0)]);
    applyGravity(b);

    const holes = holesInColumn(b, 2).length + holesInColumn(b, 0).length;
    const spawns = applyRefill(b, rng);

    expect(spawns).toHaveLength(holes);
    expect(isFull(b)).toBe(true);

    const columnTwo = spawns.filter((s) => s.to % GRID_COLS === 2);
    // Bottom-first, each subsequent tile queued one row higher off-screen.
    expect(columnTwo.map((s) => s.dropFromRow)).toEqual([-1, -2, -3]);
  });

  it('gives refilled tiles fresh ids that never collide with survivors', () => {
    const b = board();
    clearCells(b, [indexOf(0, 1), indexOf(1, 1)]);
    applyGravity(b);

    const survivors = new Set(b.cells.filter(Boolean).map((cell) => cell!.id));
    const spawns = applyRefill(b, createRng(7));

    for (const spawn of spawns) expect(survivors.has(spawn.tileId)).toBe(false);
    expect(new Set(b.cells.map((cell) => cell!.id)).size).toBe(CELL_COUNT);
  });

  it('is reproducible for a given seed', () => {
    const run = () => {
      const b = board();
      clearCells(b, [indexOf(0, 0), indexOf(0, 1), indexOf(0, 2)]);
      applyGravity(b);
      applyRefill(b, createRng(99));
      return typeLayout(b);
    };

    expect(run()).toEqual(run());
  });
});

describe('expandSpecials', () => {
  it('pulls in the whole row of a striped tile caught in the clear', () => {
    const b = createBoard(BASE_LAYOUT, { [indexOf(6, 1)]: 'stripedRow' });

    expect(expandSpecials(b, [indexOf(6, 0), indexOf(6, 1)])).toEqual([30, 31, 32, 33, 34]);
  });

  it('leaves an ordinary clear alone', () => {
    expect(expandSpecials(board(), [30, 31, 32])).toEqual([30, 31, 32]);
  });
});

describe('placeSpawns', () => {
  it('honours a striped leftover special instead of flattening it to none', () => {
    const b = board();
    clearCells(b, [indexOf(4, 2)]);

    placeSpawns(b, [
      { tileId: 900, type: 3, special: 'stripedRow', to: indexOf(4, 2), dropFromRow: 4 },
    ]);

    expect(b.cells[indexOf(4, 2)]).toMatchObject({ id: 900, type: 3, special: 'stripedRow' });
    expect(b.nextTileId).toBeGreaterThan(900);
  });
});

describe('applyStep match leftovers', () => {
  it('clears the run then plants the striped leftover in the hole', () => {
    const b = board();
    const hole = indexOf(3, 1);

    applyStep(b, {
      kind: 'match',
      runs: [{ cells: [hole], type: 1, dir: 'row' }],
      cleared: [hole],
      comboLevel: 0,
      points: 80,
      spawned: [{ tileId: 700, type: 1, special: 'stripedRow', to: hole, dropFromRow: 3 }],
    });

    expect(b.cells[hole]).toMatchObject({ id: 700, type: 1, special: 'stripedRow' });
  });
});

describe('replaceAll', () => {
  it('rewrites every cell with fresh tiles', () => {
    const b = board();
    const before = new Set(b.cells.map((cell) => cell!.id));

    const shuffled = [...BASE_LAYOUT].reverse();
    replaceAll(b, shuffled);

    expect(typeLayout(b)).toEqual(shuffled);
    for (const cell of b.cells) expect(before.has(cell!.id)).toBe(false);
  });
});

describe('cloneBoard', () => {
  it('isolates the copy from later mutations', () => {
    const b = board();
    const copy = cloneBoard(b);

    applySwap(b, { a: indexOf(5, 1), b: indexOf(5, 2) });

    expect(typeLayout(copy)).toEqual(BASE_LAYOUT);
    expect(typeLayout(b)).not.toEqual(BASE_LAYOUT);
  });
});
