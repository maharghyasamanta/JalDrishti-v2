import {
  HAZARD_LABEL,
  HAZARD_ORDER,
  HAZARD_SHORT,
  type HazardGroup,
} from './sachet';

export type SubHazard = HazardGroup | 'earthquake';

export const SUB_HAZARD_ORDER: SubHazard[] = [...HAZARD_ORDER, 'earthquake'];

export const SUB_HAZARD_LABEL: Record<SubHazard, string> = {
  ...HAZARD_LABEL,
  earthquake: 'Earthquake',
};

export const SUB_HAZARD_SHORT: Record<SubHazard, string> = {
  ...HAZARD_SHORT,
  earthquake: 'Quake',
};

export type SubStatus = 'Verified' | 'Pending' | 'Unsubscribed';

export const SUB_STATUSES: SubStatus[] = ['Verified', 'Pending', 'Unsubscribed'];

export const CHANGE_EVENT = 'jaldrishti:subscriptions-changed';

export const STORAGE_KEY = 'jaldrishti:demo:subscriptions:v3';

export interface Subscription {
  id: string;
  pincode: string;
  phone: string;
  state: string;
  district?: string;
  locality?: string;
  hazards: SubHazard[];
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
    hazards: ['water', 'storm', 'earthquake'],
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
    hazards: ['water', 'coastal'],
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
    hazards: ['water', 'coastal', 'storm', 'earthquake'],
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
    hazards: ['coastal', 'storm', 'heat'],
    status: 'Pending',
    subscribedDate: '2026-11-15',
  },
  {
    id: 'SUB-007',
    pincode: '530001',
    phone: '9848011223',
    state: 'Andhra Pradesh',
    district: 'Visakhapatnam',
    locality: 'Visakhapatnam',
    hazards: ['coastal', 'water', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-16',
    verifiedDate: '2026-11-16',
  },
  {
    id: 'SUB-008',
    pincode: '791111',
    phone: '9436011224',
    state: 'Arunachal Pradesh',
    district: 'Papum Pare',
    locality: 'Itanagar',
    hazards: ['water', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-15',
    verifiedDate: '2026-11-15',
  },
  {
    id: 'SUB-009',
    pincode: '492001',
    phone: '9425211225',
    state: 'Chhattisgarh',
    district: 'Raipur',
    locality: 'Raipur',
    hazards: ['water', 'heat'],
    status: 'Verified',
    subscribedDate: '2026-11-14',
    verifiedDate: '2026-11-14',
  },
  {
    id: 'SUB-010',
    pincode: '403001',
    phone: '9822111226',
    state: 'Goa',
    district: 'North Goa',
    locality: 'Panaji',
    hazards: ['coastal', 'water'],
    status: 'Verified',
    subscribedDate: '2026-11-14',
    verifiedDate: '2026-11-14',
  },
  {
    id: 'SUB-011',
    pincode: '380001',
    phone: '9825011227',
    state: 'Gujarat',
    district: 'Ahmedabad',
    locality: 'Ahmedabad',
    hazards: ['coastal', 'heat', 'other'],
    status: 'Verified',
    subscribedDate: '2026-11-15',
    verifiedDate: '2026-11-15',
  },
  {
    id: 'SUB-012',
    pincode: '122001',
    phone: '9811011228',
    state: 'Haryana',
    district: 'Gurugram',
    locality: 'Gurugram',
    hazards: ['storm', 'heat', 'cold'],
    status: 'Pending',
    subscribedDate: '2026-11-13',
  },
  {
    id: 'SUB-013',
    pincode: '171001',
    phone: '9418011229',
    state: 'Himachal Pradesh',
    district: 'Shimla',
    locality: 'Shimla',
    hazards: ['water', 'cold', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-13',
    verifiedDate: '2026-11-13',
  },
  {
    id: 'SUB-014',
    pincode: '834001',
    phone: '9431111230',
    state: 'Jharkhand',
    district: 'Ranchi',
    locality: 'Ranchi',
    hazards: ['storm', 'heat', 'other'],
    status: 'Verified',
    subscribedDate: '2026-11-15',
    verifiedDate: '2026-11-15',
  },
  {
    id: 'SUB-015',
    pincode: '560001',
    phone: '9845011231',
    state: 'Karnataka',
    district: 'Bengaluru Urban',
    locality: 'Bengaluru',
    hazards: ['water', 'coastal', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-12',
    verifiedDate: '2026-11-12',
  },
  {
    id: 'SUB-016',
    pincode: '462001',
    phone: '9425011232',
    state: 'Madhya Pradesh',
    district: 'Bhopal',
    locality: 'Bhopal',
    hazards: ['water', 'heat', 'cold'],
    status: 'Pending',
    subscribedDate: '2026-11-11',
  },
  {
    id: 'SUB-017',
    pincode: '795001',
    phone: '9436011233',
    state: 'Manipur',
    district: 'Imphal West',
    locality: 'Imphal',
    hazards: ['water', 'storm', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-11',
    verifiedDate: '2026-11-11',
  },
  {
    id: 'SUB-018',
    pincode: '793001',
    phone: '9436111234',
    state: 'Meghalaya',
    district: 'East Khasi Hills',
    locality: 'Shillong',
    hazards: ['water', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-10',
    verifiedDate: '2026-11-10',
  },
  {
    id: 'SUB-019',
    pincode: '796001',
    phone: '9436111235',
    state: 'Mizoram',
    district: 'Aizawl',
    locality: 'Aizawl',
    hazards: ['water', 'earthquake'],
    status: 'Pending',
    subscribedDate: '2026-11-10',
  },
  {
    id: 'SUB-020',
    pincode: '797001',
    phone: '9436011236',
    state: 'Nagaland',
    district: 'Kohima',
    locality: 'Kohima',
    hazards: ['water', 'storm', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-09',
    verifiedDate: '2026-11-09',
  },
  {
    id: 'SUB-021',
    pincode: '141001',
    phone: '9814011237',
    state: 'Punjab',
    district: 'Ludhiana',
    locality: 'Ludhiana',
    hazards: ['water', 'cold', 'heat'],
    status: 'Verified',
    subscribedDate: '2026-11-09',
    verifiedDate: '2026-11-09',
  },
  {
    id: 'SUB-022',
    pincode: '302001',
    phone: '9414011238',
    state: 'Rajasthan',
    district: 'Jaipur',
    locality: 'Jaipur',
    hazards: ['heat', 'storm', 'cold'],
    status: 'Verified',
    subscribedDate: '2026-11-08',
    verifiedDate: '2026-11-08',
  },
  {
    id: 'SUB-023',
    pincode: '737101',
    phone: '9434011239',
    state: 'Sikkim',
    district: 'East Sikkim',
    locality: 'Gangtok',
    hazards: ['water', 'cold', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-08',
    verifiedDate: '2026-11-08',
  },
  {
    id: 'SUB-024',
    pincode: '500001',
    phone: '9849011240',
    state: 'Telangana',
    district: 'Hyderabad',
    locality: 'Hyderabad',
    hazards: ['water', 'heat', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-07',
    verifiedDate: '2026-11-07',
  },
  {
    id: 'SUB-025',
    pincode: '799001',
    phone: '9436111241',
    state: 'Tripura',
    district: 'West Tripura',
    locality: 'Agartala',
    hazards: ['water', 'storm', 'earthquake'],
    status: 'Unsubscribed',
    subscribedDate: '2026-11-07',
  },
  {
    id: 'SUB-026',
    pincode: '226001',
    phone: '9415011242',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    locality: 'Lucknow',
    hazards: ['water', 'heat', 'cold'],
    status: 'Verified',
    subscribedDate: '2026-11-06',
    verifiedDate: '2026-11-06',
  },
  {
    id: 'SUB-027',
    pincode: '248001',
    phone: '9412011243',
    state: 'Uttarakhand',
    district: 'Dehradun',
    locality: 'Dehradun',
    hazards: ['water', 'cold', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-06',
    verifiedDate: '2026-11-06',
  },
  {
    id: 'SUB-028',
    pincode: '700001',
    phone: '9830011244',
    state: 'West Bengal',
    district: 'Kolkata',
    locality: 'Kolkata',
    hazards: ['water', 'coastal', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-05',
    verifiedDate: '2026-11-05',
  },
  {
    id: 'SUB-029',
    pincode: '744101',
    phone: '9434211245',
    state: 'Andaman and Nicobar Islands',
    district: 'South Andaman',
    locality: 'Port Blair',
    hazards: ['coastal', 'water', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-05',
    verifiedDate: '2026-11-05',
  },
  {
    id: 'SUB-030',
    pincode: '160001',
    phone: '9815011246',
    state: 'Chandigarh',
    district: 'Chandigarh',
    locality: 'Chandigarh',
    hazards: ['storm', 'heat', 'cold'],
    status: 'Pending',
    subscribedDate: '2026-11-04',
  },
  {
    id: 'SUB-031',
    pincode: '396210',
    phone: '9825111247',
    state: 'Dadra and Nagar Haveli and Daman and Diu',
    district: 'Daman',
    locality: 'Daman',
    hazards: ['coastal', 'water'],
    status: 'Verified',
    subscribedDate: '2026-11-04',
    verifiedDate: '2026-11-04',
  },
  {
    id: 'SUB-032',
    pincode: '110001',
    phone: '9810011248',
    state: 'Delhi',
    district: 'Delhi',
    locality: 'New Delhi',
    hazards: ['heat', 'cold', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-03',
    verifiedDate: '2026-11-03',
  },
  {
    id: 'SUB-033',
    pincode: '190001',
    phone: '9419011249',
    state: 'Jammu and Kashmir',
    district: 'Srinagar',
    locality: 'Srinagar',
    hazards: ['water', 'cold', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-03',
    verifiedDate: '2026-11-03',
  },
  {
    id: 'SUB-034',
    pincode: '194101',
    phone: '9419111250',
    state: 'Ladakh',
    district: 'Leh',
    locality: 'Leh',
    hazards: ['cold', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-02',
    verifiedDate: '2026-11-02',
  },
  {
    id: 'SUB-035',
    pincode: '682555',
    phone: '9447011251',
    state: 'Lakshadweep',
    district: 'Lakshadweep',
    locality: 'Kavaratti',
    hazards: ['coastal', 'water'],
    status: 'Pending',
    subscribedDate: '2026-11-02',
  },
  {
    id: 'SUB-036',
    pincode: '605001',
    phone: '9443011252',
    state: 'Puducherry',
    district: 'Puducherry',
    locality: 'Puducherry',
    hazards: ['coastal', 'water', 'storm'],
    status: 'Verified',
    subscribedDate: '2026-11-01',
    verifiedDate: '2026-11-01',
  },
];

function cloneList(list: Subscription[]): Subscription[] {
  return list.map((s) => ({ ...s, hazards: [...s.hazards] }));
}

function normalizeSubHazards(raw: unknown[]): SubHazard[] {
  const seen = new Set<SubHazard>();
  for (const entry of raw) {
    if (typeof entry === 'string' && SUB_HAZARD_ORDER.includes(entry as SubHazard)) {
      seen.add(entry as SubHazard);
    }
  }
  return SUB_HAZARD_ORDER.filter((h) => seen.has(h));
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

export function nextSubscriptionId(subs: Subscription[]): string {
  let maxNum = 0;
  for (const s of subs) {
    const m = /^SUB-(\d+)$/.exec(s.id);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `SUB-${String(maxNum + 1).padStart(3, '0')}`;
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
          ): item is Omit<Subscription, 'pincode' | 'district' | 'locality' | 'hazards'> & {
            pincode?: unknown;
            district?: unknown;
            locality?: unknown;
            hazards: unknown[];
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
          hazards: normalizeSubHazards(item.hazards),
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
