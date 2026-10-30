import crypto from 'node:crypto';
import type { AppStore } from './store';
import type { GA4Service } from './ga4-api';
import type { GSCService } from './gsc-api';
import type { ResearchService } from './research-api';
import { AppDataSchema, SourceHealth, SyncAllResult, SyncLogEntry, SyncResult, SyncSource } from './types';
import { RetryOptions, withRetry } from './http';

export interface ConnectionChecker {
  isConnected(): Promise<boolean>;
}

type GA4Reporter = Pick<GA4Service, 'listProperties' | 'getReport'>;
type GSCReporter = Pick<GSCService, 'listSites' | 'getReport'>;
type CompetitorScanner = Pick<ResearchService, 'scanCompetitors'>;

const STARTUP_SYNC_DELAY_MS = 3000;

export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  // One job per source at a time. A request identical to the running one shares its
  // promise; a request with different parameters (e.g. a newly selected property) is
  // queued behind it so it never races the running job's cache writes.
  private inFlight: Partial<Record<SyncSource, { key: string; promise: Promise<SyncResult> }>> = {};
  private allInFlight: Promise<SyncAllResult> | null = null;

  constructor(
    private store: AppStore,
    private oauth: ConnectionChecker,
    private ga4Service: GA4Reporter,
    private gscService: GSCReporter,
    private researchService: CompetitorScanner,
    private retryOptions: RetryOptions = { attempts: 3, baseDelayMs: 1000, maxDelayMs: 60_000 }
  ) {}

  // runStartupSync is only true on app launch; changing the interval must not re-trigger it.
  public async start(options: { runStartupSync?: boolean } = {}): Promise<void> {
    this.stop();
    const data = await this.store.read();
    const minutes = data.settings.refreshMinutes;

    if (options.runStartupSync && data.settings.syncOnStartup) {
      this.startupTimer = setTimeout(() => {
        this.startupTimer = null;
        this.syncAll('Startup synchronization').catch((err) =>
          console.error('[SyncScheduler] Startup sync failed:', err)
        );
      }, STARTUP_SYNC_DELAY_MS);
    }

    if (minutes > 0) {
      this.timer = setInterval(() => {
        this.syncAll('Scheduled background refresh').catch((err) =>
          console.error('[SyncScheduler] Scheduled sync error:', err)
        );
      }, minutes * 60 * 1000);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  public async logSync(
    source: 'ga4' | 'gsc' | 'research' | 'all',
    status: 'success' | 'partial' | 'error',
    message: string,
    durationMs: number,
    details?: Record<string, any>
  ): Promise<void> {
    const entry: SyncLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source,
      status,
      message,
      durationMs,
      details
    };

    await this.store.update((prev) => ({
      ...prev,
      syncHistory: [entry, ...prev.syncHistory].slice(0, 100),
      lastRefresh: new Date().toISOString()
    }));
  }

  private runExclusive(source: SyncSource, key: string, job: () => Promise<SyncResult>): Promise<SyncResult> {
    const existing = this.inFlight[source];
    if (existing && existing.key === key) return existing.promise;

    const previous = existing?.promise ?? Promise.resolve();
    const promise: Promise<SyncResult> = previous
      .catch(() => undefined)
      .then(job)
      .finally(() => {
        if (this.inFlight[source]?.promise === promise) delete this.inFlight[source];
      });
    this.inFlight[source] = { key, promise };
    return promise;
  }

  private setHealth(source: SyncSource, patch: Partial<SourceHealth>): Promise<AppDataSchema> {
    return this.store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        [source]: { ...prev.sourcesHealth[source], ...patch }
      }
    }));
  }

  private async markDisconnected(source: 'ga4' | 'gsc'): Promise<SyncResult> {
    await this.setHealth(source, {
      connected: false,
      status: 'disconnected',
      syncInProgress: false,
      lastError: null
    });
    return { success: false, skipped: true, message: 'Google account is not connected.' };
  }

  private async recordFailure(source: SyncSource, label: string, err: any, startTime: number): Promise<SyncResult> {
    const errorMsg = err?.message || `${label} sync failed`;
    await this.setHealth(source, { syncInProgress: false, status: 'error', lastError: errorMsg });
    await this.logSync(source, 'error', `${label} sync failed: ${errorMsg}`, Date.now() - startTime);
    return { success: false, message: errorMsg };
  }

  public async syncGA4(reason = 'Manual refresh'): Promise<SyncResult> {
    const { settings } = await this.store.read();
    return this.runExclusive('ga4', `${settings.selectedGa4PropertyId ?? ''}:${settings.reportDays}`, () =>
      this.runGA4(reason)
    );
  }

  private async runGA4(reason: string): Promise<SyncResult> {
    const startTime = Date.now();
    if (!(await this.oauth.isConnected())) return this.markDisconnected('ga4');

    const { settings } = await this.store.read();
    let propertyId = settings.selectedGa4PropertyId;
    const days = settings.reportDays;

    await this.setHealth('ga4', { connected: true, syncInProgress: true, status: 'syncing' });

    try {
      if (!propertyId) {
        // Try fetching first available property
        const props = await withRetry(() => this.ga4Service.listProperties(), this.retryOptions);
        if (props.length === 0) {
          throw new Error('No GA4 properties found in this Google account.');
        }
        propertyId = props[0].id;
        await this.store.update((prev) => ({
          ...prev,
          settings: { ...prev.settings, selectedGa4PropertyId: prev.settings.selectedGa4PropertyId || propertyId }
        }));
      }

      const report = await withRetry(() => this.ga4Service.getReport(propertyId!, days), this.retryOptions);

      await this.store.update((prev) => ({
        ...prev,
        ga4Cache: report,
        sourcesHealth: {
          ...prev.sourcesHealth,
          ga4: {
            connected: true,
            status: 'idle',
            syncInProgress: false,
            lastSync: new Date().toISOString(),
            lastError: null
          }
        }
      }));

      await this.logSync(
        'ga4',
        'success',
        `GA4 synced: ${report.overview.sessions} sessions over ${report.days ?? days} days (${reason})`,
        Date.now() - startTime
      );
      return { success: true, message: 'GA4 synchronized successfully.' };
    } catch (err: any) {
      return this.recordFailure('ga4', 'GA4', err, startTime);
    }
  }

  public async syncGSC(reason = 'Manual refresh'): Promise<SyncResult> {
    const { settings } = await this.store.read();
    return this.runExclusive('gsc', `${settings.selectedGscSiteUrl ?? ''}:${settings.reportDays}`, () =>
      this.runGSC(reason)
    );
  }

  private async runGSC(reason: string): Promise<SyncResult> {
    const startTime = Date.now();
    if (!(await this.oauth.isConnected())) return this.markDisconnected('gsc');

    const { settings } = await this.store.read();
    let siteUrl = settings.selectedGscSiteUrl;
    const days = settings.reportDays;

    await this.setHealth('gsc', { connected: true, syncInProgress: true, status: 'syncing' });

    try {
      if (!siteUrl) {
        const sites = await withRetry(() => this.gscService.listSites(), this.retryOptions);
        if (sites.length === 0) {
          throw new Error('No verified Search Console properties found in this Google account.');
        }
        siteUrl = sites[0].siteUrl;
        await this.store.update((prev) => ({
          ...prev,
          settings: { ...prev.settings, selectedGscSiteUrl: prev.settings.selectedGscSiteUrl || siteUrl }
        }));
      }

      const report = await withRetry(() => this.gscService.getReport(siteUrl!, days), this.retryOptions);

      await this.store.update((prev) => ({
        ...prev,
        gscCache: report,
        sourcesHealth: {
          ...prev.sourcesHealth,
          gsc: {
            connected: true,
            status: 'idle',
            syncInProgress: false,
            lastSync: new Date().toISOString(),
            lastError: null
          }
        }
      }));

      await this.logSync(
        'gsc',
        'success',
        `Search Console synced: ${report.overview.clicks} clicks over ${report.days ?? days} days (${reason})`,
        Date.now() - startTime
      );
      return { success: true, message: 'Search Console synchronized successfully.' };
    } catch (err: any) {
      return this.recordFailure('gsc', 'Search Console', err, startTime);
    }
  }

  public async syncResearch(reason = 'Watchlist scan'): Promise<SyncResult> {
    const { settings } = await this.store.read();
    return this.runExclusive('research', settings.competitors.join('\u0000'), () => this.runResearch(reason));
  }

  private async runResearch(reason: string): Promise<SyncResult> {
    const startTime = Date.now();
    const { settings } = await this.store.read();
    const competitors = settings.competitors || [];

    if (competitors.length === 0) {
      return { success: false, skipped: true, message: 'The competitor watchlist is empty.' };
    }

    await this.setHealth('research', { syncInProgress: true, status: 'syncing' });

    try {
      const articles = await withRetry(() => this.researchService.scanCompetitors(competitors), this.retryOptions);

      await this.store.update((prev) => ({
        ...prev,
        lastResearchResults: articles.length > 0 ? articles : prev.lastResearchResults,
        sourcesHealth: {
          ...prev.sourcesHealth,
          research: {
            connected: true,
            status: 'idle',
            syncInProgress: false,
            lastSync: new Date().toISOString(),
            lastError: null
          }
        }
      }));

      await this.logSync(
        'research',
        'success',
        `Watchlist scanned: ${articles.length} headlines retrieved for ${competitors.length} companies (${reason})`,
        Date.now() - startTime
      );
      return { success: true, message: `Retrieved ${articles.length} headlines for ${competitors.length} companies.` };
    } catch (err: any) {
      return this.recordFailure('research', 'Watchlist scan', err, startTime);
    }
  }

  public syncAll(reason = 'Sync all'): Promise<SyncAllResult> {
    // Overlapping "sync all" requests share the run that's already in progress.
    if (!this.allInFlight) {
      this.allInFlight = this.runAll(reason).finally(() => {
        this.allInFlight = null;
      });
    }
    return this.allInFlight;
  }

  private async runAll(reason: string): Promise<SyncAllResult> {
    const startTime = Date.now();
    const settle = (r: PromiseSettledResult<SyncResult>): SyncResult =>
      r.status === 'fulfilled' ? r.value : { success: false, message: String(r.reason?.message || r.reason) };

    const [ga4Res, gscRes, researchRes] = await Promise.allSettled([
      this.syncGA4(reason),
      this.syncGSC(reason),
      this.syncResearch(reason)
    ]);
    const ga4 = settle(ga4Res);
    const gsc = settle(gscRes);
    const research = settle(researchRes);

    // Sources that aren't configured are skipped, not failures.
    const attempted = [ga4, gsc, research].filter((r) => !r.skipped);
    const failed = attempted.filter((r) => !r.success).length;
    const status: SyncAllResult['status'] =
      failed === 0 ? 'success' : failed === attempted.length ? 'error' : 'partial';

    const describe = (name: string, r: SyncResult) => `${name} ${r.skipped ? 'skipped' : r.success ? 'ok' : 'failed'}`;
    await this.logSync(
      'all',
      status,
      `Full sync (${reason}): ${describe('GA4', ga4)}, ${describe('Search Console', gsc)}, ${describe('Research', research)}`,
      Date.now() - startTime,
      { ga4: ga4.success, gsc: gsc.success, research: research.success }
    );

    return { status, ga4, gsc, research };
  }
}
