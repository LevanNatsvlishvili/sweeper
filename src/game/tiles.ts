// Procedural candy rendering, layout, and tile-level GSAP animations.

import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';

import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/resize';
import { findValidSwaps } from './matcher';
import {
  GRID_COLS,
  GRID_ROWS,
  colOf,
  indexOf,
  rowOf,
  type GridIndex,
  type Special,
  type Tile,
  type TypeId,
} from './types';
import type { Board } from './board';

/**
 * The board is twice as tall as it is wide, so in portrait the height runs out first.
 * Size the cell off whichever axis binds, keeping a band clear at the top for the
 * prompt line and at the bottom for the CTA slide-up.
 */
const BOARD_MARGIN_X = 40;
const BOARD_RESERVE_TOP = 120;
/**
 * Must clear the raised CTA panel, which parks at DESIGN_HEIGHT - PANEL_HEIGHT - 36.
 * Keep in step with PANEL_HEIGHT in ui/cta.ts: 168 panel + 36 margin + 14 gap + 22 well pad.
 */
const BOARD_RESERVE_BOTTOM = 240;
const BOARD_BAND = DESIGN_HEIGHT - BOARD_RESERVE_TOP - BOARD_RESERVE_BOTTOM;

export const CELL_SIZE = Math.floor(
  Math.min((DESIGN_WIDTH - BOARD_MARGIN_X * 2) / GRID_COLS, BOARD_BAND / GRID_ROWS),
);
export const TILE_RADIUS = Math.round(CELL_SIZE * 0.375);
export const GRID_PIXEL_W = GRID_COLS * CELL_SIZE;
export const GRID_PIXEL_H = GRID_ROWS * CELL_SIZE;
export const BOARD_ORIGIN_X = (DESIGN_WIDTH - GRID_PIXEL_W) / 2;
export const BOARD_ORIGIN_Y = BOARD_RESERVE_TOP + (BOARD_BAND - GRID_PIXEL_H) / 2;

export const BOARD_HIT_AREA = new Rectangle(
  BOARD_ORIGIN_X,
  BOARD_ORIGIN_Y,
  GRID_PIXEL_W,
  GRID_PIXEL_H,
);

export type CandyShape = 'circle' | 'square' | 'diamond' | 'heart' | 'triangle';

export interface PaletteEntry {
  readonly shape: CandyShape;
  readonly fill: number;
  readonly stroke: number;
}

/** Shape + colour paired so the board still reads if colour is lost. */
export const PALETTE: readonly PaletteEntry[] = [
  { shape: 'circle', fill: 0xe74c3c, stroke: 0x9b2b22 },
  { shape: 'square', fill: 0x3d8bfd, stroke: 0x1d4f9c },
  { shape: 'diamond', fill: 0x2ecc71, stroke: 0x1b7a43 },
  { shape: 'heart', fill: 0xe91e8c, stroke: 0x9a145c },
  { shape: 'triangle', fill: 0xf4c431, stroke: 0xb07d12 },
];

export function paletteOf(type: TypeId): PaletteEntry {
  return PALETTE[type];
}

export function cellCenter(row: number, col: number): { x: number; y: number } {
  return {
    x: BOARD_ORIGIN_X + col * CELL_SIZE + CELL_SIZE / 2,
    y: BOARD_ORIGIN_Y + row * CELL_SIZE + CELL_SIZE / 2,
  };
}

export function cellCenterAt(index: GridIndex): { x: number; y: number } {
  return cellCenter(rowOf(index), colOf(index));
}

export function hitCell(localX: number, localY: number): GridIndex | null {
  const col = Math.floor((localX - BOARD_ORIGIN_X) / CELL_SIZE);
  const row = Math.floor((localY - BOARD_ORIGIN_Y) / CELL_SIZE);
  if (row < 0 || col < 0 || row >= GRID_ROWS || col >= GRID_COLS) return null;
  return indexOf(row, col);
}

export interface TileView {
  readonly id: number;
  readonly type: TypeId;
  readonly root: Container;
}

export function createTileView(tile: Tile): TileView {
  const root = new Container();
  root.eventMode = 'none';
  root.addChild(drawCandy(tile.type, tile.special));
  return { id: tile.id, type: tile.type, root };
}

export function placeTileView(view: TileView, row: number, col: number): void {
  const { x, y } = cellCenter(row, col);
  view.root.position.set(x, y);
}

export function drawBoardBackdrop(parent: Container): void {
  const pad = 22;
  const well = new Graphics()
    .roundRect(
      BOARD_ORIGIN_X - pad,
      BOARD_ORIGIN_Y - pad,
      GRID_PIXEL_W + pad * 2,
      GRID_PIXEL_H + pad * 2,
      28,
    )
    .fill({ color: 0x1c1410 })
    .stroke({ width: 3, color: 0x3a2a22, alpha: 0.9 });

  parent.addChild(well);

  const slots = new Graphics();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const { x, y } = cellCenter(row, col);
      slots.circle(x, y, TILE_RADIUS + 6).fill({ color: 0x0c0908, alpha: 0.55 });
    }
  }
  parent.addChild(slots);
}

export function spawnBoardViews(board: Board, parent: Container): Map<number, TileView> {
  const views = new Map<number, TileView>();

  for (let index = 0; index < board.cells.length; index++) {
    const tile = board.cells[index];
    if (!tile) continue;
    const view = createTileView(tile);
    placeTileView(view, rowOf(index), colOf(index));
    view.root.scale.set(0);
    view.root.alpha = 0;
    parent.addChild(view.root);
    views.set(tile.id, view);
  }

  return views;
}

export async function playIntro(views: ReadonlyMap<number, TileView>, staggerTotal: number): Promise<void> {
  const ordered = [...views.values()].sort((a, b) => a.id - b.id);
  const last = Math.max(ordered.length - 1, 1);

  await Promise.all(
    ordered.map((view, index) => {
      view.root.scale.set(0);
      view.root.alpha = 0;
      const delay = (index / last) * staggerTotal;
      return Promise.all([
        animateTo(view.root.scale, { x: 1, y: 1, duration: 0.38, delay, ease: 'back.out(2.2)' }),
        animateTo(view.root, { alpha: 1, duration: 0.2, delay }),
      ]);
    }),
  );
}

export async function playSwap(
  viewA: TileView,
  viewB: TileView,
  destA: { x: number; y: number },
  destB: { x: number; y: number },
  duration: number,
): Promise<void> {
  lift(viewA);
  lift(viewB);
  viewA.root.rotation = 0;
  viewB.root.rotation = 0;

  await Promise.all([
    animateTo(viewA.root, { x: destA.x, y: destA.y, duration, ease: 'power2.inOut' }),
    animateTo(viewB.root, { x: destB.x, y: destB.y, duration, ease: 'power2.inOut' }),
  ]);
}

export async function playWrongSwap(
  viewA: TileView,
  viewB: TileView,
  destA: { x: number; y: number },
  destB: { x: number; y: number },
  duration: number,
): Promise<void> {
  const startA = { x: viewA.root.x, y: viewA.root.y };
  const startB = { x: viewB.root.x, y: viewB.root.y };

  await playSwap(viewA, viewB, destA, destB, duration);
  await waitFor(0.12);
  await playSwap(viewA, viewB, startA, startB, duration);
}

export async function playClearPop(view: TileView, duration: number): Promise<void> {
  const up = Math.min(0.14, duration * 0.35);
  await animateTo(view.root.scale, { x: 1.15, y: 1.15, duration: up, ease: 'back.out(2)' });
  await Promise.all([
    animateTo(view.root.scale, { x: 0.15, y: 0.15, duration: duration - up, ease: 'back.in(1.6)' }),
    animateTo(view.root, { alpha: 0, duration: duration - up, ease: 'power2.in' }),
  ]);
}

export function destroyTileView(view: TileView): void {
  gsap.killTweensOf(view.root);
  gsap.killTweensOf(view.root.scale);
  view.root.destroy({ children: true });
}

export function setTileSelected(view: TileView, selected: boolean): void {
  gsap.killTweensOf(view.root.scale);
  gsap.to(view.root.scale, { x: selected ? 1.08 : 1, y: selected ? 1.08 : 1, duration: 0.12, ease: 'back.out(2)' });
}

export function createDebugOverlay(parent: Container, getBoard: () => Board): {
  refresh: () => void;
  dispose: () => void;
} {
  const root = new Container();
  root.eventMode = 'none';
  root.visible = false;
  parent.addChild(root);

  const style = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 13,
    fill: '#ffffff',
    stroke: { color: '#000000', width: 3 },
  });

  const swapStyle = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 18,
    fontWeight: '700',
    fill: '#ffd166',
    stroke: { color: '#000000', width: 4 },
  });

  function refresh(): void {
    for (const child of root.removeChildren()) child.destroy();
    if (!root.visible) return;

    const board = getBoard();
    const valid = findValidSwaps(board.cells);
    const highlighted = new Set<GridIndex>();
    for (const swap of valid) {
      highlighted.add(swap.a);
      highlighted.add(swap.b);
    }

    const marks = new Graphics();
    for (const index of highlighted) {
      const { x, y } = cellCenterAt(index);
      marks.roundRect(x - CELL_SIZE / 2 + 4, y - CELL_SIZE / 2 + 4, CELL_SIZE - 8, CELL_SIZE - 8, 16).stroke({
        width: 3,
        color: 0xffd166,
        alpha: 0.95,
      });
    }
    root.addChild(marks);

    for (let index = 0; index < board.cells.length; index++) {
      const { x, y } = cellCenterAt(index);
      const label = new Text({
        text: `r${rowOf(index)}c${colOf(index)}`,
        style,
      });
      label.anchor.set(0.5);
      label.position.set(x, y + 28);
      root.addChild(label);
    }

    const summary = new Text({
      text:
        valid.length === 0
          ? 'valid swap: none'
          : `valid swap: ${valid
              .map((swap) => `r${rowOf(swap.a)}c${colOf(swap.a)} ↔ r${rowOf(swap.b)}c${colOf(swap.b)}`)
              .join('  ')}`,
      style: swapStyle,
    });
    summary.anchor.set(0.5, 0);
    summary.position.set(DESIGN_WIDTH / 2, BOARD_ORIGIN_Y + GRID_PIXEL_H + 18);
    root.addChild(summary);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'd' && event.key !== 'D') return;
    if (event.repeat) return;
    root.visible = !root.visible;
    refresh();
  }

  window.addEventListener('keydown', onKey);

  return {
    refresh,
    dispose: () => {
      window.removeEventListener('keydown', onKey);
      root.destroy({ children: true });
    },
  };
}

export function animateTo(target: object, vars: gsap.TweenVars): Promise<void> {
  return new Promise((resolve) => {
    gsap.to(target, { ...vars, onComplete: resolve });
  });
}

export function waitFor(seconds: number): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.delayedCall(seconds, resolve);
  });
}

function drawCandy(type: TypeId, special: Special): Container {
  const candy = new Container();
  const { shape, fill, stroke } = paletteOf(type);
  const r = TILE_RADIUS;
  const body = new Graphics();

  switch (shape) {
    case 'circle':
      body.circle(0, 0, r).fill({ color: fill }).stroke({ width: 4, color: stroke, alignment: 1 });
      break;
    case 'square': {
      const s = r * 1.62;
      body
        .roundRect(-s / 2, -s / 2, s, s, r * 0.28)
        .fill({ color: fill })
        .stroke({ width: 4, color: stroke, alignment: 1 });
      break;
    }
    case 'diamond':
      body
        .poly([0, -r, r, 0, 0, r, -r, 0])
        .fill({ color: fill })
        .stroke({ width: 4, color: stroke, alignment: 1 });
      break;
    case 'heart':
      body.poly(heartPoints(r)).fill({ color: fill }).stroke({ width: 4, color: stroke, alignment: 1 });
      break;
    case 'triangle':
      body
        .poly([0, -r, r * 0.96, r * 0.78, -r * 0.96, r * 0.78])
        .fill({ color: fill })
        .stroke({ width: 4, color: stroke, alignment: 1 });
      break;
  }

  const shine = new Graphics()
    .ellipse(-r * 0.22, -r * 0.32, r * 0.42, r * 0.26)
    .fill({ color: 0xffffff, alpha: 0.38 });

  candy.addChild(body, shine);

  if (special === 'stripedRow') {
    const stripe = new Graphics().roundRect(-r, -r * 0.16, r * 2, r * 0.32, 6).fill({ color: 0xffffff, alpha: 0.4 });
    stripe.angle = -28;
    candy.addChild(stripe);
  }

  return candy;
}

function heartPoints(r: number): number[] {
  const pts: number[] = [];
  const scale = r / 16;
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    const sin = Math.sin(t);
    const x = scale * 16 * sin * sin * sin;
    const y =
      -scale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + r * 0.12;
    pts.push(x, y);
  }
  return pts;
}

function lift(view: TileView): void {
  view.root.parent?.addChild(view.root);
}
