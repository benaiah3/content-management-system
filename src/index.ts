import { getBirdClient, sleep } from './pipeline/client.js';
import { loadSources } from './pipeline/sources.js';
import { scrapeAccounts } from './pipeline/scrapers/account-scraper.js';
import { scrapeSearches } from './pipeline/scrapers/search-scraper.js';
import { scrapeTrending } from './pipeline/scrapers/trending-scraper.js';
import { scrapeLists } from './pipeline/scrapers/list-scraper.js';
import { processTweetBatches, processNewsBatches } from './pipeline/processor.js';
import { distill } from './pipeline/distiller.js';
import { composeBriefs } from './composer/content-brief.js';
import { validateConfig } from './personality/validator.js';
import { writeJSON } from './storage/file-store.js';
import { datePaths } from './storage/paths.js';
import { logger } from './utils/logger.js';
import { join } from 'path';
import type { RawTweetBatch, RawNewsBatch } from './pipeline/types.js';

const DELAY_BETWEEN_SCRAPER_TYPES_MS = 3000;

// --- Pipeline Stages ---

async function runScrape() {
  logger.info('=== SCRAPE STAGE ===');
  const sources = await loadSources();
  const client = await getBirdClient();
  const paths = datePaths();

  const tweetBatches: RawTweetBatch[] = [];
  const newsBatches: RawNewsBatch[] = [];

  // 1. Scrape accounts
  const accountBatches = await scrapeAccounts(client, sources);
  tweetBatches.push(...accountBatches);
  await sleep(DELAY_BETWEEN_SCRAPER_TYPES_MS);

  // 2. Scrape searches
  const searchBatches = await scrapeSearches(client, sources);
  tweetBatches.push(...searchBatches);
  await sleep(DELAY_BETWEEN_SCRAPER_TYPES_MS);

  // 3. Scrape trending/news
  const trendingBatches = await scrapeTrending(client, sources);
  newsBatches.push(...trendingBatches);
  await sleep(DELAY_BETWEEN_SCRAPER_TYPES_MS);

  // 4. Scrape lists
  const listBatches = await scrapeLists(client, sources);
  tweetBatches.push(...listBatches);

  // Store raw data
  await writeJSON(join(paths.raw, 'tweet-batches.json'), tweetBatches);
  await writeJSON(join(paths.raw, 'news-batches.json'), newsBatches);

  logger.info({
    tweetBatches: tweetBatches.length,
    newsBatches: newsBatches.length,
    totalTweets: tweetBatches.reduce((s, b) => s + b.tweets.length, 0),
  }, 'Scrape complete');

  return { tweetBatches, newsBatches };
}

async function runProcess(tweetBatches?: RawTweetBatch[], newsBatches?: RawNewsBatch[]) {
  logger.info('=== PROCESS STAGE ===');
  const paths = datePaths();

  // Load from disk if not provided
  if (!tweetBatches) {
    const { readJSON } = await import('./storage/file-store.js');
    tweetBatches = await readJSON<RawTweetBatch[]>(join(paths.raw, 'tweet-batches.json'));
  }
  if (!newsBatches) {
    const { readJSON } = await import('./storage/file-store.js');
    newsBatches = await readJSON<RawNewsBatch[]>(join(paths.raw, 'news-batches.json'));
  }

  const processedTweets = processTweetBatches(tweetBatches);
  const trendingTopics = processNewsBatches(newsBatches);

  await writeJSON(join(paths.processed, 'processed-tweets.json'), processedTweets);
  await writeJSON(join(paths.processed, 'trending-topics.json'), trendingTopics);

  logger.info({ processedCount: processedTweets.length }, 'Process complete');
  return { processedTweets, trendingTopics };
}

async function runDistill(
  processedTweets?: Awaited<ReturnType<typeof runProcess>>['processedTweets'],
  trendingTopics?: Awaited<ReturnType<typeof runProcess>>['trendingTopics'],
) {
  logger.info('=== DISTILL STAGE ===');
  const paths = datePaths();

  if (!processedTweets) {
    const { readJSON } = await import('./storage/file-store.js');
    processedTweets = await readJSON(join(paths.processed, 'processed-tweets.json'));
  }
  if (!trendingTopics) {
    const { readJSON } = await import('./storage/file-store.js');
    trendingTopics = await readJSON(join(paths.processed, 'trending-topics.json'));
  }

  // TODO: Add LLM provider when API key is configured
  const digest = await distill(processedTweets!, trendingTopics!);

  await writeJSON(join(paths.distilled, 'digest.json'), digest);

  logger.info({ insightCount: digest.insights.length }, 'Distill complete');
  return digest;
}

async function runBrief(digest?: Awaited<ReturnType<typeof runDistill>>) {
  logger.info('=== BRIEF STAGE ===');
  const paths = datePaths();

  if (!digest) {
    const { readJSON } = await import('./storage/file-store.js');
    digest = await readJSON(join(paths.distilled, 'digest.json'));
  }

  const briefs = await composeBriefs(digest!);

  await writeJSON(join(paths.briefs, 'briefs.json'), briefs);

  logger.info({ briefCount: briefs.length }, 'Briefs composed');
  return briefs;
}

// --- Full Pipeline ---

export async function runPipeline() {
  const start = Date.now();
  logger.info('=== PIPELINE START ===');

  // Validate config first
  const { valid, errors } = await validateConfig();
  if (!valid) {
    logger.error({ errors }, 'Config validation failed — aborting pipeline');
    throw new Error(`Config validation failed: ${errors.join('; ')}`);
  }

  // Run all stages
  const { tweetBatches, newsBatches } = await runScrape();
  const { processedTweets, trendingTopics } = await runProcess(tweetBatches, newsBatches);
  const digest = await runDistill(processedTweets, trendingTopics);
  const briefs = await runBrief(digest);

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  logger.info({
    duration: `${duration}s`,
    tweets: processedTweets.length,
    insights: digest.insights.length,
    briefs: briefs.length,
  }, '=== PIPELINE COMPLETE ===');

  return { digest, briefs };
}

// --- CLI Entry Point ---

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes('--run-now') || args.length === 0) {
      await runPipeline();
    } else if (args.includes('--scrape-only')) {
      await runScrape();
    } else if (args.includes('--process-only')) {
      await runProcess();
    } else if (args.includes('--distill-only')) {
      await runDistill();
    } else if (args.includes('--brief-only')) {
      await runBrief();
    } else if (args.includes('--cron')) {
      const { startCron } = await import('./scheduler/cron.js');
      startCron();
    } else {
      console.log(`Usage:
  tsx src/index.ts              Run full pipeline
  tsx src/index.ts --run-now    Run full pipeline
  tsx src/index.ts --scrape-only   Scrape only
  tsx src/index.ts --process-only  Process only
  tsx src/index.ts --distill-only  Distill only
  tsx src/index.ts --brief-only    Compose briefs only
  tsx src/index.ts --cron          Start cron scheduler`);
    }
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Pipeline failed');
    process.exit(1);
  }
}

main();
