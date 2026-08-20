// Grid primitives and pure-data types shared by the board engine. Never imports Pixi.

export const GRID_SIZE = 5;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** Index into the 5-entry candy palette. Shape and colour are paired per type so the board reads for colourblind players. */
export type TypeId = 0 | 1 | 2 | 3 | 4;

/** 'stripedRow' clears its entire row when matched — the Cascade Jackpot variant's engineered tile. */
export type Special = 'none' | 'stripedRow';

/** Row-major grid index: row * GRID_SIZE + col. Row 0 is the top. */
export type GridIndex = number;

export interface Tile {
  /**
   * Stable across swaps and gravity. The renderer follows a tile by id rather than
   * re-drawing the board, which is what makes a fall animatable instead of a snap.
   */
  readonly id: number;
  readonly type: TypeId;
  readonly special: Special;
}

/** A cell holds a tile, or null while it's a hole awaiting gravity or refill. */
export type Cell = Tile | null;

export interface Run {
  readonly cells: readonly GridIndex[];
  readonly type: TypeId;
  readonly dir: 'row' | 'col';
}

export interface Swap {
  readonly a: GridIndex;
  readonly b: GridIndex;
}

export interface Move {
  readonly tileId: number;
  readonly from: GridIndex;
  readonly to: GridIndex;
}

export interface Spawn {
  readonly tileId: number;
  readonly type: TypeId;
  readonly to: GridIndex;
  /** Virtual row above the board to fall in from; -1 sits one cell above row 0. */
  readonly dropFromRow: number;
}

/**
 * Refill tiles for one resolution step, indexed by column, ordered bottom-first.
 * Scripted, never random — determinism is the whole point of the rig.
 *
 * `null` means "hold the holes open this step": the Classic variant's cascade has to
 * come from falling tiles alone, so nothing drops in until the combo has played.
 */
export type RefillStep = readonly (readonly TypeId[])[] | null;

/**
 * The resolution pipeline flattened into an ordered, animatable list. Produced by
 * resolve() and replayed by the director; board state only ever mutates at these
 * boundaries, which is what lets an MRAID pause freeze mid-fall without desyncing.
 */
export type Step =
  | { readonly kind: 'swap'; readonly a: GridIndex; readonly b: GridIndex }
  | {
      readonly kind: 'match';
      readonly runs: readonly Run[];
      readonly cleared: readonly GridIndex[];
      readonly comboLevel: number;
    }
  | { readonly kind: 'gravity'; readonly moves: readonly Move[] }
  | { readonly kind: 'refill'; readonly spawns: readonly Spawn[] }
  | { readonly kind: 'settle' };

export function indexOf(row: number, col: number): GridIndex {
  return row * GRID_SIZE + col;
}

export function rowOf(index: GridIndex): number {
  return Math.floor(index / GRID_SIZE);
}

export function colOf(index: GridIndex): number {
  return index % GRID_SIZE;
}
