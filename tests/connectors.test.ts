import { describe, it, expect, vi, afterEach } from 'vitest';
import { GA4Service } from '../electron/ga4-api';
import { GSCService } from '../electron/gsc-api';
import { ResearchService, decodeEntities } from '../electron/research-api';
import { HttpError } from '../electron/http';

const tokens = { getValidAccessToken: async () => 'token-123' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GA4Service', () => {
  it('requests the average session duration and key events for exactly N days', async () => {
    const bodies: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        if (!body.dimensions) {
          return jsonResponse({
            rows: [{ metricValues: ['10', '12', '20', '50', '0.5', '184.6', '7'].map((value) => ({ value })) }]
          });
        }
        return jsonResponse({ rows: [] });
      })
    );

    const report = await new GA4Service(tokens).getReport('properties/123', 30);
    const overviewReq = bodies.find((b) => !b.dimensions);
    expect(overviewReq.metrics.map((m: any) => m.name)).toEqual([
      'activeUsers', 'totalUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration', 'keyEvents'
    ]);
    expect(overviewReq.dateRanges).toEqual([{ startDate: '29daysAgo', endDate: 'today' }]);
    expect(report.overview.averageSessionDuration).toBe(185);
    expect(report.overview.conversions).toBe(7);
    expect(report.propertyId).toBe('123');
    expect(report.days).toBe(30);
  });

  it('rejects non-numeric property IDs before calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(new GA4Service(tokens).getReport('../../evil', 30)).rejects.toThrow('valid numeric');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('follows pagination when listing properties', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const page2 = url.includes('pageToken=next');
        return jsonResponse({
          accountSummaries: [
            { displayName: 'Acct', propertySummaries: [{ property: page2 ? 'properties/2' : 'properties/1', displayName: 'P' }] }
          ],
          nextPageToken: page2 ? undefined : 'next'
        });
      })
    );
    const props = await new GA4Service(tokens).listProperties();
    expect(props.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('surfaces API errors as HttpError with the API message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'User does not have access' } }, 403)));
    const err = await new GA4Service(tokens).getReport('123', 7).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.message).toContain('User does not have access');
  });
});

describe('GSCService', () => {
  it('computes an impression-weighted average position', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        if (body.dimensions[0] === 'date') {
          return jsonResponse({
            rows: [
              { keys: ['2026-10-01'], clicks: 90, impressions: 900, ctr: 0.1, position: 2 },
              { keys: ['2026-10-02'], clicks: 1, impressions: 100, ctr: 0.01, position: 40 }
            ]
          });
        }
        return jsonResponse({ rows: [] });
      })
    );

    const report = await new GSCService(tokens).getReport('https://example.com/', 7);
    // (2*900 + 40*100) / 1000 = 5.8 (a plain mean of days would say 21)
    expect(report.overview.position).toBe(5.8);
    expect(report.overview.clicks).toBe(91);
    expect(report.overview.ctr).toBeCloseTo(0.091);
    expect(report.days).toBe(7);
  });
});

describe('ResearchService', () => {
  const feed = (items: string) => `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
  const item = (title: string, link: string, pubDate: string, extra = '') =>
    `<item><title>${title}</title><link>${link}</link><pubDate>${pubDate}</pubDate>${extra}</item>`;

  it('decodes entities without double-decoding', () => {
    expect(decodeEntities('AT&amp;T &amp;lt;b&amp;gt; &#8217;')).toBe('AT&T &lt;b&gt; ’');
  });

  it('tolerates invalid dates and skips non-http links', () => {
    const service = new ResearchService();
    const articles = service.parseFeed(
      feed(
        item('Good headline - Reuters', 'https://news.example/a', 'not a date') +
          item('Bad link', 'javascript:alert(1)', 'Mon, 26 Oct 2026 10:00:00 GMT') +
          item('Escaped &lt;b&gt; &amp; more - Wire', 'https://news.example/b', 'Mon, 26 Oct 2026 10:00:00 GMT',
            '<description>&lt;a href="x"&gt;Story&lt;/a&gt;&amp;nbsp;&lt;font&gt;Wire&lt;/font&gt;</description>')
      ),
      'acme'
    );
    expect(articles.map((a) => a.link)).toEqual(['https://news.example/a', 'https://news.example/b']);
    expect(articles[0].source).toBe('Reuters');
    expect(Number.isNaN(new Date(articles[0].pubDate).getTime())).toBe(false);
    expect(articles[1].title).toBe('Escaped <b> & more - Wire');
    expect(articles[1].snippet).toBe('Story Wire');
  });

  it('scans every watchlist entry, not just the first five', async () => {
    const service = new ResearchService();
    const searched: string[] = [];
    vi.spyOn(service, 'search').mockImplementation(async (name: string) => {
      searched.push(name);
      return [{ id: name, title: name, link: `https://x/${name}`, pubDate: new Date().toISOString(), source: 'S' }];
    });
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const results = await service.scanCompetitors(names);
    expect(searched.sort()).toEqual(names);
    expect(results).toHaveLength(7);
  });

  it('fails the scan when every lookup fails instead of reporting zero headlines', async () => {
    const service = new ResearchService();
    vi.spyOn(service, 'search').mockRejectedValue(new Error('offline'));
    await expect(service.scanCompetitors(['a', 'b'])).rejects.toThrow('offline');
  });
});
