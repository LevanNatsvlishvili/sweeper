// MRAID lifecycle shim for ad network viewability and clickthrough.

import type { Application } from 'pixi.js';
import gsap from 'gsap';

type MraidState = 'loading' | 'default' | 'expanded' | 'resized' | 'hidden';

interface MraidApi {
  getState(): MraidState;
  isViewable(): boolean;
  addEventListener(event: string, listener: (...args: never[]) => void): void;
  removeEventListener(event: string, listener: (...args: never[]) => void): void;
  open(url: string): void;
}

declare global {
  interface Window {
    mraid?: MraidApi;
  }
}

export interface Mraid {
  /** True when running inside a real MRAID container rather than a plain browser. */
  readonly isHosted: boolean;
  /** Resolves once the ad is ready AND viewable. Resolves immediately when unhosted. */
  whenViewable(): Promise<void>;
  /** Opens the store listing through the ad container when hosted, else a new tab. */
  clickthrough(url: string): void;
  dispose(): void;
}

export function setupMraid(app: Application): Mraid {
  const mraid = window.mraid;
  const isHosted = typeof mraid?.getState === 'function';

  let isPaused = false;

  /**
   * Freezing the GSAP global timeline is what makes a pause safe mid-pipeline: every
   * animation and every `waitFor` is a tween on it, so the director's awaited promise
   * simply never resolves and no board state is left half-applied.
   */
  function pause(): void {
    if (isPaused) return;
    isPaused = true;
    app.ticker.stop();
    // Pause (never re-timeScale) the global timeline so any local scaling survives a cycle.
    gsap.globalTimeline.pause();
  }

  function resume(): void {
    if (!isPaused) return;
    isPaused = false;
    gsap.globalTimeline.resume();
    app.ticker.start();
  }

  /**
   * Backgrounding a webview does not reliably fire viewableChange, and an unhosted
   * preview never fires it at all. visibilitychange covers both; pausing twice is a
   * no-op, so it composes with the MRAID events rather than fighting them.
   */
  function onVisibilityChange(): void {
    if (document.hidden) pause();
    else resume();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  function clickthrough(url: string): void {
    // A sandboxed iframe without allow-popups blocks window.open outright. Never let a
    // blocked clickthrough throw and take the rest of the ad down with it.
    try {
      if (isHosted && mraid) {
        mraid.open(url);
        return;
      }
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      console.warn('[sweet-swap] clickthrough blocked by the container', error);
    }
  }

  // Unhosted (plain browser / our dev server): no viewability gate, but still pause on
  // tab-hide so a backgrounded preview does not burn frames.
  if (!isHosted || !mraid) {
    return {
      isHosted: false,
      whenViewable: () => Promise.resolve(),
      clickthrough,
      dispose: () => document.removeEventListener('visibilitychange', onVisibilityChange),
    };
  }

  function onViewableChange(isViewable: boolean): void {
    if (isViewable) resume();
    else pause();
  }

  function onStateChange(state: MraidState): void {
    if (state === 'hidden') pause();
  }

  mraid.addEventListener('viewableChange', onViewableChange as (...args: never[]) => void);
  mraid.addEventListener('stateChange', onStateChange as (...args: never[]) => void);

  function whenReady(): Promise<void> {
    if (mraid!.getState() !== 'loading') return Promise.resolve();
    return new Promise((resolve) => {
      const onReady = (): void => {
        mraid!.removeEventListener('ready', onReady);
        resolve();
      };
      mraid!.addEventListener('ready', onReady);
    });
  }

  async function whenViewable(): Promise<void> {
    await whenReady();
    if (mraid!.isViewable()) return;

    await new Promise<void>((resolve) => {
      const onFirstViewable = (isViewable: boolean): void => {
        if (!isViewable) return;
        mraid!.removeEventListener('viewableChange', onFirstViewable as (...args: never[]) => void);
        resolve();
      };
      mraid!.addEventListener('viewableChange', onFirstViewable as (...args: never[]) => void);
    });
  }

  return {
    isHosted: true,
    whenViewable,
    clickthrough,
    dispose: () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      mraid.removeEventListener('viewableChange', onViewableChange as (...args: never[]) => void);
      mraid.removeEventListener('stateChange', onStateChange as (...args: never[]) => void);
    },
  };
}
