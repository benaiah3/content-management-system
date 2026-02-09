import type { XApiClient } from '../x-api-client.js';
import type { RawNewsBatch, SourcesConfig } from '../types.js';
import { logger } from '../../utils/logger.js';

export async function scrapeTrending(
  client: XApiClient,
  sources: SourcesConfig,
): Promise<RawNewsBatch[]> {
  const batches: RawNewsBatch[] = [];

  // Scrape trending topics
  if (sources.trending.enabled) {
    logger.info('Scraping trending topics');

    try {
      const result = await client.getNews(sources.trending.count, {
        aiOnly: sources.trending.ai_only,
        withTweets: sources.trending.with_tweets,
        tweetsPerItem: sources.trending.tweets_per_item,
        tabs: ['trending'],
      });

      if (result.success) {
        batches.push({
          source: 'trending',
          items: result.items,
          scrapedAt: new Date().toISOString(),
        });
        logger.info({ count: result.items.length }, 'Trending topics scraped');
      } else {
        logger.warn({ error: result.error }, 'Failed to scrape trending');
      }
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Error scraping trending');
    }
  }

  // Scrape news
  if (sources.news.enabled) {
    logger.info('Scraping news');

    try {
      const result = await client.getNews(sources.news.count, {
        aiOnly: sources.news.ai_only,
        withTweets: sources.news.with_tweets,
        tweetsPerItem: sources.news.tweets_per_item,
        tabs: ['forYou', 'news'],
      });

      if (result.success) {
        batches.push({
          source: 'news',
          items: result.items,
          scrapedAt: new Date().toISOString(),
        });
        logger.info({ count: result.items.length }, 'News scraped');
      } else {
        logger.warn({ error: result.error }, 'Failed to scrape news');
      }
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Error scraping news');
    }
  }

  return batches;
}
