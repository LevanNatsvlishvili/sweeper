// Touch swipe and tap-half input handling.

export type Direction = 'left' | 'right';

const SWIPE_THRESHOLD_PX = 40;
const SWIPE_HORIZONTAL_BIAS = 1.5;

/**
 * Interprets raw pointer gestures only — swipe vs. tap-half — and reports a
 * direction. Game-rule interpretation (what a direction means, whether it's
 * honored) belongs to the caller, not here.
 */
export function setupInput(el: HTMLElement, onDirection: (dir: Direction) => void): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onPointerDown(e: PointerEvent): void {
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  }

  function onPointerUp(e: PointerEvent): void {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_BIAS) {
      onDirection(dx > 0 ? 'right' : 'left');
      return;
    }

    // Tap fallback: classify by which half of the screen it landed in.
    onDirection(e.clientX < window.innerWidth / 2 ? 'left' : 'right');
  }

  function onPointerCancel(): void {
    tracking = false;
  }

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
  };
}
