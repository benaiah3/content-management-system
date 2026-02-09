export interface TweetAuthor {
  username: string;
  name: string;
}

// Minimal tweet schema used throughout this pipeline.
// This intentionally matches the fields the processor/distiller need; sources can map into it.
export interface TweetData {
  id: string;
  text: string;
  author: TweetAuthor;
  authorId?: string;
  createdAt?: string;
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  conversationId?: string;
  quotedTweet?: {
    text: string;
    author: TweetAuthor;
  };
}

// Minimal "news/trend" item schema used by the pipeline.
export interface NewsItem {
  id: string;
  headline: string;
  category?: string;
  postCount?: number;
  description?: string;
  url?: string;
  tweets?: TweetData[];
}

export interface RawTweetBatch {
  source: 'account' | 'search' | 'list';
  handle?: string;
  query?: string;
  listId?: string;
  category?: string;
  tweets: TweetData[];
  scrapedAt: string;
}

export interface RawNewsBatch {
  source: 'trending' | 'news';
  items: NewsItem[];
  scrapedAt: string;
}

export type RawBatch = RawTweetBatch | RawNewsBatch;

export interface ProcessedTweet {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorId?: string;
  createdAt: string;
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
    score: number;
  };
  source: string;
  category: string;
  quotedText?: string;
  quotedAuthor?: string;
  isThread: boolean;
  conversationId?: string;
  contentHash: string;
}

export interface TrendingTopic {
  id: string;
  headline: string;
  category: string;
  postCount?: number;
  description?: string;
  url?: string;
  relatedTweets: ProcessedTweet[];
}

export interface Insight {
  id: string;
  type: 'trend' | 'hot-take' | 'announcement' | 'technical-deep-dive' | 'debate' | 'general';
  title: string;
  summary: string;
  evidence: Array<{
    tweetId: string;
    author: string;
    text: string;
    engagement: number;
  }>;
  category: string;
  relevanceScore: number;
  contentPotential: {
    x: boolean;
    blog: boolean;
    linkedin: boolean;
  };
  suggestedAngles: string[];
  extractedAt: string;
}

export interface DailyDigest {
  date: string;
  totalTweetsScraped: number;
  totalAfterDedup: number;
  insights: Insight[];
  trendingTopics: TrendingTopic[];
  topVoices: Array<{
    handle: string;
    name: string;
    tweetCount: number;
    totalEngagement: number;
  }>;
}

export interface SourcesConfig {
  accounts: Array<{
    handle: string;
    category: string;
    priority: 'high' | 'medium' | 'low';
    tweet_count: number;
    note?: string;
  }>;
  lists: Array<{
    id: string;
    name: string;
    tweet_count: number;
  }>;
  searches: Array<{
    query: string;
    category: string;
    count: number;
    note?: string;
  }>;
  trending: {
    enabled: boolean;
    ai_only: boolean;
    count: number;
    with_tweets: boolean;
    tweets_per_item: number;
  };
  news: {
    enabled: boolean;
    ai_only: boolean;
    count: number;
    with_tweets: boolean;
    tweets_per_item: number;
  };
}
