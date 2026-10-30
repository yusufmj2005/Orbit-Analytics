import crypto from 'node:crypto';
import { AppStore } from './store';
import { GoogleOAuthManager } from './google-oauth';
import { GA4Service } from './ga4-api';
import { GSCService } from './gsc-api';
import { ResearchService } from './research-api';
import { SyncLogEntry } from './types';

export class SyncScheduler {
  private store: AppStore;
  private oauth: GoogleOAuthManager;
  private ga4Service: GA4Service;
  private gscService: GSCService;
  private researchService: ResearchService;

  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private backoffDelays: Record<string, number> = { ga4: 1000, gsc: 1000, research: 1000 };

  constructor(
    store: AppStore,
    oauth: GoogleOAuthManager,
    ga4Service: GA4Service,
    gscService: GSCService,
    researchService: ResearchService
  ) {
    this.store = store;
    this.oauth = oauth;
    this.ga4Service = ga4Service;
    this.gscService = gscService;
    this.researchService = researchService;
  }

  public async start(): Promise<void> {
    this.stop();
    const data = await this.store.read();
    const minutes = data.settings.refreshMinutes;

    if (data.settings.syncOnStartup) {
      // Trigger startup sync shortly after boot
      setTimeout(() => {
        this.syncAll('Startup synchronization').catch((err) =>
          console.error('[SyncScheduler] Startup sync failed:', err)
        );
      }, 3000);
    }

    if (minutes > 0) {
      const ms = minutes * 60 * 1000;
      this.timer = setInterval(() => {
        this.syncAll('Scheduled background refresh').catch((err) =>
          console.error('[SyncScheduler] Scheduled sync error:', err)
        );
      }, ms);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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

  public async syncGA4(reason = 'Manual refresh'): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    const isGoogleConnected = await this.oauth.isConnected();

    if (!isGoogleConnected) {
      await this.store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          ga4: {
            ...prev.sourcesHealth.ga4,
            connected: false,
            status: 'disconnected',
            syncInProgress: false,
            lastError: 'Google account not connected.'
          }
        }
      }));
      return { success: false, message: 'Google account is not connected.' };
    }

    const data = await this.store.read();
    let propertyId = data.settings.selectedGa4PropertyId;

    await this.store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, syncInProgress: true, status: 'syncing' }
      }
    }));

    try {
      if (!propertyId) {
        // Try fetching first available property
        const props = await this.ga4Service.listProperties();
        if (props.length > 0) {
          propertyId = props[0].id;
          await this.store.update((prev) => ({
            ...prev,
            settings: { ...prev.settings, selectedGa4PropertyId: propertyId }
          }));
        } else {
          throw new Error('No GA4 properties found in this Google account.');
        }
      }

      const report = await this.ga4Service.getReport(propertyId, 30);
      const duration = Date.now() - startTime;

      // Update cache without overwriting if report is null
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

      this.backoffDelays.ga4 = 1000; // Reset backoff
      await this.logSync('ga4', 'success', `GA4 synced: ${report.overview.sessions} sessions recorded (${reason})`, duration);
      return { success: true, message: 'GA4 synchronized successfully.' };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMsg = err?.message || 'GA4 sync failed';

      // Exponential backoff adjustment
      this.backoffDelays.ga4 = Math.min(this.backoffDelays.ga4 * 2, 60_000);

      await this.store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          ga4: {
            ...prev.sourcesHealth.ga4,
            syncInProgress: false,
            status: 'error',
            lastError: errorMsg
          }
        }
      }));

      await this.logSync('ga4', 'error', `GA4 sync failed: ${errorMsg}`, duration);
      return { success: false, message: errorMsg };
    }
  }

  public async syncGSC(reason = 'Manual refresh'): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    const isGoogleConnected = await this.oauth.isConnected();

    if (!isGoogleConnected) {
      await this.store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          gsc: {
            ...prev.sourcesHealth.gsc,
            connected: false,
            status: 'disconnected',
            syncInProgress: false,
            lastError: 'Google account not connected.'
          }
        }
      }));
      return { success: false, message: 'Google account is not connected.' };
    }

    const data = await this.store.read();
    let siteUrl = data.settings.selectedGscSiteUrl;

    await this.store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        gsc: { ...prev.sourcesHealth.gsc, syncInProgress: true, status: 'syncing' }
      }
    }));

    try {
      if (!siteUrl) {
        const sites = await this.gscService.listSites();
        if (sites.length > 0) {
          siteUrl = sites[0].siteUrl;
          await this.store.update((prev) => ({
            ...prev,
            settings: { ...prev.settings, selectedGscSiteUrl: siteUrl }
          }));
        } else {
          throw new Error('No verified Search Console properties found in this Google account.');
        }
      }

      const report = await this.gscService.getReport(siteUrl, 30);
      const duration = Date.now() - startTime;

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

      this.backoffDelays.gsc = 1000;
      await this.logSync('gsc', 'success', `Search Console synced: ${report.overview.clicks} clicks recorded (${reason})`, duration);
      return { success: true, message: 'Search Console synchronized successfully.' };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMsg = err?.message || 'Search Console sync failed';

      this.backoffDelays.gsc = Math.min(this.backoffDelays.gsc * 2, 60_000);

      await this.store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          gsc: {
            ...prev.sourcesHealth.gsc,
            syncInProgress: false,
            status: 'error',
            lastError: errorMsg
          }
        }
      }));

      await this.logSync('gsc', 'error', `Search Console sync failed: ${errorMsg}`, duration);
      return { success: false, message: errorMsg };
    }
  }

  public async syncResearch(reason = 'Watchlist scan'): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    const data = await this.store.read();
    const competitors = data.settings.competitors || [];

    await this.store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        research: { ...prev.sourcesHealth.research, syncInProgress: true, status: 'syncing' }
      }
    }));

    try {
      const articles = await this.researchService.scanCompetitors(competitors);
      const duration = Date.now() - startTime;

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

      this.backoffDelays.research = 1000;
      await this.logSync('research', 'success', `Watchlist scanned: ${articles.length} headlines retrieved (${reason})`, duration);
      return { success: true, message: `Retrieved ${articles.length} headlines.` };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMsg = err?.message || 'Research feed fetch failed';

      this.backoffDelays.research = Math.min(this.backoffDelays.research * 2, 60_000);

      await this.store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          research: {
            ...prev.sourcesHealth.research,
            syncInProgress: false,
            status: 'error',
            lastError: errorMsg
          }
        }
      }));

      await this.logSync('research', 'error', `Watchlist scan failed: ${errorMsg}`, duration);
      return { success: false, message: errorMsg };
    }
  }

  public async syncAll(reason = 'Sync all'): Promise<{ ga4: any; gsc: any; research: any }> {
    // Avoid overlapping runs
    if (this.isSyncing) {
      return {
        ga4: { success: false, message: 'Sync already in progress.' },
        gsc: { success: false, message: 'Sync already in progress.' },
        research: { success: false, message: 'Sync already in progress.' }
      };
    }

    this.isSyncing = true;
    try {
      const [ga4Res, gscRes, resRes] = await Promise.allSettled([
        this.syncGA4(reason),
        this.syncGSC(reason),
        this.syncResearch(reason)
      ]);

      const ga4 = ga4Res.status === 'fulfilled' ? ga4Res.value : { success: false, message: ga4Res.reason };
      const gsc = gscRes.status === 'fulfilled' ? gscRes.value : { success: false, message: gscRes.reason };
      const research = resRes.status === 'fulfilled' ? resRes.value : { success: false, message: resRes.reason };

      const overallStatus = (ga4.success || gsc.success) && research.success ? 'success' : 'partial';
      await this.logSync('all', overallStatus, `Full sync completed: ${reason}`, 0, {
        ga4: ga4.success,
        gsc: gsc.success,
        research: research.success
      });

      return { ga4, gsc, research };
    } finally {
      this.isSyncing = false;
    }
  }
}

