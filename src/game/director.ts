// FSM orchestrating intro, input, resolving, complete, and CTA states.

import type { AppContext } from '../core/app';
import { setupTileInput } from '../core/input';
import { createParticleBurst } from '../fx/particles';
import { createTextPops } from '../fx/textPops';
import { startHint, stopHint } from '../ui/hint';
import { STORE_URL, createCta } from '../ui/cta';
import { applyStep, cloneBoard, createBoard, type Board } from './board';
import { playGravity, playRefill, playSettle } from './cascade';
import { findValidSwaps } from './matcher';
import { resolve } from './resolve';
import {
  BOARD_HIT_AREA,
  animateTo,
  cellCenterAt,
  createDebugOverlay,
  destroyTileView,
  drawBoardBackdrop,
  paletteOf,
  playClearPop,
  playIntro,
  playSwap,
  playWrongSwap,
  setTileSelected,
  spawnBoardViews,
  waitFor,
  type TileView,
} from './tiles';
import { areAdjacent, type GridIndex, type Step, type Swap } from './types';
import type { Variant } from './variants';
import type { Mraid } from '../core/mraid';
import gsap from 'gsap';

export type DirectorState = 'INTRO' | 'AWAIT_INPUT' | 'WRONG_SWAP' | 'RESOLVING' | 'COMPLETE' | 'CTA';

export interface Director {
  start: () => Promise<void>;
  dispose: () => void;
}

export function createDirector(ctx: AppContext, variant: Variant, mraid: Mraid): Director {
  const board: Board = createBoard(variant.seed, variant.specials);
  const views = spawnBoardViews(board, ctx.layers.tiles);
  const particles = createParticleBurst(ctx.layers.fx);
  const pops = createTextPops(ctx.layers.ui);
  const cta = createCta(ctx.layers.ui, () => mraid.clickthrough(STORE_URL));
  const debug = createDebugOverlay(ctx.layers.debug, () => board);

  let state: DirectorState = 'INTRO';
  let selected: GridIndex | null = null;
  let hintViews: TileView[] = [];
  let hintStronger = false;
  let hintCall: gsap.core.Tween | null = null;
  let disposed = false;

  drawBoardBackdrop(ctx.layers.boardBg);
  ctx.layers.tiles.hitArea = BOARD_HIT_AREA;
  ctx.layers.boardBg.eventMode = 'none';
  ctx.layers.fx.eventMode = 'none';
  ctx.layers.debug.eventMode = 'none';

  const disposeInput = setupTileInput(ctx.layers.tiles, {
    isEnabled: () => state === 'AWAIT_INPUT',
    onSwipe: (from, to) => void trySwap(from, to),
    onTap: onTap,
  });

  function viewAt(index: GridIndex): TileView | null {
    const tile = board.cells[index];
    if (!tile) return null;
    return views.get(tile.id) ?? null;
  }

  function clearSelection(): void {
    if (selected !== null) {
      const view = viewAt(selected);
      if (view) setTileSelected(view, false);
    }
    selected = null;
  }

  function onTap(index: GridIndex): void {
    if (state !== 'AWAIT_INPUT') return;
    if (selected === null) {
      selected = index;
      const view = viewAt(index);
      if (view) setTileSelected(view, true);
      return;
    }
    if (selected === index) {
      clearSelection();
      return;
    }
    if (areAdjacent(selected, index)) {
      const from = selected;
      clearSelection();
      void trySwap(from, index);
      return;
    }
    const prev = viewAt(selected);
    if (prev) setTileSelected(prev, false);
    selected = index;
    const next = viewAt(index);
    if (next) setTileSelected(next, true);
  }

  function isLegalSwap(swap: Swap): boolean {
    return findValidSwaps(board.cells).some(
      (valid) => (valid.a === swap.a && valid.b === swap.b) || (valid.a === swap.b && valid.b === swap.a),
    );
  }

  async function trySwap(a: GridIndex, b: GridIndex): Promise<void> {
    if (state !== 'AWAIT_INPUT' || a === b || !areAdjacent(a, b)) return;
    if (!board.cells[a] || !board.cells[b]) return;

    stopIdle();
    clearSelection();
    const swap: Swap = { a, b };
    if (!isLegalSwap(swap)) {
      state = 'WRONG_SWAP';
      await playIllegal(swap);
      return;
    }
    state = 'RESOLVING';
    await playLegal(swap);
  }

  function stopIdle(): void {
    hintCall?.kill();
    hintCall = null;
    stopHint(hintViews);
    hintViews = [];
  }

  function enterAwaitInput(): void {
    if (disposed) return;
    state = 'AWAIT_INPUT';
    debug.refresh();
    stopIdle();

    const delayHint = hintStronger ? 0.15 : variant.timing.hintDelay;
    hintCall = gsap.delayedCall(delayHint, () => {
      const valid = findValidSwaps(board.cells)[0];
      if (!valid || state !== 'AWAIT_INPUT') return;
      const pair = [viewAt(valid.a), viewAt(valid.b)].filter((view): view is TileView => view !== null);
      hintViews = pair;
      startHint(pair, hintStronger, ctx.layers.fx);
    });
  }

  async function playIllegal(swap: Swap): Promise<void> {
    state = 'WRONG_SWAP';
    stopIdle();
    const viewA = viewAt(swap.a);
    const viewB = viewAt(swap.b);
    if (viewA && viewB) await playWrongSwap(viewA, viewB);
    hintStronger = true;
    enterAwaitInput();
  }

  async function playLegal(swap: Swap): Promise<void> {
    state = 'RESOLVING';
    stopIdle();
    hintStronger = false;

    const planned = cloneBoard(board);
    const steps = resolve(planned, swap, variant);

    for (const step of steps) {
      if (disposed) return;
      await playStep(step);
      applyStep(board, step);
      debug.refresh();
    }

    await finish();
  }

  async function playStep(step: Step): Promise<void> {
    const { timing } = variant;

    switch (step.kind) {
      case 'swap': {
        const viewA = viewAt(step.a);
        const viewB = viewAt(step.b);
        if (!viewA || !viewB) return;
        await playSwap(viewA, viewB, cellCenterAt(step.b), cellCenterAt(step.a), timing.wobble, timing.swapSnap);
        return;
      }
      case 'match': {
        const beat = variant.combos[step.comboLevel];
        if (beat) void pops.combo(beat);
        await Promise.all(
          step.cleared.map(async (index) => {
            const tile = board.cells[index];
            if (!tile) return;
            const view = views.get(tile.id);
            if (!view) return;
            particles.burst(view.root.x, view.root.y, paletteOf(tile.type).fill);
            await playClearPop(view, timing.clear);
            views.delete(tile.id);
            destroyTileView(view);
          }),
        );
        return;
      }
      case 'gravity':
        await playGravity(views, step.moves, timing.gravity);
        return;
      case 'refill':
        await playRefill(views, ctx.layers.tiles, step.spawns, timing.refill);
        return;
      case 'settle':
        await playSettle(timing.settle);
        return;
    }
  }

  async function finish(): Promise<void> {
    state = 'COMPLETE';
    await animateTo(ctx.world, { alpha: 0.58, duration: 0.25 });
    void pops.complete(variant.completionText);
    await waitFor(variant.timing.completeHold);
    state = 'CTA';
    await cta.show(variant.timing.ctaSlide);
  }

  async function start(): Promise<void> {
    await playIntro(views, variant.timing.introStagger);
    if (disposed) return;
    void pops.prompt('Make a match!', variant.timing.promptHold);
    enterAwaitInput();
  }

  return {
    start,
    dispose: () => {
      disposed = true;
      state = 'CTA';
      stopIdle();
      disposeInput();
      debug.dispose();
      particles.dispose();
      pops.dispose();
      cta.dispose();
    },
  };
}
