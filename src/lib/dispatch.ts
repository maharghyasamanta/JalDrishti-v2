import type { Earthquake } from './earthquakes';
import type { SachetAlert } from './sachet';
import { maskPhone, type Subscription } from './subscriptions';

export type DispatchMode = 'broadcast' | 'targeted';
export type LookbackHours = 24 | 168 | 720;
export type SmsKind = 'alert' | 'earthquake';

export const OUTBOX_STORAGE_KEY = 'jaldrishti:demo:outbox:v1';
export const SETTINGS_STORAGE_KEY = 'jaldrishti:demo:sms-settings:v1';
export const OUTBOX_MAX = 500;
export const SMS_MAX_LEN = 160;

export interface DemoSms {
  id: string;
  eventKey: string;
  kind: SmsKind;
  subscriptionId: string;
  toMasked: string;
  state: string;
  district?: string;
  pincode: string;
  body: string;
  createdAt: string;
  read: boolean;
  eventLabel: string;
  badgeText: string;
  locationLabel: string;
  source: string;
}

export interface OutboxState {
  messages: DemoSms[];
  droppedCount: number;
}

export interface DispatchPlanInput {
  subs: Subscription[];
  alerts: SachetAlert[];
  quakes: Earthquake[];
  mode: DispatchMode;
  lookbackHours: LookbackHours;
  sentKeys: Set<string>;
  now?: number;
}

export interface DispatchPlanResult {
  messages: DemoSms[];
  indiaQuakesInWindow: Earthquake[];
  skippedUnconsented: number;
}

const IST_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toGsmSafe(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatIstShort(iso: string | null): string {
  if (!iso) return 'time unknown';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'time unknown';

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms));

    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    const day = get('day');
    const month = get('month');
    const hour = get('hour');
    const minute = get('minute');
    if (day && month && hour && minute) {
      return `${day} ${month} ${hour}:${minute} IST`;
    }
  } catch {
    // Fallback arithmetic IST (+05:30)
  }

  const ist = new Date(ms + 330 * 60_000);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mon = IST_MONTHS[ist.getUTCMonth()] ?? 'Jan';
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${dd} ${mon} ${hh}:${mm} IST`;
}

function truncateText(text: string, maxLen: number): string {
  if (maxLen <= 0) return '';
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - 3).trimEnd()}...`;
}

function fitToSmsLimit(
  render: (primary: string, secondary: string) => string,
  primary: string,
  secondary: string,
  maxLen = SMS_MAX_LEN,
): string {
  const cleanPrimary = toGsmSafe(primary) || 'India';
  const cleanSecondary = toGsmSafe(secondary) || 'Alert';

  const initial = toGsmSafe(render(cleanPrimary, cleanSecondary));
  if (initial.length <= maxLen) return initial;

  const over = initial.length - maxLen;
  const trimmedPrimary = truncateText(cleanPrimary, Math.max(8, cleanPrimary.length - over));
  const afterPrimary = toGsmSafe(render(trimmedPrimary, cleanSecondary));
  if (afterPrimary.length <= maxLen) return afterPrimary;

  const over2 = afterPrimary.length - maxLen;
  const minPrimary = truncateText(cleanPrimary, Math.max(5, trimmedPrimary.length - Math.ceil(over2 / 2)));
  const afterMinPrimary = toGsmSafe(render(minPrimary, cleanSecondary));
  if (afterMinPrimary.length <= maxLen) return afterMinPrimary;

  const over3 = afterMinPrimary.length - maxLen;
  const trimmedSecondary = truncateText(cleanSecondary, Math.max(6, cleanSecondary.length - over3));
  const finalText = toGsmSafe(render(minPrimary, trimmedSecondary));
  return finalText.length <= maxLen ? finalText : finalText.slice(0, maxLen);
}

function alertAreaSummary(alert: SachetAlert, sub: Subscription): string {
  const rawArea = toGsmSafe(alert.areaDesc);
  if (rawArea && !alert.detailsInOriginal) return rawArea;
  if (alert.states.length > 0) return toGsmSafe(alert.states.join(', '));
  return toGsmSafe(sub.state) || 'India';
}

export function buildAlertSms(alert: SachetAlert, sub: Subscription): string {
  const event = toGsmSafe(alert.event || alert.headline || 'Weather Alert') || 'Weather Alert';
  const severity = toGsmSafe(alert.severity || 'Unknown') || 'Unknown';
  const issued = formatIstShort(alert.sent);
  const area = alertAreaSummary(alert, sub);

  return fitToSmsLimit(
    (areaPart, eventPart) =>
      `JalDrishti DEMO: ${eventPart} (${severity}) for ${areaPart}. Issued ${issued}. Official: sachet.ndma.gov.in. Emergency 112.`,
    area,
    event,
  );
}

export function buildQuakeSms(q: Earthquake, _sub: Subscription): string {
  const mag = Number.isFinite(q.magnitude) ? q.magnitude.toFixed(1) : '0.0';
  const place = toGsmSafe(q.location || q.region || 'India') || 'India';
  const locLabel = toGsmSafe(q.state ? q.state : 'India') || 'India';
  const depthNum = Number.isFinite(q.depth) ? Math.max(0, q.depth) : 0;
  const depth = depthNum % 1 === 0 ? String(depthNum) : depthNum.toFixed(1);
  const issued = formatIstShort(q.time);
  const src = toGsmSafe(q.source || 'USGS') || 'USGS';

  return fitToSmsLimit(
    (placePart, srcPart) =>
      `JalDrishti DEMO: M${mag} earthquake ${placePart} (${locLabel}), depth ${depth} km, ${issued}. Source ${srcPart}. Not official: riseq.seismo.gov.in. Emergency 112.`,
    place,
    src,
  );
}

export function selectIndiaQuakesInWindow(
  quakes: Earthquake[],
  lookbackHours: LookbackHours,
  now = Date.now(),
): Earthquake[] {
  const cutoff = now - lookbackHours * 3600_000;
  const upperBound = now + 5 * 60_000;

  return quakes
    .filter((q) => {
      if (!q.inIndia) return false;
      const t = Date.parse(q.time);
      if (!Number.isFinite(t)) return false;
      return t >= cutoff && t <= upperBound;
    })
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

export function planDeliveries({
  subs,
  alerts,
  quakes,
  mode,
  lookbackHours,
  sentKeys,
  now = Date.now(),
}: DispatchPlanInput): DispatchPlanResult {
  const indiaQuakesInWindow = selectIndiaQuakesInWindow(quakes, lookbackHours, now);
  const skippedUnconsented = subs.filter((s) => s.status !== 'Verified').length;
  const verifiedSubs = subs.filter((s) => s.status === 'Verified');

  const planned: DemoSms[] = [];
  const seenInRun = new Set<string>();
  const createdAt = new Date(now).toISOString();

  for (const sub of verifiedSubs) {
    const masked = maskPhone(sub.phone);

    for (const alert of alerts) {
      if (mode === 'targeted') {
        if (!alert.states.includes(sub.state) || !sub.hazards.includes(alert.hazard)) {
          continue;
        }
      }
      const eventKey = `alert:${alert.id}`;
      const deliveryKey = `${sub.id}|${eventKey}`;
      if (sentKeys.has(deliveryKey) || seenInRun.has(deliveryKey)) continue;
      seenInRun.add(deliveryKey);

      planned.push({
        id: deliveryKey,
        eventKey,
        kind: 'alert',
        subscriptionId: sub.id,
        toMasked: masked,
        state: sub.state,
        district: sub.district,
        pincode: sub.pincode,
        body: buildAlertSms(alert, sub),
        createdAt,
        read: false,
        eventLabel: toGsmSafe(alert.event || 'Weather Alert') || 'Weather Alert',
        badgeText: alert.severity,
        locationLabel: alertAreaSummary(alert, sub),
        source: 'NDMA SACHET',
      });
    }

    for (const q of indiaQuakesInWindow) {
      if (mode === 'targeted') {
        if (!sub.hazards.includes('earthquake') || !q.state || q.state !== sub.state) {
          continue;
        }
      }
      const eventKey = `quake:${q.id}`;
      const deliveryKey = `${sub.id}|${eventKey}`;
      if (sentKeys.has(deliveryKey) || seenInRun.has(deliveryKey)) continue;
      seenInRun.add(deliveryKey);

      const magText = Number.isFinite(q.magnitude) ? `M${q.magnitude.toFixed(1)}` : 'M?';
      planned.push({
        id: deliveryKey,
        eventKey,
        kind: 'earthquake',
        subscriptionId: sub.id,
        toMasked: masked,
        state: sub.state,
        district: sub.district,
        pincode: sub.pincode,
        body: buildQuakeSms(q, sub),
        createdAt,
        read: false,
        eventLabel: toGsmSafe(q.location || q.region || 'India earthquake') || 'India earthquake',
        badgeText: magText,
        locationLabel: q.state ?? 'India',
        source: q.source || 'USGS/NCS',
      });
    }
  }

  return {
    messages: planned,
    indiaQuakesInWindow,
    skippedUnconsented,
  };
}

function isValidDemoSms(item: unknown): item is DemoSms {
  if (!item || typeof item !== 'object') return false;
  const r = item as Partial<DemoSms>;
  return (
    typeof r.id === 'string' &&
    typeof r.eventKey === 'string' &&
    (r.kind === 'alert' || r.kind === 'earthquake') &&
    typeof r.subscriptionId === 'string' &&
    typeof r.toMasked === 'string' &&
    typeof r.state === 'string' &&
    typeof r.pincode === 'string' &&
    typeof r.body === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.read === 'boolean' &&
    typeof r.eventLabel === 'string' &&
    typeof r.badgeText === 'string' &&
    typeof r.locationLabel === 'string' &&
    typeof r.source === 'string'
  );
}

export function loadOutbox(): OutboxState {
  try {
    const raw = window.localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return { messages: [], droppedCount: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { messages: [], droppedCount: 0 };
    const record = parsed as { messages?: unknown; droppedCount?: unknown };
    const messages = Array.isArray(record.messages) ? record.messages.filter(isValidDemoSms) : [];
    const droppedCount =
      typeof record.droppedCount === 'number' && Number.isFinite(record.droppedCount) && record.droppedCount >= 0
        ? Math.floor(record.droppedCount)
        : 0;
    return {
      messages: messages.slice(0, OUTBOX_MAX),
      droppedCount,
    };
  } catch {
    return { messages: [], droppedCount: 0 };
  }
}

export function saveOutbox(state: OutboxState): void {
  try {
    window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or storage restriction errors in sandboxed/private browsers
  }
}

export function appendToOutbox(current: OutboxState, incoming: DemoSms[]): OutboxState {
  if (incoming.length === 0) return current;
  const existingIds = new Set(current.messages.map((m) => m.id));
  const uniqueIncoming = incoming.filter((m) => !existingIds.has(m.id));
  if (uniqueIncoming.length === 0) return current;

  const combined = [...uniqueIncoming, ...current.messages];
  const overflow = Math.max(0, combined.length - OUTBOX_MAX);
  const next: OutboxState = {
    messages: combined.slice(0, OUTBOX_MAX),
    droppedCount: current.droppedCount + overflow,
  };
  saveOutbox(next);
  return next;
}

export function markOutboxRead(current: OutboxState): OutboxState {
  const next: OutboxState = {
    ...current,
    messages: current.messages.map((m) => (m.read ? m : { ...m, read: true })),
  };
  saveOutbox(next);
  return next;
}

export function clearStoredOutbox(): OutboxState {
  const empty: OutboxState = { messages: [], droppedCount: 0 };
  saveOutbox(empty);
  return empty;
}

export function getLastSmsBySubscriber(messages: DemoSms[]): Map<string, DemoSms> {
  const map = new Map<string, DemoSms>();
  for (const msg of messages) {
    const existing = map.get(msg.subscriptionId);
    if (!existing) {
      map.set(msg.subscriptionId, msg);
    } else {
      const tNew = Date.parse(msg.createdAt);
      const tCur = Date.parse(existing.createdAt);
      if (Number.isFinite(tNew) && (!Number.isFinite(tCur) || tNew > tCur)) {
        map.set(msg.subscriptionId, msg);
      }
    }
  }
  return map;
}
