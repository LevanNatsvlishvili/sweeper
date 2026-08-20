// End-card CTA overlay with MRAID clickthrough.

import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/resize';
import { animateTo } from '../game/tiles';

export const STORE_URL = 'https://play.google.com/store';

const PANEL_HEIGHT = 168;

export interface CtaOverlay {
  show: (duration: number) => Promise<void>;
  dispose: () => void;
}

export function createCta(parent: Container, onClick: () => void): CtaOverlay {
  const root = new Container();
  root.eventMode = 'none';
  root.visible = false;
  root.y = DESIGN_HEIGHT;
  parent.addChild(root);

  const panel = new Graphics()
    .roundRect(28, 0, DESIGN_WIDTH - 56, PANEL_HEIGHT, 28)
    .fill({ color: 0x2a1810, alpha: 0.96 })
    .stroke({ width: 3, color: 0xf4c431, alpha: 0.85 });
  panel.eventMode = 'none';
  root.addChild(panel);

  const button = new Graphics().roundRect(86, 46, DESIGN_WIDTH - 172, 76, 38).fill({ color: 0xf4c431 });
  button.eventMode = 'static';
  button.cursor = 'pointer';
  button.on('pointertap', onClick);
  root.addChild(button);

  const label = new Text({
    text: 'PLAY NOW',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 34,
      fontWeight: '800',
      fill: '#2a1810',
    }),
  });
  label.anchor.set(0.5);
  label.position.set(DESIGN_WIDTH / 2, 84);
  label.eventMode = 'none';
  root.addChild(label);

  return {
    show: async (duration) => {
      root.visible = true;
      root.eventMode = 'static';
      await animateTo(root, { y: DESIGN_HEIGHT - PANEL_HEIGHT - 36, duration, ease: 'power3.out' });
    },
    dispose: () => {
      button.off('pointertap', onClick);
      root.destroy({ children: true });
    },
  };
}
