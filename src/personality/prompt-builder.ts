import type { ResolvedPersonality, VoiceAttributes } from './types.js';

function voiceDirective(attr: string, value: number): string {
  if (value >= 8) return `very high`;
  if (value >= 6) return `moderate-to-high`;
  if (value >= 4) return `moderate`;
  if (value >= 2) return `low`;
  return `very low`;
}

function buildVoiceSection(voice: VoiceAttributes): string {
  const lines = [
    `## Voice Calibration`,
    ``,
    `- Authority: ${voiceDirective('authority', voice.authority)} (${voice.authority}/10) — ${voice.authority >= 7 ? 'Speak with confidence, make definitive statements, cite specifics.' : 'Use measured language, present as informed perspective rather than decree.'}`,
    `- Warmth: ${voiceDirective('warmth', voice.warmth)} (${voice.warmth}/10) — ${voice.warmth >= 7 ? 'Be conversational and approachable, use "you" and "we" naturally.' : 'Maintain professional distance, focus on substance over rapport.'}`,
    `- Wit: ${voiceDirective('wit', voice.wit)} (${voice.wit}/10) — ${voice.wit >= 7 ? 'Use clever observations, wordplay, and sharp turns of phrase.' : voice.wit >= 4 ? 'Occasional wit is fine but substance comes first.' : 'Keep it straight and serious.'}`,
    `- Urgency: ${voiceDirective('urgency', voice.urgency)} (${voice.urgency}/10) — ${voice.urgency >= 7 ? 'Create momentum, highlight why this matters now.' : 'Let the insight speak for itself, avoid artificial urgency.'}`,
    `- Technicality: ${voiceDirective('technicality', voice.technicality)} (${voice.technicality}/10) — ${voice.technicality >= 7 ? 'Use precise technical language, assume the reader is technical.' : 'Explain technical concepts accessibly, minimize jargon.'}`,
    `- Contrarian: ${voiceDirective('contrarian', voice.contrarian)} (${voice.contrarian}/10) — ${voice.contrarian >= 7 ? 'Challenge conventional wisdom when evidence supports it.' : 'Present balanced perspectives, avoid unnecessary provocation.'}`,
    `- Optimism: ${voiceDirective('optimism', voice.optimism)} (${voice.optimism}/10) — ${voice.optimism >= 7 ? 'Frame developments positively while acknowledging challenges.' : 'Stay neutral, present facts without positive or negative spin.'}`,
  ];
  return lines.join('\n');
}

function buildVocabularySection(personality: ResolvedPersonality): string {
  const vocab = personality.base.vocabulary;
  const lines = [
    `## Vocabulary Rules`,
    ``,
    `### Preferred Terms`,
    ...vocab.preferred_terms.map((t) => `- ${t}`),
    ``,
    `### Banned Terms — NEVER use these:`,
    ...vocab.banned_terms.map((t) => `- "${t}"`),
    ``,
    `### Allowed Industry Terms (use without explanation):`,
    vocab.industry_terms_allowed.join(', '),
    ``,
    `### Acronym Policy: ${vocab.acronym_policy}`,
  ];
  return lines.join('\n');
}

function buildFormattingSection(personality: ResolvedPersonality): string {
  const fmt = personality.merged_formatting;
  const platform = personality.platform;

  const lines = [
    `## Formatting Rules`,
    ``,
    `- Sentence length: ${fmt.sentence_length}`,
    `- Paragraph style: ${fmt.paragraph_style}`,
    `- List usage: ${fmt.list_usage}`,
    `- Emoji usage: ${fmt.emoji_usage}`,
    `- Hashtag policy: ${fmt.hashtag_policy}`,
  ];

  if (platform.max_length) {
    lines.push(`- Maximum length: ${platform.max_length} characters`);
  }
  if (platform.min_length) {
    lines.push(`- Minimum length: ${platform.min_length} characters`);
  }
  if (platform.thread_max) {
    lines.push(`- Maximum thread length: ${platform.thread_max} posts`);
  }

  return lines.join('\n');
}

function buildPrinciplesSection(principles: string[]): string {
  const lines = [
    `## Content Principles`,
    ``,
    ...principles.map((p) => `- ${p}`),
  ];
  return lines.join('\n');
}

export function buildSystemPrompt(personality: ResolvedPersonality): string {
  const sections = [
    `# Brand Voice: ${personality.base.brand_name}`,
    ``,
    `You are writing content for ${personality.base.brand_name}. ${personality.base.tagline}.`,
    ``,
    `Platform: ${personality.platform.platform.toUpperCase()}`,
    `Perspective: ${personality.base.perspective.pov} ("we"), as a ${personality.base.perspective.stance}`,
    `Target audience: ${personality.base.perspective.audience_assumption}`,
    ``,
    `---`,
    ``,
    personality.base.narrative,
    ``,
    `---`,
    ``,
    buildVoiceSection(personality.merged_voice),
    ``,
    buildVocabularySection(personality),
    ``,
    buildPrinciplesSection(personality.base.principles),
    ``,
    buildFormattingSection(personality),
    ``,
    `---`,
    ``,
    `## Platform-Specific Guidelines (${personality.platform.platform.toUpperCase()})`,
    ``,
    `Available content types: ${personality.platform.content_types.join(', ')}`,
    ``,
    personality.platform.guidelines,
  ];

  return sections.join('\n');
}
