// Score readout. Deliberately no goal or progress bar — the run just ends when it ends.

import gsap from 'gsap';
import { Container, Text, TextStyle } from 'pixi.js';

import { DESIGN_WIDTH } from '../core/resize';

const SCORE_Y = 50;

export interface Hud {
  /** Ticks the readout up to `value`; the count-up is the reward, so never snap it. */
  setScore(value: number): void;
  dispose(): void;
}

export function createHud(parent: Container): Hud {
  const style = new TextStyle({
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: 46,
    fontWeight: '900',
    fill: '#ffd166',
    stroke: { color: '#2a1810', width: 6 },
  });

  const label = new Text({ text: '0', style });
  label.anchor.set(0.5);
  label.position.set(DESIGN_WIDTH / 2, SCORE_Y);
  label.eventMode = 'none';
  parent.addChild(label);

  // GSAP tweens this and the ticker reads it, so the number rolls rather than jumping.
  const counter = { value: 0 };
  let shown = 0;

  function setScore(value: number): void {
    if (value === shown) return;
    shown = value;

    gsap.killTweensOf(counter);
    gsap.to(counter, {
      value,
      duration: 0.45,
      ease: 'power2.out',
      onUpdate: () => {
        label.text = String(Math.round(counter.value));
      },
    });

    gsap.killTweensOf(label.scale);
    label.scale.set(1);
    gsap.to(label.scale, {
      x: 1.22,
      y: 1.22,
      duration: 0.14,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1,
    });
  }

  return {
    setScore,
    dispose: () => {
      gsap.killTweensOf(counter);
      gsap.killTweensOf(label.scale);
      label.destroy();
    },
  };
}
