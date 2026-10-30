import { GoogleOAuthManager } from './google-oauth';
import { GSCReportData, GSCOverviewMetrics, GSCTrendPoint, GSCQueryRow, GSCPageRow } from './types';

export interface GSCSiteInfo {
  siteUrl: string;
  permissionLevel: string;
}

export class GSCService {
  private oauth: GoogleOAuthManager;

  constructor(oauth: GoogleOAuthManager) {
    this.oauth = oauth;
  }

  public async listSites(): Promise<GSCSiteInfo[]> {
    const accessToken = await this.oauth.getValidAccessToken();

    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[GSCService] Failed to list sites:', err);
      throw new Error(`Google Search Console API error (${response.status}): ${err}`);
    }

    const data: any = await response.json();
    const sites: GSCSiteInfo[] = [];

    if (Array.isArray(data.siteEntry)) {
      for (const entry of data.siteEntry) {
        if (entry.siteUrl) {
          sites.push({
            siteUrl: entry.siteUrl,
            permissionLevel: entry.permissionLevel || 'siteOwner'
          });
        }
      }
    }

    return sites;
  }

  public async getReport(siteUrl: string, days = 30): Promise<GSCReportData> {
    const cleanUrl = siteUrl.trim();
    if (!cleanUrl) {
      throw new Error('Please select or specify a valid Search Console site URL.');
    }

    const accessToken = await this.oauth.getValidAccessToken();
    const encodedSite = encodeURIComponent(cleanUrl);
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

    const endDate = new Date().toISOString().slice(0, 10);
    const startObj = new Date();
    startObj.setDate(startObj.getDate() - days);
    const startDate = startObj.toISOString().slice(0, 10);

    const runQuery = async (body: any) => {
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
        throw new Error(`Search Console API error (${resp.status}): ${text}`);
      }
      return resp.json();
    };

    // 1. Fetch Daily Trends
    const trendsPromise = runQuery({
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit: 100
    });

    // 2. Fetch Top Queries
    const queriesPromise = runQuery({
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 15
    });

    // 3. Fetch Top Pages
    const pagesPromise = runQuery({
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 15
    });

    // 4. Fetch Devices
    const devicesPromise = runQuery({
      startDate,
      endDate,
      dimensions: ['device'],
      rowLimit: 10
    });

    // 5. Fetch Countries
    const countriesPromise = runQuery({
      startDate,
      endDate,
      dimensions: ['country'],
      rowLimit: 10
    });

    const [trendsRes, queriesRes, pagesRes, devicesRes, countriesRes] = await Promise.all([
      trendsPromise,
      queriesPromise,
      pagesPromise,
      devicesPromise.catch(() => ({ rows: [] })),
      countriesPromise.catch(() => ({ rows: [] }))
    ]);

    const dailyTrends: GSCTrendPoint[] = (trendsRes.rows || []).map((row: any) => ({
      date: row.keys?.[0] || '',
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: Math.round((Number(row.position) || 0) * 10) / 10
    }));

    // Calculate aggregated overview metrics
    const totalClicks = dailyTrends.reduce((s, p) => s + p.clicks, 0);
    const totalImpressions = dailyTrends.reduce((s, p) => s + p.impressions, 0);
    const overallCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition = dailyTrends.length > 0
      ? Math.round((dailyTrends.reduce((s, p) => s + p.position, 0) / dailyTrends.length) * 10) / 10
      : 0;

    const overview: GSCOverviewMetrics = {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: Math.min(1, Math.max(0, overallCtr)),
      position: avgPosition
    };

    const topQueries: GSCQueryRow[] = (queriesRes.rows || []).map((row: any) => ({
      query: row.keys?.[0] || '(not provided)',
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: Math.round((Number(row.position) || 0) * 10) / 10
    }));

    const topPages: GSCPageRow[] = (pagesRes.rows || []).map((row: any) => ({
      page: row.keys?.[0] || '/',
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: Math.round((Number(row.position) || 0) * 10) / 10
    }));

    const deviceBreakdown = (devicesRes.rows || []).map((row: any) => ({
      device: (row.keys?.[0] || 'DESKTOP').toUpperCase(),
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0
    }));

    const countryBreakdown = (countriesRes.rows || []).map((row: any) => ({
      country: (row.keys?.[0] || 'Unknown').toUpperCase(),
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0
    }));

    return {
      siteUrl: cleanUrl,
      dateRange: `Last ${days} days (${startDate} to ${endDate})`,
      fetchedAt: new Date().toISOString(),
      overview,
      dailyTrends,
      topQueries,
      topPages,
      deviceBreakdown,
      countryBreakdown
    };
  }
}

