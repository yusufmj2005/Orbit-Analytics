import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Check, X } from 'lucide-react';
import { AppDataSchema, BusinessRecord, GA4ReportData, GSCReportData, ResearchArticle } from './vite-env';
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

const emptyInitialData: AppDataSchema = {
  version: 2,
  settings: {
    refreshMinutes: 30,
    syncOnStartup: true,
    competitors: ['Microsoft', 'Adobe', 'Datadog', 'Mixpanel'],
    aiModel: 'gpt-4o-mini',
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

export default function App() {
  const [page, setPage] = useState<string>('overview');
  const [data, setData] = useState<AppDataSchema>(emptyInitialData);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSampleMode, setIsSampleMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Sample data states for visual inspection without overwriting real store
  const [sampleGa4, setSampleGa4] = useState<GA4ReportData | null>(null);
  const [sampleGsc, setSampleGsc] = useState<GSCReportData | null>(null);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // Persist data updates to disk
  const persistData = useCallback(async (next: AppDataSchema) => {
    setData(next);
    await window.orbit.write(next);
  }, []);

  // Functional updater helper
  const updateData = useCallback(
    async (updater: (prev: AppDataSchema) => AppDataSchema) => {
      setData((prev) => {
        const next = updater(prev);
        window.orbit.write(next).catch((err) => console.error('[App] Write failed:', err));
        return next;
      });
    },
    []
  );

  // Initial Load
  useEffect(() => {
    window.orbit
      .read()
      .then((loaded) => {
        setData(loaded);
        // If loaded records contain sample items, turn on sample mode toggle
        if (loaded.businessRecords.some((r) => r.isSample)) {
          setIsSampleMode(true);
        }
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[App] Failed to load data:', err);
        setIsReady(true);
      });
  }, []);

  // Toggle Demo / Sample Mode
  const handleToggleSampleMode = async () => {
    if (isSampleMode) {
      // Clear sample data
      setSampleGa4(null);
      setSampleGsc(null);
      const cleanedRecords = data.businessRecords.filter((r) => !r.isSample);
      await persistData({
        ...data,
        businessRecords: cleanedRecords
      });
      setIsSampleMode(false);
      showToast('Sample demonstration data cleared.');
    } else {
      // Load sample data
      setSampleGa4(SAMPLE_GA4_REPORT);
      setSampleGsc(SAMPLE_GSC_REPORT);
      const existingIds = new Set(data.businessRecords.map((r) => r.id));
      const newSamples = SAMPLE_BUSINESS_RECORDS.filter((r) => !existingIds.has(r.id));
      await persistData({
        ...data,
        businessRecords: [...newSamples, ...data.businessRecords]
      });
      setIsSampleMode(true);
      showToast('Sample demonstration data active. Marked as sample preview.');
    }
  };

  // Sync All
  const handleRefreshAll = async () => {
    setIsSyncing(true);
    try {
      const res = await window.orbit.syncNow('all');
      const refreshed = await window.orbit.read();
      setData(refreshed);
      showToast('All data sources synchronized successfully.');
    } catch (err: any) {
      showToast(`Synchronization error: ${err?.message || 'Check network connection'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync Individual Source
  const handleSyncSource = async (source: 'ga4' | 'gsc' | 'research' | 'all') => {
    setIsSyncing(true);
    try {
      await window.orbit.syncNow(source);
      const refreshed = await window.orbit.read();
      setData(refreshed);
      showToast(`Source [${source.toUpperCase()}] synchronized.`);
    } catch (err: any) {
      showToast(`Sync error: ${err?.message || 'Failed'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // GA4 Manual Refresh
  const handleRefreshGA4 = async () => {
    const propId = data.settings.selectedGa4PropertyId || data.ga4Cache?.propertyId;
    if (!propId) {
      throw new Error('Please select an authorized GA4 property in Settings first.');
    }
    const report = await window.orbit.ga4GetReport(propId, 30);
    setData((prev) => ({
      ...prev,
      ga4Cache: report,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, lastSync: new Date().toISOString(), lastError: null }
      }
    }));
    showToast('Google Analytics 4 report refreshed.');
  };

  // GSC Manual Refresh
  const handleRefreshGSC = async () => {
    const siteUrl = data.settings.selectedGscSiteUrl || data.gscCache?.siteUrl;
    if (!siteUrl) {
      throw new Error('Please select a verified Search Console property first.');
    }
    const report = await window.orbit.gscGetReport(siteUrl, 30);
    setData((prev) => ({
      ...prev,
      gscCache: report,
      sourcesHealth: {
        ...prev.sourcesHealth,
        gsc: { ...prev.sourcesHealth.gsc, lastSync: new Date().toISOString(), lastError: null }
      }
    }));
    showToast('Google Search Console report refreshed.');
  };

  // Public Research Search
  const handlePerformSearch = async (q: string, category?: any) => {
    const results = await window.orbit.publicResearch(q, category);
    const refreshed = await window.orbit.read();
    setData(refreshed);
    return results;
  };

  // Scan Watchlist
  const handleScanWatchlist = async () => {
    setIsSyncing(true);
    try {
      await window.orbit.scanCompetitors();
      const refreshed = await window.orbit.read();
      setData(refreshed);
      showToast(`Retrieved latest headlines for ${data.settings.competitors.length} competitors.`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Update Records
  const handleUpdateRecords = async (records: BusinessRecord[]) => {
    await persistData({
      ...data,
      businessRecords: records
    });
  };

  // Export Backup
  const handleExportBackup = async () => {
    const jsonStr = await window.orbit.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Database backup exported.');
  };

  // Import Backup
  const handleImportBackup = async (jsonStr: string) => {
    const res = await window.orbit.importBackup(jsonStr);
    if (res.success) {
      const refreshed = await window.orbit.read();
      setData(refreshed);
      showToast(`Backup restored! ${res.count} records loaded.`);
    }
    return res;
  };

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
  const activeGa4 = isSampleMode ? sampleGa4 || data.ga4Cache || SAMPLE_GA4_REPORT : data.ga4Cache;
  const activeGsc = isSampleMode ? sampleGsc || data.gscCache || SAMPLE_GSC_REPORT : data.gscCache;

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
        data={data}
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
          {toastMessage && (
            <div className="toast">
              <Check size={15} />
              <span>{toastMessage}</span>
              <button onClick={() => setToastMessage('')}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Sample Mode Banner */}
          {isSampleMode && <SampleBanner onClear={handleToggleSampleMode} />}

          {/* Page Routing */}
          {page === 'overview' && (
            <OverviewPage
              data={data}
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
              onOpenSettings={() => setShowSettings(true)}
              onRefreshGA4={handleRefreshGA4}
              onRefreshGSC={handleRefreshGSC}
              onLoadSample={handleToggleSampleMode}
            />
          )}

          {page === 'business' && (
            <BusinessPage data={data} onUpdateRecords={handleUpdateRecords} />
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
            <InsightsPage data={data} onOpenSettings={() => setShowSettings(true)} />
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
          onClose={() => setShowSettings(false)}
          onUpdateData={updateData}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onClearSampleData={() => {
            handleToggleSampleMode();
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
