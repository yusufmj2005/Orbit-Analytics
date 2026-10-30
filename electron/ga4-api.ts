import type { TokenProvider } from './google-oauth';
import { GA4ReportData, GA4OverviewMetrics, GA4TrendPoint, GA4ChannelRow, GA4LandingPageRow } from './types';
import { fetchWithTimeout, readApiError } from './http';

export interface GA4PropertyInfo {
  id: string; // numeric property id, e.g. "12345678"
  displayName: string;
  account: string;
}

export function normalizeReportDays(days: unknown): number {
  const n = Math.round(Number(days));
  return Number.isFinite(n) && n >= 1 && n <= 365 ? n : 30;
}

export class GA4Service {
  private oauth: TokenProvider;

  constructor(oauth: TokenProvider) {
    this.oauth = oauth;
  }

  public async listProperties(): Promise<GA4PropertyInfo[]> {
    const accessToken = await this.oauth.getValidAccessToken();
    const properties: GA4PropertyInfo[] = [];
    let pageToken = '';

    // accountSummaries is paginated; follow nextPageToken so large organizations see every property.
    for (let page = 0; page < 50; page++) {
      const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        const err = await readApiError(response, 'Google Analytics Admin API error');
        console.error('[GA4Service] Failed to list account summaries:', err.message);
        throw err;
      }

      const data: any = await response.json();
      for (const account of Array.isArray(data.accountSummaries) ? data.accountSummaries : []) {
        for (const prop of Array.isArray(account.propertySummaries) ? account.propertySummaries : []) {
          const cleanId = String(prop.property || '').replace(/^properties\//, '');
          if (!cleanId) continue;
          properties.push({
            id: cleanId,
            displayName: prop.displayName || `GA4 Property ${cleanId}`,
            account: account.displayName || 'Google Analytics Account'
          });
        }
      }

      pageToken = data.nextPageToken || '';
      if (!pageToken) break;
    }

    return properties;
  }

  public async getReport(propertyId: string, days = 30): Promise<GA4ReportData> {
    const cleanId = String(propertyId || '').replace(/^properties\//, '').trim();
    if (!/^\d+$/.test(cleanId)) {
      throw new Error('Please specify a valid numeric GA4 Property ID.');
    }
    const period = normalizeReportDays(days);

    const accessToken = await this.oauth.getValidAccessToken();
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`;
    // "NdaysAgo" through "today" is inclusive, so N-1 days ago gives exactly N days.
    const dateRanges = [{ startDate: `${period - 1}daysAgo`, endDate: 'today' }];

    // 1. Fetch Overview & Metrics
    const overviewReq = {
      dateRanges,
      metrics: [
        { name: 'activeUsers' },
        { name: 'totalUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
        { name: 'keyEvents' }
      ]
    };

    // 2. Fetch Daily Trends
    const trendsReq = {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' }
      ],
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
    };

    // 3. Fetch Channels Breakdown
    const channelsReq = {
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'engagementRate' }
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8
    };

    // 4. Fetch Top Pages (pagePath + screenPageViews is a known-compatible combination)
    const pagesReq = {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'activeUsers' }
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10
    };

    const runReport = async (body: any) => {
      const resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        throw await readApiError(resp, 'GA4 Data API error');
      }
      return resp.json() as Promise<any>;
    };

    const [overviewData, trendsData, channelsData, pagesData] = await Promise.all([
      runReport(overviewReq),
      runReport(trendsReq),
      runReport(channelsReq),
      runReport(pagesReq)
    ]);

    const overviewRow = overviewData.rows?.[0]?.metricValues || [];
    const overview: GA4OverviewMetrics = {
      activeUsers: Number(overviewRow[0]?.value) || 0,
      totalUsers: Number(overviewRow[1]?.value) || 0,
      sessions: Number(overviewRow[2]?.value) || 0,
      screenPageViews: Number(overviewRow[3]?.value) || 0,
      engagementRate: Math.min(1, Math.max(0, Number(overviewRow[4]?.value) || 0)),
      averageSessionDuration: Math.round(Number(overviewRow[5]?.value) || 0),
      conversions: Number(overviewRow[6]?.value) || 0
    };

    const dailyTrends: GA4TrendPoint[] = (trendsData.rows || []).map((row: any) => {
      const d = row.dimensionValues?.[0]?.value || '';
      // Format YYYYMMDD to YYYY-MM-DD
      const formattedDate = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
      return {
        date: formattedDate,
        activeUsers: Number(row.metricValues?.[0]?.value) || 0,
        sessions: Number(row.metricValues?.[1]?.value) || 0,
        screenPageViews: Number(row.metricValues?.[2]?.value) || 0
      };
    });

    const channels: GA4ChannelRow[] = (channelsData.rows || []).map((row: any) => ({
      channel: row.dimensionValues?.[0]?.value || 'Unassigned',
      sessions: Number(row.metricValues?.[0]?.value) || 0,
      activeUsers: Number(row.metricValues?.[1]?.value) || 0,
      engagementRate: Math.min(1, Math.max(0, Number(row.metricValues?.[2]?.value) || 0))
    }));

    const landingPages: GA4LandingPageRow[] = (pagesData.rows || []).map((row: any) => ({
      pagePath: row.dimensionValues?.[0]?.value || '/',
      screenPageViews: Number(row.metricValues?.[0]?.value) || 0,
      sessions: Number(row.metricValues?.[1]?.value) || 0,
      activeUsers: Number(row.metricValues?.[2]?.value) || 0
    }));

    return {
      propertyId: cleanId,
      days: period,
      dateRange: `Last ${period} days`,
      fetchedAt: new Date().toISOString(),
      overview,
      dailyTrends,
      channels,
      landingPages
    };
  }
}
