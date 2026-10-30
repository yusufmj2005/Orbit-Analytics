import crypto from 'node:crypto';
import { ResearchArticle } from './types';

export class ResearchService {
  private userAgent = 'OrbitAnalytics/0.2.0 (Desktop Intelligence Research; Windows)';

  public async search(
    query: string,
    category?: 'company' | 'competitor' | 'technology' | 'industry' | 'general'
  ): Promise<ResearchArticle[]> {
    const q = query.trim();
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let xml = '';
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/rss+xml, text/xml;q=0.9, */*;q=0.8' },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Google News RSS returned HTTP status ${response.status}`);
      }
      xml = await response.text();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Research request timed out. Please check your internet connection and try again.');
      }
      throw new Error(`Public research lookup failed: ${err.message || 'Network error'}`);
    } finally {
      clearTimeout(timeout);
    }

    const articles: ResearchArticle[] = [];
    const seenLinks = new Set<string>();
    const seenTitles = new Set<string>();

    const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25);

    for (const match of itemMatches) {
      const block = match[1];

      const pick = (tag: string) => {
        const found = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return found
          ? found[1]
              .replace(/<!\[CDATA\[|\]\]>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'")
              .replace(/<[^>]+>/g, '')
              .trim()
          : '';
      };

      const title = pick('title');
      let link = pick('link');
      const pubDate = pick('pubDate');
      let source = pick('source');

      // Extract source if inside title e.g. "Headline - Source Name"
      if (!source && title.includes(' - ')) {
        const parts = title.split(' - ');
        source = parts[parts.length - 1];
      }

      if (!title || !link) continue;

      // Extract description / snippet if available
      const snippet = pick('description').slice(0, 220);

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
        pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: source || 'Public News',
        snippet: snippet || undefined,
        category: category || 'general',
        query: q
      });
    }

    return articles;
  }

  public async scanCompetitors(competitors: string[]): Promise<ResearchArticle[]> {
    if (!Array.isArray(competitors) || competitors.length === 0) {
      return [];
    }

    // Scan up to 5 competitors in parallel, taking top 3 articles each
    const targets = competitors.slice(0, 5);
    const results = await Promise.allSettled(
      targets.map((name) => this.search(name, 'competitor'))
    );

    const merged: ResearchArticle[] = [];
    const seenLinks = new Set<string>();

    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const item of r.value.slice(0, 3)) {
          if (!seenLinks.has(item.link)) {
            seenLinks.add(item.link);
            merged.push(item);
          }
        }
      }
    }

    // Sort by publication date desc
    merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    return merged.slice(0, 20);
  }
}

