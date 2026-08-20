// Gravity fall, refill, and settle steps of the resolution pipeline.

import { colOf, rowOf, type Move, type Spawn } from './types';
import {
  animateTo,
  cellCenter,
  createTileView,
  placeTileView,
  waitFor,
  type TileView,
} from './tiles';
import type { Container } from 'pixi.js';

const COLUMN_STAGGER = 0.05;

export async function playGravity(views: ReadonlyMap<number, TileView>, moves: readonly Move[], duration: number): Promise<void> {
  if (moves.length === 0) return;

  await Promise.all(
    moves.map((move) => {
      const view = views.get(move.tileId);
      if (!view) return Promise.resolve();
      const dest = cellCenter(rowOf(move.to), colOf(move.to));
      return animateTo(view.root, {
        x: dest.x,
        y: dest.y,
        duration,
        delay: colOf(move.to) * COLUMN_STAGGER,
        ease: 'bounce.out',
      });
    }),
  );
}

export async function playRefill(
  views: Map<number, TileView>,
  parent: Container,
  spawns: readonly Spawn[],
  duration: number,
): Promise<void> {
  if (spawns.length === 0) return;

  for (const spawn of spawns) {
    const view = createTileView({ id: spawn.tileId, type: spawn.type, special: 'none' });
    placeTileView(view, spawn.dropFromRow, colOf(spawn.to));
    parent.addChild(view.root);
    views.set(spawn.tileId, view);
  }

  await Promise.all(
    spawns.map((spawn) => {
      const view = views.get(spawn.tileId);
      if (!view) return Promise.resolve();
      const dest = cellCenter(rowOf(spawn.to), colOf(spawn.to));
      return animateTo(view.root, {
        x: dest.x,
        y: dest.y,
        duration,
        delay: colOf(spawn.to) * COLUMN_STAGGER,
        ease: 'bounce.out',
      });
    }),
  );
}

export function playSettle(duration: number): Promise<void> {
  return waitFor(duration);
}
