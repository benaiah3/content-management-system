import { z } from 'zod';
import { readJSON } from '../storage/file-store.js';
import { PATHS } from '../storage/paths.js';
import type { SourcesConfig } from './types.js';

const SourcesSchema = z.object({
  accounts: z.array(
    z.object({
      handle: z.string().min(1),
      category: z.string().min(1),
      priority: z.enum(['high', 'medium', 'low']),
      tweet_count: z.number().int().positive(),
      note: z.string().optional(),
    }),
  ),
  lists: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      tweet_count: z.number().int().positive(),
    }),
  ),
  searches: z.array(
    z.object({
      query: z.string().min(1),
      category: z.string().min(1),
      count: z.number().int().positive(),
      note: z.string().optional(),
    }),
  ),
  trending: z.object({
    enabled: z.boolean(),
    ai_only: z.boolean(),
    count: z.number().int().positive(),
    with_tweets: z.boolean(),
    tweets_per_item: z.number().int().positive(),
  }),
  news: z.object({
    enabled: z.boolean(),
    ai_only: z.boolean(),
    count: z.number().int().positive(),
    with_tweets: z.boolean(),
    tweets_per_item: z.number().int().positive(),
  }),
});

export async function loadSources(): Promise<SourcesConfig> {
  const raw = await readJSON<unknown>(PATHS.sources);
  const result = SourcesSchema.parse(raw);
  return result as SourcesConfig;
}
