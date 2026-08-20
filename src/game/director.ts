// FSM orchestrating intro, input, resolving, complete, and CTA states.

import type { AppContext } from '../core/app';
import { setupTileInput } from '../core/input';
import { createParticleBurst } from '../fx/particles';
import { createTextPops } from '../fx/textPops';
import { createHud } from '../ui/hud';
import { startHint, stopHint } from '../ui/hint';
import { STORE_URL, createCta } from '../ui/cta';
import { applyStep, cloneBoard, type Board } from './board';
import { playGravity, playRefill, playSettle } from './cascade';
import { generateBoard, hasLegalMove, reshuffle } from './generate';
import { bestSwap, findValidSwaps } from './matcher';
import { isRunComplete, resolve } from './resolve';
import { createRng } from './rng';
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
import { comboBeat, type Variant } from './variants';
import type { Mraid } from '../core/mraid';
import gsap from 'gsap';

export type DirectorState = 'INTRO' | 'AWAIT_INPUT' | 'WRONG_SWAP' | 'RESOLVING' | 'COMPLETE' | 'CTA';

export interface Director {
  start: () => Promise<void>;
  dispose: () => void;
}

export function createDirector(ctx: AppContext, variant: Variant, mraid: Mraid): Director {
  const rng = createRng(variant.rngSeed);
  const board: Board = generateBoard(rng);
  let views = spawnBoardViews(board, ctx.layers.tiles);
  const particles = createParticleBurst(ctx.layers.fx);
  const pops = createTextPops(ctx.layers.ui);
  const hud = createHud(ctx.layers.ui);
  const cta = createCta(ctx.layers.ui, () => mraid.clickthrough(STORE_URL));
  const debug = createDebugOverlay(ctx.layers.debug, () => board);

  let state: DirectorState = 'INTRO';
  let selected: GridIndex | null = null;
  let hintViews: TileView[] = [];
  let hintStronger = false;
  let hintCall: gsap.core.Tween | null = null;
  let disposed = false;

  let score = 0;
  let moves = 0;

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

  /**
   * Schedules the idle hint: the best pair breathes and a swipe arrow travels across it.
   * The hint only ever suggests — the player makes every move.
   */
  function enterAwaitInput(): void {
    if (disposed) return;
    state = 'AWAIT_INPUT';
    debug.refresh();
    stopIdle();

    const delayHint = hintStronger ? 0.15 : variant.timing.hintDelay;
    hintCall = gsap.delayedCall(delayHint, () => {
      const valid = bestSwap(board.cells);
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
    if (viewA && viewB) {
      await playWrongSwap(viewA, viewB, cellCenterAt(swap.b), cellCenterAt(swap.a), variant.timing.swapSnap);
    }
    hintStronger = true;
    enterAwaitInput();
  }

  async function playLegal(swap: Swap): Promise<void> {
    state = 'RESOLVING';
    stopIdle();
    hintStronger = false;

    // Resolve on a copy first so the whole move is decided before any of it is animated,
    // then replay it step by step onto the live board.
    const planned = cloneBoard(board);
    const { steps, points } = resolve(planned, swap, rng, variant.scoring);

    // Each cascade level plays a little faster than the last, so a long chain builds
    // momentum rather than making the player wait through it.
    let level = 0;
    for (const step of steps) {
      if (disposed) return;
      if (step.kind === 'match') level = step.comboLevel;
      await playStep(step, cascadeScale(level));
      applyStep(board, step);
      debug.refresh();
    }

    score += points;
    moves++;
    hud.setScore(score);

    if (disposed) return;

    if (isRunComplete(variant, score, moves)) {
      await finish();
      return;
    }

    if (!hasLegalMove(board)) await playReshuffle();
    enterAwaitInput();
  }

  /** Rescues a board with no legal moves left, so the player is never stranded. */
  async function playReshuffle(): Promise<void> {
    void pops.prompt('No moves — shuffling!', 0.5);
    await Promise.all(
      [...views.values()].map((view) => animateTo(view.root, { alpha: 0, duration: 0.22 })),
    );
    for (const view of views.values()) destroyTileView(view);
    views.clear();

    reshuffle(board, rng);
    views = spawnBoardViews(board, ctx.layers.tiles);
    await playIntro(views, variant.timing.introStagger * 0.5);
  }

  function cascadeScale(level: number): number {
    const { cascadeSpeedup, cascadeSpeedFloor } = variant.timing;
    return Math.max(cascadeSpeedFloor, 1 - level * cascadeSpeedup);
  }

  async function playStep(step: Step, scale: number): Promise<void> {
    const { timing } = variant;

    switch (step.kind) {
      case 'swap': {
        const viewA = viewAt(step.a);
        const viewB = viewAt(step.b);
        if (!viewA || !viewB) return;
        await playSwap(viewA, viewB, cellCenterAt(step.b), cellCenterAt(step.a), timing.swapSnap);
        return;
      }
      case 'match': {
        const beat = comboBeat(variant, step.comboLevel);
        if (beat) void pops.combo(beat);
        await Promise.all(
          step.cleared.map(async (index) => {
            const tile = board.cells[index];
            if (!tile) return;
            const view = views.get(tile.id);
            if (!view) return;
            particles.burst(view.root.x, view.root.y, paletteOf(tile.type).fill);
            await playClearPop(view, timing.clear * scale);
            views.delete(tile.id);
            destroyTileView(view);
          }),
        );
        return;
      }
      case 'gravity':
        await playGravity(views, step.moves, timing.gravity * scale);
        return;
      case 'refill':
        await playRefill(views, ctx.layers.tiles, step.spawns, timing.refill * scale);
        return;
      case 'settle':
        await playSettle(timing.settle * scale);
        return;
    }
  }

  async function finish(): Promise<void> {
    state = 'COMPLETE';
    stopIdle();
    await animateTo(ctx.world, { alpha: 0.58, duration: 0.25 });
    void pops.complete(variant.completionText);
    await waitFor(variant.timing.completeHold);
    state = 'CTA';
    await cta.show(variant.timing.ctaSlide);
  }

  async function start(): Promise<void> {
    hud.setScore(0);
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
      hud.dispose();
      cta.dispose();
    },
  };
}
