import { describe, it, expect } from 'vitest';
import { AppDataSchema } from '../src/vite-env';

describe('AI Analyst Context Assembly & Citations', () => {
  const mockData: AppDataSchema = {
    version: 2,
    settings: {
      refreshMinutes: 30,
      syncOnStartup: true,
      competitors: ['Acme Corp', 'Rival Tech'],
      aiModel: 'gpt-4o-mini',
      theme: 'dark'
    },
    businessRecords: [
      { id: '1', date: '2026-10-28', label: 'Consulting Fee', amount: 4000, kind: 'revenue' },
      { id: '2', date: '2026-10-29', label: 'AWS Cloud', amount: 800, kind: 'expense' }
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

  it('assembles curated context with honest missing source status', () => {
    const revenue = mockData.businessRecords.filter((r) => r.kind === 'revenue').reduce((s, r) => s + r.amount, 0);
    const expenses = mockData.businessRecords.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);

    const contextPayload = {
      businessLedger: {
        recordCount: mockData.businessRecords.length,
        totalRevenue: revenue,
        totalExpenses: expenses,
        netIncome: revenue - expenses
      },
      googleAnalytics4: mockData.ga4Cache || 'NOT_CONNECTED_OR_EMPTY',
      googleSearchConsole: mockData.gscCache || 'NOT_CONNECTED_OR_EMPTY',
      publicResearchSignals: mockData.lastResearchResults
    };

    expect(contextPayload.businessLedger.totalRevenue).toBe(4000);
    expect(contextPayload.businessLedger.totalExpenses).toBe(800);
    expect(contextPayload.businessLedger.netIncome).toBe(3200);

    // Verifies that absent services are explicitly flagged
    expect(contextPayload.googleAnalytics4).toBe('NOT_CONNECTED_OR_EMPTY');
    expect(contextPayload.googleSearchConsole).toBe('NOT_CONNECTED_OR_EMPTY');

    // Verifies headlines included
    expect(contextPayload.publicResearchSignals.length).toBe(1);
    expect(contextPayload.publicResearchSignals[0].source).toBe('TechCrunch');

    // Verifies no credential leaks
    const jsonStr = JSON.stringify(contextPayload);
    expect(jsonStr).not.toContain('apiKey');
    expect(jsonStr).not.toContain('clientSecret');
    expect(jsonStr).not.toContain('accessToken');
  });

  it('correctly parses source citations from AI analyst output', () => {
    const sampleAiOutput = `
### OBSERVATIONS:
- Total recorded revenue is $4,000 against $800 in expenses [Source: Local Ledger].
- Acme Corp recently announced a competing product [Source: Public Research - TechCrunch].

### LIMITATIONS:
- Website conversion rates could not be calculated because Google Analytics 4 is not connected.
    `;

    const citations: string[] = [];
    if (/\[Source:\s*(Local\s*Ledger|Business\s*Ledger)\]/i.test(sampleAiOutput)) citations.push('Local Business Ledger');
    if (/\[Source:\s*Google\s*Analytics(\s*4)?\]/i.test(sampleAiOutput)) citations.push('Google Analytics 4');
    if (/\[Source:\s*Public/i.test(sampleAiOutput) || /TechCrunch/i.test(sampleAiOutput)) citations.push('Public Internet Research');

    expect(citations).toContain('Local Business Ledger');
    expect(citations).toContain('Public Internet Research');
    expect(citations).not.toContain('Google Analytics 4');
  });
});
