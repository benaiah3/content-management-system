import type { NewsItem, TweetAuthor, TweetData } from './types.js';

export type XApiResult<T> = { success: true } & T | { success: false; error: string };

export interface PagedFetchOptions {
  maxPages?: number;
  pageDelayMs?: number;
}

export interface GetNewsOptions {
  aiOnly?: boolean;
  withTweets?: boolean;
  tweetsPerItem?: number;
  tabs?: string[];
}

type XUser = { id: string; name: string; username: string };
type XPublicMetrics = { like_count?: number; retweet_count?: number; reply_count?: number };
type XTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  public_metrics?: XPublicMetrics;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toTweetAuthor(user?: XUser): TweetAuthor {
  return {
    username: user?.username ?? 'unknown',
    name: user?.name ?? 'Unknown',
  };
}

function toTweetData(tweet: XTweet, usersById: Map<string, XUser>): TweetData {
  const authorId = tweet.author_id ?? undefined;
  const author = toTweetAuthor(authorId ? usersById.get(authorId) : undefined);
  return {
    id: tweet.id,
    text: tweet.text,
    author,
    authorId,
    createdAt: tweet.created_at,
    conversationId: tweet.conversation_id,
    likeCount: tweet.public_metrics?.like_count ?? 0,
    retweetCount: tweet.public_metrics?.retweet_count ?? 0,
    replyCount: tweet.public_metrics?.reply_count ?? 0,
  };
}

function buildXApiError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const title = typeof b.title === 'string' ? b.title : undefined;
    const detail = typeof b.detail === 'string' ? b.detail : undefined;
    const errors = Array.isArray(b.errors) ? b.errors : undefined;
    if (errors?.length) {
      const first = errors[0];
      if (first && typeof first === 'object') {
        const e = first as Record<string, unknown>;
        const et = typeof e.title === 'string' ? e.title : undefined;
        const ed = typeof e.detail === 'string' ? e.detail : undefined;
        if (et || ed) return [et, ed].filter(Boolean).join(': ');
      }
    }
    if (title || detail) return [title, detail].filter(Boolean).join(': ');
  }
  return `X API request failed with status ${status}`;
}

export class XApiClient {
  private readonly bearerToken: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: { bearerToken: string; baseUrl?: string; timeoutMs?: number }) {
    this.bearerToken = opts.bearerToken;
    this.baseUrl = (opts.baseUrl ?? 'https://api.x.com/2').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async getJson<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<XApiResult<{ data: T }>> {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
          'Content-Type': 'application/json',
        },
        signal: ac.signal,
      });

      const text = await res.text();
      const body = text ? safeJsonParse(text) : null;

      if (!res.ok) {
        return { success: false, error: buildXApiError(res.status, body) };
      }

      // v2 responses typically return `{ data, meta, includes }`; callers can cast as needed.
      return { success: true, data: body as T };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    } finally {
      clearTimeout(t);
    }
  }

  async getUserIdByUsername(username: string): Promise<XApiResult<{ userId: string }>> {
    const u = username.replace(/^@/, '');
    const res = await this.getJson<{ data?: XUser; errors?: unknown }>(`/users/by/username/${encodeURIComponent(u)}`, {
      'user.fields': 'id,username,name',
    });
    if (!res.success) return res;

    const data = (res.data as any)?.data as XUser | undefined;
    if (!data?.id) return { success: false, error: 'User not found' };
    return { success: true, userId: data.id };
  }

  async getUserTweetsPaged(userId: string, count: number, opts?: PagedFetchOptions): Promise<XApiResult<{ tweets: TweetData[] }>> {
    const maxPages = opts?.maxPages ?? 5;
    const pageDelayMs = opts?.pageDelayMs ?? 0;

    const tweets: TweetData[] = [];
    let nextToken: string | undefined = undefined;
    let pages = 0;

    while (tweets.length < count && pages < maxPages) {
      pages++;

      const maxResults = clampInt(count - tweets.length, 10, 100);
      const res = await this.getJson<{
        data?: XTweet[];
        includes?: { users?: XUser[] };
        meta?: { next_token?: string };
      }>(`/users/${encodeURIComponent(userId)}/tweets`, {
        max_results: maxResults,
        pagination_token: nextToken,
        expansions: 'author_id',
        'tweet.fields': 'created_at,author_id,public_metrics,conversation_id',
        'user.fields': 'id,username,name',
      });

      if (!res.success) return res as any;

      const body = res.data as any;
      const data: XTweet[] = body.data ?? [];
      const users: XUser[] = body.includes?.users ?? [];
      const usersById = new Map(users.map((u) => [u.id, u]));

      for (const t of data) tweets.push(toTweetData(t, usersById));

      nextToken = body.meta?.next_token;
      if (!nextToken) break;

      if (pageDelayMs > 0) {
        await new Promise((r) => setTimeout(r, pageDelayMs));
      }
    }

    return { success: true, tweets };
  }

  async search(query: string, count: number): Promise<XApiResult<{ tweets: TweetData[] }>> {
    const tweets: TweetData[] = [];
    let nextToken: string | undefined = undefined;
    let pages = 0;
    const maxPages = Math.max(1, Math.ceil(count / 100));

    while (tweets.length < count && pages < maxPages) {
      pages++;

      const maxResults = clampInt(count - tweets.length, 10, 100);
      const res = await this.getJson<{
        data?: XTweet[];
        includes?: { users?: XUser[] };
        meta?: { next_token?: string };
      }>(`/tweets/search/recent`, {
        query,
        max_results: maxResults,
        next_token: nextToken,
        expansions: 'author_id',
        'tweet.fields': 'created_at,author_id,public_metrics,conversation_id',
        'user.fields': 'id,username,name',
      });

      if (!res.success) return res as any;

      const body = res.data as any;
      const data: XTweet[] = body.data ?? [];
      const users: XUser[] = body.includes?.users ?? [];
      const usersById = new Map(users.map((u) => [u.id, u]));

      for (const t of data) tweets.push(toTweetData(t, usersById));

      nextToken = body.meta?.next_token;
      if (!nextToken) break;
    }

    return { success: true, tweets };
  }

  async getListTimeline(listId: string, count: number): Promise<XApiResult<{ tweets: TweetData[] }>> {
    const maxResults = clampInt(count, 10, 100);
    const res = await this.getJson<{
      data?: XTweet[];
      includes?: { users?: XUser[] };
    }>(`/lists/${encodeURIComponent(listId)}/tweets`, {
      max_results: maxResults,
      expansions: 'author_id',
      'tweet.fields': 'created_at,author_id,public_metrics,conversation_id',
      'user.fields': 'id,username,name',
    });
    if (!res.success) return res as any;

    const body = res.data as any;
    const data: XTweet[] = body.data ?? [];
    const users: XUser[] = body.includes?.users ?? [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    const tweets = data.map((t) => toTweetData(t, usersById)).slice(0, count);
    return { success: true, tweets };
  }

  private async getTweetsByIds(ids: string[]): Promise<XApiResult<{ tweets: TweetData[] }>> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return { success: true, tweets: [] };

    const res = await this.getJson<{
      data?: XTweet[];
      includes?: { users?: XUser[] };
    }>(`/tweets`, {
      ids: unique.slice(0, 100).join(','),
      expansions: 'author_id',
      'tweet.fields': 'created_at,author_id,public_metrics,conversation_id',
      'user.fields': 'id,username,name',
    });
    if (!res.success) return res as any;

    const body = res.data as any;
    const data: XTweet[] = body.data ?? [];
    const users: XUser[] = body.includes?.users ?? [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    return { success: true, tweets: data.map((t) => toTweetData(t, usersById)) };
  }

  async getNews(count: number, opts?: GetNewsOptions): Promise<XApiResult<{ items: NewsItem[] }>> {
    const tabs = opts?.tabs ?? [];
    const withTweets = opts?.withTweets ?? false;
    const tweetsPerItem = clampInt(opts?.tweetsPerItem ?? 0, 0, 10);

    // Trends (by WOEID)
    if (tabs.includes('trending')) {
      const woeid = clampInt(Number(process.env.X_TRENDS_WOEID ?? '23424977'), 1, 999999999);
      const maxTrends = clampInt(count, 1, 50);
      const res = await this.getJson<{ data?: Array<{ trend_name: string; tweet_count?: number }> }>(
        `/trends/by/woeid/${woeid}`,
        { max_trends: maxTrends, 'trend.fields': 'trend_name,tweet_count' },
      );
      if (!res.success) return res as any;

      const trends = ((res.data as any).data ?? []) as Array<{ trend_name: string; tweet_count?: number }>;
      const items: NewsItem[] = [];

      for (const t of trends.slice(0, count)) {
        let relatedTweets: TweetData[] | undefined;
        if (withTweets && tweetsPerItem > 0) {
          const s = await this.search(t.trend_name, tweetsPerItem);
          if (s.success) relatedTweets = s.tweets;
        }
        items.push({
          id: t.trend_name,
          headline: t.trend_name,
          category: 'trending',
          postCount: t.tweet_count,
          url: `https://x.com/search?q=${encodeURIComponent(t.trend_name)}`,
          tweets: relatedTweets,
        });
      }

      return { success: true, items };
    }

    // News search (requires query); we use env/config to keep the existing sources.json format unchanged.
    const query = process.env.X_NEWS_QUERY ?? (opts?.aiOnly ? 'AI' : 'news');
    const maxResults = clampInt(count, 1, 50);
    const res = await this.getJson<{
      data?: Array<{
        id: string;
        name: string;
        summary?: string;
        category?: string;
        cluster_posts_results?: Array<{ post_id: string }>;
        url?: string;
      }>;
    }>(`/news/search`, {
      query,
      max_results: maxResults,
      // Keep fields minimal; add more as needed.
      'news.fields': 'id,name,summary,category,cluster_posts_results,url',
    });
    if (!res.success) return res as any;

    const stories = ((res.data as any).data ?? []) as Array<{
      id: string;
      name: string;
      summary?: string;
      category?: string;
      cluster_posts_results?: Array<{ post_id: string }>;
      url?: string;
    }>;

    const items: NewsItem[] = [];
    for (const s of stories.slice(0, count)) {
      let relatedTweets: TweetData[] | undefined;
      if (withTweets && tweetsPerItem > 0) {
        const ids = (s.cluster_posts_results ?? []).map((p) => p.post_id).slice(0, tweetsPerItem);
        const t = await this.getTweetsByIds(ids);
        if (t.success) relatedTweets = t.tweets.slice(0, tweetsPerItem);
      }
      items.push({
        id: s.id,
        headline: s.name,
        category: s.category ?? 'news',
        description: s.summary,
        url: s.url,
        tweets: relatedTweets,
      });
    }

    return { success: true, items };
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

