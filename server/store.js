import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { auditLog } from './audit.js';

const DATA_DIR = resolve('server', 'data');
const BACKUP_COUNT = 5;
const SCHEMA_VERSION = 1;

// Simple async mutex (queue of pending resolvers)
class Mutex {
  constructor() { this._locked = false; this._queue = [] }
  async acquire() {
    if (!this._locked) { this._locked = true; return; }
    await new Promise(resolve => this._queue.push(resolve));
  }
  release() { if (this._queue.length) { this._queue.shift()(); } else { this._locked = false; } }
}
const mutex = new Mutex();

async function ensureDir() { await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {}); }

async function atomicWrite(filePath, data) {
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

async function rotateBackups(baseName) {
  for (let i = BACKUP_COUNT - 1; i >= 0; i--) {
    const src = i === 0 ? resolve(DATA_DIR, `${baseName}.json`) : resolve(DATA_DIR, `${baseName}.${i}.json`);
    const dst = resolve(DATA_DIR, `${baseName}.${i + 1}.json`);
    try { await fs.rename(src, dst); } catch (_) {}
  }
}

export async function read(key) {
  const filePath = resolve(DATA_DIR, `${key}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const obj = JSON.parse(raw);
    if (obj.schemaVersion !== SCHEMA_VERSION) {
      // version mismatch – treat as fresh
      return { schemaVersion: SCHEMA_VERSION };
    }
    return obj;
  } catch (e) {
    // If file missing, return fresh schema
    if (e.code === 'ENOENT') return { schemaVersion: SCHEMA_VERSION };
    // Corrupt JSON – rename and start fresh
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    await fs.rename(filePath, corruptPath).catch(() => {});
    await auditLog({ type: 'store_corrupt', key, path: filePath });
    return { schemaVersion: SCHEMA_VERSION };
  }
}

export async function write(key, data) {
  await mutex.acquire();
  try {
    await ensureDir();
    await rotateBackups(key);
    const obj = { schemaVersion: SCHEMA_VERSION, ...data };
    const filePath = resolve(DATA_DIR, `${key}.json`);
    await atomicWrite(filePath, obj);
  } finally {
    mutex.release();
  }
}

export async function update(key, updater) {
  await mutex.acquire();
  try {
    const current = await read(key);
    const updated = await updater(current);
    await write(key, updated);
    return updated;
  } finally {
    mutex.release();
  }
}

// Export a simple repository interface used by later modules
export const Store = { read, write, update };
