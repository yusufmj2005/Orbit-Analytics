import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, AlertTriangle, Check, X } from 'lucide-react';
import { AppDataSchema, BusinessRecord, ResearchArticle, SyncAllResult, SyncResult } from './vite-env';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SampleBanner } from './components/SampleBanner';
import { OverviewPage } from './components/OverviewPage';
import { WebsitePage } from './components/WebsitePage';
import { BusinessPage } from './components/BusinessPage';
import { ResearchPage } from './components/ResearchPage';
import { InsightsPage } from './components/InsightsPage';
import { StatusPage } from './components/StatusPage';
import { SettingsModal } from './components/SettingsModal';
import { SAMPLE_GA4_REPORT, SAMPLE_GSC_REPORT, SAMPLE_BUSINESS_RECORDS } from './sampleData';
import { buildPatch, isEmptyPatch } from './utils/patch';

const emptyInitialData: AppDataSchema = {
  version: 2,
  settings: {
    refreshMinutes: 30,
    syncOnStartup: true,
    competitors: [],
    aiModel: 'gpt-4o-mini',
    reportDays: 30,
    theme: 'dark'
  },
  businessRecords: [],
  searchHistory: [],
  savedSearches: [],
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

type SyncSourceName = 'ga4' | 'gsc' | 'research';

const SOURCE_LABELS: Record<SyncSourceName, string> = {
  ga4: 'Google Analytics 4',
  gsc: 'Search Console',
  research: 'Watchlist scan'
};

function describeSyncAll(res: SyncAllResult): { message: string; kind: 'success' | 'error' } {
  const entries = (['ga4', 'gsc', 'research'] as const).map((key) => ({ key, result: res[key] }));
  const failed = entries.filter((e) => !e.result.success && !e.result.skipped);
  const skipped = entries.filter((e) => e.result.skipped);
  const skippedNote = skipped.length ? ` Skipped: ${skipped.map((e) => SOURCE_LABELS[e.key]).join(', ')} (not configured).` : '';

  if (failed.length === 0) {
    return { message: `Synchronization complete.${skippedNote}`, kind: 'success' };
  }
  const details = failed.map((e) => `${SOURCE_LABELS[e.key]}: ${e.result.message}`).join(' · ');
  return {
    message: `${res.status === 'error' ? 'Synchronization failed' : 'Synchronization partially failed'}: ${details}${skippedNote}`,
    kind: 'error'
  };
}

export default function App() {
  const [page, setPage] = useState<string>('overview');
  const [data, setData] = useState<AppDataSchema>(emptyInitialData);
  const dataRef = useRef<AppDataSchema>(emptyInitialData);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  // Sample mode is purely an in-memory overlay: demo data is never saved or sent anywhere.
  const [isSampleMode, setIsSampleMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const applyData = useCallback((next: AppDataSchema) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 8000 : 4500);
  }, []);

  const loadData = useCallback(() => {
    setLoadError('');
    let receivedPush = false;
    // The main process pushes every change (background syncs, sign-in, imports), so the UI
    // always reflects what's on disk instead of a stale snapshot.
    const unsubscribe = window.orbit.onDataChanged((next) => {
      receivedPush = true;
      applyData(next);
    });
    window.orbit
      .read()
      .then((loaded) => {
        if (!receivedPush) applyData(loaded);
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[App] Failed to load data:', err);
        setLoadError(err?.message || 'Could not read the local Orbit database.');
      });
    return unsubscribe;
  }, [applyData]);

  useEffect(() => loadData(), [loadData]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Applies a local edit and saves only the changed, renderer-owned fields.
  // Resolves to false (after showing an error) if the change couldn't be saved.
  const updateData = useCallback(
    async (updater: (prev: AppDataSchema) => AppDataSchema): Promise<boolean> => {
      const prev = dataRef.current;
      const next = updater(prev);
      const patch = buildPatch(prev, next);
      if (isEmptyPatch(patch)) return true;

      applyData(next);
      try {
        applyData(await window.orbit.patch(patch));
        return true;
      } catch (err: any) {
        showToast(`Could not save changes: ${err?.message || 'Unknown error'}`, 'error');
        try {
          applyData(await window.orbit.read());
        } catch {
          applyData(prev);
        }
        return false;
      }
    },
    [applyData, showToast]
  );

  // Toggle Demo / Sample Mode
  const handleToggleSampleMode = () => {
    if (isSampleMode) {
      setIsSampleMode(false);
      showToast('Sample demonstration data cleared.');
    } else {
      setIsSampleMode(true);
      showToast('Sample demonstration data shown. It is not saved and is never sent to the AI analyst.');
    }
  };

  const handleClearSampleData = () => {
    if (isSampleMode) handleToggleSampleMode();
  };

  // Sync All
  const handleRefreshAll = async () => {
    setIsSyncing(true);
    try {
      const res = await window.orbit.syncNow('all');
      const { message, kind } = describeSyncAll(res);
      showToast(message, kind);
    } catch (err: any) {
      showToast(`Synchronization error: ${err?.message || 'Check network connection'}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync Individual Source
  const syncSource = async (source: SyncSourceName): Promise<SyncResult> => {
    try {
      const res = await window.orbit.syncNow(source);
      if (res.success) showToast(`${SOURCE_LABELS[source]} synchronized.`);
      else showToast(`${SOURCE_LABELS[source]}: ${res.message}`, 'error');
      return res;
    } catch (err: any) {
      const message = err?.message || 'Failed';
      showToast(`${SOURCE_LABELS[source]} sync error: ${message}`, 'error');
      return { success: false, message };
    }
  };

  const handleSyncSource = async (source: SyncSourceName | 'all') => {
    if (source === 'all') return handleRefreshAll();
    await syncSource(source);
  };

  const handleSelectGa4Property = async (propertyId: string) => {
    if (await updateData((prev) => ({ ...prev, settings: { ...prev.settings, selectedGa4PropertyId: propertyId } }))) {
      await syncSource('ga4');
    }
  };

  const handleSelectGscSite = async (siteUrl: string) => {
    if (await updateData((prev) => ({ ...prev, settings: { ...prev.settings, selectedGscSiteUrl: siteUrl } }))) {
      await syncSource('gsc');
    }
  };

  const handleChangeReportDays = async (days: number) => {
    if (!(await updateData((prev) => ({ ...prev, settings: { ...prev.settings, reportDays: days } })))) return;
    const connected = dataRef.current.sourcesHealth.ga4.connected || dataRef.current.sourcesHealth.gsc.connected;
    if (connected) {
      await Promise.all([syncSource('ga4'), syncSource('gsc')]);
    }
  };

  // Public Research Search (results are also pushed into app data by the main process)
  const handlePerformSearch = (q: string, category?: string): Promise<ResearchArticle[]> =>
    window.orbit.publicResearch(q, category);

  // Scan Watchlist
  const handleScanWatchlist = async () => {
    setIsSyncing(true);
    try {
      const res = await window.orbit.scanCompetitors();
      showToast(res.message, res.success ? 'success' : 'error');
    } catch (err: any) {
      showToast(`Watchlist scan failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Update Records (sample rows are display-only and are filtered out before saving)
  const handleUpdateRecords = (records: BusinessRecord[]) =>
    updateData((prev) => ({ ...prev, businessRecords: records.filter((r) => !r.isSample) }));

  // Export Backup
  const handleExportBackup = async () => {
    try {
      const jsonStr = await window.orbit.exportBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Database backup exported.');
    } catch (err: any) {
      showToast(`Backup export failed: ${err?.message || 'Unknown error'}`, 'error');
    }
  };

  // Import Backup
  const handleImportBackup = async (jsonStr: string) => {
    const res = await window.orbit.importBackup(jsonStr);
    if (res.success) {
      showToast(`Backup restored! ${res.count} new records added.`);
    }
    return res;
  };

  // Ledger view with demo rows overlaid while sample mode is on
  const viewData = useMemo<AppDataSchema>(
    () =>
      isSampleMode
        ? { ...data, businessRecords: [...SAMPLE_BUSINESS_RECORDS, ...data.businessRecords] }
        : data,
    [data, isSampleMode]
  );

  if (loadError) {
    return (
      <div className="loading">
        <div className="orbit-mark">
          <AlertTriangle size={24} />
        </div>
        <span>Orbit could not load its local data: {loadError}</span>
        <button className="primary-button" onClick={() => loadData()}>
          Retry
        </button>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="loading">
        <div className="orbit-mark">
          <Activity size={24} />
        </div>
        <span>Starting Orbit Analytics…</span>
      </div>
    );
  }

  // Active GA4 and GSC datasets (either real cache or sample mode preview)
  const activeGa4 = isSampleMode ? SAMPLE_GA4_REPORT : data.ga4Cache;
  const activeGsc = isSampleMode ? SAMPLE_GSC_REPORT : data.gscCache;

  const pageTitles: Record<string, string> = {
    overview: 'Executive Dashboard',
    website: 'Website & Search Analytics',
    business: 'Business Ledger & Finances',
    research: 'Internet Research & Competitors',
    insights: 'Orbit AI Analyst',
    status: 'Integration Status & Refresh History'
  };

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <Sidebar
        activePage={page}
        onSelectPage={setPage}
        onOpenSettings={() => setShowSettings(true)}
        data={viewData}
        isSampleMode={isSampleMode}
      />

      {/* Main Content Area */}
      <main className="main">
        <TopBar
          pageTitle={pageTitles[page] || 'Dashboard'}
          lastRefresh={data.lastRefresh}
          onRefreshAll={handleRefreshAll}
          isSyncing={isSyncing}
          onOpenSettings={() => setShowSettings(true)}
          isSampleMode={isSampleMode}
          onToggleSampleMode={handleToggleSampleMode}
        />

        <div className="content">
          {/* Toast Notification */}
          {toast && (
            <div className={`toast ${toast.kind === 'error' ? 'error-toast' : ''}`} role="status">
              {toast.kind === 'error' ? <AlertTriangle size={15} /> : <Check size={15} />}
              <span>{toast.message}</span>
              <button onClick={() => setToast(null)} aria-label="Dismiss notification">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Sample Mode Banner */}
          {isSampleMode && <SampleBanner onClear={handleToggleSampleMode} />}

          {/* Page Routing */}
          {page === 'overview' && (
            <OverviewPage
              data={viewData}
              ga4Data={activeGa4}
              gscData={activeGsc}
              onNavigate={setPage}
              onOpenSettings={() => setShowSettings(true)}
              onSyncAll={handleRefreshAll}
              isSyncing={isSyncing}
            />
          )}

          {page === 'website' && (
            <WebsitePage
              data={data}
              ga4Data={activeGa4}
              gscData={activeGsc}
              isSampleMode={isSampleMode}
              onOpenSettings={() => setShowSettings(true)}
              onRefreshGA4={() => syncSource('ga4')}
              onRefreshGSC={() => syncSource('gsc')}
              onSelectGa4Property={handleSelectGa4Property}
              onSelectGscSite={handleSelectGscSite}
              onChangeReportDays={handleChangeReportDays}
              onLoadSample={() => !isSampleMode && handleToggleSampleMode()}
            />
          )}

          {page === 'business' && (
            <BusinessPage data={viewData} onUpdateRecords={handleUpdateRecords} />
          )}

          {page === 'research' && (
            <ResearchPage
              data={data}
              onUpdateData={updateData}
              onPerformSearch={handlePerformSearch}
              onScanWatchlist={handleScanWatchlist}
              isScanning={isSyncing}
            />
          )}

          {page === 'insights' && (
            <InsightsPage data={data} isSampleMode={isSampleMode} onOpenSettings={() => setShowSettings(true)} />
          )}

          {page === 'status' && (
            <StatusPage
              data={data}
              onSyncSource={handleSyncSource}
              onOpenSettings={() => setShowSettings(true)}
              isSyncing={isSyncing}
            />
          )}
        </div>

        {/* Global Desktop Status Bar */}
        <footer className="statusbar">
          <span>
            <span className="status-dot online" />
            <span>Orbit Analytics v0.1.0 · Desktop Edition</span>
          </span>
          <span>
            Storage: Local JSON (Atomic writes) · DPAPI Encryption
          </span>
          <span>
            {isSampleMode ? 'PREVIEW MODE (SAMPLE DATA)' : 'Production Workspace'}
          </span>
        </footer>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          data={data}
          isSampleMode={isSampleMode}
          onClose={() => setShowSettings(false)}
          onUpdateData={updateData}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onClearSampleData={() => {
            handleClearSampleData();
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
