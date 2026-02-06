import matter from 'gray-matter';
import { readMarkdown } from '../storage/file-store.js';
import { PATHS } from '../storage/paths.js';
import { join } from 'path';
import type {
  PersonalityConfig,
  PlatformAdaptation,
  ResolvedPersonality,
  VoiceAttributes,
  FormattingPreferences,
  Platform,
} from './types.js';

export async function loadPersonality(): Promise<PersonalityConfig> {
  const raw = await readMarkdown(PATHS.personality);
  const { data, content } = matter(raw);

  return {
    brand_name: data.brand_name,
    tagline: data.tagline,
    mission: data.mission,
    voice: data.voice as VoiceAttributes,
    perspective: data.perspective,
    vocabulary: data.vocabulary,
    principles: data.principles,
    formatting: data.formatting as FormattingPreferences,
    topics: data.topics,
    narrative: content.trim(),
  };
}

export async function loadPlatform(platform: Platform): Promise<PlatformAdaptation> {
  const filePath = join(PATHS.platforms, `${platform}.md`);
  const raw = await readMarkdown(filePath);
  const { data, content } = matter(raw);

  return {
    platform: data.platform as Platform,
    max_length: data.max_length,
    min_length: data.min_length,
    thread_max: data.thread_max,
    voice_overrides: data.voice_overrides ?? {},
    formatting_overrides: data.formatting_overrides ?? {},
    content_types: data.content_types ?? [],
    guidelines: content.trim(),
  };
}

function mergeVoice(base: VoiceAttributes, overrides: Partial<VoiceAttributes>): VoiceAttributes {
  return { ...base, ...overrides };
}

function mergeFormatting(
  base: FormattingPreferences,
  overrides: Partial<FormattingPreferences>,
): FormattingPreferences {
  return { ...base, ...overrides };
}

export async function resolvePersonality(platform: Platform): Promise<ResolvedPersonality> {
  const base = await loadPersonality();
  const platformConfig = await loadPlatform(platform);

  return {
    base,
    platform: platformConfig,
    merged_voice: mergeVoice(base.voice, platformConfig.voice_overrides),
    merged_formatting: mergeFormatting(base.formatting, platformConfig.formatting_overrides),
  };
}
