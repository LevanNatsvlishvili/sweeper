// Pure-data 10x5 grid state and step-boundary mutations.

import {
  ALL_TYPES,
  CELL_COUNT,
  GRID_COLS,
  GRID_ROWS,
  indexOf,
  rowOf,
  type Cell,
  type GridIndex,
  type Move,
  type Spawn,
  type Special,
  type Step,
  type Swap,
  type Tile,
  type TypeId,
} from './types';
import type { Rng } from './rng';

export interface Board {
  readonly cells: Cell[];
  /** Monotonic id source. Refilled tiles take fresh ids so no view is reused mid-fall. */
  nextTileId: number;
}

export interface Cleared {
  readonly tile: Tile;
  readonly at: GridIndex;
}

export function createBoard(
  seed: readonly TypeId[],
  specials: Readonly<Record<GridIndex, Special>> = {},
): Board {
  if (seed.length !== CELL_COUNT) {
    throw new Error(`seed must hold ${CELL_COUNT} tiles, got ${seed.length}`);
  }

  const cells: Cell[] = seed.map((type, index) => ({
    id: index,
    type,
    special: specials[index] ?? 'none',
  }));

  return { cells, nextTileId: CELL_COUNT };
}

/** Tiles are immutable, so a shallow copy of the cell array is a full clone. */
export function cloneBoard(board: Board): Board {
  return { cells: board.cells.slice(), nextTileId: board.nextTileId };
}

export function applySwap(board: Board, swap: Swap): void {
  const { cells } = board;
  const held = cells[swap.a];
  cells[swap.a] = cells[swap.b];
  cells[swap.b] = held;
}

/** Empties the given cells and hands back what was in them, for the shard burst. */
export function clearCells(board: Board, indices: readonly GridIndex[]): Cleared[] {
  const cleared: Cleared[] = [];

  for (const index of indices) {
    const tile = board.cells[index];
    if (!tile) continue;
    cleared.push({ tile, at: index });
    board.cells[index] = null;
  }

  return cleared;
}

/**
 * Compacts every column downward. Returns one Move per tile that actually shifted, so
 * the renderer animates a fall rather than diffing two board snapshots itself.
 */
export function applyGravity(board: Board): Move[] {
  const moves: Move[] = [];
  const { cells } = board;

  for (let col = 0; col < GRID_COLS; col++) {
    let write = GRID_ROWS - 1;

    for (let row = GRID_ROWS - 1; row >= 0; row--) {
      const from = indexOf(row, col);
      const tile = cells[from];
      if (!tile) continue;

      if (write !== row) {
        const to = indexOf(write, col);
        cells[to] = tile;
        cells[from] = null;
        moves.push({ tileId: tile.id, from, to });
      }

      write--;
    }

    // Everything above the write head is a hole by definition.
    for (let row = write; row >= 0; row--) cells[indexOf(row, col)] = null;
  }

  return moves;
}

/** Drops fresh tiles into every hole, bottom-first per column, from the seeded stream. */
export function applyRefill(board: Board, rng: Rng): Spawn[] {
  const spawns: Spawn[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    const holes = holesInColumn(board, col);

    holes.forEach((to, order) => {
      // Freely random: a refill that happens to complete a run is where the big chains
      // come from, and chains are the whole appeal. MAX_CASCADE_DEPTH bounds the runaway.
      const type = ALL_TYPES[rng.int(ALL_TYPES.length)];
      const tile: Tile = { id: board.nextTileId++, type, special: 'none' };
      board.cells[to] = tile;
      // Stack the incoming tiles above the board in fall order: -1, -2, -3...
      spawns.push({ tileId: tile.id, type, to, dropFromRow: -1 - order });
    });
  }

  return spawns;
}

/** Rewrites the whole grid — used by the reshuffle that rescues a dead board. */
export function replaceAll(board: Board, layout: readonly TypeId[]): void {
  for (let index = 0; index < CELL_COUNT; index++) {
    board.cells[index] = { id: board.nextTileId++, type: layout[index], special: 'none' };
  }
}

/** Holes in a column, bottom-first. After gravity they are always contiguous at the top. */
export function holesInColumn(board: Board, col: number): GridIndex[] {
  const holes: GridIndex[] = [];

  for (let row = GRID_ROWS - 1; row >= 0; row--) {
    const index = indexOf(row, col);
    if (!board.cells[index]) holes.push(index);
  }

  return holes;
}

export function isFull(board: Board): boolean {
  return board.cells.every((cell) => cell !== null);
}

/**
 * Expands a clear set to include the full row of any striped tile caught in it.
 * The Cascade Jackpot variant's row-clear comes from here, not from a forked pipeline.
 */
export function expandSpecials(board: Board, cleared: readonly GridIndex[]): GridIndex[] {
  const expanded = new Set<GridIndex>(cleared);

  for (const index of cleared) {
    const tile = board.cells[index];
    if (tile?.special !== 'stripedRow') continue;

    const row = rowOf(index);
    for (let col = 0; col < GRID_COLS; col++) expanded.add(indexOf(row, col));
  }

  return [...expanded].sort((a, b) => a - b);
}

/** Places refill tiles using the ids resolve() already assigned, so the view map stays in sync. */
export function placeSpawns(board: Board, spawns: readonly Spawn[]): void {
  for (const spawn of spawns) {
    board.cells[spawn.to] = { id: spawn.tileId, type: spawn.type, special: 'none' };
    if (spawn.tileId >= board.nextTileId) board.nextTileId = spawn.tileId + 1;
  }
}

/**
 * Replays one resolve() step onto a live board. The director animates the step first,
 * then calls this so gameplay state only mutates at step boundaries.
 */
export function applyStep(board: Board, step: Step): void {
  switch (step.kind) {
    case 'swap':
      applySwap(board, { a: step.a, b: step.b });
      break;
    case 'match':
      clearCells(board, step.cleared);
      break;
    case 'gravity':
      applyGravity(board);
      break;
    case 'refill':
      placeSpawns(board, step.spawns);
      break;
    case 'settle':
      break;
  }
}

/** Debug/test helper: the board's type layout as a plain CELL_COUNT-entry array. */
export function typeLayout(board: Board): (TypeId | null)[] {
  return board.cells.map((cell) => cell?.type ?? null);
}
