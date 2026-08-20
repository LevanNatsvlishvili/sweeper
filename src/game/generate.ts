// Builds playable boards from the seeded stream, and rescues one that has run dry.

import { createBoard, replaceAll, type Board } from './board';
import { findValidSwaps } from './matcher';
import type { Rng } from './rng';
import { ALL_TYPES, CELL_COUNT, GRID_COLS, GRID_ROWS, indexOf, type TypeId } from './types';

/** A board with no free matches and at least one legal move should exist within a few tries. */
const MAX_ATTEMPTS = 200;

/**
 * Fills the grid cell by cell, refusing any type that would complete a run with the two
 * cells already placed to the left or above. That makes an opening match impossible by
 * construction, so the only thing left to retry for is "has a legal move at all".
 */
function fillWithoutMatches(rng: Rng): TypeId[] {
  const layout: TypeId[] = new Array(CELL_COUNT);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const banned = new Set<TypeId>();

      if (col >= 2) {
        const left = layout[indexOf(row, col - 1)];
        if (left === layout[indexOf(row, col - 2)]) banned.add(left);
      }
      if (row >= 2) {
        const above = layout[indexOf(row - 1, col)];
        if (above === layout[indexOf(row - 2, col)]) banned.add(above);
      }

      const choices = ALL_TYPES.filter((type) => !banned.has(type));
      layout[indexOf(row, col)] = choices[rng.int(choices.length)];
    }
  }

  return layout;
}

function playableLayout(rng: Rng): TypeId[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const layout = fillWithoutMatches(rng);
    if (findValidSwaps(createBoard(layout).cells).length > 0) return layout;
  }

  throw new Error(`could not generate a playable board in ${MAX_ATTEMPTS} attempts`);
}

export function generateBoard(rng: Rng): Board {
  return createBoard(playableLayout(rng));
}

/**
 * Replaces a board that has no legal moves left. With no auto-play in the ad, this is the
 * *only* thing standing between the player and a dead screen: a stuck board would leave
 * them with nothing to do and no CTA, so it must never be removed.
 */
export function reshuffle(board: Board, rng: Rng): void {
  replaceAll(board, playableLayout(rng));
}

export function hasLegalMove(board: Board): boolean {
  return findValidSwaps(board.cells).length > 0;
}
