import { GoogleOAuthManager } from './google-oauth';
import { GA4ReportData, GA4OverviewMetrics, GA4TrendPoint, GA4ChannelRow, GA4LandingPageRow } from './types';

export interface GA4PropertyInfo {
  id: string; // e.g. "properties/12345678" or "12345678"
  displayName: string;
  account: string;
}

export class GA4Service {
  private oauth: GoogleOAuthManager;

  constructor(oauth: GoogleOAuthManager) {
    this.oauth = oauth;
  }

  public async listProperties(): Promise<GA4PropertyInfo[]> {
    const accessToken = await this.oauth.getValidAccessToken();

    const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[GA4Service] Failed to list account summaries:', err);
      throw new Error(`Google Analytics Admin API error (${response.status}): ${err}`);
    }

    const data: any = await response.json();
    const properties: GA4PropertyInfo[] = [];

    if (Array.isArray(data.accountSummaries)) {
      for (const account of data.accountSummaries) {
        if (Array.isArray(account.propertySummaries)) {
          for (const prop of account.propertySummaries) {
            const rawId = prop.property || '';
            const cleanId = rawId.replace(/^properties\//, '');
            properties.push({
              id: cleanId,
              displayName: prop.displayName || `GA4 Property ${cleanId}`,
              account: account.displayName || 'Google Analytics Account'
            });
          }
        }
      }
    }

    return properties;
  }

  public async getReport(propertyId: string, days = 30): Promise<GA4ReportData> {
    const cleanId = propertyId.replace(/^properties\//, '').trim();
    if (!cleanId) {
      throw new Error('Please specify a valid GA4 Property ID.');
    }

    const accessToken = await this.oauth.getValidAccessToken();
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`;

    // 1. Fetch Overview & Metrics
    const overviewReq = {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'totalUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
        { name: 'userEngagementDuration' },
        { name: 'conversions' }
      ]
    };

    // 2. Fetch Daily Trends
    const trendsReq = {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
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
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'engagementRate' }
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8
    };

    // 4. Fetch Top Landing Pages
    const pagesReq = {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
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
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`GA4 Data API error (${resp.status}): ${text}`);
      }
      return resp.json();
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
      engagementRate: Number(row.metricValues?.[2]?.value) || 0
    }));

    const landingPages: GA4LandingPageRow[] = (pagesData.rows || []).map((row: any) => ({
      pagePath: row.dimensionValues?.[0]?.value || '/',
      screenPageViews: Number(row.metricValues?.[0]?.value) || 0,
      sessions: Number(row.metricValues?.[1]?.value) || 0,
      activeUsers: Number(row.metricValues?.[2]?.value) || 0
    }));

    return {
      propertyId: cleanId,
      dateRange: `Last ${days} days`,
      fetchedAt: new Date().toISOString(),
      overview,
      dailyTrends,
      channels,
      landingPages
    };
  }
}

