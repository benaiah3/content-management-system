import { TwitterClient, resolveCredentials } from '@steipete/bird';
import { logger } from '../utils/logger.js';
import { tryResolveChromeTwitterCookiesDarwin } from './chrome-cookies-darwin.js';

let cachedClient: TwitterClient | null = null;

export async function getBirdClient(): Promise<TwitterClient> {
  if (cachedClient) return cachedClient;

  logger.info('Resolving Twitter credentials...');

  const chromeProfile = process.env.CHROME_PROFILE ?? process.env.BIRD_CHROME_PROFILE ?? 'Default';

  let { cookies, warnings } = await resolveCredentials({
    cookieSource: ['chrome', 'safari'],
    cookieTimeoutMs: 30_000,
    chromeProfile,
  });

  let usedFallback = false;

  // Fallback: Bird's Chrome cookie extractor can fail on some systems due to SQLite 64-bit
  // integer overflow when reading the cookie DB. If we still don't have cookies, try our own
  // Chrome DB + Keychain decrypt path (macOS only).
  if (!cookies.authToken || !cookies.ct0) {
    const fb = await tryResolveChromeTwitterCookiesDarwin({ chromeProfile });
    warnings = [...warnings, ...fb.warnings];
    if (fb.cookies.authToken && fb.cookies.ct0) {
      cookies = fb.cookies;
      usedFallback = true;
    }
  }

  if (warnings.length > 0) {
    // If fallback succeeded, these warnings are expected noise from the upstream extractor.
    if (usedFallback) {
      logger.debug({ warnings }, 'Credential resolution warnings (fallback succeeded)');
    } else {
      logger.warn({ warnings }, 'Credential resolution warnings');
    }
  }

  if (!cookies.authToken || !cookies.ct0) {
    throw new Error(
      'Failed to resolve Twitter credentials. Ensure you are logged into X in Chrome, or set AUTH_TOKEN and CT0 env vars.',
    );
  }

  if (usedFallback) {
    logger.info({ source: cookies.source }, 'Resolved Twitter cookies via Chrome DB fallback');
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
