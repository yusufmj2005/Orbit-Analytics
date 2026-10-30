import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIService, buildAIContext, extractCitations } from '../electron/ai-api';
import { AppDataSchema } from '../electron/types';

const mockData: AppDataSchema = {
  version: 2,
  settings: {
    refreshMinutes: 30,
    syncOnStartup: true,
    competitors: ['Acme Corp', 'Rival Tech'],
    aiModel: 'gpt-4o-mini',
    reportDays: 30,
    theme: 'dark'
  },
  businessRecords: [
    { id: '1', date: '2026-10-28', label: 'Consulting Fee', amount: 4000, kind: 'revenue' },
    { id: '2', date: '2026-10-29', label: 'AWS Cloud', amount: 800, kind: 'expense' },
    { id: 'old', date: '2025-01-01', label: 'Old Sale', amount: 100, kind: 'revenue' },
    { id: 'demo', date: '2026-10-30', label: 'Demo Revenue', amount: 99999, kind: 'revenue', isSample: true }
  ],
  searchHistory: [],
  savedSearches: [],
  lastResearchResults: [
    {
      id: 'news-1',
      title: 'Acme Corp launches new enterprise BI platform',
      link: 'https://news.example.com/acme',
      pubDate: '2026-10-29T12:00:00Z',
      source: 'TechCrunch'
    }
  ],
  ga4Cache: null, // Disconnected
  gscCache: null, // Disconnected
  syncHistory: [],
  sourcesHealth: {
    ga4: { connected: false, lastSync: null, lastError: null, syncInProgress: false, status: 'disconnected' },
    gsc: { connected: false, lastSync: null, lastError: null, syncInProgress: false, status: 'disconnected' },
    research: { connected: true, lastSync: null, lastError: null, syncInProgress: false, status: 'idle' },
    ai: { connected: true, lastSync: null, lastError: null, syncInProgress: false, status: 'idle' }
  },
  lastRefresh: '2026-10-29T12:00:00Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI Analyst Context Assembly & Citations', () => {
  it('assembles curated context with honest missing-source status and no sample data', () => {
    const { context, dataSourcesIncluded } = buildAIContext(mockData);

    expect(context.businessLedger.totalRevenue).toBe(4100);
    expect(context.businessLedger.totalExpenses).toBe(800);
    expect(context.businessLedger.netIncome).toBe(3300);
    expect(context.businessLedger.recordCount).toBe(3);
    expect(JSON.stringify(context)).not.toContain('Demo Revenue');

    // Most recent records first
    expect(context.businessLedger.recentRecords.map((r) => r.date)).toEqual(['2026-10-29', '2026-10-28', '2025-01-01']);

    expect(context.googleAnalytics4).toBe('NOT_CONNECTED_OR_EMPTY');
    expect(context.googleSearchConsole).toBe('NOT_CONNECTED_OR_EMPTY');
    expect(context.publicResearchSignals[0].source).toBe('TechCrunch');
    expect(dataSourcesIncluded).toContain('Local Business Ledger (3 records)');
  });

  it('parses source citations from analyst output', () => {
    const output = `
### OBSERVATIONS:
- Total recorded revenue is $4,000 against $800 in expenses [Source: Local Ledger].
- Acme Corp recently announced a competing product [Source: Public RSS - TechCrunch].
- Reuters is mentioned here without a citation tag.
`;
    const citations = extractCitations(output);
    expect(citations).toEqual(['Local Business Ledger', 'Public Internet Research']);
    expect(extractCitations('Mentions Reuters only')).toEqual([]);
  });

  it('sends the key only in the auth header, never in the prompt, and falls back from unknown models', async () => {
    let captured: { headers: any; body: any } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        captured = { headers: init.headers, body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'Revenue is up [Source: Local Ledger]' } }] }),
          { status: 200 }
        );
      })
    );

    const service = new AIService({ getSecret: async () => 'sk-secret-key' });
    const res = await service.analyze({ prompt: 'How are we doing?', model: 'gpt-evil' }, mockData);

    expect(res.modelUsed).toBe('gpt-4o-mini');
    expect(res.sourcesCited).toEqual(['Local Business Ledger']);
    expect(captured!.headers.Authorization).toBe('Bearer sk-secret-key');
    const bodyText = JSON.stringify(captured!.body);
    expect(bodyText).not.toContain('sk-secret-key');
    expect(bodyText).not.toContain('Demo Revenue');
    expect(captured!.body.model).toBe('gpt-4o-mini');
  });

  it('refuses to run without a key or a prompt', async () => {
    const noKey = new AIService({ getSecret: async () => null });
    await expect(noKey.analyze({ prompt: 'hi' }, mockData)).rejects.toThrow('not configured');
    await expect(noKey.analyze({ prompt: '   ' }, mockData)).rejects.toThrow('enter a question');
  });

  it('reports OpenAI error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 }))
    );
    const service = new AIService({ getSecret: async () => 'sk-bad' });
    await expect(service.analyze({ prompt: 'hi' }, mockData)).rejects.toThrow('Incorrect API key provided');
  });
});
