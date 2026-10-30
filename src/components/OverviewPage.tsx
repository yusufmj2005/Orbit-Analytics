import React, { useMemo } from 'react';
import {
  Sparkles,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  Globe2,
  Search,
  BrainCircuit,
  Link2,
  ExternalLink,
  ShieldCheck,
  Plus,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { AppDataSchema, GA4ReportData, GSCReportData } from '../vite-env';
import { formatCurrency, formatNumber, formatRelativeTime } from '../utils/formatters';
import { calculateLedgerMetrics, getRevenueExpensesTrend } from '../utils/calculations';

interface OverviewPageProps {
  data: AppDataSchema;
  ga4Data: GA4ReportData | null;
  gscData: GSCReportData | null;
  onNavigate: (page: string) => void;
  onOpenSettings: () => void;
  onSyncAll: () => void;
  isSyncing: boolean;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  data,
  ga4Data,
  gscData,
  onNavigate,
  onOpenSettings,
  onSyncAll,
  isSyncing
}) => {
  const ledgerMetrics = useMemo(() => calculateLedgerMetrics(data.businessRecords), [data.businessRecords]);
  const financialTrend = useMemo(() => getRevenueExpensesTrend(data.businessRecords, 14), [data.businessRecords]);

  const hasRecords = data.businessRecords.length > 0;
  const hasGA4 = Boolean(ga4Data);
  const hasGSC = Boolean(gscData);
  const hasResearch = data.lastResearchResults.length > 0;

  return (
    <div className="overview-page">
      {/* Intro Header */}
      <div className="page-intro">
        <div>
          <div className="eyebrow">EXECUTIVE INTELLIGENCE DASHBOARD</div>
          <h1>
            Your business, <span>in Orbit.</span>
          </h1>
          <p>Unified signals across authorized metrics, local records, and public research.</p>
        </div>
        <div className="intro-actions">
          <button className="primary-button" onClick={onSyncAll} disabled={isSyncing}>
            <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
            <span>{isSyncing ? 'Synchronizing...' : 'Refresh Overview'}</span>
          </button>
        </div>
      </div>

      {/* Hero Welcome Panel */}
      <div className="welcome-panel">
        <div className="welcome-copy">
          <div className="welcome-kicker">
            <Sparkles size={14} /> YOUR INTELLIGENCE CENTER
          </div>
          <h2>Signals made clear.</h2>
          <p>
            Orbit aggregates private financial records, Google Analytics 4 traffic, Search Console signals, and public competitor intelligence into one local desktop application.
          </p>
          <div className="welcome-buttons">
            <button className="primary-button" onClick={() => onNavigate('business')}>
              <Plus size={14} /> Add Business Record
            </button>
            <button className="outline-button" onClick={onOpenSettings}>
              Configure Integrations <ExternalLink size={13} />
            </button>
          </div>
        </div>

        <div className="welcome-art">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-core">
            <Activity size={32} />
          </div>
          <div className="art-node node-one" />
          <div className="art-node node-two" />
          <div className="art-node node-three" />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="section-heading">
        <div>
          <h3>Executive Snapshot</h3>
          <p>Verified figures directly derived from connected or recorded data.</p>
        </div>
        <span className="subtle-pill">
          <ShieldCheck size={13} /> Verified Source Status
        </span>
      </div>

      <div className="metrics-grid">
        {/* Recorded Revenue */}
        <div className="metric-card">
          <div className="metric-top">
            <span>Recorded Revenue</span>
            <div className="metric-icon">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="metric-value">{formatCurrency(ledgerMetrics.revenue)}</div>
          <div className="metric-note">
            <span className="note-dot" />
            <span>{hasRecords ? `${data.businessRecords.filter(r => r.kind === 'revenue').length} entries recorded` : 'Local ledger'}</span>
          </div>
        </div>

        {/* Recorded Expenses */}
        <div className="metric-card">
          <div className="metric-top">
            <span>Recorded Expenses</span>
            <div className="metric-icon">
              <ArrowDownRight size={16} />
            </div>
          </div>
          <div className="metric-value">{formatCurrency(ledgerMetrics.expenses)}</div>
          <div className="metric-note">
            <span className="note-dot" />
            <span>{hasRecords ? `${data.businessRecords.filter(r => r.kind === 'expense').length} entries recorded` : 'Local ledger'}</span>
          </div>
        </div>

        {/* Net Income */}
        <div className="metric-card">
          <div className="metric-top">
            <span>Net Recorded Income</span>
            <div className="metric-icon">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className={`metric-value ${ledgerMetrics.netIncome < 0 ? 'text-danger' : ''}`}>
            {formatCurrency(ledgerMetrics.netIncome)}
          </div>
          <div className="metric-note">
            <span className="note-dot" />
            <span>Profit Margin: {ledgerMetrics.profitMargin.toFixed(1)}%</span>
          </div>
        </div>

        {/* GA4 Sessions or Connection Prompt */}
        <div className="metric-card" onClick={() => onNavigate('website')} style={{ cursor: 'pointer' }}>
          <div className="metric-top">
            <span>Website Sessions (30d)</span>
            <div className="metric-icon">
              <Globe2 size={16} />
            </div>
          </div>
          <div className="metric-value">
            {hasGA4 ? formatNumber(ga4Data!.overview.sessions) : 'Not Connected'}
          </div>
          <div className="metric-note">
            <span className={`note-dot ${hasGA4 ? 'online' : ''}`} />
            <span>{hasGA4 ? `GA4: ${ga4Data!.overview.activeUsers.toLocaleString()} active users` : 'Configure in Settings'}</span>
          </div>
        </div>

        {/* GSC Clicks or Connection Prompt */}
        <div className="metric-card" onClick={() => onNavigate('website')} style={{ cursor: 'pointer' }}>
          <div className="metric-top">
            <span>Search Clicks (30d)</span>
            <div className="metric-icon">
              <Search size={16} />
            </div>
          </div>
          <div className="metric-value">
            {hasGSC ? formatNumber(gscData!.overview.clicks) : 'Not Connected'}
          </div>
          <div className="metric-note">
            <span className={`note-dot ${hasGSC ? 'online' : ''}`} />
            <span>{hasGSC ? `GSC: ${formatNumber(gscData!.overview.impressions)} impressions` : 'Configure in Settings'}</span>
          </div>
        </div>

        {/* Connected Services */}
        <div className="metric-card" onClick={() => onNavigate('status')} style={{ cursor: 'pointer' }}>
          <div className="metric-top">
            <span>Connected Integrations</span>
            <div className="metric-icon">
              <Link2 size={16} />
            </div>
          </div>
          <div className="metric-value">
            {(data.sourcesHealth.ga4.connected ? 1 : 0) +
              (data.sourcesHealth.gsc.connected ? 1 : 0) +
              (data.sourcesHealth.ai.connected ? 1 : 0) +
              1}{' '}
            / 4
          </div>
          <div className="metric-note">
            <span className="note-dot online" />
            <span>Click to inspect sync status</span>
          </div>
        </div>
      </div>

      {/* Visual Analytics Panels */}
      <div className="two-col">
        {/* Left: Financial Ledger Activity */}
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>Financial Activity (Last 14 Days)</h3>
              <p>Daily breakdown of recorded revenue and expenses.</p>
            </div>
            <button className="outline-button" onClick={() => onNavigate('business')}>
              View Ledger <ExternalLink size={12} />
            </button>
          </div>

          {hasRecords ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financialTrend} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#242638" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="displayDate" tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#171827', border: '1px solid #32344b', borderRadius: 8, color: '#f4f3ff' }}
                    formatter={(v: any, name: any) => [
                      formatCurrency(Number(v)),
                      name === 'revenue' ? 'Revenue' : 'Expenses'
                    ]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#a78bfa" strokeWidth={2} fill="url(#revGrad)" />
                  <Area type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={1.8} fill="url(#expGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <BarChart3 size={24} />
              </div>
              <h3>No Financial Records Entered</h3>
              <p>Add your first business transaction to populate revenue and expense visual charts.</p>
              <button className="primary-button" onClick={() => onNavigate('business')}>
                <Plus size={14} /> Add Transaction
              </button>
            </div>
          )}
        </section>

        {/* Right: Integration Health & Signals Glance */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Data Source Connections</h3>
              <p>Live status and synchronization timestamps.</p>
            </div>
            <button className="small-icon" onClick={onOpenSettings} title="Settings">
              <Plus size={15} />
            </button>
          </div>

          <div className="source-list">
            <div className="source-row" onClick={() => onNavigate('website')} style={{ cursor: 'pointer' }}>
              <div className="source-icon">
                <Globe2 size={16} />
              </div>
              <div className="source-copy">
                <strong>Google Analytics 4</strong>
                <small>
                  {hasGA4 ? `Property: ${ga4Data!.propertyId} · Synced ${formatRelativeTime(ga4Data!.fetchedAt)}` : 'Not connected'}
                </small>
              </div>
              <span className={`source-status ${hasGA4 ? 'text-success' : ''}`}>
                {hasGA4 ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            <div className="source-row" onClick={() => onNavigate('website')} style={{ cursor: 'pointer' }}>
              <div className="source-icon">
                <Search size={16} />
              </div>
              <div className="source-copy">
                <strong>Google Search Console</strong>
                <small>
                  {hasGSC ? `${gscData!.siteUrl} · Synced ${formatRelativeTime(gscData!.fetchedAt)}` : 'Not connected'}
                </small>
              </div>
              <span className={`source-status ${hasGSC ? 'text-success' : ''}`}>
                {hasGSC ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            <div className="source-row" onClick={() => onNavigate('business')} style={{ cursor: 'pointer' }}>
              <div className="source-icon">
                <Activity size={16} />
              </div>
              <div className="source-copy">
                <strong>Local Business Ledger</strong>
                <small>{data.businessRecords.length} records saved on this PC</small>
              </div>
              <span className="source-status text-success">Active</span>
            </div>

            <div className="source-row" onClick={() => onNavigate('research')} style={{ cursor: 'pointer' }}>
              <div className="source-icon">
                <Search size={16} />
              </div>
              <div className="source-copy">
                <strong>Public Research Feed</strong>
                <small>Google News RSS · {data.settings.competitors.length} watchlist targets</small>
              </div>
              <span className="source-status text-success">Ready</span>
            </div>

            <div className="source-row" onClick={() => onNavigate('insights')} style={{ cursor: 'pointer' }}>
              <div className="source-icon">
                <BrainCircuit size={16} />
              </div>
              <div className="source-copy">
                <strong>AI Analyst (OpenAI)</strong>
                <small>{data.sourcesHealth.ai.connected ? `Model: ${data.settings.aiModel}` : 'API key needed'}</small>
              </div>
              <span className={`source-status ${data.sourcesHealth.ai.connected ? 'text-success' : ''}`}>
                {data.sourcesHealth.ai.connected ? 'Configured' : 'Not Configured'}
              </span>
            </div>
          </div>

          <button className="full-link" onClick={() => onNavigate('status')}>
            View Detailed Sync History & Controls <ExternalLink size={13} />
          </button>
        </section>
      </div>

      {/* Recent Competitor Signals Glance */}
      {hasResearch && (
        <section className="panel" style={{ marginTop: '20px' }}>
          <div className="panel-head">
            <div>
              <h3>Recent Public Market Signals</h3>
              <p>Top headlines retrieved from public news feeds.</p>
            </div>
            <button className="outline-button" onClick={() => onNavigate('research')}>
              View All Headlines <ExternalLink size={12} />
            </button>
          </div>
          <div className="overview-headlines-grid">
            {data.lastResearchResults.slice(0, 3).map((article) => (
              <div key={article.id} className="headline-mini-card">
                <div className="headline-source">{article.source}</div>
                <h4>{article.title}</h4>
                <div className="headline-footer">
                  <span>{new Date(article.pubDate).toLocaleDateString()}</span>
                  <button
                    className="text-link"
                    onClick={() => window.orbit.openExternal(article.link)}
                  >
                    Read article <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

