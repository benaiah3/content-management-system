import type { Platform } from '../personality/types.js';
import type { Insight, DailyDigest } from '../pipeline/types.js';
import type { ContentBrief } from './types.js';
import { resolvePersonality } from '../personality/loader.js';
import { buildSystemPrompt } from '../personality/prompt-builder.js';
import { todayDateString } from '../utils/date.js';
import { logger } from '../utils/logger.js';

function pickContentType(platform: Platform, insight: Insight): string {
  switch (platform) {
    case 'x':
      return insight.evidence.length >= 3 ? 'thread' : 'single-tweet';
    case 'blog':
      if (insight.type === 'technical-deep-dive') return 'tutorial';
      if (insight.type === 'hot-take') return 'opinion';
      if (insight.type === 'trend') return 'analysis';
      return 'roundup';
    case 'linkedin':
      if (insight.type === 'trend') return 'prediction';
      if (insight.type === 'hot-take') return 'insight-post';
      return 'lesson-learned';
  }
}

function buildUserPrompt(insight: Insight, contentType: string, platform: Platform): string {
  const evidenceBlock = insight.evidence
    .map((e) => `  - @${e.author}: "${e.text.slice(0, 200)}" (engagement: ${Math.round(e.engagement)})`)
    .join('\n');

  const anglesBlock = insight.suggestedAngles.map((a) => `  - ${a}`).join('\n');

  return `Create a ${contentType} for ${platform.toUpperCase()} about the following insight:

## Topic
${insight.title}

## Summary
${insight.summary}

## Supporting Evidence (tweets from today)
${evidenceBlock}

## Suggested Angles
${anglesBlock}

## Category
${insight.category}

## Content Type
${contentType}

Write the content now. Follow the brand voice and platform guidelines exactly.`;
}

export async function composeBriefs(digest: DailyDigest): Promise<ContentBrief[]> {
  const briefs: ContentBrief[] = [];
  const platforms: Platform[] = ['x', 'blog', 'linkedin'];

  for (const insight of digest.insights) {
    for (const platform of platforms) {
      // Check if this insight is suitable for this platform
      const potential = insight.contentPotential;
      if (!potential[platform]) continue;

      const resolved = await resolvePersonality(platform);
      const systemPrompt = buildSystemPrompt(resolved);
      const contentType = pickContentType(platform, insight);
      const userPrompt = buildUserPrompt(insight, contentType, platform);

      briefs.push({
        id: `brief-${todayDateString()}-${platform}-${insight.id}`,
        insight,
        platform,
        systemPrompt,
        userPrompt,
        contentType,
        constraints: {
          maxLength: resolved.platform.max_length,
          minLength: resolved.platform.min_length,
          formatting: resolved.merged_formatting,
        },
        createdAt: new Date().toISOString(),
      });
    }
  }

  logger.info({ briefCount: briefs.length }, 'Content briefs composed');
  return briefs;
}
