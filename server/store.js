import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { auditLog } from './audit.js';
import { getDataDir } from './paths.js';

const BACKUP_COUNT = 5;
const SCHEMA_VERSION = 1;
const RENAME_RETRIES = 3;

// Simple async mutex (queue of pending resolvers)
class Mutex {
  constructor() {
    this._locked = false;
    this._queue = [];
  }
  async acquire() {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    await new Promise((resolve) => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length) {
      this._queue.shift()();
    } else {
      this._locked = false;
    }
  }
}
const mutex = new Mutex();

async function renameWithRetry(src, dst, retries = RENAME_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fs.rename(src, dst);
      return;
    } catch (err) {
      if ((err?.code === 'EPERM' || err?.code === 'EBUSY') && attempt < retries) {
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function atomicWrite(filePath, data) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = `${filePath}.tmp-${suffix}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    await renameWithRetry(tempPath, filePath, RENAME_RETRIES);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

async function rotateBackups(dataDir, key, livePath) {
  for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
    const src = join(dataDir, `${key}.${i}.json`);
    const dst = join(dataDir, `${key}.${i + 1}.json`);
    try {
      await renameWithRetry(src, dst, RENAME_RETRIES);
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  // Copy (never move/remove) live file to .1 so the live file remains present throughout write
  try {
    await fs.copyFile(livePath, join(dataDir, `${key}.1.json`));
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

async function _readUnlocked(key) {
  const dataDir = getDataDir();
  const filePath = join(dataDir, `${key}.json`);

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { schemaVersion: SCHEMA_VERSION };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error('Store root value is not an object');
    }
  } catch {
    // Corrupt JSON: try to restore the first valid backup (.1 .. .5)
    for (let i = 1; i <= BACKUP_COUNT; i++) {
      const bakPath = join(dataDir, `${key}.${i}.json`);
      try {
        const bakRaw = await fs.readFile(bakPath, 'utf8');
        const bakObj = JSON.parse(bakRaw);
        if (isPlainObject(bakObj) && bakObj.schemaVersion === SCHEMA_VERSION) {
          await atomicWrite(filePath, bakObj);
          await auditLog({ type: 'store_restored_backup', key, backupIndex: i });
          return bakObj;
        }
      } catch {
        // Backup missing or unreadable/invalid; continue searching
      }
    }

    // No valid backup found: rename corrupt file and return fresh object
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    await renameWithRetry(filePath, corruptPath, RENAME_RETRIES).catch(() => {});
    await auditLog({ type: 'store_corrupt', key, path: filePath });
    return { schemaVersion: SCHEMA_VERSION };
  }

  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    const schemaBakPath = `${filePath}.schema-${Date.now()}.bak`;
    await fs.copyFile(filePath, schemaBakPath).catch(() => {});
    await auditLog({
      type: 'store_schema_mismatch',
      key,
      foundVersion: parsed.schemaVersion ?? null,
      expectedVersion: SCHEMA_VERSION,
    });
    return { schemaVersion: SCHEMA_VERSION };
  }

  return parsed;
}

async function _writeUnlocked(key, data) {
  const dataDir = getDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = join(dataDir, `${key}.json`);
  await rotateBackups(dataDir, key, filePath);
  const obj = { schemaVersion: SCHEMA_VERSION, ...data };
  await atomicWrite(filePath, obj);
  return obj;
}

export async function read(key) {
  await mutex.acquire();
  try {
    return await _readUnlocked(key);
  } finally {
    mutex.release();
  }
}

export async function write(key, data) {
  await mutex.acquire();
  try {
    return await _writeUnlocked(key, data);
  } finally {
    mutex.release();
  }
}

export async function update(key, updater) {
  await mutex.acquire();
  try {
    const current = await _readUnlocked(key);
    const updated = await updater(current);
    if (!isPlainObject(updated)) {
      throw new TypeError('Store updater must return a plain object');
    }
    return await _writeUnlocked(key, updated);
  } finally {
    mutex.release();
  }
}

// Export a simple repository interface used by later modules
export const Store = { read, write, update };
