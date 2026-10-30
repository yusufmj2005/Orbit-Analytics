/// <reference types="vite/client" />

// Data types are shared with the Electron main process so the two sides can't drift apart.
export * from '../electron/types';

import type {
  AIAnalysisResponse,
  AppDataSchema,
  DataPatch,
  ResearchArticle,
  SyncAllResult,
  SyncResult
} from '../electron/types';

export interface OrbitBridge {
  read: () => Promise<AppDataSchema>;
  patch: (patch: DataPatch) => Promise<AppDataSchema>;
  onDataChanged: (callback: (data: AppDataSchema) => void) => () => void;

  storeSecret: (key: 'openai_api_key', value: string) => Promise<{ ok: boolean }>;
  hasSecret: (key: 'openai_api_key' | 'google_client_id') => Promise<boolean>;
  deleteSecret: (key: 'openai_api_key') => Promise<{ ok: boolean }>;

  googleAuth: (clientId?: string, clientSecret?: string) => Promise<{ success: boolean; email?: string }>;
  googleDisconnect: () => Promise<{ ok: boolean }>;
  googleStatus: () => Promise<{ connected: boolean; email: string | null; hasClientId: boolean }>;

  ga4ListProperties: () => Promise<{ id: string; displayName: string; account: string }[]>;
  gscListSites: () => Promise<{ siteUrl: string; permissionLevel: string }[]>;

  publicResearch: (query: string, category?: string) => Promise<ResearchArticle[]>;
  scanCompetitors: () => Promise<SyncResult>;

  aiAnalyze: (prompt: string, model?: string) => Promise<AIAnalysisResponse>;

  syncNow(source: 'ga4' | 'gsc' | 'research'): Promise<SyncResult>;
  syncNow(source?: 'all'): Promise<SyncAllResult>;

  exportBackup: () => Promise<string>;
  importBackup: (jsonString: string) => Promise<{ success: boolean; count: number; error?: string }>;

  openExternal: (url: string) => Promise<boolean>;
}

declare global {
  interface Window {
    orbit: OrbitBridge;
  }
}
