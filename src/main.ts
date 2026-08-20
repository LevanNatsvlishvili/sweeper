import { createApp } from './core/app';
import { setupMraid } from './core/mraid';
import { setupResize } from './core/resize';

async function main(): Promise<void> {
  const ctx = await createApp();
  const disposeResize = setupResize(ctx.root);
  const mraid = setupMraid(ctx.app);

  await mraid.whenViewable();

  window.addEventListener('beforeunload', () => {
    disposeResize();
    mraid.dispose();
  });
}

main();
