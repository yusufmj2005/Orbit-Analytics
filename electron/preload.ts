import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('orbit', {
  read: () => ipcRenderer.invoke('orbit:read'),
  patch: (patch: unknown) => ipcRenderer.invoke('orbit:patch', patch),
  onDataChanged: (callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('orbit:data-changed', listener);
    return () => {
      ipcRenderer.removeListener('orbit:data-changed', listener);
    };
  },

  // Credentials (write/check only; secrets are never returned to the UI)
  storeSecret: (key: string, value: string) => ipcRenderer.invoke('orbit:store-secret', key, value),
  hasSecret: (key: string) => ipcRenderer.invoke('orbit:has-secret', key),
  deleteSecret: (key: string) => ipcRenderer.invoke('orbit:delete-secret', key),

  // Google OAuth
  googleAuth: (clientId?: string, clientSecret?: string) =>
    ipcRenderer.invoke('orbit:google-auth', clientId, clientSecret),
  googleDisconnect: () => ipcRenderer.invoke('orbit:google-disconnect'),
  googleStatus: () => ipcRenderer.invoke('orbit:google-status'),

  // GA4 / Search Console property pickers
  ga4ListProperties: () => ipcRenderer.invoke('orbit:ga4-list-properties'),
  gscListSites: () => ipcRenderer.invoke('orbit:gsc-list-sites'),

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

  // Backup / Restore
  exportBackup: () => ipcRenderer.invoke('orbit:export-backup'),
  importBackup: (jsonString: string) => ipcRenderer.invoke('orbit:import-backup', jsonString),

  // Utilities
  openExternal: (url: string) => ipcRenderer.invoke('orbit:open-external', url)
});
