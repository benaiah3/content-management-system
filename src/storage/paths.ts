import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { todayDateString } from '../utils/date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

export const PATHS = {
  root: PROJECT_ROOT,
  config: join(PROJECT_ROOT, 'config'),
  personality: join(PROJECT_ROOT, 'config', 'personality.md'),
  platforms: join(PROJECT_ROOT, 'config', 'platforms'),
  sources: join(PROJECT_ROOT, 'config', 'sources.json'),
  data: join(PROJECT_ROOT, 'data'),
} as const;

export function datePaths(date?: string) {
  const d = date ?? todayDateString();
  return {
    raw: join(PATHS.data, 'raw', d),
    processed: join(PATHS.data, 'processed', d),
    distilled: join(PATHS.data, 'distilled', d),
    briefs: join(PATHS.data, 'briefs', d),
    content: join(PATHS.data, 'content', d),
  };
}
