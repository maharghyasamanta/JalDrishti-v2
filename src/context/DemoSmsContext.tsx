import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchEarthquakes,
  type Earthquake,
} from '../lib/earthquakes';
import {
  fetchSachetAlerts,
  type SachetAlert,
} from '../lib/sachet';
import {
  CHANGE_EVENT,
  loadSubscriptions,
  type Subscription,
} from '../lib/subscriptions';
import {
  SETTINGS_STORAGE_KEY,
  appendToOutbox,
  clearStoredOutbox,
  loadOutbox,
  markOutboxRead,
  planDeliveries,
  selectIndiaQuakesInWindow,
  type DemoSms,
  type DispatchMode,
  type LookbackHours,
  type OutboxState,
} from '../lib/dispatch';

const REFRESH_MS = 5 * 60 * 1000;

export type DispatchStatus = 'idle' | 'running' | 'ok' | 'error';
export type FeedStatus = 'loading' | 'ok' | 'error';

export interface DemoSmsCounts {
  alerts: number;
  indiaQuakes: number;
  queued: number;
  skippedUnconsented: number;
}

interface PersistedSettings {
  enabled: boolean;
  mode: DispatchMode;
  lookbackHours: LookbackHours;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  enabled: true,
  mode: 'broadcast',
  lookbackHours: 24,
};

function loadSettings(): PersistedSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
    const r = parsed as Partial<PersistedSettings>;
    return {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      mode: r.mode === 'targeted' || r.mode === 'broadcast' ? r.mode : 'broadcast',
      lookbackHours: r.lookbackHours === 24 || r.lookbackHours === 168 || r.lookbackHours === 720 ? r.lookbackHours : 24,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(next: PersistedSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage restriction errors
  }
}

interface DemoSmsContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  mode: DispatchMode;
  setMode: (m: DispatchMode) => void;
  lookbackHours: LookbackHours;
  setLookbackHours: (h: LookbackHours) => void;
  outbox: DemoSms[];
  droppedCount: number;
  unreadCount: number;
  lastRun: string | null;
  status: DispatchStatus;
  alertsStatus: FeedStatus;
  quakesStatus: FeedStatus;
  errorMessage: string | null;
  lastRunSummary: string | null;
  activeAlerts: SachetAlert[];
  indiaQuakes: Earthquake[];
  allIndiaQuakes: Earthquake[];
  counts: DemoSmsCounts;
  runNow: () => Promise<void>;
  clearOutbox: () => void;
  markAllRead: () => void;
}

const DemoSmsContext = createContext<DemoSmsContextValue | null>(null);

export function DemoSmsProvider({ children }: { children: ReactNode }) {
  const initialSettings = useMemo(() => loadSettings(), []);
  const [enabled, setEnabledState] = useState<boolean>(initialSettings.enabled);
  const [mode, setModeState] = useState<DispatchMode>(initialSettings.mode);
  const [lookbackHours, setLookbackHoursState] = useState<LookbackHours>(initialSettings.lookbackHours);

  const [outboxState, setOutboxState] = useState<OutboxState>(() => loadOutbox());
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [status, setStatus] = useState<DispatchStatus>('idle');
  const [alertsStatus, setAlertsStatus] = useState<FeedStatus>('loading');
  const [quakesStatus, setQuakesStatus] = useState<FeedStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null);

  const [activeAlerts, setActiveAlerts] = useState<SachetAlert[]>([]);
  const [allQuakes, setAllQuakes] = useState<Earthquake[]>([]);
  const [subsSnapshot, setSubsSnapshot] = useState<Subscription[]>(() => loadSubscriptions());

  const alertsRef = useRef<SachetAlert[]>([]);
  const quakesRef = useRef<Earthquake[]>([]);
  const outboxRef = useRef<OutboxState>(outboxState);
  outboxRef.current = outboxState;

  const settingsRef = useRef<PersistedSettings>({ enabled, mode, lookbackHours });
  settingsRef.current = { enabled, mode, lookbackHours };

  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const applyDispatch = useCallback(
    (
      alerts: SachetAlert[],
      quakes: Earthquake[],
      forceSimulate: boolean,
      hadAlertsError: boolean,
      hadQuakesError: boolean,
    ) => {
      const subs = loadSubscriptions();
      setSubsSnapshot(subs);
      const { enabled: isEnabled, mode: curMode, lookbackHours: curLookback } = settingsRef.current;

      const currentOutbox = loadOutbox();
      const sentKeys = new Set(currentOutbox.messages.map((m) => m.id));
      const plan = planDeliveries({
        subs,
        alerts,
        quakes,
        mode: curMode,
        lookbackHours: curLookback,
        sentKeys,
      });

      let nextOutbox = currentOutbox;
      let simulatedNow = 0;

      if (isEnabled || forceSimulate) {
        if (plan.messages.length > 0) {
          nextOutbox = appendToOutbox(currentOutbox, plan.messages);
          simulatedNow = plan.messages.length;
        }
        setOutboxState(nextOutbox);
      }

      const nowIso = new Date().toISOString();
      setLastRun(nowIso);

      if (hadAlertsError && hadQuakesError) {
        setStatus('error');
        setErrorMessage('Could not reach live alerts or earthquake feeds. No demo SMS simulated for unavailable feeds.');
        setLastRunSummary(null);
      } else if (hadAlertsError || hadQuakesError) {
        setStatus('error');
        const failedFeed = hadAlertsError ? 'NDMA SACHET live alerts' : 'earthquake feed';
        setErrorMessage(`Partial failure: unable to refresh ${failedFeed}. Processed available feed only.`);
        setLastRunSummary(
          `Demo dispatch: ${simulatedNow} SMS simulated for ${alerts.length} alerts + ${plan.indiaQuakesInWindow.length} India earthquakes`,
        );
      } else {
        setStatus('ok');
        setErrorMessage(null);
        setLastRunSummary(
          !isEnabled && !forceSimulate
            ? `Auto-dispatch paused · ${alerts.length} active alerts + ${plan.indiaQuakesInWindow.length} India earthquakes in feed`
            : `Demo dispatch: ${simulatedNow} SMS simulated for ${alerts.length} alerts + ${plan.indiaQuakesInWindow.length} India earthquakes`,
        );
      }
    },
    [],
  );

  const fetchAndDispatch = useCallback(
    async (forceSimulate = false) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      const runId = ++seqRef.current;

      setStatus('running');

      const [alertsResult, quakesResult] = await Promise.allSettled([
        fetchSachetAlerts(ctl.signal),
        fetchEarthquakes(ctl.signal),
      ]);

      if (ctl.signal.aborted || runId !== seqRef.current) return;

      let nextAlerts = alertsRef.current;
      let hadAlertsError = false;
      if (alertsResult.status === 'fulfilled') {
        nextAlerts = alertsResult.value.alerts;
        alertsRef.current = nextAlerts;
        setActiveAlerts(nextAlerts);
        setAlertsStatus('ok');
      } else {
        hadAlertsError = true;
        setAlertsStatus('error');
      }

      let nextQuakes = quakesRef.current;
      let hadQuakesError = false;
      if (quakesResult.status === 'fulfilled') {
        nextQuakes = quakesResult.value.quakes;
        quakesRef.current = nextQuakes;
        setAllQuakes(nextQuakes);
        setQuakesStatus('ok');
      } else {
        hadQuakesError = true;
        setQuakesStatus('error');
      }

      applyDispatch(nextAlerts, nextQuakes, forceSimulate, hadAlertsError, hadQuakesError);
    },
    [applyDispatch],
  );

  const runNow = useCallback(async () => {
    await fetchAndDispatch(true);
  }, [fetchAndDispatch]);

  const setEnabled = useCallback(
    (v: boolean) => {
      const next = { ...settingsRef.current, enabled: v };
      settingsRef.current = next;
      saveSettings(next);
      setEnabledState(v);
      if (v) {
        applyDispatch(
          alertsRef.current,
          quakesRef.current,
          false,
          alertsStatus === 'error',
          quakesStatus === 'error',
        );
      }
    },
    [alertsStatus, applyDispatch, quakesStatus],
  );

  const setMode = useCallback(
    (m: DispatchMode) => {
      const next = { ...settingsRef.current, mode: m };
      settingsRef.current = next;
      saveSettings(next);
      setModeState(m);
      if (alertsRef.current.length > 0 || quakesRef.current.length > 0) {
        applyDispatch(
          alertsRef.current,
          quakesRef.current,
          false,
          alertsStatus === 'error',
          quakesStatus === 'error',
        );
      }
    },
    [alertsStatus, applyDispatch, quakesStatus],
  );

  const setLookbackHours = useCallback(
    (h: LookbackHours) => {
      const next = { ...settingsRef.current, lookbackHours: h };
      settingsRef.current = next;
      saveSettings(next);
      setLookbackHoursState(h);
      if (alertsRef.current.length > 0 || quakesRef.current.length > 0) {
        applyDispatch(
          alertsRef.current,
          quakesRef.current,
          false,
          alertsStatus === 'error',
          quakesStatus === 'error',
        );
      }
    },
    [alertsStatus, applyDispatch, quakesStatus],
  );

  const clearOutbox = useCallback(() => {
    const empty = clearStoredOutbox();
    setOutboxState(empty);
  }, []);

  const markAllRead = useCallback(() => {
    setOutboxState((cur) => markOutboxRead(cur));
  }, []);

  // Initial fetch + 5-minute polling
  useEffect(() => {
    void fetchAndDispatch(false);
    const timer = window.setInterval(() => {
      if (settingsRef.current.enabled) {
        void fetchAndDispatch(false);
      }
    }, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchAndDispatch]);

  // React to subscription registry / localStorage updates immediately
  useEffect(() => {
    const onSubChange = () => {
      setSubsSnapshot(loadSubscriptions());
      if (alertsRef.current.length > 0 || quakesRef.current.length > 0) {
        applyDispatch(
          alertsRef.current,
          quakesRef.current,
          false,
          alertsStatus === 'error',
          quakesStatus === 'error',
        );
      } else if (settingsRef.current.enabled) {
        void fetchAndDispatch(false);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === 'jaldrishti:demo:subscriptions:v2') {
        onSubChange();
      } else if (e.key === 'jaldrishti:demo:outbox:v1') {
        setOutboxState(loadOutbox());
      } else if (e.key === SETTINGS_STORAGE_KEY) {
        const s = loadSettings();
        settingsRef.current = s;
        setEnabledState(s.enabled);
        setModeState(s.mode);
        setLookbackHoursState(s.lookbackHours);
      }
    };

    window.addEventListener(CHANGE_EVENT, onSubChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onSubChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [alertsStatus, applyDispatch, fetchAndDispatch, quakesStatus]);

  const indiaQuakes = useMemo(
    () => selectIndiaQuakesInWindow(allQuakes, lookbackHours),
    [allQuakes, lookbackHours],
  );

  const allIndiaQuakes = useMemo(
    () => allQuakes.filter((q) => q.inIndia).sort((a, b) => Date.parse(b.time) - Date.parse(a.time)),
    [allQuakes],
  );

  const unreadCount = useMemo(
    () => outboxState.messages.reduce((acc, m) => (m.read ? acc : acc + 1), 0),
    [outboxState.messages],
  );

  const counts = useMemo<DemoSmsCounts>(
    () => ({
      alerts: activeAlerts.length,
      indiaQuakes: indiaQuakes.length,
      queued: outboxState.messages.length,
      skippedUnconsented: subsSnapshot.filter((s) => s.status !== 'Verified').length,
    }),
    [activeAlerts.length, indiaQuakes.length, outboxState.messages.length, subsSnapshot],
  );

  const value = useMemo<DemoSmsContextValue>(
    () => ({
      enabled,
      setEnabled,
      mode,
      setMode,
      lookbackHours,
      setLookbackHours,
      outbox: outboxState.messages,
      droppedCount: outboxState.droppedCount,
      unreadCount,
      lastRun,
      status,
      alertsStatus,
      quakesStatus,
      errorMessage,
      lastRunSummary,
      activeAlerts,
      indiaQuakes,
      allIndiaQuakes,
      counts,
      runNow,
      clearOutbox,
      markAllRead,
    }),
    [
      enabled,
      setEnabled,
      mode,
      setMode,
      lookbackHours,
      setLookbackHours,
      outboxState.messages,
      outboxState.droppedCount,
      unreadCount,
      lastRun,
      status,
      alertsStatus,
      quakesStatus,
      errorMessage,
      lastRunSummary,
      activeAlerts,
      indiaQuakes,
      allIndiaQuakes,
      counts,
      runNow,
      clearOutbox,
      markAllRead,
    ],
  );

  return <DemoSmsContext.Provider value={value}>{children}</DemoSmsContext.Provider>;
}

export function useDemoSms(): DemoSmsContextValue {
  const ctx = useContext(DemoSmsContext);
  if (!ctx) {
    throw new Error('useDemoSms must be used within a DemoSmsProvider');
  }
  return ctx;
}
