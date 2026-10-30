import type { TokenProvider } from './google-oauth';
import { GSCReportData, GSCOverviewMetrics, GSCTrendPoint, GSCQueryRow, GSCPageRow } from './types';
import { fetchWithTimeout, readApiError } from './http';
import { daysAgoLocal, localDateString } from './dates';
import { normalizeReportDays } from './ga4-api';

export interface GSCSiteInfo {
  siteUrl: string;
  permissionLevel: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export class GSCService {
  private oauth: TokenProvider;

  constructor(oauth: TokenProvider) {
    this.oauth = oauth;
  }

  public async listSites(): Promise<GSCSiteInfo[]> {
    const accessToken = await this.oauth.getValidAccessToken();

    const response = await fetchWithTimeout('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const err = await readApiError(response, 'Google Search Console API error');
      console.error('[GSCService] Failed to list sites:', err.message);
      throw err;
    }

    const data: any = await response.json();
    const sites: GSCSiteInfo[] = [];

    if (Array.isArray(data.siteEntry)) {
      for (const entry of data.siteEntry) {
        // Unverified sites can't be queried for search analytics.
        if (entry.siteUrl && entry.permissionLevel !== 'siteUnverifiedUser') {
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
    const cleanUrl = String(siteUrl || '').trim();
    if (!cleanUrl) {
      throw new Error('Please select or specify a valid Search Console site URL.');
    }
    const period = normalizeReportDays(days);

    const accessToken = await this.oauth.getValidAccessToken();
    const encodedSite = encodeURIComponent(cleanUrl);
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

    // Inclusive range of exactly `period` calendar days in the user's timezone.
    const endDate = localDateString();
    const startDate = daysAgoLocal(period - 1);

    const runQuery = async (body: any) => {
      const resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        throw await readApiError(resp, 'Search Console API error');
      }
      return resp.json() as Promise<any>;
    };

    const base = { startDate, endDate };
    const [trendsRes, queriesRes, pagesRes, devicesRes, countriesRes] = await Promise.all([
      runQuery({ ...base, dimensions: ['date'], rowLimit: Math.max(100, period) }),
      runQuery({ ...base, dimensions: ['query'], rowLimit: 15 }),
      runQuery({ ...base, dimensions: ['page'], rowLimit: 15 }),
      runQuery({ ...base, dimensions: ['device'], rowLimit: 10 }).catch(() => ({ rows: [] })),
      runQuery({ ...base, dimensions: ['country'], rowLimit: 10 }).catch(() => ({ rows: [] }))
    ]);

    const dailyTrends: GSCTrendPoint[] = (trendsRes.rows || []).map((row: any) => ({
      date: row.keys?.[0] || '',
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: round1(Number(row.position) || 0)
    }));

    // Aggregate overview metrics. Average position is impression-weighted, matching how
    // Search Console reports it; a plain mean over days over-weights low-traffic days.
    let totalClicks = 0;
    let totalImpressions = 0;
    let weightedPosition = 0;
    for (const row of trendsRes.rows || []) {
      const impressions = Number(row.impressions) || 0;
      totalClicks += Number(row.clicks) || 0;
      totalImpressions += impressions;
      weightedPosition += (Number(row.position) || 0) * impressions;
    }

    const overview: GSCOverviewMetrics = {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? Math.min(1, totalClicks / totalImpressions) : 0,
      position: totalImpressions > 0 ? round1(weightedPosition / totalImpressions) : 0
    };

    const topQueries: GSCQueryRow[] = (queriesRes.rows || []).map((row: any) => ({
      query: row.keys?.[0] || '(not provided)',
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: round1(Number(row.position) || 0)
    }));

    const topPages: GSCPageRow[] = (pagesRes.rows || []).map((row: any) => ({
      page: row.keys?.[0] || '/',
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      ctr: Number(row.ctr) || 0,
      position: round1(Number(row.position) || 0)
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
      days: period,
      dateRange: `Last ${period} days (${startDate} to ${endDate})`,
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
