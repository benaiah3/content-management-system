import { z } from 'zod';
import { loadPersonality, loadPlatform } from './loader.js';
import type { Platform } from './types.js';
import { logger } from '../utils/logger.js';

const VoiceSchema = z.object({
  authority: z.number().min(1).max(10),
  warmth: z.number().min(1).max(10),
  wit: z.number().min(1).max(10),
  urgency: z.number().min(1).max(10),
  technicality: z.number().min(1).max(10),
  contrarian: z.number().min(1).max(10),
  optimism: z.number().min(1).max(10),
});

const PerspectiveSchema = z.object({
  pov: z.enum(['first-person-plural', 'first-person-singular', 'third-person']),
  stance: z.string().min(1),
  audience_assumption: z.string().min(1),
});

const VocabularySchema = z.object({
  preferred_terms: z.array(z.string()),
  banned_terms: z.array(z.string()),
  industry_terms_allowed: z.array(z.string()),
  acronym_policy: z.string().min(1),
});

const FormattingSchema = z.object({
  sentence_length: z.string().min(1),
  paragraph_style: z.string().min(1),
  list_usage: z.string().min(1),
  emoji_usage: z.string().min(1),
  hashtag_policy: z.string().min(1),
});

const TopicsSchema = z.object({
  primary: z.array(z.string()).min(1),
  secondary: z.array(z.string()),
  avoid: z.array(z.string()),
});

const PersonalitySchema = z.object({
  brand_name: z.string().min(1),
  tagline: z.string().min(1),
  mission: z.string().min(1),
  voice: VoiceSchema,
  perspective: PerspectiveSchema,
  vocabulary: VocabularySchema,
  principles: z.array(z.string()).min(1),
  formatting: FormattingSchema,
  topics: TopicsSchema,
  narrative: z.string().min(10),
});

const PlatformSchema = z.object({
  platform: z.enum(['x', 'blog', 'linkedin']),
  max_length: z.number().optional(),
  min_length: z.number().optional(),
  thread_max: z.number().optional(),
  voice_overrides: z.record(z.string(), z.number().min(1).max(10)).optional(),
  formatting_overrides: z.record(z.string(), z.string()).optional(),
  content_types: z.array(z.string()).min(1),
  guidelines: z.string().min(10),
});

export async function validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const personality = await loadPersonality();
    const result = PersonalitySchema.safeParse(personality);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`personality.md: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  } catch (err) {
    errors.push(`personality.md: Failed to load — ${(err as Error).message}`);
  }

  const platforms: Platform[] = ['x', 'blog', 'linkedin'];
  for (const platform of platforms) {
    try {
      const config = await loadPlatform(platform);
      const result = PlatformSchema.safeParse(config);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`platforms/${platform}.md: ${issue.path.join('.')} — ${issue.message}`);
        }
      }
    } catch (err) {
      errors.push(`platforms/${platform}.md: Failed to load — ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) {
    logger.error({ errors }, 'Config validation failed');
  } else {
    logger.info('Config validation passed');
  }

  return { valid: errors.length === 0, errors };
}

// Run directly with: npx tsx src/personality/validator.ts
if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '')) {
  validateConfig().then(({ valid, errors }) => {
    if (!valid) {
      console.error('Validation errors:');
      errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }
    console.log('All config files are valid.');
  });
}
