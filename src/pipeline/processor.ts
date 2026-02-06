import { createHash } from 'crypto';
import type { TweetData } from '@steipete/bird';
import type { RawTweetBatch, RawNewsBatch, RawBatch, ProcessedTweet, TrendingTopic } from './types.js';
import { logger } from '../utils/logger.js';

function hashContent(text: string): string {
  return createHash('sha256').update(text.toLowerCase().trim()).digest('hex').slice(0, 16);
}

function computeEngagementScore(tweet: TweetData): number {
  const likes = tweet.likeCount ?? 0;
  const retweets = tweet.retweetCount ?? 0;
  const replies = tweet.replyCount ?? 0;
  return likes * 1 + retweets * 2 + replies * 1.5;
}

function normalizeTweet(tweet: TweetData, source: string, category: string): ProcessedTweet {
  return {
    id: tweet.id,
    text: tweet.text,
    authorName: tweet.author.name,
    authorHandle: tweet.author.username,
    authorId: tweet.authorId,
    createdAt: tweet.createdAt ?? new Date().toISOString(),
    engagement: {
      likes: tweet.likeCount ?? 0,
      retweets: tweet.retweetCount ?? 0,
      replies: tweet.replyCount ?? 0,
      score: computeEngagementScore(tweet),
    },
    source,
    category,
    quotedText: tweet.quotedTweet?.text,
    quotedAuthor: tweet.quotedTweet?.author.username,
    isThread: !!tweet.conversationId && tweet.conversationId !== tweet.id,
    conversationId: tweet.conversationId,
    contentHash: hashContent(tweet.text),
  };
}

function isSelfPromo(text: string): boolean {
  const lower = text.toLowerCase();
  const urls = (text.match(/https?:\/\//g) ?? []).length;
  const promoTerms = ['check out my', 'sign up for', 'use my code', 'link in bio', 'subscribe to my'];
  return urls > 2 && promoTerms.some((term) => lower.includes(term));
}

export function processTweetBatches(
  tweetBatches: RawTweetBatch[],
): ProcessedTweet[] {
  const seen = new Set<string>();
  const seenContent = new Set<string>();
  const processed: ProcessedTweet[] = [];

  for (const batch of tweetBatches) {
    const sourceLabel =
      batch.source === 'account' ? `account:${batch.handle}` :
      batch.source === 'search' ? `search:${batch.query}` :
      `list:${batch.listId}`;

    for (const tweet of batch.tweets) {
      // Deduplicate by tweet ID
      if (seen.has(tweet.id)) continue;
      seen.add(tweet.id);

      // Deduplicate by content hash (catches near-identical retweets)
      const contentHash = hashContent(tweet.text);
      if (seenContent.has(contentHash)) continue;
      seenContent.add(contentHash);

      // Filter self-promo
      if (isSelfPromo(tweet.text)) continue;

      processed.push(normalizeTweet(tweet, sourceLabel, batch.category ?? 'general'));
    }
  }

  // Sort by engagement score descending
  processed.sort((a, b) => b.engagement.score - a.engagement.score);

  logger.info({
    totalInput: tweetBatches.reduce((sum, b) => sum + b.tweets.length, 0),
    afterDedup: processed.length,
  }, 'Processed tweet batches');

  return processed;
}

export function processNewsBatches(
  newsBatches: RawNewsBatch[],
  tweetProcessor: (tweet: TweetData, source: string, category: string) => ProcessedTweet = normalizeTweet,
): TrendingTopic[] {
  const topics: TrendingTopic[] = [];

  for (const batch of newsBatches) {
    for (const item of batch.items) {
      const relatedTweets = (item.tweets ?? []).map((t) =>
        tweetProcessor(t, `${batch.source}:${item.headline}`, item.category ?? 'trending'),
      );

      topics.push({
        id: item.id,
        headline: item.headline,
        category: item.category ?? 'trending',
        postCount: item.postCount,
        description: item.description,
        url: item.url,
        relatedTweets,
      });
    }
  }

  logger.info({ topicCount: topics.length }, 'Processed news/trending batches');
  return topics;
}
