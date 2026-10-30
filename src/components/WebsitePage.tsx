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
import { GA4ReportData, GSCReportData, AppDataSchema, SyncResult } from '../vite-env';
import { formatNumber, formatPercent, formatDuration, formatRelativeTime } from '../utils/formatters';

interface WebsitePageProps {
  data: AppDataSchema;
  ga4Data: GA4ReportData | null;
  gscData: GSCReportData | null;
  isSampleMode: boolean;
  onOpenSettings: () => void;
  onRefreshGA4: () => Promise<SyncResult>;
  onRefreshGSC: () => Promise<SyncResult>;
  onSelectGa4Property: (propertyId: string) => Promise<void>;
  onSelectGscSite: (siteUrl: string) => Promise<void>;
  onChangeReportDays: (days: number) => Promise<void>;
  onLoadSample: () => void;
}

export const WebsitePage: React.FC<WebsitePageProps> = ({
  data,
  ga4Data,
  gscData,
  isSampleMode,
  onOpenSettings,
  onRefreshGA4,
  onRefreshGSC,
  onSelectGa4Property,
  onSelectGscSite,
  onChangeReportDays,
  onLoadSample
}) => {
  const [activeTab, setActiveTab] = useState<'ga4' | 'gsc'>('ga4');
  const [busyGA4, setBusyGA4] = useState(false);
  const [busyGSC, setBusyGSC] = useState(false);
  const [propertiesList, setPropertiesList] = useState<{ id: string; displayName: string; account: string }[]>([]);
  const [sitesList, setSitesList] = useState<{ siteUrl: string; permissionLevel: string }[]>([]);
  const [listError, setListError] = useState('');

  const isGoogleConnected = data.sourcesHealth.ga4.connected || data.sourcesHealth.gsc.connected;
  const reportDays = data.settings.reportDays || 30;
  const ga4Error = !isSampleMode ? data.sourcesHealth.ga4.lastError : null;
  const gscError = !isSampleMode ? data.sourcesHealth.gsc.lastError : null;

  useEffect(() => {
    if (!isGoogleConnected) {
      setPropertiesList([]);
      setSitesList([]);
      return;
    }
    let active = true;
    setListError('');
    const fail = (err: any) => {
      if (active) setListError(err?.message || 'Could not load your Google properties.');
    };
    window.orbit.ga4ListProperties().then((list) => active && setPropertiesList(list)).catch(fail);
    window.orbit.gscListSites().then((list) => active && setSitesList(list)).catch(fail);
    return () => {
      active = false;
    };
  }, [isGoogleConnected]);

  const runBusy = async (setBusy: (busy: boolean) => void, task: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await task();
    } catch (err) {
      console.error('[WebsitePage] Refresh failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshGA4 = () => runBusy(setBusyGA4, onRefreshGA4);
  const handleRefreshGSC = () => runBusy(setBusyGSC, onRefreshGSC);

  const handleChangeDays = (days: number) =>
    runBusy(
      (busy) => {
        setBusyGA4(busy);
        setBusyGSC(busy);
      },
      () => onChangeReportDays(days)
    );

  const periodSelect = (
    <select
      className="settings-input"
      value={reportDays}
      disabled={busyGA4 || busyGSC}
      onChange={(e) => handleChangeDays(Number(e.target.value))}
    >
      <option value={7}>Last 7 days</option>
      <option value={30}>Last 30 days</option>
      <option value={90}>Last 90 days</option>
    </select>
  );

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
                  disabled={busyGA4}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) runBusy(setBusyGA4, () => onSelectGa4Property(id));
                  }}
                >
                  {!data.settings.selectedGa4PropertyId && <option value="">Select a property...</option>}
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
              {periodSelect}
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

          {listError && <div className="error-box">{listError}</div>}
          {ga4Error && <div className="error-box">Last GA4 sync failed: {ga4Error}</div>}

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
                    <span>Key Events</span>
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="metric-value">{ga4Data.overview.conversions.toLocaleString()}</div>
                  <div className="metric-note">
                    <span className="note-dot online" />
                    <span>Formerly called conversions in GA4</span>
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
                      <h3>Top Pages</h3>
                      <p>Most viewed page paths.</p>
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
              <h3>{isGoogleConnected ? 'No Google Analytics 4 Data Yet' : 'Google Analytics 4 Not Connected'}</h3>
              <p>
                Connect your Google account in Settings to pull real session trends, user cohorts, conversion rates, and acquisition channels directly from the Google Analytics Data API.
              </p>
              <div className="empty-actions">
                <button className="primary-button" onClick={onOpenSettings}>
                  <Lock size={14} /> Connect Google Account
                </button>
                {!isSampleMode && (
                  <button className="outline-button" onClick={onLoadSample}>
                    Preview Sample GA4 Data
                  </button>
                )}
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
                  disabled={busyGSC}
                  onChange={(e) => {
                    const url = e.target.value;
                    if (url) runBusy(setBusyGSC, () => onSelectGscSite(url));
                  }}
                >
                  {!data.settings.selectedGscSiteUrl && <option value="">Select a site...</option>}
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
              {periodSelect}
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

          {listError && <div className="error-box">{listError}</div>}
          {gscError && <div className="error-box">Last Search Console sync failed: {gscError}</div>}

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
              <h3>{isGoogleConnected ? 'No Search Console Data Yet' : 'Google Search Console Not Connected'}</h3>
              <p>
                Connect your Google account to view search clicks, impression volume, average SERP ranking position, and the top keywords driving traffic to your domain.
              </p>
              <div className="empty-actions">
                <button className="primary-button" onClick={onOpenSettings}>
                  <Lock size={14} /> Connect Google Account
                </button>
                {!isSampleMode && (
                  <button className="outline-button" onClick={onLoadSample}>
                    Preview Sample Search Console Data
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

