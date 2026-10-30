import { SecureCredentialVault } from './crypto';
import { AppDataSchema } from './types';

export interface AIAnalysisRequest {
  prompt: string;
  model?: string;
}

export interface AIAnalysisResponse {
  answer: string;
  modelUsed: string;
  timestamp: string;
  sourcesCited: string[];
  dataSourcesIncluded: string[];
}

export class AIService {
  private vault: SecureCredentialVault;

  constructor(vault: SecureCredentialVault) {
    this.vault = vault;
  }

  public async analyze(
    request: AIAnalysisRequest,
    currentData: AppDataSchema
  ): Promise<AIAnalysisResponse> {
    const prompt = request.prompt?.trim();
    if (!prompt) {
      throw new Error('Please enter a question or prompt for the Orbit Analyst.');
    }

    const apiKey = await this.vault.getSecret('openai_api_key');
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is not configured. Please open Settings & Connections to save your key securely.'
      );
    }

    const selectedModel = request.model || currentData.settings.aiModel || 'gpt-4o-mini';

    // Build strictly curated context
    const dataSourcesIncluded: string[] = [];

    // 1. Business ledger metrics
    const records = currentData.businessRecords || [];
    const revenueRecords = records.filter((r) => r.kind === 'revenue');
    const expenseRecords = records.filter((r) => r.kind === 'expense');
    const leadRecords = records.filter((r) => r.kind === 'lead');

    const totalRevenue = revenueRecords.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenseRecords.reduce((s, r) => s + r.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    const ledgerContext = {
      recordCount: records.length,
      totalRevenue,
      totalExpenses,
      netIncome,
      totalLeads: leadRecords.length,
      recentRecords: records.slice(0, 20).map((r) => ({
        date: r.date,
        type: r.kind,
        label: r.label,
        amount: r.amount,
        category: r.category
      }))
    };
    dataSourcesIncluded.push(`Local Business Ledger (${records.length} records)`);

    // 2. GA4 Context (if available)
    let ga4Context: any = null;
    if (currentData.ga4Cache) {
      ga4Context = {
        propertyId: currentData.ga4Cache.propertyId,
        dateRange: currentData.ga4Cache.dateRange,
        fetchedAt: currentData.ga4Cache.fetchedAt,
        overview: currentData.ga4Cache.overview,
        topChannels: currentData.ga4Cache.channels.slice(0, 5),
        topLandingPages: currentData.ga4Cache.landingPages.slice(0, 5)
      };
      dataSourcesIncluded.push(`Google Analytics 4 (Property: ${currentData.ga4Cache.propertyId})`);
    }

    // 3. Search Console Context (if available)
    let gscContext: any = null;
    if (currentData.gscCache) {
      gscContext = {
        siteUrl: currentData.gscCache.siteUrl,
        dateRange: currentData.gscCache.dateRange,
        fetchedAt: currentData.gscCache.fetchedAt,
        overview: currentData.gscCache.overview,
        topQueries: currentData.gscCache.topQueries.slice(0, 8),
        topPages: currentData.gscCache.topPages.slice(0, 5)
      };
      dataSourcesIncluded.push(`Google Search Console (${currentData.gscCache.siteUrl})`);
    }

    // 4. Public Research Headlines
    const researchContext = (currentData.lastResearchResults || []).slice(0, 8).map((a) => ({
      title: a.title,
      source: a.source,
      published: a.pubDate,
      query: a.query
    }));
    if (researchContext.length > 0) {
      dataSourcesIncluded.push(`Public Internet Research (${researchContext.length} headlines)`);
    }

    const systemPrompt = `You are Orbit Analytics, a senior business intelligence analyst embedded in a desktop application.
Your mission is to provide rigorous, honest, evidence-based business insights strictly derived from the provided context data.

RULES:
1. ONLY make assertions directly supported by the context data.
2. If data is absent or an integration is not connected (e.g. GA4 or GSC not connected), explicitly declare: "This cannot be determined because [integration] is not connected."
3. Distinguish between:
   - "OBSERVATIONS": Direct facts, numbers, and dates from the data.
   - "ANALYSIS / INTERPRETATION": What the pattern indicates.
   - "RECOMMENDATIONS / NEXT STEPS": Actionable advice for the business.
4. Always cite data sources (e.g., "[Source: Local Ledger]", "[Source: Google Analytics 4]", "[Source: Public RSS - Reuters]").
5. NEVER fabricate metrics, conversion rates, traffic numbers, competitor actions, or external URLs.
6. Local ledger records are manually recorded by the user; note that they represent recorded transactions rather than automated ERP syncs unless specified.
7. Format your response cleanly using GitHub-style Markdown with clear headings and bullet points.`;

    const userContent = JSON.stringify({
      question: prompt,
      contextGeneratedAt: new Date().toISOString(),
      businessLedger: ledgerContext,
      googleAnalytics4: ga4Context || 'NOT_CONNECTED_OR_EMPTY',
      googleSearchConsole: gscContext || 'NOT_CONNECTED_OR_EMPTY',
      publicResearchSignals: researchContext
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze the following business intelligence data to answer: "${prompt}"\n\nCONTEXT:\n${userContent}` }
        ],
        temperature: 0.2,
        max_tokens: 1200
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      let msg = `OpenAI API error (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          msg = parsed.error.message;
        }
      } catch {}
      throw new Error(`AI Analysis failed: ${msg}`);
    }

    const result: any = await response.json();
    const answer = result.choices?.[0]?.message?.content || 'No response generated by AI model.';

    // Extract sources cited
    const sourcesCited: string[] = [];
    if (/\[Source:\s*(Local\s*Ledger|Business\s*Ledger)\]/i.test(answer)) sourcesCited.push('Local Business Ledger');
    if (/\[Source:\s*Google\s*Analytics(\s*4)?\]/i.test(answer)) sourcesCited.push('Google Analytics 4');
    if (/\[Source:\s*(Google\s*)?Search\s*Console\]/i.test(answer)) sourcesCited.push('Google Search Console');
    if (/\[Source:\s*Public/i.test(answer) || /TechCrunch|Reuters|Bloomberg/i.test(answer)) {
      sourcesCited.push('Public Internet Research');
    }

    return {
      answer,
      modelUsed: selectedModel,
      timestamp: new Date().toISOString(),
      sourcesCited,
      dataSourcesIncluded
    };
  }
}
