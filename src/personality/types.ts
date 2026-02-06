export interface VoiceAttributes {
  authority: number;
  warmth: number;
  wit: number;
  urgency: number;
  technicality: number;
  contrarian: number;
  optimism: number;
}

export interface Perspective {
  pov: 'first-person-plural' | 'first-person-singular' | 'third-person';
  stance: string;
  audience_assumption: string;
}

export interface VocabularyRules {
  preferred_terms: string[];
  banned_terms: string[];
  industry_terms_allowed: string[];
  acronym_policy: string;
}

export interface FormattingPreferences {
  sentence_length: string;
  paragraph_style: string;
  list_usage: string;
  emoji_usage: string;
  hashtag_policy: string;
}

export interface TopicAuthority {
  primary: string[];
  secondary: string[];
  avoid: string[];
}

export interface PersonalityConfig {
  brand_name: string;
  tagline: string;
  mission: string;
  voice: VoiceAttributes;
  perspective: Perspective;
  vocabulary: VocabularyRules;
  principles: string[];
  formatting: FormattingPreferences;
  topics: TopicAuthority;
  narrative: string;
}

export type Platform = 'x' | 'blog' | 'linkedin';

export interface PlatformAdaptation {
  platform: Platform;
  max_length?: number;
  min_length?: number;
  thread_max?: number;
  voice_overrides: Partial<VoiceAttributes>;
  formatting_overrides: Partial<FormattingPreferences>;
  content_types: string[];
  guidelines: string;
}

export interface ResolvedPersonality {
  base: PersonalityConfig;
  platform: PlatformAdaptation;
  merged_voice: VoiceAttributes;
  merged_formatting: FormattingPreferences;
}
