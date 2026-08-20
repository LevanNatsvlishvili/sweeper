import { createApp } from './core/app';
import { setupMraid } from './core/mraid';
import { setupResize } from './core/resize';
import { createDirector } from './game/director';
import { assertSeed } from './game/resolve';
import { selectVariant } from './game/variants';

async function main(): Promise<void> {
  const variant = selectVariant(window.location.search);

  if (import.meta.env.DEV) {
    // The rig is only as good as its seed. Fail the boot loudly if the seed and the
    // resolution pipeline ever disagree, rather than letting it misfire mid-cascade.
    const { steps } = assertSeed(variant);
    console.info(`[sweet-swap] seed "${variant.id}" verified — ${steps.length} resolution steps`);
  }

  const ctx = await createApp();
  const disposeResize = setupResize(ctx.root);
  const mraid = setupMraid(ctx.app);

  await mraid.whenViewable();

  const director = createDirector(ctx, variant, mraid);
  ctx.app.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  await director.start();

  window.addEventListener('beforeunload', () => {
    director.dispose();
    disposeResize();
    mraid.dispose();
  });
}

main();
