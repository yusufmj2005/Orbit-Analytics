import React, { useState, useEffect } from 'react';
import {
  Globe2,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  TrendingUp,
  Users,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Monitor,
  Tablet,
  Calendar,
  Lock
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
import { GA4ReportData, GSCReportData, AppDataSchema } from '../vite-env';
import { formatNumber, formatPercent, formatDuration, formatRelativeTime } from '../utils/formatters';

interface WebsitePageProps {
  data: AppDataSchema;
  ga4Data: GA4ReportData | null;
  gscData: GSCReportData | null;
  onOpenSettings: () => void;
  onRefreshGA4: () => Promise<void>;
  onRefreshGSC: () => Promise<void>;
  onLoadSample: () => void;
}

export const WebsitePage: React.FC<WebsitePageProps> = ({
  data,
  ga4Data,
  gscData,
  onOpenSettings,
  onRefreshGA4,
  onRefreshGSC,
  onLoadSample
}) => {
  const [activeTab, setActiveTab] = useState<'ga4' | 'gsc'>('ga4');
  const [dateRange, setDateRange] = useState<number>(30);
  const [busyGA4, setBusyGA4] = useState(false);
  const [busyGSC, setBusyGSC] = useState(false);
  const [propertiesList, setPropertiesList] = useState<{ id: string; displayName: string; account: string }[]>([]);
  const [sitesList, setSitesList] = useState<{ siteUrl: string; permissionLevel: string }[]>([]);

  const isGoogleConnected = data.sourcesHealth.ga4.connected || data.sourcesHealth.gsc.connected;

  useEffect(() => {
    if (isGoogleConnected) {
      window.orbit.ga4ListProperties().then(setPropertiesList).catch(() => {});
      window.orbit.gscListSites().then(setSitesList).catch(() => {});
    }
  }, [isGoogleConnected]);

  const handleRefreshGA4 = async () => {
    setBusyGA4(true);
    try {
      await onRefreshGA4();
    } finally {
      setBusyGA4(false);
    }
  };

  const handleRefreshGSC = async () => {
    setBusyGSC(true);
    try {
      await onRefreshGSC();
    } finally {
      setBusyGSC(false);
    }
  };

  return (
    <div className="website-page">
      {/* Page Title */}
      <div className="page-intro">
        <div>
          <div className="eyebrow">DIGITAL PERFORMANCE</div>
          <h1>
            Website & Search <span>Analytics.</span>
          </h1>
          <p>
            Direct reporting from Google Analytics 4 Data API and Google Search Console Search Analytics.
          </p>
        </div>

        <div className="tab-switchers">
          <button
            className={`tab-btn ${activeTab === 'ga4' ? 'active' : ''}`}
            onClick={() => setActiveTab('ga4')}
          >
            <Globe2 size={15} />
            <span>Google Analytics 4</span>
            {ga4Data && <span className="tab-active-dot" />}
          </button>
          <button
            className={`tab-btn ${activeTab === 'gsc' ? 'active' : ''}`}
            onClick={() => setActiveTab('gsc')}
          >
            <Search size={15} />
            <span>Search Console</span>
            {gscData && <span className="tab-active-dot" />}
          </button>
        </div>
      </div>

      {/* GA4 TAB */}
      {activeTab === 'ga4' && (
        <div className="tab-content">
          {/* Controls Bar */}
          <div className="integration-controls-bar">
            <div className="control-group">
              <label>Property:</label>
              {propertiesList.length > 0 ? (
                <select
                  className="settings-input"
                  value={data.settings.selectedGa4PropertyId || ''}
                  onChange={(e) => {
                    window.orbit.write({
                      ...data,
                      settings: { ...data.settings, selectedGa4PropertyId: e.target.value }
                    });
                  }}
                >
                  {propertiesList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} ({p.id})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="info-text">
                  {ga4Data?.propertyId ? `Property ID: ${ga4Data.propertyId}` : 'No property selected'}
                </span>
              )}
            </div>

            <div className="control-group">
              <label>Period:</label>
              <select
                className="settings-input"
                value={dateRange}
                onChange={(e) => setDateRange(Number(e.target.value))}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>

            <div className="action-group">
              <button
                className="outline-button"
                onClick={handleRefreshGA4}
                disabled={busyGA4 || !isGoogleConnected}
              >
                <RefreshCw size={14} className={busyGA4 ? 'spin' : ''} />
                <span>{busyGA4 ? 'Fetching GA4...' : 'Refresh GA4'}</span>
              </button>
              <button className="settings-button" onClick={onOpenSettings}>
                Configure OAuth
              </button>
            </div>
          </div>

          {ga4Data ? (
            <>
              {/* GA4 KPI Cards */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Active Users</span>
                    <Users size={16} />
                  </div>
                  <div className="metric-value">{ga4Data.overview.activeUsers.toLocaleString()}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Total: {ga4Data.overview.totalUsers.toLocaleString()} users</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Sessions</span>
                    <Globe2 size={16} />
                  </div>
                  <div className="metric-value">{ga4Data.overview.sessions.toLocaleString()}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Pageviews: {formatNumber(ga4Data.overview.screenPageViews)}</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Engagement Rate</span>
                    <TrendingUp size={16} />
                  </div>
                  <div className="metric-value">{formatPercent(ga4Data.overview.engagementRate)}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Avg Duration: {formatDuration(ga4Data.overview.averageSessionDuration)}</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Conversions</span>
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="metric-value">{ga4Data.overview.conversions.toLocaleString()}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Key event actions</span>
                  </div>
                </div>
              </div>

              {/* GA4 Daily Trend Chart */}
              <section className="panel chart-panel" style={{ marginBottom: '20px' }}>
                <div className="panel-head">
                  <div>
                    <h3>Traffic Trends ({ga4Data.dateRange})</h3>
                    <p>Daily sessions, active users, and screen pageviews.</p>
                  </div>
                  <span className="subtle-pill">
                    Synced: {formatRelativeTime(ga4Data.fetchedAt)}
                  </span>
                </div>

                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ga4Data.dailyTrends} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#242638" strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#171827', border: '1px solid #32344b', borderRadius: 8, color: '#f4f3ff' }}
                      />
                      <Area type="monotone" dataKey="sessions" stroke="#a78bfa" strokeWidth={2} fill="url(#sessGrad)" name="Sessions" />
                      <Area type="monotone" dataKey="activeUsers" stroke="#38bdf8" strokeWidth={1.8} fill="url(#userGrad)" name="Active Users" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Channels & Landing Pages Breakdown */}
              <div className="two-col">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Acquisition Channels</h3>
                      <p>Top traffic sources driving user sessions.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Channel Group</th>
                          <th>Sessions</th>
                          <th>Active Users</th>
                          <th>Engagement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ga4Data.channels.map((ch, idx) => (
                          <tr key={idx}>
                            <td className="record-name">{ch.channel}</td>
                            <td>{ch.sessions.toLocaleString()}</td>
                            <td>{ch.activeUsers.toLocaleString()}</td>
                            <td>{formatPercent(ch.engagementRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Top Landing Pages</h3>
                      <p>Most frequented entry URLs.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Page Path</th>
                          <th>Views</th>
                          <th>Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ga4Data.landingPages.map((lp, idx) => (
                          <tr key={idx}>
                            <td className="record-name" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {lp.pagePath}
                            </td>
                            <td>{lp.screenPageViews.toLocaleString()}</td>
                            <td>{lp.sessions.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state large-empty-state">
              <div className="empty-icon">
                <Globe2 size={32} />
              </div>
              <h3>Google Analytics 4 Not Connected</h3>
              <p>
                Connect your Google account in Settings to pull real session trends, user cohorts, conversion rates, and acquisition channels directly from the Google Analytics Data API.
              </p>
              <div className="empty-actions">
                <button className="primary-button" onClick={onOpenSettings}>
                  <Lock size={14} /> Connect Google Account
                </button>
                <button className="outline-button" onClick={onLoadSample}>
                  Preview Sample GA4 Data
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GSC TAB */}
      {activeTab === 'gsc' && (
        <div className="tab-content">
          {/* Controls Bar */}
          <div className="integration-controls-bar">
            <div className="control-group">
              <label>Property / Site:</label>
              {sitesList.length > 0 ? (
                <select
                  className="settings-input"
                  value={data.settings.selectedGscSiteUrl || ''}
                  onChange={(e) => {
                    window.orbit.write({
                      ...data,
                      settings: { ...data.settings, selectedGscSiteUrl: e.target.value }
                    });
                  }}
                >
                  {sitesList.map((s) => (
                    <option key={s.siteUrl} value={s.siteUrl}>
                      {s.siteUrl}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="info-text">
                  {gscData?.siteUrl ? gscData.siteUrl : 'No verified site selected'}
                </span>
              )}
            </div>

            <div className="control-group">
              <label>Period:</label>
              <select
                className="settings-input"
                value={dateRange}
                onChange={(e) => setDateRange(Number(e.target.value))}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>

            <div className="action-group">
              <button
                className="outline-button"
                onClick={handleRefreshGSC}
                disabled={busyGSC || !isGoogleConnected}
              >
                <RefreshCw size={14} className={busyGSC ? 'spin' : ''} />
                <span>{busyGSC ? 'Fetching GSC...' : 'Refresh Search Console'}</span>
              </button>
              <button className="settings-button" onClick={onOpenSettings}>
                Configure OAuth
              </button>
            </div>
          </div>

          {gscData ? (
            <>
              {/* GSC KPI Cards */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Search Clicks</span>
                    <TrendingUp size={16} />
                  </div>
                  <div className="metric-value">{gscData.overview.clicks.toLocaleString()}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Organic traffic to verified URLs</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Search Impressions</span>
                    <Eye size={16} />
                  </div>
                  <div className="metric-value">{gscData.overview.impressions.toLocaleString()}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Appeared in Google Search</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Average CTR</span>
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="metric-value">{formatPercent(gscData.overview.ctr)}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Clicks per search view</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Average SERP Position</span>
                    <Globe2 size={16} />
                  </div>
                  <div className="metric-value">#{gscData.overview.position.toFixed(1)}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Organic search ranking rank</span>
                  </div>
                </div>
              </div>

              {/* GSC Trend Chart */}
              <section className="panel chart-panel" style={{ marginBottom: '20px' }}>
                <div className="panel-head">
                  <div>
                    <h3>Search Visibility Trend ({gscData.dateRange})</h3>
                    <p>Daily Google Search clicks and search impression volume.</p>
                  </div>
                  <span className="subtle-pill">
                    Synced: {formatRelativeTime(gscData.fetchedAt)}
                  </span>
                </div>

                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={gscData.dailyTrends} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c084fc" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#c084fc" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#242638" strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#171827', border: '1px solid #32344b', borderRadius: 8, color: '#f4f3ff' }}
                      />
                      <Area type="monotone" dataKey="clicks" stroke="#c084fc" strokeWidth={2} fill="url(#clicksGrad)" name="Clicks" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Queries & Pages Tables */}
              <div className="two-col">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Top Search Queries</h3>
                      <p>Search keywords driving highest organic impressions.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Search Query</th>
                          <th>Clicks</th>
                          <th>Impr.</th>
                          <th>CTR</th>
                          <th>Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gscData.topQueries.map((q, idx) => (
                          <tr key={idx}>
                            <td className="record-name">{q.query}</td>
                            <td>{q.clicks.toLocaleString()}</td>
                            <td>{formatNumber(q.impressions)}</td>
                            <td>{formatPercent(q.ctr)}</td>
                            <td>#{q.position}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Top Performing Pages</h3>
                      <p>Indexed landing URLs receiving search traffic.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Page URL</th>
                          <th>Clicks</th>
                          <th>Impr.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gscData.topPages.map((p, idx) => (
                          <tr key={idx}>
                            <td className="record-name" style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.page}
                            </td>
                            <td>{p.clicks.toLocaleString()}</td>
                            <td>{formatNumber(p.impressions)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state large-empty-state">
              <div className="empty-icon">
                <Search size={32} />
              </div>
              <h3>Google Search Console Not Connected</h3>
              <p>
                Connect your Google account to view search clicks, impression volume, average SERP ranking position, and the top keywords driving traffic to your domain.
              </p>
              <div className="empty-actions">
                <button className="primary-button" onClick={onOpenSettings}>
                  <Lock size={14} /> Connect Google Account
                </button>
                <button className="outline-button" onClick={onLoadSample}>
                  Preview Sample Search Console Data
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

