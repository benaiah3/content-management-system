# Content Management System (CMS)

Local pipeline for:
- scraping X activity via the official X API
- processing + deduping posts
- distilling daily insights
- composing platform-specific *content briefs* (X / blog / LinkedIn)

## Setup

You need an X API Bearer Token:
- set `X_BEARER_TOKEN` in your shell environment (recommended)

Optional config:
- `X_API_BASE_URL` (defaults to `https://api.x.com/2`)
- `X_TRENDS_WOEID` (defaults to `23424977` = United States)
- `X_NEWS_QUERY` (defaults to `AI` when `ai_only` is true)

## Run

```bash
cd "/Users/benaiahwillis/Content Management System"
npm install

# one-shot run (scrape -> process -> distill -> briefs)
X_BEARER_TOKEN="..." npm run run:pipeline
```

Individual stages:
```bash
X_BEARER_TOKEN="..." npm run run:scrape
X_BEARER_TOKEN="..." npm run run:process
X_BEARER_TOKEN="..." npm run run:distill
X_BEARER_TOKEN="..." npm run run:brief
```

## Outputs

Outputs are written to `data/<stage>/<YYYY-MM-DD>/...` as JSON:
- `data/raw/<date>/tweet-batches.json`
- `data/raw/<date>/news-batches.json`
- `data/processed/<date>/processed-tweets.json`
- `data/processed/<date>/trending-topics.json`
- `data/distilled/<date>/digest.json`
- `data/briefs/<date>/briefs.json`

Important: the current system generates **brief prompts**, not final tweet text.

## Cherry On Top (What’s Still Missing)

### 1) LLM integration (to generate final tweet text)

Today, the pipeline produces a strong `systemPrompt` + `userPrompt` for each brief, but it does not call an LLM to generate the final X post text.

To fully generate “ready-to-post” tweets/threads we still need to:
- pick an LLM provider (OpenAI / Anthropic / etc.)
- add a generator step to produce final tweet text from each X brief
- optionally export the final content as `.md`/`.txt`

### 2) Publishing / webhook

The pipeline currently does **not** post to X.

Best practice is to publish via a webhook:
- send generated X posts to your webhook endpoint
- your webhook service can queue, approve, schedule, and post

### 3) Scheduling (cron / launchd)

The pipeline is designed for a periodic trigger:
- run it on an interval using `cron`/`launchd` (alarm clock pattern)

