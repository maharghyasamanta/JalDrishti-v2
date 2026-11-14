// Audit logger – append‑only JSONL. No OTPs or full phone numbers are logged.
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const LOG_PATH = resolve('server', 'data', 'audit.log');

export async function auditLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  await appendFile(LOG_PATH, line, { encoding: 'utf8' }).catch(() => {});
}
