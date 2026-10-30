import React, { useState } from 'react';
import {
  Search,
  Globe2,
  RefreshCw,
  ExternalLink,
  Bookmark,
  BookmarkPlus,
  Clock,
  Trash2,
  Briefcase,
  Cpu,
  Layers,
  Sparkles,
  ShieldCheck,
  X
} from 'lucide-react';
import { ResearchArticle, AppDataSchema } from '../vite-env';

interface ResearchPageProps {
  data: AppDataSchema;
  onUpdateData: (updater: (prev: AppDataSchema) => AppDataSchema) => Promise<boolean>;
  onPerformSearch: (query: string, category?: string) => Promise<ResearchArticle[]>;
  onScanWatchlist: () => Promise<void>;
  isScanning: boolean;
}

export const ResearchPage: React.FC<ResearchPageProps> = ({
  data,
  onUpdateData,
  onPerformSearch,
  onScanWatchlist,
  isScanning
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'general' | 'company' | 'competitor' | 'technology' | 'industry'>('general');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  // Results of the last search on this page; null shows the latest stored results (e.g. a
  // watchlist scan that just finished, from here or in the background).
  const [searchResults, setSearchResults] = useState<ResearchArticle[] | null>(null);
  const [newCompetitor, setNewCompetitor] = useState('');
  const articles = searchResults ?? data.lastResearchResults ?? [];

  const competitors = data.settings.competitors || [];
  const searchHistory = data.searchHistory || [];
  const savedSearches = data.savedSearches || [];

  const handleSearch = async (e?: React.FormEvent, customQuery?: string, customCategory?: any) => {
    e?.preventDefault();
    const q = (customQuery !== undefined ? customQuery : query).trim();
    if (!q) return;

    const cat = customCategory !== undefined ? customCategory : category;
    setIsSearching(true);
    setSearchError('');

    try {
      const results = await onPerformSearch(q, cat);
      setSearchResults(results);
    } catch (err: any) {
      setSearchError(err?.message || 'Could not fetch public research feeds.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveSearch = async () => {
    if (!query.trim()) return;
    const exists = savedSearches.some((s) => s.query.toLowerCase() === query.trim().toLowerCase());
    if (exists) return;
    const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`;

    await onUpdateData((prev) => ({
      ...prev,
      savedSearches: [
        { id, query: query.trim(), category },
        ...prev.savedSearches
      ]
    }));
  };

  const handleRemoveSavedSearch = async (id: string) => {
    await onUpdateData((prev) => ({
      ...prev,
      savedSearches: prev.savedSearches.filter((s) => s.id !== id)
    }));
  };

  const handleClearHistory = async () => {
    await onUpdateData((prev) => ({
      ...prev,
      searchHistory: []
    }));
  };

  const handleAddCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCompetitor.trim();
    if (!name || competitors.some((c) => c.toLowerCase() === name.toLowerCase())) return;

    const saved = await onUpdateData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        competitors: [...prev.settings.competitors, name]
      }
    }));
    if (saved) setNewCompetitor('');
  };

  const handleRemoveCompetitor = async (name: string) => {
    await onUpdateData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        competitors: prev.settings.competitors.filter((c) => c !== name)
      }
    }));
  };

  return (
    <div className="research-page">
      {/* Page Title */}
      <div className="page-intro">
        <div>
          <div className="eyebrow">PUBLIC MARKET INTELLIGENCE</div>
          <h1>
            Internet & Competitor <span>Research.</span>
          </h1>
          <p>
            Curated market signals and news coverage powered by authenticated Google News RSS feeds.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={async () => {
            await onScanWatchlist();
            setSearchResults(null);
          }}
          disabled={isScanning || competitors.length === 0}
        >
          <RefreshCw size={14} className={isScanning ? 'spin' : ''} />
          <span>{isScanning ? 'Scanning Watchlist...' : 'Scan All Competitors'}</span>
        </button>
      </div>

      {/* Competitor Watchlist Bar */}
      <div className="watchlist-bar">
        <div className="watchlist-title">
          <Briefcase size={14} />
          <span>Competitor Watchlist:</span>
        </div>
        <div className="watchlist-chips">
          {competitors.map((name) => (
            <span
              key={name}
              className="watch-chip"
              onClick={() => {
                setQuery(name);
                setCategory('competitor');
                handleSearch(undefined, name, 'competitor');
              }}
              title="Click to search competitor"
            >
              <span>{name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveCompetitor(name);
                }}
                title="Remove from watchlist"
              >
                <X size={11} />
              </button>
            </span>
          ))}

          <form onSubmit={handleAddCompetitor} className="quick-add-competitor">
            <input
              type="text"
              placeholder="+ Add competitor"
              value={newCompetitor}
              onChange={(e) => setNewCompetitor(e.target.value)}
            />
          </form>
        </div>
      </div>

      {/* Search Input Box */}
      <form className="research-search-container" onSubmit={(e) => handleSearch(e)}>
        <div className="research-search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search company, competitor, product launch, AI model, or industry trend..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-action-btn"
              title="Save search"
              onClick={handleSaveSearch}
            >
              <BookmarkPlus size={15} />
            </button>
          )}
          <button type="submit" className="primary-button" disabled={isSearching || !query.trim()}>
            {isSearching ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
            <span>Search</span>
          </button>
        </div>

        {/* Facet Filters */}
        <div className="category-facets">
          <button
            type="button"
            className={`facet-pill ${category === 'general' ? 'active' : ''}`}
            onClick={() => setCategory('general')}
          >
            All Signals
          </button>
          <button
            type="button"
            className={`facet-pill ${category === 'competitor' ? 'active' : ''}`}
            onClick={() => setCategory('competitor')}
          >
            <Briefcase size={13} /> Competitors
          </button>
          <button
            type="button"
            className={`facet-pill ${category === 'technology' ? 'active' : ''}`}
            onClick={() => setCategory('technology')}
          >
            <Cpu size={13} /> Technology
          </button>
          <button
            type="button"
            className={`facet-pill ${category === 'industry' ? 'active' : ''}`}
            onClick={() => setCategory('industry')}
          >
            <Layers size={13} /> Industry & Market
          </button>
        </div>
      </form>

      {/* Saved Searches & History */}
      <div className="searches-meta-row">
        {savedSearches.length > 0 && (
          <div className="meta-subgroup">
            <span className="meta-label">
              <Bookmark size={13} /> Saved:
            </span>
            {savedSearches.map((s) => (
              <span
                key={s.id}
                className="saved-search-pill"
                onClick={() => {
                  setQuery(s.query);
                  if (s.category) setCategory(s.category as typeof category);
                  handleSearch(undefined, s.query, s.category);
                }}
              >
                <span>{s.query}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveSavedSearch(s.id);
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {searchHistory.length > 0 && (
          <div className="meta-subgroup" style={{ marginLeft: 'auto' }}>
            <span className="meta-label">
              <Clock size={13} /> Recent:
            </span>
            {searchHistory.slice(0, 4).map((h, i) => (
              <button
                key={i}
                type="button"
                className="history-pill"
                onClick={() => {
                  setQuery(h);
                  handleSearch(undefined, h);
                }}
              >
                {h}
              </button>
            ))}
            <button
              type="button"
              className="text-link"
              style={{ fontSize: '10px', marginLeft: '6px' }}
              onClick={handleClearHistory}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {searchError && <div className="error-box">{searchError}</div>}

      {/* Search Results Articles */}
      <div className="research-results-section">
        <div className="section-heading">
          <div>
            <h3>Retrieved Public Signals</h3>
            <p>
              {articles.length} verified news headlines · Deduplicated across feeds · Legitimate public RSS
            </p>
          </div>
          <span className="subtle-pill">
            <Globe2 size={12} /> Google News RSS
          </span>
        </div>

        {articles.length > 0 ? (
          <div className="research-results">
            {articles.map((item) => (
              <article key={item.id} className="research-item">
                <div className="research-item-top">
                  <span className="source-label">{item.source}</span>
                  <span className="pub-date">{new Date(item.pubDate).toLocaleDateString()}</span>
                </div>
                <h3>{item.title}</h3>
                {item.snippet && <p className="research-snippet">{item.snippet}</p>}
                <div className="research-item-bottom">
                  {item.category && <span className="category-pill">{item.category}</span>}
                  <button
                    className="text-link"
                    onClick={() => window.orbit.openExternal(item.link)}
                  >
                    Read original article <ExternalLink size={12} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !isSearching && (
            <div className="empty-state">
              <div className="empty-icon">
                <Search size={28} />
              </div>
              <h3>Explore Public Signals</h3>
              <p>
                Search a company, competitor, or technology to fetch real-time public headlines and media coverage.
              </p>
            </div>
          )
        )}
      </div>

      {/* Transparency Note */}
      <div className="footer-note">
        <ShieldCheck size={14} />
        <span>
          Orbit queries public Google News RSS endpoints. It does not bypass paywalls, crawl private portals, or claim exhaustive surveillance.
        </span>
      </div>
    </div>
  );
};

