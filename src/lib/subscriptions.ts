import type { HazardGroup } from './sachet';

export type SubStatus = 'Verified' | 'Pending' | 'Unsubscribed';

export const SUB_STATUSES: SubStatus[] = ['Verified', 'Pending', 'Unsubscribed'];

export const CHANGE_EVENT = 'jaldrishti:subscriptions-changed';

const STORAGE_KEY = 'jaldrishti:demo:subscriptions:v2';

export interface Subscription {
  id: string;
  pincode: string;
  phone: string;
  state: string;
  district?: string;
  locality?: string;
  hazards: HazardGroup[];
  status: SubStatus;
  subscribedDate: string;
  verifiedDate?: string;
}

export interface ResolvedPincode {
  district: string;
  state: string;
  locality: string;
}

const SAMPLE_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'SUB-001',
    pincode: '781001',
    phone: '9876543210',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    locality: 'Guwahati',
    hazards: ['water', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-10',
    verifiedDate: '2026-11-10',
  },
  {
    id: 'SUB-002',
    pincode: '682001',
    phone: '9847012345',
    state: 'Kerala',
    district: 'Ernakulam',
    locality: 'Ernakulam',
    hazards: ['water'],
    status: 'Verified',
    subscribedDate: '2026-11-12',
    verifiedDate: '2026-11-12',
  },
  {
    id: 'SUB-003',
    pincode: '400001',
    phone: '9765432109',
    state: 'Maharashtra',
    district: 'Mumbai',
    locality: 'Mumbai',
    hazards: ['water', 'storm', 'heat'],
    status: 'Pending',
    subscribedDate: '2026-11-14',
  },
  {
    id: 'SUB-004',
    pincode: '751001',
    phone: '9937112233',
    state: 'Odisha',
    district: 'Khordha',
    locality: 'Bhubaneswar',
    hazards: ['water', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-11',
    verifiedDate: '2026-11-12',
  },
  {
    id: 'SUB-005',
    pincode: '800001',
    phone: '9123456780',
    state: 'Bihar',
    district: 'Patna',
    locality: 'Patna',
    hazards: ['water', 'cold'],
    status: 'Unsubscribed',
    subscribedDate: '2026-11-08',
  },
  {
    id: 'SUB-006',
    pincode: '600001',
    phone: '9840987654',
    state: 'Tamil Nadu',
    district: 'Chennai',
    locality: 'Chennai',
    hazards: ['storm', 'heat'],
    status: 'Pending',
    subscribedDate: '2026-11-15',
  },
];

function cloneList(list: Subscription[]): Subscription[] {
  return list.map((s) => ({ ...s, hazards: [...s.hazards] }));
}

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizePincode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return /^[1-9]\d{5}$/.test(digits) ? digits : null;
}

export async function resolvePincode(pin: string, signal?: AbortSignal): Promise<ResolvedPincode | null> {
  const normalized = normalizePincode(pin);
  if (!normalized) return null;

  try {
    const res = await fetch(`/api/pincode?pin=${encodeURIComponent(normalized)}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const record = data as {
      ok?: unknown;
      district?: unknown;
      state?: unknown;
      places?: Array<{ name?: unknown }>;
    };

    if (
      record.ok !== true ||
      typeof record.district !== 'string' ||
      !record.district.trim() ||
      typeof record.state !== 'string' ||
      !record.state.trim()
    ) {
      return null;
    }

    const firstPlaceName =
      Array.isArray(record.places) && typeof record.places[0]?.name === 'string' && record.places[0].name.trim()
        ? record.places[0].name.trim()
        : record.district.trim();

    return {
      district: record.district.trim(),
      state: record.state.trim(),
      locality: firstPlaceName,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function formatPhone(phone: string): string {
  const d = normalizePhone(phone) ?? phone.replace(/\D/g, '');
  if (d.length === 10) {
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  return phone;
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length >= 4) {
    return `+91 ******${d.slice(-4)}`;
  }
  return '+91 **********';
}

export function withStatus(sub: Subscription, status: SubStatus): Subscription {
  if (status === 'Verified') {
    return {
      ...sub,
      status,
      verifiedDate: sub.status === 'Verified' && sub.verifiedDate ? sub.verifiedDate : todayStr(),
    };
  }
  const { verifiedDate: _omit, ...rest } = sub;
  return { ...rest, status };
}

export function loadSubscriptions(): Subscription[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeded = cloneList(SAMPLE_SUBSCRIPTIONS);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (
            item,
          ): item is Omit<Subscription, 'pincode' | 'district' | 'locality'> & {
            pincode?: unknown;
            district?: unknown;
            locality?: unknown;
          } =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.phone === 'string' &&
            typeof item.state === 'string' &&
            Array.isArray(item.hazards) &&
            SUB_STATUSES.includes(item.status) &&
            typeof item.subscribedDate === 'string',
        )
        .map((item) => ({
          ...item,
          pincode: typeof item.pincode === 'string' ? item.pincode : '',
          district: typeof item.district === 'string' && item.district.trim() ? item.district.trim() : undefined,
          locality: typeof item.locality === 'string' && item.locality.trim() ? item.locality.trim() : undefined,
        }));
    }
  } catch {
    // Fallback to in-memory sample rows if localStorage is unavailable or corrupt
  }
  return cloneList(SAMPLE_SUBSCRIPTIONS);
}

export function saveSubscriptions(list: Subscription[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage write errors in restricted contexts
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resetSampleSubscriptions(): Subscription[] {
  const seeded = cloneList(SAMPLE_SUBSCRIPTIONS);
  saveSubscriptions(seeded);
  return seeded;
}
