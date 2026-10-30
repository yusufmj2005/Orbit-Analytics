import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  FileText,
  AlertCircle,
  HelpCircle,
  Send
} from 'lucide-react';
import { AppDataSchema, AIAnalysisResponse } from '../vite-env';
import { MarkdownView } from './MarkdownView';

interface InsightsPageProps {
  data: AppDataSchema;
  isSampleMode: boolean;
  onOpenSettings: () => void;
}

export const InsightsPage: React.FC<InsightsPageProps> = ({ data, isSampleMode, onOpenSettings }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(data.settings.aiModel || 'gpt-4o-mini');

  // Follow the default model when it's changed in Settings.
  useEffect(() => {
    setSelectedModel(data.settings.aiModel || 'gpt-4o-mini');
  }, [data.settings.aiModel]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  const hasApiKey = data.sourcesHealth.ai.connected;

  const quickPrompts = [
    {
      label: 'Financial Audit',
      query: 'Summarize my recorded revenue and expenses, highlight net margin, and evaluate cashflow.'
    },
    {
      label: 'Website Traffic Review',
      query: 'How did website traffic perform this month, and which acquisition channels drove the most sessions?'
    },
    {
      label: 'Competitor Intelligence',
      query: 'What are the most significant recent public developments or market headlines for my competitors?'
    },
    {
      label: 'Data Gap Assessment',
      query: 'What information and metrics are missing before I can assess conversion performance accurately?'
    }
  ];

  const handleRunAnalysis = async (customPrompt?: string) => {
    const q = (customPrompt !== undefined ? customPrompt : prompt).trim();
    if (!q || isAnalyzing || !hasApiKey) return;

    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const response = await window.orbit.aiAnalyze(q, selectedModel);
      setAnalysisResult(response);
    } catch (err: any) {
      setAnalysisError(err?.message || 'AI request failed. Please verify your OpenAI key.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="insights-page">
      {/* Page Title */}
      <div className="page-intro">
        <div>
          <div className="eyebrow">EVIDENCE-BASED INTELLIGENCE</div>
          <h1>
            Orbit <span>Analyst.</span>
          </h1>
          <p>
            Rigorous business intelligence driven by actual data inside Orbit. No invented statistics.
          </p>
        </div>

        <div className="model-selector-bar">
          <label>Model:</label>
          <select
            className="settings-input"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="gpt-4o-mini">GPT-4o Mini (Cost-efficient)</option>
            <option value="gpt-4o">GPT-4o (Deep Analysis)</option>
            <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
          </select>
        </div>
      </div>

      {/* Main Layout */}
      <div className="ai-layout">
        {/* Left Column: Query & Analysis */}
        <div className="ai-main-column">
          {/* Prompt Form */}
          <section className="panel ai-input-panel">
            <div className="ai-panel-head">
              <div className="ai-symbol">
                <BrainCircuit size={22} />
              </div>
              <div>
                <h3>Query Orbit Intelligence</h3>
                <p>
                  {hasApiKey
                    ? 'Connected to OpenAI API via OS-encrypted credential storage.'
                    : 'OpenAI API key required to execute natural language queries.'}
                </p>
              </div>
              <span className={`connection-badge ${hasApiKey ? 'connected' : ''}`}>
                <span className="status-dot online" />
                {hasApiKey ? 'Connected' : 'Key Needed'}
              </span>
            </div>

            {/* Quick Templates */}
            <div className="quick-prompts-row">
              <span className="quick-label">Suggested Inquiries:</span>
              <div className="quick-buttons-wrap">
                {quickPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="quick-prompt-chip"
                    disabled={isAnalyzing || !hasApiKey}
                    onClick={() => {
                      setPrompt(item.query);
                      handleRunAnalysis(item.query);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div className="ai-textarea-wrap">
              <textarea
                placeholder="Ask about your financial ledger, website metrics, competitor headlines, or missing conversion data..."
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div className="ai-form-footer">
              <div className="cost-warning-note">
                <ShieldAlert size={13} />
                <span>API token consumption is billed directly to your OpenAI developer account.</span>
              </div>

              <button
                className="primary-button"
                onClick={() => handleRunAnalysis()}
                disabled={isAnalyzing || !prompt.trim() || !hasApiKey}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Analyzing Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Analyze Data</span>
                  </>
                )}
              </button>
            </div>

            {analysisError && <div className="error-box" style={{ marginTop: '14px' }}>{analysisError}</div>}
          </section>

          {/* Analysis Result Output */}
          {analysisResult && (
            <section className="panel ai-result-panel">
              <div className="panel-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} style={{ color: '#c084fc' }} />
                  <h3>Intelligence Briefing</h3>
                </div>
                <span className="subtle-pill">
                  Model: {analysisResult.modelUsed} · {new Date(analysisResult.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {/* Citations Bar */}
              {analysisResult.sourcesCited.length > 0 && (
                <div className="citations-bar">
                  <span className="citations-title">Sources Cited:</span>
                  {analysisResult.sourcesCited.map((src, i) => (
                    <span key={i} className="citation-pill">
                      <ShieldCheck size={11} /> {src}
                    </span>
                  ))}
                </div>
              )}

              <MarkdownView text={analysisResult.answer} />
            </section>
          )}

          {!hasApiKey && !analysisResult && (
            <div className="empty-state">
              <div className="empty-icon">
                <BrainCircuit size={28} />
              </div>
              <h3>AI Analyst Awaiting Configuration</h3>
              <p>
                Provide an OpenAI API key in Settings. Your key will be safely stored using Windows DPAPI encryption and never written in plaintext.
              </p>
              <button className="primary-button" onClick={onOpenSettings}>
                Configure AI Credential <ExternalLink size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Context Inspector */}
        <aside className="ai-sidebar-column">
          <section className="panel context-panel">
            <h3>Context Transmitted to AI</h3>
            <p className="context-desc">
              Ledger totals, your 20 most recent records, cached GA4 / Search Console summaries and up to 8 headlines are sent to OpenAI. Secrets and system directories are never included.
            </p>

            <div className="context-row">
              <span>Business Ledger:</span>
              <strong>{data.businessRecords.length} records</strong>
            </div>
            {isSampleMode && (
              <div className="context-row">
                <span>Sample / demo data:</span>
                <strong>Never sent</strong>
              </div>
            )}
            <div className="context-row">
              <span>Google Analytics 4:</span>
              <strong>{data.ga4Cache ? `${data.ga4Cache.overview.sessions.toLocaleString()} sessions` : data.sourcesHealth.ga4.connected ? 'No data synced' : 'Not Connected'}</strong>
            </div>
            <div className="context-row">
              <span>Search Console:</span>
              <strong>{data.gscCache ? `${data.gscCache.overview.clicks.toLocaleString()} clicks` : data.sourcesHealth.gsc.connected ? 'No data synced' : 'Not Connected'}</strong>
            </div>
            <div className="context-row">
              <span>Research Headlines:</span>
              <strong>{Math.min(data.lastResearchResults.length, 8)} articles</strong>
            </div>
            <div className="context-row">
              <span>Watchlist Competitors:</span>
              <strong>{data.settings.competitors.length} companies</strong>
            </div>

            <div className="context-warning">
              <ShieldCheck size={16} />
              <div>
                <strong>Honest Intelligence Policy:</strong>
                <p>
                  Orbit instructs the model to explicitly identify gaps when data is absent and forbids fabricating metrics or sources.
                </p>
              </div>
            </div>

            <button className="full-link" onClick={onOpenSettings}>
              Manage Data & Keys <ExternalLink size={13} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
};

