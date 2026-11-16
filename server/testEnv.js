import { join } from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

export const prevSmsDataDir = process.env.SMS_DATA_DIR;
export const testDataDir = fsSync.mkdtempSync(join(os.tmpdir(), 'jaldrishti-test-'));
process.env.SMS_DATA_DIR = testDataDir;
