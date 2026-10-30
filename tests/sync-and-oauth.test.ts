import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { AppStore } from '../electron/store';
import { SyncScheduler } from '../electron/sync-scheduler';
import { HttpError, NetworkError, backoffDelay, isTransientError, withRetry } from '../electron/http';
import { base64UrlEncode, generateCodeChallenge, generateCodeVerifier, generateState, statesMatch } from '../electron/pkce';
import { GA4ReportData, GSCReportData } from '../electron/types';

describe('OAuth PKCE and State Security', () => {
  it('generates high-entropy PKCE code_verifier with valid base64url characters', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateCodeVerifier()).not.toBe(verifier);
  });

  it('computes the S256 code_challenge as unpadded base64url(SHA-256(verifier))', () => {
    const verifier = generateCodeVerifier();
    // Cross-check against Node's own base64url encoder.
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(generateCodeChallenge(verifier)).toBe(expected);
    expect(base64UrlEncode(Buffer.from([0xfb, 0xff]))).toBe('-_8');
  });

  it('accepts only the exact callback state', () => {
    const state = generateState();
    expect(state).toHaveLength(48);
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, generateState())).toBe(false);
    expect(statesMatch(state, null)).toBe(false);
    expect(statesMatch(state, state.slice(0, -1))).toBe(false);
  });
});

describe('Retry with bounded exponential backoff', () => {
  it('computes capped delays', () => {
    expect([0, 1, 2, 5, 6, 10].map((a) => backoffDelay(a, 1000, 60_000))).toEqual([1000, 2000, 4000, 32000, 60000, 60000]);
  });

  it('classifies transient errors', () => {
    expect(isTransientError(new NetworkError('offline'))).toBe(true);
    expect(isTransientError(new HttpError('rate', 429))).toBe(true);
    expect(isTransientError(new HttpError('server', 503))).toBe(true);
    expect(isTransientError(new HttpError('denied', 403))).toBe(false);
    expect(isTransientError(new Error('bug'))).toBe(false);
  });

  it('retries transient failures and then succeeds', async () => {
    const sleeps: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError('busy', 503))
      .mockRejectedValueOnce(new NetworkError('reset'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { attempts: 3, sleep: async (ms) => void sleeps.push(ms) })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('does not retry permanent failures', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError('forbidden', 403));
    await expect(withRetry(fn, { attempts: 3, sleep: async () => {} })).rejects.toThrow('forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt limit', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError('busy', 500));
    await expect(withRetry(fn, { attempts: 3, sleep: async () => {} })).rejects.toThrow('busy');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

function ga4Report(sessions: number, propertyId = '111'): GA4ReportData {
  return {
    propertyId,
    days: 30,
    dateRange: 'Last 30 days',
    fetchedAt: new Date().toISOString(),
    overview: {
      activeUsers: 1, totalUsers: 1, sessions, screenPageViews: 1,
      engagementRate: 0.5, averageSessionDuration: 60, conversions: 0
    },
    dailyTrends: [],
    channels: [],
    landingPages: []
  };
}

function gscReport(clicks: number): GSCReportData {
  return {
    siteUrl: 'https://example.com/',
    days: 30,
    dateRange: 'Last 30 days',
    fetchedAt: new Date().toISOString(),
    overview: { clicks, impressions: 100, ctr: 0.1, position: 3 },
    dailyTrends: [],
    topQueries: [],
    topPages: []
  };
}

describe('SyncScheduler', () => {
  let testDir: string;
  let store: AppStore;
  let connected: boolean;
  let ga4: { listProperties: ReturnType<typeof vi.fn>; getReport: ReturnType<typeof vi.fn> };
  let gsc: { listSites: ReturnType<typeof vi.fn>; getReport: ReturnType<typeof vi.fn> };
  let research: { scanCompetitors: ReturnType<typeof vi.fn> };
  let scheduler: SyncScheduler;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `orbit-sync-test-${crypto.randomUUID()}`);
    store = new AppStore(testDir);
    await store.init();
    connected = true;
    ga4 = {
      listProperties: vi.fn().mockResolvedValue([{ id: '111', displayName: 'Main', account: 'Acct' }]),
      getReport: vi.fn().mockImplementation(async (id: string) => ga4Report(42, id))
    };
    gsc = {
      listSites: vi.fn().mockResolvedValue([{ siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' }]),
      getReport: vi.fn().mockResolvedValue(gscReport(7))
    };
    research = { scanCompetitors: vi.fn().mockResolvedValue([]) };
    scheduler = new SyncScheduler(
      store,
      { isConnected: async () => connected },
      ga4 as any,
      gsc as any,
      research as any,
      { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} }
    );
  });

  afterEach(async () => {
    scheduler.stop();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('auto-selects the first GA4 property, caches the report and logs the sync', async () => {
    const res = await scheduler.syncGA4('test');
    expect(res.success).toBe(true);
    const data = await store.read();
    expect(data.settings.selectedGa4PropertyId).toBe('111');
    expect(data.ga4Cache?.overview.sessions).toBe(42);
    expect(data.sourcesHealth.ga4).toMatchObject({ connected: true, status: 'idle', syncInProgress: false, lastError: null });
    expect(data.syncHistory[0]).toMatchObject({ source: 'ga4', status: 'success' });
    expect(ga4.getReport).toHaveBeenCalledWith('111', 30);
  });

  it('shares one run between identical overlapping requests', async () => {
    const [a, b] = await Promise.all([scheduler.syncGA4('a'), scheduler.syncGA4('b')]);
    expect(a).toBe(b);
    expect(ga4.getReport).toHaveBeenCalledTimes(1);
  });

  it('queues a request for a newly selected property behind the running one', async () => {
    await store.patch({ settings: { selectedGa4PropertyId: '111' } });
    let release!: () => void;
    ga4.getReport.mockImplementationOnce(
      (id: string) => new Promise((resolve) => (release = () => resolve(ga4Report(1, id))))
    );
    const first = scheduler.syncGA4('first');
    await new Promise((r) => setTimeout(r, 10));
    await store.patch({ settings: { selectedGa4PropertyId: '222' } });
    const second = scheduler.syncGA4('second');
    release();
    await Promise.all([first, second]);

    expect(ga4.getReport.mock.calls.map((c) => c[0])).toEqual(['111', '222']);
    expect((await store.read()).ga4Cache?.propertyId).toBe('222');
  });

  it('uses the configured report period', async () => {
    await store.patch({ settings: { reportDays: 90 } });
    await scheduler.syncGSC('test');
    expect(gsc.getReport).toHaveBeenCalledWith('https://example.com/', 90);
  });

  it('retries transient API errors before succeeding', async () => {
    ga4.getReport.mockRejectedValueOnce(new HttpError('busy', 503));
    const res = await scheduler.syncGA4('test');
    expect(res.success).toBe(true);
    expect(ga4.getReport).toHaveBeenCalledTimes(2);
  });

  it('records permanent failures without retrying', async () => {
    ga4.getReport.mockRejectedValue(new HttpError('GA4 Data API error (HTTP 403): denied', 403));
    const res = await scheduler.syncGA4('test');
    expect(res.success).toBe(false);
    expect(ga4.getReport).toHaveBeenCalledTimes(1);
    const data = await store.read();
    expect(data.sourcesHealth.ga4.status).toBe('error');
    expect(data.sourcesHealth.ga4.lastError).toContain('403');
  });

  it('treats disconnected Google sources as skipped, not failed', async () => {
    connected = false;
    await store.patch({ settings: { competitors: ['Acme'] } });
    const res = await scheduler.syncAll('test');
    expect(res.ga4.skipped).toBe(true);
    expect(res.gsc.skipped).toBe(true);
    expect(res.research.success).toBe(true);
    expect(res.status).toBe('success');
    expect(ga4.getReport).not.toHaveBeenCalled();
  });

  it('reports "error" when every attempted source fails and "partial" when some do', async () => {
    ga4.getReport.mockRejectedValue(new HttpError('denied', 403));
    gsc.getReport.mockRejectedValue(new HttpError('denied', 403));
    research.scanCompetitors.mockRejectedValue(new HttpError('blocked', 403));
    expect((await scheduler.syncAll('all fail')).status).toBe('error');

    gsc.getReport.mockResolvedValue(gscReport(1));
    const partial = await scheduler.syncAll('some fail');
    expect(partial.status).toBe('partial');
    const log = (await store.read()).syncHistory[0];
    expect(log).toMatchObject({ source: 'all', status: 'partial' });
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('shares an in-progress full sync with overlapping callers', async () => {
    const [a, b] = await Promise.all([scheduler.syncAll('a'), scheduler.syncAll('b')]);
    expect(a).toBe(b);
    expect(ga4.getReport).toHaveBeenCalledTimes(1);
  });

  it('only runs the startup sync when asked to', async () => {
    vi.useFakeTimers();
    try {
      const spy = vi.spyOn(scheduler, 'syncAll').mockResolvedValue({} as any);
      await scheduler.start();
      vi.advanceTimersByTime(5000);
      expect(spy).not.toHaveBeenCalled();

      await scheduler.start({ runStartupSync: true });
      vi.advanceTimersByTime(5000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      scheduler.stop();
      vi.useRealTimers();
    }
  });
});
