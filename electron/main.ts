import { app, BrowserWindow, ipcMain, shell, session } from 'electron';
import path from 'node:path';
import { AppStore } from './store';
import { SecureCredentialVault } from './crypto';
import { GoogleOAuthManager } from './google-oauth';
import { GA4Service } from './ga4-api';
import { GSCService } from './gsc-api';
import { ResearchService } from './research-api';
import { AIService } from './ai-api';
import { SyncScheduler } from './sync-scheduler';

let win: BrowserWindow | null = null;
const isDev = !app.isPackaged;

// Core Services
const store = new AppStore();
const vault = new SecureCredentialVault();
const oauth = new GoogleOAuthManager(vault);
const ga4 = new GA4Service(oauth);
const gsc = new GSCService(oauth);
const research = new ResearchService();
const ai = new AIService(vault);
const scheduler = new SyncScheduler(store, oauth, ga4, gsc, research);

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#090a12',
    title: 'Orbit Analytics',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  // Set restrictive Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: https:; " +
          "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173;"
        ]
      }
    });
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  await store.init();

  // Setup connection state for Google
  const googleConnected = await oauth.isConnected();
  const googleEmail = await oauth.getAccountEmail();
  const hasAiKey = await vault.hasSecret('openai_api_key');

  await store.update((prev) => ({
    ...prev,
    sourcesHealth: {
      ...prev.sourcesHealth,
      ga4: {
        ...prev.sourcesHealth.ga4,
        connected: googleConnected
      },
      gsc: {
        ...prev.sourcesHealth.gsc,
        connected: googleConnected
      },
      ai: {
        ...prev.sourcesHealth.ai,
        connected: hasAiKey
      }
    }
  }));

  // Start background sync scheduler
  await scheduler.start();

  // IPC Handlers
  ipcMain.handle('orbit:read', async () => {
    return store.read();
  });

  ipcMain.handle('orbit:write', async (_e, data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data payload.');
    }
    await store.write(data);
    return { ok: true };
  });

  ipcMain.handle('orbit:store-secret', async (_e, key: string, value: string) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Invalid secret parameters.');
    }
    await vault.setSecret(key, value);
    if (key === 'openai_api_key') {
      await store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          ai: { ...prev.sourcesHealth.ai, connected: Boolean(value.trim()) }
        }
      }));
    }
    return { ok: true };
  });

  ipcMain.handle('orbit:has-secret', async (_e, key: string) => {
    return vault.hasSecret(key);
  });

  ipcMain.handle('orbit:delete-secret', async (_e, key: string) => {
    await vault.deleteSecret(key);
    if (key === 'openai_api_key') {
      await store.update((prev) => ({
        ...prev,
        sourcesHealth: {
          ...prev.sourcesHealth,
          ai: { ...prev.sourcesHealth.ai, connected: false }
        }
      }));
    }
    return { ok: true };
  });

  ipcMain.handle('orbit:get-secret', async (_e, key: string) => {
    // Only return if authorized
    return vault.getSecret(key);
  });

  // Google OAuth Handlers
  ipcMain.handle('orbit:google-auth', async (_e, clientId?: string, clientSecret?: string) => {
    const tokens = await oauth.startOAuthFlow(clientId, clientSecret);
    await store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, connected: true, lastError: null },
        gsc: { ...prev.sourcesHealth.gsc, connected: true, lastError: null }
      }
    }));
    return { success: true, email: tokens.email };
  });

  ipcMain.handle('orbit:google-disconnect', async () => {
    await oauth.disconnect();
    await store.update((prev) => ({
      ...prev,
      ga4Cache: null,
      gscCache: null,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, connected: false, status: 'disconnected' },
        gsc: { ...prev.sourcesHealth.gsc, connected: false, status: 'disconnected' }
      }
    }));
    return { ok: true };
  });

  ipcMain.handle('orbit:google-status', async () => {
    const connected = await oauth.isConnected();
    const email = await oauth.getAccountEmail();
    const hasClientId = await vault.hasSecret('google_client_id');
    return { connected, email, hasClientId };
  });

  // GA4 Handlers
  ipcMain.handle('orbit:ga4-list-properties', async () => {
    return ga4.listProperties();
  });

  ipcMain.handle('orbit:ga4-get-report', async (_e, propertyId: string, days?: number) => {
    if (!propertyId) throw new Error('Property ID is required.');
    const report = await ga4.getReport(propertyId, days || 30);
    await store.update((prev) => ({
      ...prev,
      ga4Cache: report,
      settings: { ...prev.settings, selectedGa4PropertyId: propertyId },
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, lastSync: new Date().toISOString(), lastError: null }
      }
    }));
    return report;
  });

  // GSC Handlers
  ipcMain.handle('orbit:gsc-list-sites', async () => {
    return gsc.listSites();
  });

  ipcMain.handle('orbit:gsc-get-report', async (_e, siteUrl: string, days?: number) => {
    if (!siteUrl) throw new Error('Site URL is required.');
    const report = await gsc.getReport(siteUrl, days || 30);
    await store.update((prev) => ({
      ...prev,
      gscCache: report,
      settings: { ...prev.settings, selectedGscSiteUrl: siteUrl },
      sourcesHealth: {
        ...prev.sourcesHealth,
        gsc: { ...prev.sourcesHealth.gsc, lastSync: new Date().toISOString(), lastError: null }
      }
    }));
    return report;
  });

  // Public Research Handlers
  ipcMain.handle('orbit:public-research', async (_e, query: string, category?: any) => {
    const items = await research.search(query, category);
    await store.update((prev) => {
      const history = [query.trim(), ...prev.searchHistory.filter((q) => q.toLowerCase() !== query.trim().toLowerCase())].slice(0, 20);
      return {
        ...prev,
        searchHistory: history,
        lastResearchResults: items.length > 0 ? items : prev.lastResearchResults,
        sourcesHealth: {
          ...prev.sourcesHealth,
          research: { ...prev.sourcesHealth.research, lastSync: new Date().toISOString() }
        }
      };
    });
    return items;
  });

  ipcMain.handle('orbit:scan-competitors', async () => {
    return scheduler.syncResearch('Manual competitor scan');
  });

  // AI Handler
  ipcMain.handle('orbit:ai-analyze', async (_e, prompt: string, model?: string) => {
    const currentData = await store.read();
    return ai.analyze({ prompt, model }, currentData);
  });

  // Synchronization Handlers
  ipcMain.handle('orbit:sync-now', async (_e, source?: 'ga4' | 'gsc' | 'research' | 'all') => {
    if (source === 'ga4') return scheduler.syncGA4('Manual trigger');
    if (source === 'gsc') return scheduler.syncGSC('Manual trigger');
    if (source === 'research') return scheduler.syncResearch('Manual trigger');
    return scheduler.syncAll('Manual full sync');
  });

  ipcMain.handle('orbit:sync-update-settings', async (_e, refreshMinutes: number, syncOnStartup: boolean) => {
    await store.update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        refreshMinutes,
        syncOnStartup
      }
    }));
    await scheduler.start();
    return { ok: true };
  });

  // Backup / Restore Handlers
  ipcMain.handle('orbit:export-backup', async () => {
    return store.exportBackup();
  });

  ipcMain.handle('orbit:import-backup', async (_e, jsonString: string) => {
    return store.importBackup(jsonString);
  });

  // External Links
  ipcMain.handle('orbit:open-external', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Only valid HTTP(S) links are permitted.');
    }
    await shell.openExternal(url);
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  scheduler.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
