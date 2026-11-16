import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the SMS/store data directory at call time.
 * Uses SMS_DATA_DIR (resolved) if set and non-empty, otherwise <server>/data.
 */
export function getDataDir() {
  const envDir = process.env.SMS_DATA_DIR;
  if (envDir && envDir.trim()) {
    return resolve(envDir.trim());
  }
  return join(SERVER_DIR, 'data');
}
