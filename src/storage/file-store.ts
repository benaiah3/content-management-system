import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';

async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function readJSON<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeJSON(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  logger.debug({ filePath }, 'Wrote JSON file');
}

export async function readMarkdown(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export async function writeMarkdown(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
  logger.debug({ filePath }, 'Wrote markdown file');
}

export async function fileExists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}

export { ensureDir };
