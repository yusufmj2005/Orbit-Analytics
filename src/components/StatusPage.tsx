import React, { useState } from 'react';
import {
  Activity,
  Globe2,
  Search,
  BrainCircuit,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Settings2,
  Filter
} from 'lucide-react';
import { AppDataSchema, SyncLogEntry } from '../vite-env';
import { formatRelativeTime } from '../utils/formatters';

interface StatusPageProps {
  data: AppDataSchema;
  onSyncSource: (source: 'ga4' | 'gsc' | 'research' | 'all') => Promise<void>;
  onOpenSettings: () => void;
  isSyncing: boolean;
}

export const StatusPage: React.FC<StatusPageProps> = ({
  data,
  onSyncSource,
  onOpenSettings,
  isSyncing
}) => {
  const [filterSource, setFilterSource] = useState<string>('all');
  const [syncingSource, setSyncingSource] = useState<string | null>(null);

  const handleSync = async (src: 'ga4' | 'gsc' | 'research' | 'all') => {
    setSyncingSource(src);
    try {
      await onSyncSource(src);
    } finally {
      setSyncingSource(null);
    }
  };

  const logs = data.syncHistory || [];
  const filteredLogs = filterSource === 'all'
    ? logs
    : logs.filter((l) => l.source === filterSource);

  return (
    <div className="status-page">
      {/* Page Title */}
      <div className="page-intro">
        <div>
          <div className="eyebrow">SYSTEM & INTEGRATION HEALTH</div>
          <h1>
            Sync Status & <span>History.</span>
          </h1>
          <p>
            Monitor real-time data connectivity, provider rate limits, and automated background refresh logs.
          </p>
        </div>

        <div className="section-actions">
          <button
            className="primary-button"
            onClick={() => handleSync('all')}
            disabled={isSyncing || syncingSource !== null}
          >
            <RefreshCw size={14} className={isSyncing || syncingSource === 'all' ? 'spin' : ''} />
            <span>Synchronize All Sources</span>
          </button>
        </div>
      </div>

      {/* Health Cards Grid */}
      <div className="integration-health-grid">
        {/* GA4 Health Card */}
        <div className="health-card">
          <div className="health-card-top">
            <div className="source-icon">
              <Globe2 size={18} />
            </div>
            <div>
              <h4>Google Analytics 4</h4>
              <span className={`health-status-badge ${data.sourcesHealth.ga4.connected ? 'online' : 'offline'}`}>
                {data.sourcesHealth.ga4.connected ? 'Authorized' : 'Disconnected'}
              </span>
            </div>
            <button
              className="small-icon"
              title="Sync GA4"
              disabled={!data.sourcesHealth.ga4.connected || syncingSource === 'ga4'}
              onClick={() => handleSync('ga4')}
            >
              <RefreshCw size={13} className={syncingSource === 'ga4' ? 'spin' : ''} />
            </button>
          </div>

          <div className="health-card-details">
            <div className="detail-row">
              <span>Selected Property:</span>
              <strong>{data.settings.selectedGa4PropertyId || data.ga4Cache?.propertyId || 'None'}</strong>
            </div>
            <div className="detail-row">
              <span>Last Successful Sync:</span>
              <strong>{formatRelativeTime(data.sourcesHealth.ga4.lastSync)}</strong>
            </div>
            {data.sourcesHealth.ga4.lastError && (
              <div className="detail-row error">
                <span>Last Error:</span>
                <span className="error-text">{data.sourcesHealth.ga4.lastError}</span>
              </div>
            )}
          </div>
        </div>

        {/* GSC Health Card */}
        <div className="health-card">
          <div className="health-card-top">
            <div className="source-icon">
              <Search size={18} />
            </div>
            <div>
              <h4>Google Search Console</h4>
              <span className={`health-status-badge ${data.sourcesHealth.gsc.connected ? 'online' : 'offline'}`}>
                {data.sourcesHealth.gsc.connected ? 'Authorized' : 'Disconnected'}
              </span>
            </div>
            <button
              className="small-icon"
              title="Sync Search Console"
              disabled={!data.sourcesHealth.gsc.connected || syncingSource === 'gsc'}
              onClick={() => handleSync('gsc')}
            >
              <RefreshCw size={13} className={syncingSource === 'gsc' ? 'spin' : ''} />
            </button>
          </div>

          <div className="health-card-details">
            <div className="detail-row">
              <span>Selected Site:</span>
              <strong>{data.settings.selectedGscSiteUrl || data.gscCache?.siteUrl || 'None'}</strong>
            </div>
            <div className="detail-row">
              <span>Last Successful Sync:</span>
              <strong>{formatRelativeTime(data.sourcesHealth.gsc.lastSync)}</strong>
            </div>
            {data.sourcesHealth.gsc.lastError && (
              <div className="detail-row error">
                <span>Last Error:</span>
                <span className="error-text">{data.sourcesHealth.gsc.lastError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Research RSS Health Card */}
        <div className="health-card">
          <div className="health-card-top">
            <div className="source-icon">
              <Activity size={18} />
            </div>
            <div>
              <h4>Public News RSS Feed</h4>
              <span className="health-status-badge online">Active</span>
            </div>
            <button
              className="small-icon"
              title="Scan Watchlist"
              disabled={syncingSource === 'research'}
              onClick={() => handleSync('research')}
            >
              <RefreshCw size={13} className={syncingSource === 'research' ? 'spin' : ''} />
            </button>
          </div>

          <div className="health-card-details">
            <div className="detail-row">
              <span>Watchlist Targets:</span>
              <strong>{data.settings.competitors.length} companies</strong>
            </div>
            <div className="detail-row">
              <span>Last Watchlist Scan:</span>
              <strong>{formatRelativeTime(data.sourcesHealth.research.lastSync)}</strong>
            </div>
            {data.sourcesHealth.research.lastError && (
              <div className="detail-row error">
                <span>Last Error:</span>
                <span className="error-text">{data.sourcesHealth.research.lastError}</span>
              </div>
            )}
          </div>
        </div>

        {/* OpenAI Health Card */}
        <div className="health-card">
          <div className="health-card-top">
            <div className="source-icon">
              <BrainCircuit size={18} />
            </div>
            <div>
              <h4>OpenAI Analyst API</h4>
              <span className={`health-status-badge ${data.sourcesHealth.ai.connected ? 'online' : 'offline'}`}>
                {data.sourcesHealth.ai.connected ? 'Key Configured' : 'Missing Key'}
              </span>
            </div>
            <button className="small-icon" onClick={onOpenSettings} title="Open Settings">
              <Settings2 size={13} />
            </button>
          </div>

          <div className="health-card-details">
            <div className="detail-row">
              <span>Configured Model:</span>
              <strong>{data.settings.aiModel}</strong>
            </div>
            <div className="detail-row">
              <span>Encryption Vault:</span>
              <strong>Windows DPAPI SafeStorage</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Refresh Settings Summary Panel */}
      <section className="panel" style={{ margin: '24px 0' }}>
        <div className="panel-head">
          <div>
            <h3>Scheduler Configuration</h3>
            <p>Automated periodic updates for all authorized connections.</p>
          </div>
          <button className="outline-button" onClick={onOpenSettings}>
            Adjust Interval <Settings2 size={13} />
          </button>
        </div>
        <div className="scheduler-summary-grid">
          <div className="sched-item">
            <span>Sync Interval:</span>
            <strong>
              {data.settings.refreshMinutes > 0
                ? `Every ${data.settings.refreshMinutes} minutes`
                : 'Manual triggers only'}
            </strong>
          </div>
          <div className="sched-item">
            <span>Sync on App Startup:</span>
            <strong>{data.settings.syncOnStartup ? 'Enabled' : 'Disabled'}</strong>
          </div>
          <div className="sched-item">
            <span>Last System-wide Refresh:</span>
            <strong>{formatRelativeTime(data.lastRefresh)}</strong>
          </div>
        </div>
      </section>

      {/* Sync History Logs Table */}
      <section className="panel records-panel">
        <div className="panel-head">
          <div>
            <h3>Synchronization Logs</h3>
            <p>Historical audit trail of all manual and scheduled background fetches.</p>
          </div>

          {/* Filter by source */}
          <div className="filter-pill-group">
            {['all', 'ga4', 'gsc', 'research'].map((s) => (
              <button
                key={s}
                className={`filter-pill ${filterSource === s ? 'active' : ''}`}
                onClick={() => setFilterSource(s)}
              >
                {s === 'all' ? 'All Sources' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Message / Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.timestamp).toLocaleTimeString()} ({formatRelativeTime(log.timestamp)})</td>
                    <td>
                      <span className="category-pill">{log.source.toUpperCase()}</span>
                    </td>
                    <td>
                      <span className={`status-badge-inline ${log.status}`}>
                        {log.status === 'success' && <CheckCircle2 size={12} />}
                        {log.status === 'partial' && <AlertTriangle size={12} />}
                        {log.status === 'error' && <XCircle size={12} />}
                        <span>{log.status}</span>
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {log.durationMs > 0 ? `${log.durationMs}ms` : '< 1ms'}
                    </td>
                    <td className="record-notes">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Clock size={24} />
            </div>
            <h3>No Sync Logs Recorded</h3>
            <p>Synchronization history will record every background poll and manual refresh.</p>
          </div>
        )}
      </section>
    </div>
  );
};

