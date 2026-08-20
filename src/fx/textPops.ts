// Elastic combo and completion text pops driven by VARIANT config.

import { Container, Text, TextStyle } from 'pixi.js';

import { DESIGN_WIDTH } from '../core/resize';
import { animateTo, BOARD_ORIGIN_Y, GRID_PIXEL, waitFor } from '../game/tiles';
import type { ComboBeat } from '../game/variants';

export interface TextPops {
  combo: (beat: ComboBeat) => Promise<void>;
  complete: (text: string) => Promise<void>;
  prompt: (text: string, hold: number) => Promise<void>;
  dispose: () => void;
}

export function createTextPops(parent: Container): TextPops {
  const comboStyle = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 52,
    fontWeight: '800',
    fill: '#ffffff',
    stroke: { color: '#3a1a0a', width: 6 },
  });

  const completeStyle = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 44,
    fontWeight: '800',
    fill: '#ffe8a3',
    stroke: { color: '#3a1a0a', width: 6 },
  });

  const promptStyle = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 32,
    fontWeight: '700',
    fill: '#fff4d6',
    stroke: { color: '#2a1810', width: 5 },
  });

  const comboText = makeLabel(comboStyle, parent);
  const completeText = makeLabel(completeStyle, parent);
  const promptText = makeLabel(promptStyle, parent);

  async function pop(label: Text, message: string, tint: number, scale: number, life: number): Promise<void> {
    label.text = message;
    label.tint = tint;
    label.visible = true;
    label.alpha = 1;
    label.scale.set(0.4 * scale);
    label.rotation = (Math.random() - 0.5) * 0.18;
    await animateTo(label.scale, { x: scale, y: scale, duration: 0.28, ease: 'back.out(2.4)' });
    await waitFor(life);
    await animateTo(label, { alpha: 0, duration: 0.18 });
    label.visible = false;
  }

  return {
    combo: (beat) => {
      comboText.position.set(DESIGN_WIDTH / 2, BOARD_ORIGIN_Y + GRID_PIXEL / 2);
      return pop(comboText, beat.text, beat.tint, beat.scale, 0.35);
    },
    complete: (text) => {
      completeText.position.set(DESIGN_WIDTH / 2, BOARD_ORIGIN_Y + GRID_PIXEL / 2);
      return pop(completeText, text, 0xffffff, 1, 0.8);
    },
    prompt: async (text, hold) => {
      promptText.text = text;
      promptText.tint = 0xffffff;
      promptText.visible = true;
      promptText.alpha = 0;
      promptText.scale.set(1);
      promptText.rotation = 0;
      promptText.position.set(DESIGN_WIDTH / 2, BOARD_ORIGIN_Y - 52);
      await animateTo(promptText, { alpha: 1, duration: 0.18 });
      await waitFor(hold);
      await animateTo(promptText, { alpha: 0, duration: 0.2 });
      promptText.visible = false;
    },
    dispose: () => {
      comboText.destroy();
      completeText.destroy();
      promptText.destroy();
    },
  };
}

function makeLabel(style: TextStyle, parent: Container): Text {
  const label = new Text({ text: '', style });
  label.anchor.set(0.5);
  label.eventMode = 'none';
  label.visible = false;
  parent.addChild(label);
  return label;
}
