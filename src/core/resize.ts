// Letterbox resize handler for portrait and landscape orientations.

import type { Container } from 'pixi.js';

/** Virtual design resolution (portrait). Landscape screens pillarbox to this aspect rather than stretch. */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

export function setupResize(root: Container, onResize?: (designW: number, designH: number) => void): () => void {
  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);

    root.scale.set(scale);
    root.x = (w - DESIGN_WIDTH * scale) / 2;
    root.y = (h - DESIGN_HEIGHT * scale) / 2;

    onResize?.(DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  resize();
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
}
