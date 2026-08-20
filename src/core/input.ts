// Tile drag-swipe (cardinal) with tap-select fallback. Game rules live in the director.

import type { Container, FederatedPointerEvent } from 'pixi.js';

import { CELL_SIZE, hitCell } from '../game/tiles';
import { neighborOf, type Cardinal, type GridIndex } from '../game/types';

const DRAG_THRESHOLD = 0.3;

export interface TileInputHandlers {
  isEnabled: () => boolean;
  onSwipe: (from: GridIndex, to: GridIndex) => void;
  onTap: (index: GridIndex) => void;
}

export function setupTileInput(layer: Container, handlers: TileInputHandlers): () => void {
  let startX = 0;
  let startY = 0;
  let startCell: GridIndex | null = null;
  let tracking = false;
  let swiped = false;

  function localPoint(e: FederatedPointerEvent): { x: number; y: number } {
    return layer.toLocal(e.global);
  }

  function onPointerDown(e: FederatedPointerEvent): void {
    if (!handlers.isEnabled()) return;
    const local = localPoint(e);
    startCell = hitCell(local.x, local.y);
    if (startCell === null) return;
    startX = local.x;
    startY = local.y;
    tracking = true;
    swiped = false;
  }

  function onPointerMove(e: FederatedPointerEvent): void {
    if (!tracking || startCell === null || swiped) return;
    if (!handlers.isEnabled()) {
      tracking = false;
      return;
    }

    const local = localPoint(e);
    const dx = local.x - startX;
    const dy = local.y - startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD * CELL_SIZE) return;

    const dir: Cardinal = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    const to = neighborOf(startCell, dir);
    swiped = true;
    tracking = false;

    if (to !== null) handlers.onSwipe(startCell, to);
  }

  function onPointerUp(e: FederatedPointerEvent): void {
    if (!tracking || startCell === null) {
      tracking = false;
      return;
    }
    tracking = false;
    if (swiped || !handlers.isEnabled()) return;

    const local = localPoint(e);
    const end = hitCell(local.x, local.y);
    if (end === startCell) handlers.onTap(startCell);
  }

  function onCancel(): void {
    tracking = false;
  }

  layer.eventMode = 'static';
  layer.on('pointerdown', onPointerDown);
  layer.on('pointermove', onPointerMove);
  layer.on('pointerup', onPointerUp);
  layer.on('pointerupoutside', onCancel);
  layer.on('pointercancel', onCancel);

  return () => {
    layer.off('pointerdown', onPointerDown);
    layer.off('pointermove', onPointerMove);
    layer.off('pointerup', onPointerUp);
    layer.off('pointerupoutside', onCancel);
    layer.off('pointercancel', onCancel);
  };
}
