import crypto from 'node:crypto';
import { ResearchArticle } from './types';
import { HttpError, NetworkError, fetchWithTimeout } from './http';

export type ResearchCategory = 'company' | 'competitor' | 'technology' | 'industry' | 'general';
export const RESEARCH_CATEGORIES: ResearchCategory[] = ['company', 'competitor', 'technology', 'industry', 'general'];

const SCAN_CONCURRENCY = 5;
const ARTICLES_PER_COMPETITOR = 3;

// Decodes XML/HTML entities. &amp; is decoded last so "&amp;lt;" becomes "&lt;", not "<".
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => safeFromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeFromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function toIsoDate(value: string): string {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

export class ResearchService {
  private userAgent = 'OrbitAnalytics/0.1.0 (Desktop Intelligence Research; Windows)';

  public async search(query: string, category?: ResearchCategory): Promise<ResearchArticle[]> {
    const q = String(query || '').trim();
    if (!q) return [];

    // Optional query modifier based on facet
    let fullQuery = q;
    if (category === 'competitor' && !/competitor|rival|market/i.test(q)) {
      fullQuery = `"${q}" (company OR product OR revenue OR funding OR launch)`;
    } else if (category === 'technology' && !/technology|software|ai|platform/i.test(q)) {
      fullQuery = `"${q}" (tech OR software OR updates OR architecture)`;
    } else if (category === 'industry' && !/industry|market|growth/i.test(q)) {
      fullQuery = `"${q}" (industry OR market report OR sector)`;
    }

    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(fullQuery)}&hl=en-US&gl=US&ceid=US:en`;

    let xml = '';
    try {
      const response = await fetchWithTimeout(
        url,
        { headers: { 'User-Agent': this.userAgent, Accept: 'application/rss+xml, text/xml;q=0.9, */*;q=0.8' } },
        10_000
      );
      if (!response.ok) {
        throw new HttpError(`Google News RSS returned HTTP status ${response.status}`, response.status);
      }
      xml = await response.text();
    } catch (err: any) {
      if (err instanceof NetworkError) {
        throw new NetworkError(`Public research lookup failed: ${err.message}`);
      }
      throw err;
    }

    return this.parseFeed(xml, q, category);
  }

  public parseFeed(xml: string, query: string, category?: ResearchCategory): ResearchArticle[] {
    const articles: ResearchArticle[] = [];
    const seenLinks = new Set<string>();
    const seenTitles = new Set<string>();

    const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25);

    for (const match of itemMatches) {
      const block = match[1];

      // XML-decode the element once (CDATA is already raw). Fields that carry HTML (the
      // description) are then stripped of tags and HTML-decoded once more.
      const pick = (tag: string, isHtml = false) => {
        const found = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        if (!found) return '';
        const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(found[1]);
        let text = cdata ? cdata[1] : decodeEntities(found[1]);
        if (isHtml) text = decodeEntities(text.replace(/<[^>]+>/g, ' '));
        return text.replace(/\s+/g, ' ').trim();
      };

      const title = pick('title');
      const link = pick('link');
      const pubDate = pick('pubDate');
      let source = pick('source');

      // Extract source if inside title e.g. "Headline - Source Name"
      if (!source && title.includes(' - ')) {
        const parts = title.split(' - ');
        source = parts[parts.length - 1];
      }

      if (!title || !/^https?:\/\//i.test(link)) continue;

      // Extract description / snippet if available
      const snippet = pick('description', true).slice(0, 220);

      // Deduplication by link and normalized title
      const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenLinks.has(link) || seenTitles.has(normalizedTitle)) {
        continue;
      }
      seenLinks.add(link);
      seenTitles.add(normalizedTitle);

      const id = crypto.createHash('md5').update(link + title).digest('hex').slice(0, 12);

      articles.push({
        id,
        title,
        link,
        pubDate: toIsoDate(pubDate),
        source: source || 'Public News',
        snippet: snippet || undefined,
        category: category || 'general',
        query
      });
    }

    return articles;
  }

  public async scanCompetitors(competitors: string[]): Promise<ResearchArticle[]> {
    if (!Array.isArray(competitors) || competitors.length === 0) {
      return [];
    }

    // Scan every watchlist entry (a few at a time), taking the top articles for each.
    const results: PromiseSettledResult<ResearchArticle[]>[] = [];
    for (let i = 0; i < competitors.length; i += SCAN_CONCURRENCY) {
      const batch = competitors.slice(i, i + SCAN_CONCURRENCY);
      results.push(...(await Promise.allSettled(batch.map((name) => this.search(name, 'competitor')))));
    }

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length === results.length) {
      // Nothing succeeded (e.g. offline): report the failure instead of "0 headlines".
      throw failures[0].reason;
    }

    const merged: ResearchArticle[] = [];
    const seenLinks = new Set<string>();

    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const item of r.value.slice(0, ARTICLES_PER_COMPETITOR)) {
          if (!seenLinks.has(item.link)) {
            seenLinks.add(item.link);
            merged.push(item);
          }
        }
      }
    }

    // Sort by publication date desc
    merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    return merged;
  }
}
