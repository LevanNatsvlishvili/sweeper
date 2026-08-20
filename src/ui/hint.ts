// Idle hint pulse and ghost-hand assist for the valid swap pair.

import gsap from 'gsap';

import type { TileView } from '../game/tiles';

let pulse: gsap.core.Timeline | null = null;

export function startHint(views: readonly TileView[], stronger: boolean): void {
  stopHint(views);
  if (views.length === 0) return;

  const amp = stronger ? 1.12 : 1.06;
  const duration = stronger ? 0.32 : 0.5;
  pulse = gsap.timeline({ repeat: -1, yoyo: true });
  for (const view of views) {
    pulse.to(view.root.scale, { x: amp, y: amp, duration, ease: 'sine.inOut' }, 0);
  }
}

export function stopHint(views: readonly TileView[]): void {
  pulse?.kill();
  pulse = null;
  for (const view of views) {
    gsap.killTweensOf(view.root.scale);
    view.root.scale.set(1);
  }
}
