// Pooled star burst and coin-rain particles for the completion finale.

import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';

import { waitFor } from '../game/tiles';

const STAR_COUNT = 16;
const COIN_COUNT = 18;
const COIN_LIFE = 1.5;

interface PooledGfx {
  readonly gfx: Graphics;
  busy: boolean;
}

export interface ParticleBurst {
  stars: (x: number, y: number) => void;
  coinRain: (x: number, y: number) => Promise<void>;
  dispose: () => void;
}

export function createParticleBurst(overlay: Container): ParticleBurst {
  const starsPool = fillPool(STAR_COUNT, overlay, makeStar);
  const coins = fillPool(COIN_COUNT, overlay, makeCoin);

  function stars(x: number, y: number): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = acquire(starsPool, overlay, makeStar);
      star.busy = true;
      star.gfx.visible = true;
      star.gfx.alpha = 1;
      star.gfx.rotation = Math.random() * Math.PI;
      star.gfx.scale.set(0.45 + Math.random() * 0.55);
      star.gfx.position.set(x, y);
      overlay.addChild(star.gfx);

      const angle = (i / STAR_COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const dist = 70 + Math.random() * 130;

      gsap.killTweensOf(star.gfx);
      gsap.killTweensOf(star.gfx.scale);
      gsap.to(star.gfx, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 40,
        rotation: star.gfx.rotation + (Math.random() - 0.5) * 4,
        duration: 0.85 + Math.random() * 0.35,
        ease: 'power2.out',
      });
      gsap.to(star.gfx, {
        alpha: 0,
        duration: 0.35,
        delay: 0.7,
        onComplete: () => release(star),
      });
    }
  }

  async function coinRain(x: number, y: number): Promise<void> {
    for (let i = 0; i < COIN_COUNT; i++) {
      const coin = acquire(coins, overlay, makeCoin);
      coin.busy = true;
      coin.gfx.visible = true;
      coin.gfx.alpha = 1;
      coin.gfx.rotation = 0;
      coin.gfx.scale.set(0.85 + Math.random() * 0.35);
      coin.gfx.position.set(x + (Math.random() - 0.5) * 40, y - 20);
      overlay.addChild(coin.gfx);

      const drift = (Math.random() - 0.5) * 280;
      const peak = -180 - Math.random() * 120;
      const delay = i * 0.035;

      gsap.killTweensOf(coin.gfx);
      gsap.to(coin.gfx, {
        x: coin.gfx.x + drift,
        duration: COIN_LIFE,
        delay,
        ease: 'sine.out',
      });
      gsap.to(coin.gfx, {
        y: coin.gfx.y + peak,
        duration: COIN_LIFE * 0.38,
        delay,
        ease: 'power2.out',
      });
      gsap.to(coin.gfx, {
        y: y + 220 + Math.random() * 80,
        duration: COIN_LIFE * 0.62,
        delay: delay + COIN_LIFE * 0.38,
        ease: 'power2.in',
      });
      gsap.to(coin.gfx, {
        rotation: (Math.random() - 0.5) * 8,
        duration: COIN_LIFE,
        delay,
      });
      gsap.to(coin.gfx, {
        alpha: 0,
        duration: 0.28,
        delay: delay + COIN_LIFE - 0.28,
        onComplete: () => release(coin),
      });
    }

    await waitFor(COIN_LIFE + 0.2);
  }

  return {
    stars,
    coinRain,
    dispose: () => {
      disposePool(starsPool);
      disposePool(coins);
    },
  };
}

function fillPool(size: number, parent: Container, factory: (parent: Container) => PooledGfx): PooledGfx[] {
  const pool: PooledGfx[] = [];
  for (let i = 0; i < size; i++) pool.push(factory(parent));
  return pool;
}

function acquire(pool: PooledGfx[], parent: Container, factory: (parent: Container) => PooledGfx): PooledGfx {
  const idle = pool.find((item) => !item.busy);
  if (idle) return idle;
  const extra = factory(parent);
  pool.push(extra);
  return extra;
}

function release(item: PooledGfx): void {
  gsap.killTweensOf(item.gfx);
  gsap.killTweensOf(item.gfx.scale);
  item.gfx.visible = false;
  item.busy = false;
}

function disposePool(pool: PooledGfx[]): void {
  for (const item of pool) {
    gsap.killTweensOf(item.gfx);
    gsap.killTweensOf(item.gfx.scale);
    item.gfx.destroy();
  }
  pool.length = 0;
}

function makeStar(parent: Container): PooledGfx {
  const gfx = new Graphics().poly(starPoints(12, 5)).fill({ color: 0xffe08a }).stroke({
    width: 2,
    color: 0x2a1810,
    alignment: 0.5,
  });
  return stamp(gfx, parent);
}

function makeCoin(parent: Container): PooledGfx {
  const gfx = new Graphics()
    .circle(0, 0, 11)
    .fill({ color: 0xf4c431 })
    .stroke({ width: 2, color: 0xb07d12, alignment: 1 })
    .ellipse(-3, -3.5, 4.5, 2.8)
    .fill({ color: 0xffffff, alpha: 0.45 });
  return stamp(gfx, parent);
}

function stamp(gfx: Graphics, parent: Container): PooledGfx {
  gfx.eventMode = 'none';
  gfx.visible = false;
  parent.addChild(gfx);
  return { gfx, busy: false };
}

function starPoints(outer: number, inner: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    pts.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return pts;
}
