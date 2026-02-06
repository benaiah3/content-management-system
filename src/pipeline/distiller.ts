import type { ProcessedTweet, TrendingTopic, Insight, DailyDigest } from './types.js';
import { logger } from '../utils/logger.js';
import { todayDateString } from '../utils/date.js';

// --- Algorithmic Distillation ---

interface TopicCluster {
  keyword: string;
  category: string;
  tweets: ProcessedTweet[];
  totalEngagement: number;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'about', 'up', 'its',
    'it', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
    'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
    'what', 'which', 'who', 'whom', 'and', 'but', 'or', 'if', 'while',
    'because', 'until', 'although', 'since', 'unless', 'also', 'like',
    'get', 'got', 'going', 'new', 'one', 'two', 'even', 'still', 'much',
    'really', 'thing', 'things', 'know', 'think', 'make', 'see', 'use',
    'way', 'amp', 'https', 'http', 'com', 'www', 'rt',
  ]);

  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function clusterByKeyword(tweets: ProcessedTweet[]): TopicCluster[] {
  const keywordMap = new Map<string, ProcessedTweet[]>();

  for (const tweet of tweets) {
    const keywords = extractKeywords(tweet.text);
    for (const kw of keywords) {
      if (!keywordMap.has(kw)) keywordMap.set(kw, []);
      keywordMap.get(kw)!.push(tweet);
    }
  }

  // Build clusters from keywords that appear in multiple tweets
  const clusters: TopicCluster[] = [];
  for (const [keyword, kwTweets] of keywordMap) {
    if (kwTweets.length < 3) continue;

    const totalEngagement = kwTweets.reduce((sum, t) => sum + t.engagement.score, 0);
    const primaryCategory = getMostCommonCategory(kwTweets);

    clusters.push({
      keyword,
      category: primaryCategory,
      tweets: kwTweets,
      totalEngagement,
    });
  }

  // Sort by total engagement
  clusters.sort((a, b) => b.totalEngagement - a.totalEngagement);

  // Deduplicate overlapping clusters — if two clusters share >70% tweets, merge
  const merged: TopicCluster[] = [];
  const usedTweetIds = new Set<string>();

  for (const cluster of clusters) {
    const uniqueTweets = cluster.tweets.filter((t) => !usedTweetIds.has(t.id));
    if (uniqueTweets.length < 2) continue;

    merged.push({ ...cluster, tweets: uniqueTweets });
    for (const t of uniqueTweets) usedTweetIds.add(t.id);

    if (merged.length >= 15) break; // Cap at 15 clusters
  }

  return merged;
}

function getMostCommonCategory(tweets: ProcessedTweet[]): string {
  const counts = new Map<string, number>();
  for (const t of tweets) {
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  }
  let max = 0;
  let best = 'general';
  for (const [cat, count] of counts) {
    if (count > max) { max = count; best = cat; }
  }
  return best;
}

function clusterToInsight(cluster: TopicCluster, index: number): Insight {
  const topTweets = cluster.tweets
    .sort((a, b) => b.engagement.score - a.engagement.score)
    .slice(0, 5);

  const avgEngagement = cluster.totalEngagement / cluster.tweets.length;
  const relevanceScore = Math.min(100, Math.round(
    (cluster.tweets.length * 10) + (avgEngagement / 100),
  ));

  return {
    id: `insight-${todayDateString()}-${index}`,
    type: 'general',
    title: `${cluster.keyword.charAt(0).toUpperCase() + cluster.keyword.slice(1)} — ${cluster.tweets.length} posts, ${Math.round(cluster.totalEngagement)} total engagement`,
    summary: `Topic "${cluster.keyword}" is generating significant discussion with ${cluster.tweets.length} related posts. Top voices: ${[...new Set(topTweets.map((t) => `@${t.authorHandle}`))].slice(0, 3).join(', ')}.`,
    evidence: topTweets.map((t) => ({
      tweetId: t.id,
      author: `@${t.authorHandle}`,
      text: t.text.slice(0, 280),
      engagement: t.engagement.score,
    })),
    category: cluster.category,
    relevanceScore,
    contentPotential: {
      x: true,
      blog: cluster.tweets.length >= 5 && avgEngagement > 50,
      linkedin: avgEngagement > 30,
    },
    suggestedAngles: [
      `Key developments around "${cluster.keyword}"`,
      `Why "${cluster.keyword}" matters for AI/tech teams right now`,
      `Breakdown: what the conversation around "${cluster.keyword}" reveals`,
    ],
    extractedAt: new Date().toISOString(),
  };
}

function extractTopVoices(tweets: ProcessedTweet[]): DailyDigest['topVoices'] {
  const voiceMap = new Map<string, { name: string; count: number; engagement: number }>();

  for (const tweet of tweets) {
    const handle = tweet.authorHandle;
    const existing = voiceMap.get(handle) ?? { name: tweet.authorName, count: 0, engagement: 0 };
    existing.count++;
    existing.engagement += tweet.engagement.score;
    voiceMap.set(handle, existing);
  }

  return [...voiceMap.entries()]
    .map(([handle, data]) => ({
      handle,
      name: data.name,
      tweetCount: data.count,
      totalEngagement: data.engagement,
    }))
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, 10);
}

// --- LLM-Assisted Distillation ---

export interface LLMProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

async function llmDistill(
  tweets: ProcessedTweet[],
  trendingTopics: TrendingTopic[],
  llm: LLMProvider,
): Promise<Insight[]> {
  const top50 = tweets.slice(0, 50);

  const tweetSummaries = top50.map((t, i) =>
    `[${i + 1}] @${t.authorHandle}: "${t.text.slice(0, 200)}" (engagement: ${Math.round(t.engagement.score)}, category: ${t.category})`
  ).join('\n');

  const trendingSummaries = trendingTopics.slice(0, 10).map((t) =>
    `- ${t.headline} (${t.category}, ${t.postCount ?? 'unknown'} posts)`
  ).join('\n');

  const systemPrompt = `You are an AI/tech content analyst. Your job is to identify the most significant themes, insights, and developments from today's Twitter/X activity in the AI and technology space.

You must respond with valid JSON only — no markdown, no commentary.`;

  const userPrompt = `Here are the top 50 tweets by engagement from today:

${tweetSummaries}

Trending topics:
${trendingSummaries}

Analyze these and identify the 5-8 most significant themes or developments. For each, provide:

Respond with a JSON array of objects, each with:
- "type": one of "trend", "hot-take", "announcement", "technical-deep-dive", "debate"
- "title": concise title (max 80 chars)
- "summary": 2-3 sentence summary
- "evidence_indices": array of tweet numbers [1-50] that support this insight
- "category": the primary category
- "relevance_score": 0-100
- "content_potential": { "x": bool, "blog": bool, "linkedin": bool }
- "suggested_angles": array of 2-3 content angle strings

Respond ONLY with the JSON array.`;

  try {
    const response = await llm.complete(systemPrompt, userPrompt);
    const parsed = JSON.parse(response) as Array<{
      type: string;
      title: string;
      summary: string;
      evidence_indices: number[];
      category: string;
      relevance_score: number;
      content_potential: { x: boolean; blog: boolean; linkedin: boolean };
      suggested_angles: string[];
    }>;

    return parsed.map((item, index) => ({
      id: `llm-insight-${todayDateString()}-${index}`,
      type: item.type as Insight['type'],
      title: item.title,
      summary: item.summary,
      evidence: item.evidence_indices
        .filter((i) => i >= 1 && i <= top50.length)
        .map((i) => {
          const tweet = top50[i - 1];
          return {
            tweetId: tweet.id,
            author: `@${tweet.authorHandle}`,
            text: tweet.text.slice(0, 280),
            engagement: tweet.engagement.score,
          };
        }),
      category: item.category,
      relevanceScore: item.relevance_score,
      contentPotential: item.content_potential,
      suggestedAngles: item.suggested_angles,
      extractedAt: new Date().toISOString(),
    }));
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'LLM distillation failed');
    return [];
  }
}

// --- Main Distillation Entry Point ---

export async function distill(
  processedTweets: ProcessedTweet[],
  trendingTopics: TrendingTopic[],
  llm?: LLMProvider,
): Promise<DailyDigest> {
  // Algorithmic distillation (always runs)
  const clusters = clusterByKeyword(processedTweets);
  const algorithmicInsights = clusters.map((c, i) => clusterToInsight(c, i));

  logger.info({ insightCount: algorithmicInsights.length }, 'Algorithmic distillation complete');

  // LLM-assisted distillation (optional)
  let llmInsights: Insight[] = [];
  if (llm) {
    logger.info('Running LLM-assisted distillation');
    llmInsights = await llmDistill(processedTweets, trendingTopics, llm);
    logger.info({ insightCount: llmInsights.length }, 'LLM distillation complete');
  }

  // Merge: LLM insights take priority, algorithmic fill in gaps
  const allInsights = [...llmInsights, ...algorithmicInsights];

  // Deduplicate insights by checking title similarity (simple)
  const seenTitles = new Set<string>();
  const deduped = allInsights.filter((insight) => {
    const normalized = insight.title.toLowerCase().slice(0, 30);
    if (seenTitles.has(normalized)) return false;
    seenTitles.add(normalized);
    return true;
  });

  // Sort by relevance
  deduped.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const topVoices = extractTopVoices(processedTweets);

  return {
    date: todayDateString(),
    totalTweetsScraped: processedTweets.length,
    totalAfterDedup: processedTweets.length,
    insights: deduped.slice(0, 15),
    trendingTopics,
    topVoices,
  };
}
