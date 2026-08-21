import { createApp } from './core/app';
import { setupMraid } from './core/mraid';
import { setupResize } from './core/resize';
import { createDirector } from './game/director';
import { assertRun } from './game/resolve';
import { selectVariant, wantsIdleAssist } from './game/variants';

async function main(): Promise<void> {
  const variant = selectVariant(window.location.search);
  const idleAssist = wantsIdleAssist(window.location.search);

  if (import.meta.env.DEV) {
    // Simulate the whole run before showing anything. A seed that cannot reach the score
    // goal, or that dead-ends, must fail the boot rather than strand a player.
    const { moves, score, reshuffles } = assertRun(variant);
    console.info(
      `[sweet-swap] run "${variant.id}" verified — solvable in ${moves} moves ` +
        `for ${score} pts (${reshuffles} reshuffles)`,
    );
  }

  const ctx = await createApp();
  const disposeResize = setupResize(ctx.root);
  const mraid = setupMraid(ctx.app);

  await mraid.whenViewable();

  const director = createDirector(ctx, variant, mraid, { idleAssist });
  ctx.app.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  await director.start();

  window.addEventListener('beforeunload', () => {
    director.dispose();
    disposeResize();
    mraid.dispose();
  });
}

main();
