import { createApp } from './interfaces/http/createApp';
import { env } from './infrastructure/config/env';
import { createContainer } from './infrastructure/container';

const app = createApp();
const container = createContainer();

app.listen(env.port, () => {
  console.log(`Pawmily API listening on http://localhost:${env.port}/api`);
  startMidnightFeedingCloser();
});

/** Runs close-unlogged once per local calendar day after midnight. */
function startMidnightFeedingCloser() {
  let lastRunDay = '';
  const tick = async () => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    if (now.getHours() !== 0 || lastRunDay === dayKey) return;
    lastRunDay = dayKey;
    try {
      const result = await container.closeUnloggedFeedingLogs.execute();
      console.log(
        `[feeding] closed unlogged meals for ${result.date}: ${result.closed}`,
      );
    } catch (err) {
      console.error('[feeding] close-unlogged failed', err);
    }
  };
  // Check every 15 minutes (covers Railway single-instance school deploy).
  setInterval(() => {
    void tick();
  }, 15 * 60 * 1000);
  void tick();
}
