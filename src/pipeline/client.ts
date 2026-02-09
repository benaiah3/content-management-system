import { logger } from '../utils/logger.js';
import { XApiClient } from './x-api-client.js';

let cachedClient: XApiClient | null = null;

function resolveBearerToken(): string {
  const candidates = [
    process.env.X_BEARER_TOKEN,
    process.env.X_API_BEARER_TOKEN,
    process.env.TWITTER_BEARER_TOKEN,
    process.env.BEARER_TOKEN,
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  if (candidates.length === 0) {
    throw new Error(
      'Missing X API bearer token. Set X_BEARER_TOKEN (or TWITTER_BEARER_TOKEN) before running.',
    );
  }

  return candidates[0];
}

export async function getXClient(): Promise<XApiClient> {
  if (cachedClient) return cachedClient;

  logger.info('Initializing X API client...');

  const bearerToken = resolveBearerToken();
  const baseUrl =
    process.env.X_API_BASE_URL ??
    process.env.TWITTER_API_BASE_URL ??
    'https://api.x.com/2';

  cachedClient = new XApiClient({
    bearerToken,
    baseUrl,
    timeoutMs: Number(process.env.X_API_TIMEOUT_MS ?? '30000') || 30_000,
  });

  logger.info({ baseUrl }, 'X API client initialized');
  return cachedClient;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

