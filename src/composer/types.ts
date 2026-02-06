import type { ResolvedPersonality, Platform, FormattingPreferences } from '../personality/types.js';
import type { Insight } from '../pipeline/types.js';

export interface ContentBrief {
  id: string;
  insight: Insight;
  platform: Platform;
  systemPrompt: string;
  userPrompt: string;
  contentType: string;
  constraints: {
    maxLength?: number;
    minLength?: number;
    formatting: FormattingPreferences;
  };
  createdAt: string;
}
