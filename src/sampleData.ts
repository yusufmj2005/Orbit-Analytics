import { BusinessRecord, GA4ReportData, GSCReportData } from './vite-env';
import { daysAgoLocal } from './utils/dates';

// Demo data shown only in memory while sample mode is on; never saved or sent to the AI analyst.

export const SAMPLE_GA4_REPORT: GA4ReportData = {
  propertyId: 'sample-98421032',
  propertyName: 'Acme SaaS Web App [SAMPLE DEMO]',
  days: 30,
  dateRange: 'Last 30 days (Sample Preview)',
  fetchedAt: new Date().toISOString(),
  overview: {
    activeUsers: 14820,
    totalUsers: 18450,
    sessions: 29410,
    screenPageViews: 74200,
    engagementRate: 0.642,
    averageSessionDuration: 184, // 3m 4s
    conversions: 842
  },
  dailyTrends: [
    { date: '2026-10-16', activeUsers: 480, sessions: 920, screenPageViews: 2400 },
    { date: '2026-10-17', activeUsers: 510, sessions: 990, screenPageViews: 2550 },
    { date: '2026-10-18', activeUsers: 430, sessions: 810, screenPageViews: 2100 },
    { date: '2026-10-19', activeUsers: 420, sessions: 790, screenPageViews: 1950 },
    { date: '2026-10-20', activeUsers: 560, sessions: 1100, screenPageViews: 2800 },
    { date: '2026-10-21', activeUsers: 610, sessions: 1240, screenPageViews: 3100 },
    { date: '2026-10-22', activeUsers: 590, sessions: 1180, screenPageViews: 2950 },
    { date: '2026-10-23', activeUsers: 640, sessions: 1310, screenPageViews: 3300 },
    { date: '2026-10-24', activeUsers: 680, sessions: 1400, screenPageViews: 3500 },
    { date: '2026-10-25', activeUsers: 490, sessions: 940, screenPageViews: 2350 },
    { date: '2026-10-26', activeUsers: 460, sessions: 880, screenPageViews: 2200 },
    { date: '2026-10-27', activeUsers: 720, sessions: 1490, screenPageViews: 3750 },
    { date: '2026-10-28', activeUsers: 750, sessions: 1540, screenPageViews: 3900 },
    { date: '2026-10-29', activeUsers: 790, sessions: 1620, screenPageViews: 4100 }
  ],
  channels: [
    { channel: 'Organic Search', sessions: 12400, activeUsers: 7200, engagementRate: 0.68 },
    { channel: 'Direct', sessions: 8200, activeUsers: 4100, engagementRate: 0.72 },
    { channel: 'Referral', sessions: 4300, activeUsers: 2200, engagementRate: 0.58 },
    { channel: 'Organic Social', sessions: 2800, activeUsers: 1400, engagementRate: 0.49 },
    { channel: 'Email Campaign', sessions: 1710, activeUsers: 920, engagementRate: 0.81 }
  ],
  landingPages: [
    { pagePath: '/', screenPageViews: 28400, sessions: 14200, activeUsers: 8900 },
    { pagePath: '/pricing', screenPageViews: 12600, sessions: 6100, activeUsers: 4200 },
    { pagePath: '/features/analytics', screenPageViews: 9800, sessions: 3900, activeUsers: 2800 },
    { pagePath: '/blog/b2b-growth-metrics', screenPageViews: 7400, sessions: 2800, activeUsers: 2100 },
    { pagePath: '/docs/quickstart', screenPageViews: 5200, sessions: 1600, activeUsers: 1200 }
  ]
};

export const SAMPLE_GSC_REPORT: GSCReportData = {
  siteUrl: 'https://example-saas-orbit.com [SAMPLE DEMO]',
  days: 30,
  dateRange: 'Last 30 days (Sample Preview)',
  fetchedAt: new Date().toISOString(),
  overview: {
    clicks: 4820,
    impressions: 98400,
    ctr: 0.049, // 4.9%
    position: 12.4
  },
  dailyTrends: [
    { date: '2026-10-16', clicks: 140, impressions: 2900, ctr: 0.048, position: 12.8 },
    { date: '2026-10-17', clicks: 155, impressions: 3100, ctr: 0.05, position: 12.5 },
    { date: '2026-10-18', clicks: 110, impressions: 2400, ctr: 0.045, position: 13.1 },
    { date: '2026-10-19', clicks: 105, impressions: 2350, ctr: 0.044, position: 13.0 },
    { date: '2026-10-20', clicks: 165, impressions: 3400, ctr: 0.048, position: 12.2 },
    { date: '2026-10-21', clicks: 180, impressions: 3700, ctr: 0.048, position: 11.9 },
    { date: '2026-10-22', clicks: 175, impressions: 3600, ctr: 0.048, position: 12.1 },
    { date: '2026-10-23', clicks: 190, impressions: 3900, ctr: 0.048, position: 11.7 },
    { date: '2026-10-24', clicks: 205, impressions: 4100, ctr: 0.05, position: 11.4 },
    { date: '2026-10-25', clicks: 125, impressions: 2700, ctr: 0.046, position: 12.6 },
    { date: '2026-10-26', clicks: 120, impressions: 2600, ctr: 0.046, position: 12.7 },
    { date: '2026-10-27', clicks: 215, impressions: 4300, ctr: 0.05, position: 11.3 },
    { date: '2026-10-28', clicks: 230, impressions: 4600, ctr: 0.05, position: 11.1 },
    { date: '2026-10-29', clicks: 240, impressions: 4800, ctr: 0.05, position: 10.9 }
  ],
  topQueries: [
    { query: 'desktop business intelligence software', clicks: 680, impressions: 9400, ctr: 0.072, position: 3.8 },
    { query: 'offline analytics dashboard windows', clicks: 540, impressions: 8100, ctr: 0.066, position: 4.2 },
    { query: 'privacy focused business metrics', clicks: 490, impressions: 7600, ctr: 0.064, position: 5.1 },
    { query: 'executive desktop kpi app', clicks: 420, impressions: 6800, ctr: 0.061, position: 4.9 },
    { query: 'saas revenue ledger local database', clicks: 360, impressions: 5900, ctr: 0.061, position: 6.2 },
    { query: 'ga4 search console desktop viewer', clicks: 310, impressions: 5100, ctr: 0.06, position: 5.8 }
  ],
  topPages: [
    { page: 'https://example-saas-orbit.com/', clicks: 2100, impressions: 38000, ctr: 0.055, position: 8.4 },
    { page: 'https://example-saas-orbit.com/features/analytics', clicks: 1120, impressions: 21000, ctr: 0.053, position: 9.6 },
    { page: 'https://example-saas-orbit.com/pricing', clicks: 840, impressions: 16500, ctr: 0.051, position: 10.2 },
    { page: 'https://example-saas-orbit.com/blog/b2b-growth-metrics', clicks: 520, impressions: 12400, ctr: 0.042, position: 14.1 }
  ],
  deviceBreakdown: [
    { device: 'DESKTOP', clicks: 3620, impressions: 68000 },
    { device: 'MOBILE', clicks: 1120, impressions: 28400 },
    { device: 'TABLET', clicks: 80, impressions: 2000 }
  ]
};

export const SAMPLE_BUSINESS_RECORDS: BusinessRecord[] = [
  {
    id: 'sample-rec-1',
    date: daysAgoLocal(1),
    label: 'Enterprise Annual License (Apex Corp)',
    kind: 'revenue',
    amount: 14500,
    category: 'Software Subscription',
    notes: 'Signed 1-year contract with 25 seats',
    isSample: true
  },
  {
    id: 'sample-rec-2',
    date: daysAgoLocal(2),
    label: 'AWS Cloud Hosting & Database Infrastructure',
    kind: 'expense',
    amount: 1850,
    category: 'Infrastructure',
    notes: 'Production clusters and storage backups',
    isSample: true
  },
  {
    id: 'sample-rec-3',
    date: daysAgoLocal(3),
    label: 'Mid-Market Monthly SaaS Renewal (FinTech Ltd)',
    kind: 'revenue',
    amount: 2400,
    category: 'Software Subscription',
    notes: 'Monthly recurring revenue',
    isSample: true
  },
  {
    id: 'sample-rec-4',
    date: daysAgoLocal(4),
    label: 'Inbound Demo Request - Series B SaaS Founder',
    kind: 'lead',
    amount: 0,
    category: 'Inbound Sales',
    notes: 'Requested security compliance review',
    isSample: true
  },
  {
    id: 'sample-rec-5',
    date: daysAgoLocal(5),
    label: 'Google Cloud API Quotas & Vertex AI Inference',
    kind: 'expense',
    amount: 620,
    category: 'AI Services',
    notes: 'Monthly model token consumption',
    isSample: true
  },
  {
    id: 'sample-rec-6',
    date: daysAgoLocal(7),
    label: 'Custom Dashboard Implementation Services',
    kind: 'revenue',
    amount: 4800,
    category: 'Professional Services',
    notes: 'Data pipeline configuration package',
    isSample: true
  },
  {
    id: 'sample-rec-7',
    date: daysAgoLocal(9),
    label: 'Developer Tooling & GitHub Enterprise Seats',
    kind: 'expense',
    amount: 450,
    category: 'Software Tools',
    notes: 'Team licenses',
    isSample: true
  },
  {
    id: 'sample-rec-8',
    date: daysAgoLocal(11),
    label: 'Inbound Enterprise Lead - Global Logistics Partner',
    kind: 'lead',
    amount: 0,
    category: 'Partner Channel',
    notes: 'Evaluating for EMEA operations',
    isSample: true
  }
];

