import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('orbit', {
  read: () => ipcRenderer.invoke('orbit:read'),
  write: (data: unknown) => ipcRenderer.invoke('orbit:write', data),
  storeSecret: (key: string, value: string) => ipcRenderer.invoke('orbit:store-secret', key, value),
  hasSecret: (key: string) => ipcRenderer.invoke('orbit:has-secret', key),
  deleteSecret: (key: string) => ipcRenderer.invoke('orbit:delete-secret', key),
  getSecret: (key: string) => ipcRenderer.invoke('orbit:get-secret', key),

  // Google OAuth
  googleAuth: (clientId?: string, clientSecret?: string) =>
    ipcRenderer.invoke('orbit:google-auth', clientId, clientSecret),
  googleDisconnect: () => ipcRenderer.invoke('orbit:google-disconnect'),
  googleStatus: () => ipcRenderer.invoke('orbit:google-status'),

  // GA4
  ga4ListProperties: () => ipcRenderer.invoke('orbit:ga4-list-properties'),
  ga4GetReport: (propertyId: string, days?: number) =>
    ipcRenderer.invoke('orbit:ga4-get-report', propertyId, days),

  // GSC
  gscListSites: () => ipcRenderer.invoke('orbit:gsc-list-sites'),
  gscGetReport: (siteUrl: string, days?: number) =>
    ipcRenderer.invoke('orbit:gsc-get-report', siteUrl, days),

  // Public Research
  publicResearch: (query: string, category?: string) =>
    ipcRenderer.invoke('orbit:public-research', query, category),
  scanCompetitors: () => ipcRenderer.invoke('orbit:scan-competitors'),

  // AI Analyst
  aiAnalyze: (prompt: string, model?: string) =>
    ipcRenderer.invoke('orbit:ai-analyze', prompt, model),

  // Sync Scheduler
  syncNow: (source?: 'ga4' | 'gsc' | 'research' | 'all') =>
    ipcRenderer.invoke('orbit:sync-now', source),
  syncUpdateSettings: (refreshMinutes: number, syncOnStartup: boolean) =>
    ipcRenderer.invoke('orbit:sync-update-settings', refreshMinutes, syncOnStartup),

  // Backup / Restore
  exportBackup: () => ipcRenderer.invoke('orbit:export-backup'),
  importBackup: (jsonString: string) => ipcRenderer.invoke('orbit:import-backup', jsonString),

  // Utilities
  openExternal: (url: string) => ipcRenderer.invoke('orbit:open-external', url)
});
