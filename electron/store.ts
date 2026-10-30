import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { AppDataSchema, BusinessRecord } from './types';

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

export const defaultData: AppDataSchema = {
  version: DATA_VERSION,
  settings: {
    refreshMinutes: 30,
    syncOnStartup: true,
    competitors: ['Microsoft', 'Adobe', 'Datadog', 'Mixpanel'],
    aiModel: 'gpt-4o-mini',
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

export class AppStore {
  private baseDir: string;
  private filePath: string;
  private tempPath: string;
  private backupPath: string;
  private cachedData: AppDataSchema | null = null;
  private isWriting = false;

  constructor(customDir?: string) {
    this.baseDir = customDir || getDefaultUserDataDir();
    this.filePath = path.join(this.baseDir, 'orbit-data.json');
    this.tempPath = path.join(this.baseDir, 'orbit-data.json.tmp');
    this.backupPath = path.join(this.baseDir, 'orbit-data.json.bak');
  }

  public async init(): Promise<AppDataSchema> {
    await fs.mkdir(this.baseDir, { recursive: true });
    return this.read();
  }

  public async read(): Promise<AppDataSchema> {
    if (this.cachedData) {
      return this.cachedData;
    }

    try {
      if (existsSync(this.filePath)) {
        const raw = await fs.readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.cachedData = this.migrate(parsed);
        return this.cachedData;
      }
    } catch (err) {
      console.error('[Store] Primary data file corrupted or unreadable, attempting backup recovery...', err);
      try {
        if (existsSync(this.backupPath)) {
          const bakRaw = await fs.readFile(this.backupPath, 'utf8');
          const bakParsed = JSON.parse(bakRaw);
          this.cachedData = this.migrate(bakParsed);
          return this.cachedData;
        }
      } catch (bakErr) {
        console.error('[Store] Backup file also corrupted:', bakErr);
      }
    }

    // Default initialization
    const initial = JSON.parse(JSON.stringify(defaultData));
    this.cachedData = initial;
    await this.write(initial);
    return initial;
  }

  public async write(data: AppDataSchema): Promise<void> {
    while (this.isWriting) {
      await new Promise((r) => setTimeout(r, 15));
    }

    this.isWriting = true;
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      const serialized = JSON.stringify(data, null, 2);

      // Atomic write: write to temp file then rename
      await fs.writeFile(this.tempPath, serialized, { encoding: 'utf8', mode: 0o600 });

      // On Windows, rename will overwrite target if node fs.rename supports it or unlink target first
      if (existsSync(this.filePath)) {
        // Create backup first
        try {
          await fs.copyFile(this.filePath, this.backupPath);
        } catch {
          // Non-fatal if backup copy fails
        }
      }

      try {
        await fs.rename(this.tempPath, this.filePath);
      } catch (renameErr) {
        // Windows fallback if rename conflicts with an open handle
        await fs.copyFile(this.tempPath, this.filePath);
        await fs.unlink(this.tempPath).catch(() => {});
      }

      this.cachedData = data;
    } finally {
      this.isWriting = false;
    }
  }

  public async update(updater: (prev: AppDataSchema) => AppDataSchema): Promise<AppDataSchema> {
    const current = await this.read();
    const next = updater(JSON.parse(JSON.stringify(current)));
    await this.write(next);
    return next;
  }

  public async exportBackup(): Promise<string> {
    const current = await this.read();
    // Return sanitized JSON (no credentials)
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
        ? parsed.businessRecords.filter((r: any) => r && r.id && r.label && typeof r.amount === 'number')
        : [];

      await this.update((prev) => {
        const existingIds = new Set(prev.businessRecords.map((r) => r.id));
        const merged = [...prev.businessRecords];
        for (const r of importedRecords) {
          if (!existingIds.has(r.id)) {
            merged.push(r);
            existingIds.add(r.id);
          }
        }

        return {
          ...prev,
          businessRecords: merged,
          settings: {
            ...prev.settings,
            ...(parsed.settings || {})
          },
          savedSearches: parsed.savedSearches || prev.savedSearches
        };
      });

      return { success: true, count: importedRecords.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || 'Failed to parse backup JSON.' };
    }
  }

  private migrate(raw: any): AppDataSchema {
    if (!raw || typeof raw !== 'object') {
      return JSON.parse(JSON.stringify(defaultData));
    }

    const version = Number(raw.version) || 1;
    const settings = {
      ...defaultData.settings,
      ...(raw.settings || {})
    };

    const businessRecords: BusinessRecord[] = Array.isArray(raw.businessRecords)
      ? raw.businessRecords.map((r: any) => ({
          id: String(r.id || crypto.randomUUID()),
          date: String(r.date || new Date().toISOString().slice(0, 10)),
          label: String(r.label || 'Untitled record'),
          amount: typeof r.amount === 'number' ? r.amount : 0,
          kind: r.kind === 'expense' ? 'expense' : r.kind === 'lead' ? 'lead' : 'revenue',
          category: r.category || 'General',
          notes: r.notes || '',
          isSample: Boolean(r.isSample)
        }))
      : [];

    const searchHistory = Array.isArray(raw.searchHistory) ? raw.searchHistory.slice(0, 20) : defaultData.searchHistory;
    const savedSearches = Array.isArray(raw.savedSearches) ? raw.savedSearches : defaultData.savedSearches;
    const lastResearchResults = Array.isArray(raw.lastResearchResults) ? raw.lastResearchResults : [];
    const syncHistory = Array.isArray(raw.syncHistory) ? raw.syncHistory.slice(0, 100) : [];

    const sourcesHealth = {
      ga4: { ...defaultData.sourcesHealth.ga4, ...(raw.sourcesHealth?.ga4 || {}) },
      gsc: { ...defaultData.sourcesHealth.gsc, ...(raw.sourcesHealth?.gsc || {}) },
      research: { ...defaultData.sourcesHealth.research, ...(raw.sourcesHealth?.research || {}) },
      ai: { ...defaultData.sourcesHealth.ai, ...(raw.sourcesHealth?.ai || {}) }
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
