import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TwitterCookies } from '@steipete/bird';

type CookieResult = { cookies: TwitterCookies; warnings: string[] };

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function chromeProfileDir(profile: string): string {
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Google',
    'Chrome',
    profile,
  );
}

function readChromeSafeStoragePassword(): { password: string | null; warnings: string[] } {
  const warnings: string[] = [];
  try {
    // This can trigger a Keychain prompt the first time it is accessed.
    const out = execFileSync('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const password = out.trim();
    return { password: password.length ? password : null, warnings };
  } catch (err) {
    warnings.push(`Failed to read macOS Keychain (Chrome Safe Storage): ${(err as Error).message}`);
    return { password: null, warnings };
  }
}

function deriveChromeCookieKey(password: string): Buffer {
  // Chrome on macOS uses PBKDF2-HMAC-SHA1 with these constants for "v10" cookies.
  // salt: "saltysalt", iterations: 1003, key length: 16 (AES-128).
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function removePkcs7Padding(value: Buffer): Buffer {
  if (!value.length) return value;
  const padding = value[value.length - 1];
  if (!padding || padding > 16) return value;
  return value.subarray(0, value.length - padding);
}

function stripLeadingControlChars(value: string): string {
  let i = 0;
  while (i < value.length && value.charCodeAt(i) < 0x20) i += 1;
  return value.slice(i);
}

function decodeCookieValueBytes(value: Buffer, stripHashPrefix: boolean): string | null {
  // Chromium prepends a 32-byte hash to cookie values.
  const bytes = stripHashPrefix && value.length >= 32 ? value.subarray(32) : value;
  try {
    return stripLeadingControlChars(UTF8_DECODER.decode(bytes));
  } catch {
    return null;
  }
}

function decryptV10Cookie(encryptedValue: Buffer, key: Buffer): string {
  const prefix = encryptedValue.subarray(0, 3).toString('ascii');
  if (!/^v\d\d$/.test(prefix)) {
    throw new Error(`Unsupported Chrome cookie encryption version: ${prefix}`);
  }

  // AES-128-CBC with a fixed IV of 16 space characters.
  const iv = Buffer.alloc(16, 0x20);
  const ciphertext = encryptedValue.subarray(3);

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  const plaintext = removePkcs7Padding(Buffer.concat([decipher.update(ciphertext), decipher.final()]));

  // Prefer stripping the 32-byte hash prefix; if that fails, try raw decode.
  const decoded =
    decodeCookieValueBytes(plaintext, true) ??
    decodeCookieValueBytes(plaintext, false);
  if (decoded === null) {
    throw new Error('Decrypted cookie was not valid UTF-8');
  }
  return decoded;
}

function readEncryptedCookiesFromDb(dbPath: string): { rows: Array<{ host_key: string; name: string; encrypted_value: Buffer }>; warnings: string[] } {
  const warnings: string[] = [];

  if (!fs.existsSync(dbPath)) {
    warnings.push(`Chrome cookie DB not found at: ${dbPath}`);
    return { rows: [], warnings };
  }

  // Copy first so we don't fight Chrome's WAL/locks.
  const tmpPath = path.join(os.tmpdir(), `chrome-cookies-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  try {
    fs.copyFileSync(dbPath, tmpPath);
  } catch (err) {
    warnings.push(`Failed to copy Chrome cookie DB: ${(err as Error).message}`);
    return { rows: [], warnings };
  }

  try {
    const db = new DatabaseSync(tmpPath, { readOnly: true });

    // IMPORTANT: only select fields we need; some Chrome cookie columns are 64-bit ints
    // that overflow JS number conversion in node:sqlite.
    const stmt = db.prepare(
      `select host_key, name, encrypted_value
       from cookies
       where name in ('auth_token','ct0')
         and host_key in ('.x.com','x.com','.twitter.com','twitter.com')`,
    );
    const rawRows = stmt.all() as Array<{ host_key: string; name: string; encrypted_value: Uint8Array }>;
    const rows = rawRows.map((r) => ({ ...r, encrypted_value: Buffer.from(r.encrypted_value) }));
    return { rows, warnings };
  } catch (err) {
    warnings.push(`Failed to read Chrome cookie DB via node:sqlite: ${(err as Error).message}`);
    return { rows: [], warnings };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

export async function tryResolveChromeTwitterCookiesDarwin(opts?: {
  chromeProfile?: string;
}): Promise<CookieResult> {
  const warnings: string[] = [];
  const empty: TwitterCookies = { authToken: null, ct0: null, cookieHeader: null, source: null };

  if (process.platform !== 'darwin') {
    return { cookies: empty, warnings: ['Chrome cookie DB fallback is only implemented for macOS (darwin).'] };
  }

  const profile = opts?.chromeProfile ?? 'Default';
  const dbPath = path.join(chromeProfileDir(profile), 'Cookies');

  const { rows, warnings: dbWarnings } = readEncryptedCookiesFromDb(dbPath);
  warnings.push(...dbWarnings);

  const byName = new Map<string, Buffer>();
  for (const r of rows) {
    // Prefer x.com entries if multiple exist.
    if (!byName.has(r.name)) byName.set(r.name, r.encrypted_value);
    if (r.host_key === '.x.com') byName.set(r.name, r.encrypted_value);
  }

  const encAuth = byName.get('auth_token');
  const encCt0 = byName.get('ct0');
  if (!encAuth || !encCt0) {
    warnings.push('Twitter cookies not found in Chrome cookie DB (auth_token/ct0).');
    return { cookies: empty, warnings };
  }

  const { password, warnings: pwWarnings } = readChromeSafeStoragePassword();
  warnings.push(...pwWarnings);
  if (!password) return { cookies: empty, warnings };

  try {
    const key = deriveChromeCookieKey(password);
    const authToken = decryptV10Cookie(encAuth, key);
    const ct0 = decryptV10Cookie(encCt0, key);

    if (!authToken || !ct0) {
      warnings.push('Decrypted Chrome cookies were empty.');
      return { cookies: empty, warnings };
    }

    return {
      cookies: {
        authToken,
        ct0,
        cookieHeader: `auth_token=${authToken}; ct0=${ct0}`,
        source: `chrome-db:${profile}`,
      },
      warnings,
    };
  } catch (err) {
    warnings.push(`Failed to decrypt Chrome cookies: ${(err as Error).message}`);
    return { cookies: empty, warnings };
  }
}
