import type { TwitterClient } from '@steipete/bird';
import type { RawTweetBatch, SourcesConfig } from '../types.js';
import { sleep } from '../client.js';
import { logger } from '../../utils/logger.js';

const DELAY_BETWEEN_LISTS_MS = 1500;

export async function scrapeLists(
  client: TwitterClient,
  sources: SourcesConfig,
): Promise<RawTweetBatch[]> {
  const batches: RawTweetBatch[] = [];

  for (let i = 0; i < sources.lists.length; i++) {
    const list = sources.lists[i];

    logger.info({ listId: list.id, name: list.name }, 'Scraping list');

    try {
      const result = await client.getListTimeline(list.id, list.tweet_count);

      if (result.success) {
        batches.push({
          source: 'list',
          listId: list.id,
          category: list.name,
          tweets: result.tweets,
          scrapedAt: new Date().toISOString(),
        });
        logger.info({ listId: list.id, count: result.tweets.length }, 'List scraped');
      } else {
        logger.warn({ listId: list.id, error: result.error }, 'Failed to scrape list');
      }
    } catch (err) {
      logger.error({ listId: list.id, error: (err as Error).message }, 'Error scraping list');
    }

    if (i < sources.lists.length - 1) {
      await sleep(DELAY_BETWEEN_LISTS_MS);
    }
  }

  return batches;
}
