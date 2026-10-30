export type RecordKind = 'revenue' | 'expense' | 'lead';

export interface BusinessRecord {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  amount: number;
  kind: RecordKind;
  category?: string;
  notes?: string;
  isSample?: boolean;
}

export interface ResearchArticle {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet?: string;
  category?: 'company' | 'competitor' | 'technology' | 'industry' | 'general';
  query?: string;
}

export interface GA4OverviewMetrics {
  activeUsers: number;
  totalUsers: number;
  sessions: number;
  screenPageViews: number;
  engagementRate: number; // 0 to 1
  averageSessionDuration: number; // in seconds
  conversions: number; // GA4 "keyEvents" (formerly conversions)
}

export interface GA4TrendPoint {
  date: string; // YYYY-MM-DD
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
}

export interface GA4ChannelRow {
  channel: string;
  sessions: number;
  activeUsers: number;
  engagementRate: number;
}

export interface GA4LandingPageRow {
  pagePath: string;
  screenPageViews: number;
  sessions: number;
  activeUsers: number;
}

export interface GA4ReportData {
  propertyId: string;
  propertyName?: string;
  days?: number;
  dateRange: string;
  fetchedAt: string;
  overview: GA4OverviewMetrics;
  dailyTrends: GA4TrendPoint[];
  channels: GA4ChannelRow[];
  landingPages: GA4LandingPageRow[];
}

export interface GSCOverviewMetrics {
  clicks: number;
  impressions: number;
  ctr: number; // 0 to 1
  position: number;
}

export interface GSCTrendPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCReportData {
  siteUrl: string;
  days?: number;
  dateRange: string;
  fetchedAt: string;
  overview: GSCOverviewMetrics;
  dailyTrends: GSCTrendPoint[];
  topQueries: GSCQueryRow[];
  topPages: GSCPageRow[];
  deviceBreakdown?: { device: string; clicks: number; impressions: number }[];
  countryBreakdown?: { country: string; clicks: number; impressions: number }[];
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  source: 'ga4' | 'gsc' | 'research' | 'all';
  status: 'success' | 'partial' | 'error';
  message: string;
  durationMs: number;
  details?: Record<string, any>;
}

export interface SourceHealth {
  connected: boolean;
  lastSync: string | null;
  lastError: string | null;
  syncInProgress: boolean;
  status: 'idle' | 'syncing' | 'error' | 'disconnected';
}

export interface AppSettings {
  refreshMinutes: number; // 0 = manual only
  syncOnStartup: boolean;
  competitors: string[];
  aiModel: string;
  selectedGa4PropertyId?: string;
  selectedGscSiteUrl?: string;
  reportDays: number; // 7, 30 or 90: period used for GA4 / Search Console reports
  theme: 'dark';
}

export interface AppDataSchema {
  version: number;
  settings: AppSettings;
  businessRecords: BusinessRecord[];
  searchHistory: string[];
  savedSearches: { id: string; query: string; category?: string }[];
  lastResearchResults: ResearchArticle[];
  ga4Cache: GA4ReportData | null;
  gscCache: GSCReportData | null;
  syncHistory: SyncLogEntry[];
  sourcesHealth: {
    ga4: SourceHealth;
    gsc: SourceHealth;
    research: SourceHealth;
    ai: SourceHealth;
  };
  lastRefresh: string | null;
}


// Fields the renderer is allowed to change. Everything else (caches, sync history,
// source health) is owned by the main process and never overwritten from the UI.
export interface DataPatch {
  businessRecords?: BusinessRecord[];
  settings?: Partial<AppSettings>;
  savedSearches?: AppDataSchema['savedSearches'];
  searchHistory?: string[];
}

export type SyncSource = 'ga4' | 'gsc' | 'research';

export interface SyncResult {
  success: boolean;
  message: string;
  skipped?: boolean; // source not configured (e.g. Google not connected): not counted as a failure
}

export interface SyncAllResult {
  status: 'success' | 'partial' | 'error';
  ga4: SyncResult;
  gsc: SyncResult;
  research: SyncResult;
}

export interface AIAnalysisResponse {
  answer: string;
  modelUsed: string;
  timestamp: string;
  sourcesCited: string[];
  dataSourcesIncluded: string[];
}
