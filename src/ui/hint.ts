// Idle hint pulse and a single swipe arrow that travels across the valid pair.

import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';

import type { TileView } from '../game/tiles';

let pulse: gsap.core.Timeline | null = null;
let swipe: gsap.core.Timeline | null = null;
let layer: Container | null = null;

export function startHint(views: readonly TileView[], stronger: boolean, parent: Container): void {
  stopHint(views);
  if (views.length === 0) return;

  const amp = stronger ? 1.12 : 1.06;
  const duration = stronger ? 0.32 : 0.5;
  pulse = gsap.timeline({ repeat: -1, yoyo: true });
  for (const view of views) {
    pulse.to(view.root.scale, { x: amp, y: amp, duration, ease: 'sine.inOut' }, 0);
  }

  if (views.length < 2) return;

  const { from, to } = orderPair(views[0], views[1]);
  const startX = from.root.x;
  const startY = from.root.y;
  const endX = to.root.x;
  const endY = to.root.y;
  const rotation = Math.atan2(endY - startY, endX - startX);

  layer = new Container();
  layer.eventMode = 'none';
  parent.addChild(layer);

  const arrow = new Container();
  arrow.eventMode = 'none';
  arrow.position.set(startX, startY);
  arrow.rotation = rotation;
  arrow.scale.set(stronger ? 1.2 : 1);
  arrow.alpha = 0;
  arrow.addChild(drawArrow());
  layer.addChild(arrow);

  swipe = gsap.timeline({ repeat: -1, repeatDelay: 0.18 });
  swipe.to(arrow, { alpha: 1, duration: 0.12 }, 0);
  swipe.to(
    arrow,
    { x: endX, y: endY, duration: stronger ? 0.48 : 0.62, ease: 'power2.inOut' },
    0.08,
  );
  swipe.to(arrow, { alpha: 0, duration: 0.16 }, '>-0.04');
  swipe.set(arrow, { x: startX, y: startY });
}

export function stopHint(views: readonly TileView[]): void {
  pulse?.kill();
  pulse = null;
  swipe?.kill();
  swipe = null;
  if (layer) {
    layer.destroy({ children: true });
    layer = null;
  }
  for (const view of views) {
    gsap.killTweensOf(view.root.scale);
    view.root.scale.set(1);
  }
}

/** Horizontal pairs swipe right-to-left (`<=`). Vertical pairs swipe top-to-bottom. */
function orderPair(a: TileView, b: TileView): { from: TileView; to: TileView } {
  const horizontal = Math.abs(b.root.x - a.root.x) >= Math.abs(b.root.y - a.root.y);
  if (horizontal) {
    return a.root.x > b.root.x ? { from: a, to: b } : { from: b, to: a };
  }
  return a.root.y < b.root.y ? { from: a, to: b } : { from: b, to: a };
}

function drawArrow(): Graphics {
  return new Graphics()
    .poly([-18, -9, 2, -9, 2, -17, 22, 0, 2, 17, 2, 9, -18, 9])
    .fill({ color: 0xffe08a })
    .stroke({ width: 3.5, color: 0x2a1810, alignment: 0.5 });
}
