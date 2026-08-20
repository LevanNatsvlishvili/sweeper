// Pooled shard/coin burst particles for clears and jackpot rain.

import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';

const SHARDS_PER_BURST = 7;
const POOL_SIZE = SHARDS_PER_BURST * 8;

interface Shard {
  readonly gfx: Graphics;
  busy: boolean;
}

export interface ParticleBurst {
  burst: (x: number, y: number, color: number) => void;
  dispose: () => void;
}

export function createParticleBurst(parent: Container): ParticleBurst {
  const pool: Shard[] = [];

  for (let i = 0; i < POOL_SIZE; i++) pool.push(makeShard(parent));

  function acquire(): Shard {
    const idle = pool.find((shard) => !shard.busy);
    if (idle) return idle;
    const extra = makeShard(parent);
    pool.push(extra);
    return extra;
  }

  function burst(x: number, y: number, color: number): void {
    for (let i = 0; i < SHARDS_PER_BURST; i++) {
      const shard = acquire();
      shard.busy = true;
      shard.gfx.visible = true;
      shard.gfx.alpha = 1;
      shard.gfx.rotation = 0;
      shard.gfx.position.set(x, y);
      shard.gfx.tint = color;
      parent.addChild(shard.gfx);

      const angle = (i / SHARDS_PER_BURST) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 28 + Math.random() * 36;

      gsap.killTweensOf(shard.gfx);
      gsap.to(shard.gfx, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        rotation: (Math.random() - 0.5) * 2.4,
        alpha: 0,
        duration: 0.38 + Math.random() * 0.12,
        ease: 'power2.out',
        onComplete: () => {
          shard.gfx.visible = false;
          shard.busy = false;
        },
      });
    }
  }

  return {
    burst,
    dispose: () => {
      for (const shard of pool) {
        gsap.killTweensOf(shard.gfx);
        shard.gfx.destroy();
      }
      pool.length = 0;
    },
  };
}

function makeShard(parent: Container): Shard {
  const gfx = new Graphics().roundRect(-5, -3.5, 10, 7, 2).fill({ color: 0xffffff });
  gfx.eventMode = 'none';
  gfx.visible = false;
  gfx.tint = 0xffffff;
  parent.addChild(gfx);
  return { gfx, busy: false };
}
