import type { XApiClient } from '../x-api-client.js';
import type { RawTweetBatch, SourcesConfig } from '../types.js';
import { sleep } from '../client.js';
import { logger } from '../../utils/logger.js';

const DELAY_BETWEEN_SEARCHES_MS = 2000;

export async function scrapeSearches(
  client: XApiClient,
  sources: SourcesConfig,
): Promise<RawTweetBatch[]> {
  const batches: RawTweetBatch[] = [];

  for (let i = 0; i < sources.searches.length; i++) {
    const search = sources.searches[i];

    logger.info({ query: search.query, category: search.category }, 'Running search');

    try {
      const result = await client.search(search.query, search.count);

      if (result.success) {
        batches.push({
          source: 'search',
          query: search.query,
          category: search.category,
          tweets: result.tweets,
          scrapedAt: new Date().toISOString(),
        });
        logger.info({ query: search.query, count: result.tweets.length }, 'Search completed');
      } else {
        logger.warn({ query: search.query, error: result.error }, 'Search failed');
      }
    } catch (err) {
      logger.error({ query: search.query, error: (err as Error).message }, 'Error running search');
    }

    if (i < sources.searches.length - 1) {
      await sleep(DELAY_BETWEEN_SEARCHES_MS);
    }
  }

  return batches;
}
