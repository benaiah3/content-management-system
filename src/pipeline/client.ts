import { TwitterClient, resolveCredentials } from '@steipete/bird';
import { logger } from '../utils/logger.js';

let cachedClient: TwitterClient | null = null;

export async function getBirdClient(): Promise<TwitterClient> {
  if (cachedClient) return cachedClient;

  logger.info('Resolving Twitter credentials...');

  const { cookies, warnings } = await resolveCredentials({
    cookieSource: ['safari', 'chrome'],
  });

  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Credential resolution warnings');
  }

  if (!cookies.authToken || !cookies.ct0) {
    throw new Error(
      'Failed to resolve Twitter credentials. Make sure you are logged into X in Safari or Chrome.',
    );
  }

  cachedClient = new TwitterClient({
    cookies,
    timeoutMs: 30_000,
    quoteDepth: 1,
  });

  logger.info('Bird client initialized');
  return cachedClient;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
