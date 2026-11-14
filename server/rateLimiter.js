// Rate limiter – sliding window per IP and per phone (optional). Returns true if allowed, false if limit exceeded.
import { resolve } from 'node:path';

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // per IP default
const phoneMap = new Map(); // phone -> timestamps[]
const ipMap = new Map(); // ip -> timestamps[]

function prune(map, key) {
  const now = Date.now();
  const list = map.get(key) || [];
  const filtered = list.filter(ts => now - ts < WINDOW_MS);
  if (filtered.length) map.set(key, filtered); else map.delete(key);
  return filtered;
}

export function checkRateLimit(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString();
  const phone = (req.body && req.body.phone) || null;
  // IP check
  const ipList = prune(ipMap, ip);
  if (ipList.length >= MAX_REQUESTS) return false;
  ipList.push(Date.now());
  ipMap.set(ip, ipList);
  // Phone check (optional, 5 per minute)
  if (phone) {
    const pList = prune(phoneMap, phone);
    if (pList.length >= 5) return false;
    pList.push(Date.now());
    phoneMap.set(phone, pList);
  }
  return true;
}
