import cron from 'node-cron';
import { runPipeline } from '../index.js';
import { logger } from '../utils/logger.js';

const SCHEDULE = process.env.CRON_SCHEDULE ?? '0 7 * * *'; // Default: 7:00 AM daily

export function startCron() {
  logger.info({ schedule: SCHEDULE }, 'Starting cron scheduler');

  cron.schedule(SCHEDULE, async () => {
    logger.info('Cron triggered — running pipeline');
    try {
      await runPipeline();
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Cron pipeline run failed');
    }
  });

  logger.info('Cron scheduler running. Press Ctrl+C to stop.');
}
