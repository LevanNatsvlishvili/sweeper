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

  // Unhosted (plain browser / our dev server): no gating, no pause/resume, plain window.open.
  if (!isHosted || !mraid) {
    return {
      isHosted: false,
      whenViewable: () => Promise.resolve(),
      clickthrough: (url) => window.open(url, '_blank'),
      dispose: () => {},
    };
  }

  let isPaused = false;

  function pause(): void {
    if (isPaused) return;
    isPaused = true;
    app.ticker.stop();
    // Pause (never re-timeScale) the global timeline so slow-mo's own scaling survives a pause/resume cycle.
    gsap.globalTimeline.pause();
  }

  function resume(): void {
    if (!isPaused) return;
    isPaused = false;
    gsap.globalTimeline.resume();
    app.ticker.start();
  }

  function onViewableChange(isViewable: boolean): void {
    if (isViewable) resume();
    else pause();
  }

  mraid.addEventListener('viewableChange', onViewableChange as (...args: never[]) => void);

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
    clickthrough: (url) => mraid.open(url),
    dispose: () => {
      mraid.removeEventListener('viewableChange', onViewableChange as (...args: never[]) => void);
    },
  };
}
