import type { TwitterClient } from '@steipete/bird';
import type { RawTweetBatch, SourcesConfig } from '../types.js';
import { sleep } from '../client.js';
import { logger } from '../../utils/logger.js';

const DELAY_BETWEEN_ACCOUNTS_MS = 1500;

// Cache handle → userId lookups to avoid repeated API calls
const userIdCache = new Map<string, string>();

async function resolveUserId(client: TwitterClient, handle: string): Promise<string | null> {
  const normalized = handle.replace(/^@/, '');

  if (userIdCache.has(normalized)) {
    return userIdCache.get(normalized)!;
  }

  const result = await client.getUserIdByUsername(normalized);
  if (result.success && result.userId) {
    userIdCache.set(normalized, result.userId);
    return result.userId;
  }

  logger.warn({ handle, error: result.error }, 'Failed to resolve user ID');
  return null;
}

export async function scrapeAccounts(
  client: TwitterClient,
  sources: SourcesConfig,
): Promise<RawTweetBatch[]> {
  const batches: RawTweetBatch[] = [];

  for (let i = 0; i < sources.accounts.length; i++) {
    const account = sources.accounts[i];
    const handle = account.handle.replace(/^@/, '');

    logger.info({ handle, category: account.category }, 'Scraping account');

    try {
      const userId = await resolveUserId(client, handle);
      if (!userId) {
        logger.warn({ handle }, 'Skipping account — could not resolve user ID');
        continue;
      }

      const result = await client.getUserTweetsPaged(userId, account.tweet_count, {
        maxPages: 2,
        pageDelayMs: 1000,
      });

      if (result.success) {
        batches.push({
          source: 'account',
          handle,
          category: account.category,
          tweets: result.tweets,
          scrapedAt: new Date().toISOString(),
        });
        logger.info({ handle, count: result.tweets.length }, 'Scraped account tweets');
      } else {
        logger.warn({ handle, error: result.error }, 'Failed to scrape account');
      }
    } catch (err) {
      logger.error({ handle, error: (err as Error).message }, 'Error scraping account');
    }

    // Rate limit delay between accounts
    if (i < sources.accounts.length - 1) {
      await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
    }
  }

  return batches;
}
