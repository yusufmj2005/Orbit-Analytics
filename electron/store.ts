import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { AppDataSchema, AppSettings, BusinessRecord, DataPatch, SourceHealth } from './types';
import { isValidDateString, localDateString } from './dates';

function getDefaultUserDataDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    if (electron?.app?.getPath) {
      return electron.app.getPath('userData');
    }
  } catch {}
  return path.join(process.env.APPDATA || process.env.HOME || '.', 'OrbitAnalytics');
}

const DATA_VERSION = 2;

export const AI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];
export const REPORT_DAY_OPTIONS = [7, 30, 90];
const MAX_RECORDS = 50_000;
const MAX_COMPETITORS = 25;

export const defaultData: AppDataSchema = {
  version: DATA_VERSION,
  settings: {
    refreshMinutes: 30,
    syncOnStartup: true,
    competitors: ['Microsoft', 'Adobe', 'Datadog', 'Mixpanel'],
    aiModel: 'gpt-4o-mini',
    reportDays: 30,
    theme: 'dark'
  },
  businessRecords: [],
  searchHistory: ['competitor market signals', 'ai analytics tools', 'saas pricing trends'],
  savedSearches: [
    { id: '1', query: 'enterprise analytics software', category: 'industry' },
    { id: '2', query: 'customer data platform trends', category: 'technology' }
  ],
  lastResearchResults: [],
  ga4Cache: null,
  gscCache: null,
  syncHistory: [],
  sourcesHealth: {
    ga4: { connected: false, lastSync: null, lastError: null, syncInProgress: false, status: 'disconnected' },
    gsc: { connected: false, lastSync: null, lastError: null, syncInProgress: false, status: 'disconnected' },
    research: { connected: true, lastSync: null, lastError: null, syncInProgress: false, status: 'idle' },
    ai: { connected: false, lastSync: null, lastError: null, syncInProgress: false, status: 'disconnected' }
  },
  lastRefresh: null
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const cleanString = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export function normalizeRecord(r: any): BusinessRecord {
  const amount = typeof r?.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0;
  const kind = r?.kind === 'expense' ? 'expense' : r?.kind === 'lead' ? 'lead' : 'revenue';
  return {
    id: cleanString(r?.id, 100) || crypto.randomUUID(),
    date: isValidDateString(r?.date) ? r.date : localDateString(),
    label: cleanString(r?.label, 500) || 'Untitled record',
    amount: kind === 'lead' ? 0 : amount,
    kind,
    category: cleanString(r?.category, 100) || 'General',
    notes: cleanString(r?.notes, 5000)
  };
}

function normalizeGa4PropertyId(value: unknown): string | undefined {
  const id = cleanString(value, 64).replace(/^properties\//, '');
  return /^\d+$/.test(id) ? id : undefined;
}

function normalizeGscSiteUrl(value: unknown): string | undefined {
  const url = cleanString(value, 2048);
  return /^(https?:\/\/|sc-domain:)/i.test(url) ? url : undefined;
}

// Validates settings field by field, falling back to `fallback` for anything invalid.
export function sanitizeSettings(raw: any, fallback: AppSettings = defaultData.settings): AppSettings {
  const src = raw && typeof raw === 'object' ? raw : {};

  const minutes = Number(src.refreshMinutes);
  const refreshMinutes =
    Number.isFinite(minutes) && (minutes === 0 || (minutes >= 5 && minutes <= 1440))
      ? Math.round(minutes)
      : fallback.refreshMinutes;

  const competitors: string[] = [];
  if (Array.isArray(src.competitors)) {
    const seen = new Set<string>();
    for (const c of src.competitors) {
      const name = cleanString(c, 100);
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        competitors.push(name);
      }
    }
  }

  const reportDays = Number(src.reportDays);

  return {
    refreshMinutes,
    syncOnStartup: typeof src.syncOnStartup === 'boolean' ? src.syncOnStartup : fallback.syncOnStartup,
    competitors: Array.isArray(src.competitors) ? competitors.slice(0, MAX_COMPETITORS) : [...fallback.competitors],
    aiModel: AI_MODELS.includes(src.aiModel) ? src.aiModel : fallback.aiModel,
    selectedGa4PropertyId:
      'selectedGa4PropertyId' in src ? normalizeGa4PropertyId(src.selectedGa4PropertyId) : fallback.selectedGa4PropertyId,
    selectedGscSiteUrl:
      'selectedGscSiteUrl' in src ? normalizeGscSiteUrl(src.selectedGscSiteUrl) : fallback.selectedGscSiteUrl,
    reportDays: REPORT_DAY_OPTIONS.includes(reportDays) ? reportDays : fallback.reportDays,
    theme: 'dark'
  };
}

function sanitizeSavedSearches(raw: unknown): AppDataSchema['savedSearches'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s.query === 'string' && s.query.trim())
    .slice(0, 50)
    .map((s) => ({
      id: cleanString(s.id, 100) || crypto.randomUUID(),
      query: cleanString(s.query, 300),
      category: cleanString(s.category, 30) || undefined
    }));
}

function sanitizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((q) => cleanString(q, 300)).filter(Boolean).slice(0, 20);
}

function sanitizeRecords(raw: unknown): BusinessRecord[] {
  if (!Array.isArray(raw)) throw new Error('businessRecords must be an array.');
  if (raw.length > MAX_RECORDS) throw new Error(`Too many records (limit ${MAX_RECORDS}).`);
  // Sample/demo records only ever live in renderer memory; never persist them.
  return raw.filter((r) => r && typeof r === 'object' && !r.isSample).map(normalizeRecord);
}

// Applies a renderer-originated patch. Only the renderer-owned fields are accepted.
export function applyPatch(prev: AppDataSchema, patch: DataPatch): AppDataSchema {
  if (!patch || typeof patch !== 'object') throw new Error('Invalid data patch.');
  const next: AppDataSchema = { ...prev };
  if (patch.businessRecords !== undefined) next.businessRecords = sanitizeRecords(patch.businessRecords);
  if (patch.settings !== undefined) {
    if (!patch.settings || typeof patch.settings !== 'object') throw new Error('Invalid settings patch.');
    next.settings = sanitizeSettings({ ...prev.settings, ...patch.settings }, prev.settings);
  }
  if (patch.savedSearches !== undefined) next.savedSearches = sanitizeSavedSearches(patch.savedSearches);
  if (patch.searchHistory !== undefined) next.searchHistory = sanitizeHistory(patch.searchHistory);
  return next;
}

// A sync that was running when the app quit or crashed must not stay "syncing" forever.
function resetInterruptedSync(health: SourceHealth): SourceHealth {
  if (!health.syncInProgress && health.status !== 'syncing') return health;
  return { ...health, syncInProgress: false, status: health.connected ? 'idle' : 'disconnected' };
}

type ChangeListener = (data: AppDataSchema) => void;

export class AppStore {
  private baseDir: string;
  private filePath: string;
  private tempPath: string;
  private backupPath: string;
  private cachedData: AppDataSchema | null = null;
  // All reads-from-disk and writes run one at a time through this queue, so concurrent
  // update() calls can never compute from the same stale snapshot and lose each other's changes.
  private queue: Promise<unknown> = Promise.resolve();
  private skipNextBackup = false;
  private listeners = new Set<ChangeListener>();

  constructor(customDir?: string) {
    this.baseDir = customDir || getDefaultUserDataDir();
    this.filePath = path.join(this.baseDir, 'orbit-data.json');
    this.tempPath = path.join(this.baseDir, 'orbit-data.json.tmp');
    this.backupPath = path.join(this.baseDir, 'orbit-data.json.bak');
  }

  public onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  public async init(): Promise<AppDataSchema> {
    await fs.mkdir(this.baseDir, { recursive: true });
    return this.read();
  }

  public read(): Promise<AppDataSchema> {
    if (this.cachedData) return Promise.resolve(this.cachedData);
    return this.enqueue(() => this.load());
  }

  public write(data: AppDataSchema): Promise<void> {
    return this.enqueue(() => this.persist(data));
  }

  public update(updater: (prev: AppDataSchema) => AppDataSchema): Promise<AppDataSchema> {
    return this.enqueue(async () => {
      const current = await this.load();
      const next = updater(clone(current));
      await this.persist(next);
      return next;
    });
  }

  public patch(patch: DataPatch): Promise<AppDataSchema> {
    return this.update((prev) => applyPatch(prev, patch));
  }

  private async load(): Promise<AppDataSchema> {
    if (this.cachedData) return this.cachedData;

    if (existsSync(this.filePath)) {
      try {
        const raw = await fs.readFile(this.filePath, 'utf8');
        this.cachedData = this.migrate(JSON.parse(raw));
        return this.cachedData;
      } catch (err) {
        console.error('[Store] Primary data file corrupted or unreadable, attempting backup recovery...', err);
        // Keep the unreadable file for manual recovery, and make sure the next write
        // doesn't copy it over the good backup.
        await fs
          .copyFile(this.filePath, path.join(this.baseDir, `orbit-data.corrupt-${Date.now()}.json`))
          .catch(() => {});
        this.skipNextBackup = true;
        try {
          if (existsSync(this.backupPath)) {
            const bakRaw = await fs.readFile(this.backupPath, 'utf8');
            this.cachedData = this.migrate(JSON.parse(bakRaw));
            await this.persist(this.cachedData);
            return this.cachedData;
          }
        } catch (bakErr) {
          console.error('[Store] Backup file also corrupted:', bakErr);
        }
      }
    }

    const initial = clone(defaultData);
    await this.persist(initial);
    return initial;
  }

  private async persist(data: AppDataSchema): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const serialized = JSON.stringify(data, null, 2);

    // Atomic write: write to temp file then rename
    await fs.writeFile(this.tempPath, serialized, { encoding: 'utf8', mode: 0o600 });

    if (existsSync(this.filePath) && !this.skipNextBackup) {
      try {
        await fs.copyFile(this.filePath, this.backupPath);
      } catch {
        // Non-fatal if backup copy fails
      }
    }
    this.skipNextBackup = false;

    try {
      await fs.rename(this.tempPath, this.filePath);
    } catch {
      // Windows fallback if rename conflicts with an open handle
      await fs.copyFile(this.tempPath, this.filePath);
      await fs.unlink(this.tempPath).catch(() => {});
    }

    this.cachedData = data;
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[Store] Change listener failed:', err);
      }
    }
  }

  public async exportBackup(): Promise<string> {
    const current = await this.read();
    // Return sanitized JSON (no credentials, caches or sync state)
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      appName: 'Orbit Analytics',
      version: current.version,
      businessRecords: current.businessRecords,
      settings: current.settings,
      savedSearches: current.savedSearches
    }, null, 2);
  }

  public async importBackup(jsonString: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || (!Array.isArray(parsed.businessRecords) && !parsed.settings)) {
        return { success: false, count: 0, error: 'Invalid Orbit backup file structure.' };
      }

      const importedRecords: BusinessRecord[] = Array.isArray(parsed.businessRecords)
        ? sanitizeRecords(
            parsed.businessRecords.filter((r: any) => r && r.id && r.label && typeof r.amount === 'number')
          )
        : [];

      let added = 0;
      await this.update((prev) => {
        const existingIds = new Set(prev.businessRecords.map((r) => r.id));
        const merged = [...prev.businessRecords];
        for (const r of importedRecords) {
          if (!existingIds.has(r.id)) {
            merged.push(r);
            existingIds.add(r.id);
            added++;
          }
        }

        return applyPatch(prev, {
          businessRecords: merged,
          ...(parsed.settings && typeof parsed.settings === 'object' ? { settings: parsed.settings } : {}),
          ...(Array.isArray(parsed.savedSearches) ? { savedSearches: parsed.savedSearches } : {})
        });
      });

      return { success: true, count: added };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || 'Failed to parse backup JSON.' };
    }
  }

  private migrate(raw: any): AppDataSchema {
    if (!raw || typeof raw !== 'object') {
      return clone(defaultData);
    }

    const settings = sanitizeSettings({ ...defaultData.settings, ...(raw.settings || {}) });

    // Earlier versions persisted demo records into the ledger; they are dropped here.
    const businessRecords: BusinessRecord[] = Array.isArray(raw.businessRecords)
      ? raw.businessRecords.filter((r: any) => r && typeof r === 'object' && !r.isSample).map(normalizeRecord)
      : [];

    const searchHistory = Array.isArray(raw.searchHistory) ? sanitizeHistory(raw.searchHistory) : defaultData.searchHistory;
    const savedSearches = Array.isArray(raw.savedSearches) ? sanitizeSavedSearches(raw.savedSearches) : defaultData.savedSearches;
    const lastResearchResults = Array.isArray(raw.lastResearchResults) ? raw.lastResearchResults : [];
    const syncHistory = Array.isArray(raw.syncHistory) ? raw.syncHistory.slice(0, 100) : [];

    const sourcesHealth = {
      ga4: resetInterruptedSync({ ...defaultData.sourcesHealth.ga4, ...(raw.sourcesHealth?.ga4 || {}) }),
      gsc: resetInterruptedSync({ ...defaultData.sourcesHealth.gsc, ...(raw.sourcesHealth?.gsc || {}) }),
      research: resetInterruptedSync({ ...defaultData.sourcesHealth.research, ...(raw.sourcesHealth?.research || {}) }),
      ai: resetInterruptedSync({ ...defaultData.sourcesHealth.ai, ...(raw.sourcesHealth?.ai || {}) })
    };

    return {
      version: DATA_VERSION,
      settings,
      businessRecords,
      searchHistory,
      savedSearches,
      lastResearchResults,
      ga4Cache: raw.ga4Cache || null,
      gscCache: raw.gscCache || null,
      syncHistory,
      sourcesHealth,
      lastRefresh: raw.lastRefresh || null
    };
  }
}
