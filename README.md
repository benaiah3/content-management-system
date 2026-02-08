# Content Management System (CMS)

Local pipeline for:
- scraping X (Twitter) activity via your logged-in web session
- processing + deduping tweets
- distilling daily insights
- composing platform-specific *content briefs* (X / blog / LinkedIn)

## Quickstart

```bash
cd "/Users/benaiahwillis/Content Management System"
npm install
npm run run:pipeline
```

## Commands

- Full pipeline (scrape -> process -> distill -> briefs):
  - `npm run run:pipeline`
- Individual stages:
  - `npm run run:scrape`
  - `npm run run:process`
  - `npm run run:distill`
  - `npm run run:brief`
- Start in-process scheduler (requires a long-running terminal/process):
  - `tsx src/index.ts --cron`

## Authentication (X cookies)

This project uses the Bird client (`@steipete/bird`) which authenticates to X using your existing web session cookies:
- `auth_token`
- `ct0` (CSRF token)

### Preferred: login in Chrome

1. Log into `https://x.com` in **Google Chrome**
2. The pipeline will attempt to read/decrypt Chrome cookies on macOS.

Notes:
- On first run, macOS Keychain may prompt for access to Chrome storage.
- If browser cookie extraction is blocked in your environment, you can set cookies explicitly:

```bash
export AUTH_TOKEN="..."
export CT0="..."
npm run run:pipeline
```

## Outputs (what gets generated)

All outputs are written to `data/<stage>/<YYYY-MM-DD>/...` as JSON.

For example:
- Raw scrape:
  - `data/raw/<date>/tweet-batches.json`
  - `data/raw/<date>/news-batches.json`
- Processed:
  - `data/processed/<date>/processed-tweets.json`
  - `data/processed/<date>/trending-topics.json`
- Distilled insights:
  - `data/distilled/<date>/digest.json`
- Generated content briefs (includes X briefs):
  - `data/briefs/<date>/briefs.json`

Important: the current system generates **brief prompts**, not final tweet text.

## Cherry On Top (What’s Still Missing)

### 1) LLM integration (to generate final tweet text)

Right now the pipeline composes a high-quality `systemPrompt` + `userPrompt` per brief, but it does not call an LLM to produce the final X post copy.

To fully “generate tweets”, we need to:
- pick an LLM provider (OpenAI / Anthropic / etc.)
- add a small generator step that takes each X brief and returns final tweet text (single tweet or thread)
- optionally save results as `.md`/`.txt` and/or feed into publishing

### 2) Publishing / webhook

The pipeline does not post to X. The clean way to integrate publishing is:
- send generated X posts to a webhook endpoint (your partner is handling this)
- webhook can queue, approve, schedule, and post

### 3) Scheduling (cron / launchd)

Two viable patterns:
- OS scheduler triggers a one-shot run:
  - e.g. `cron`/`launchd` runs `npm run run:pipeline` on a schedule
- Long-running process keeps an internal schedule:
  - `tsx src/index.ts --cron` (uses `node-cron`)

For production reliability on macOS, `launchd` is usually preferable to leaving a terminal window open.

