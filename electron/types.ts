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
  conversions: number;
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

