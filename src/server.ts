import { planFeedingClose } from './application/feeding/feedingSchedule';
import { createApp } from './interfaces/http/createApp';
import { env } from './infrastructure/config/env';
import { createContainer } from './infrastructure/container';

const app = createApp();
const container = createContainer();

app.listen(env.port, () => {
  console.log(`Pawmily API listening on http://localhost:${env.port}/api`);
  startMidnightFeedingCloser();
});

/** Closes elapsed El Salvador days. A restart still closes days missed at midnight. */
function startMidnightFeedingCloser() {
  let closedThrough: string | null = null;
  const tick = async () => {
    const plan = planFeedingClose(new Date(), closedThrough);
    if (!plan.dates.length) return;
    try {
      let closed = 0;
      let lastDate = plan.dates[plan.dates.length - 1];
      for (const day of plan.dates) {
        const result = await container.closeUnloggedFeedingLogs.execute(day);
        closed += result.closed;
        lastDate = result.date;
      }
      closedThrough = plan.closedThrough;
      console.log(`[feeding] closed unlogged meals through ${lastDate}: ${closed}`);
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
