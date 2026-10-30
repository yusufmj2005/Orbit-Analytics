import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, shell, session } from 'electron';
import path from 'node:path';
import { AppStore } from './store';
import { SecureCredentialVault } from './crypto';
import { GoogleOAuthManager } from './google-oauth';
import { GA4Service } from './ga4-api';
import { GSCService } from './gsc-api';
import { ResearchService, RESEARCH_CATEGORIES, ResearchCategory } from './research-api';
import { AIService } from './ai-api';
import { SyncScheduler } from './sync-scheduler';
import { DataPatch } from './types';

const DEV_SERVER_URL = 'http://127.0.0.1:5173';
const isDev = !app.isPackaged;
const PROD_INDEX = path.join(__dirname, '../dist/index.html');

// Secrets the renderer may set/check/delete. Google tokens and the client secret are
// managed only by the main process, and no secret is ever returned to the renderer.
const RENDERER_WRITABLE_SECRETS = new Set(['openai_api_key']);
const RENDERER_CHECKABLE_SECRETS = new Set(['openai_api_key', 'google_client_id']);
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

let win: BrowserWindow | null = null;

// Core Services
const store = new AppStore();
const vault = new SecureCredentialVault();
const oauth = new GoogleOAuthManager(vault);
const ga4 = new GA4Service(oauth);
const gsc = new GSCService(oauth);
const research = new ResearchService();
const ai = new AIService(vault);
const scheduler = new SyncScheduler(store, oauth, ga4, gsc, research);

function isAppUrl(url: string): boolean {
  if (isDev) return url === DEV_SERVER_URL || url.startsWith(`${DEV_SERVER_URL}/`);
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && decodeURIComponent(parsed.pathname).endsWith('/dist/index.html');
  } catch {
    return false;
  }
}

// Only our own window's top frame may call privileged handlers (not an iframe or a
// page the window was somehow navigated to).
function handle(channel: string, handler: (...args: any[]) => any) {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: any[]) => {
    const frame = event.senderFrame;
    if (!win || event.sender !== win.webContents || !frame || frame !== event.sender.mainFrame || !isAppUrl(frame.url)) {
      throw new Error('Blocked IPC call from an untrusted origin.');
    }
    return handler(...args);
  });
}

function requireString(value: unknown, name: string, maxLength = 10_000): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string.`);
  if (value.length > maxLength) throw new Error(`${name} is too long.`);
  return value;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

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

  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(PROD_INDEX);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Never let the app window itself navigate away from the bundled UI.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (isHttpUrl(url)) shell.openExternal(url);
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

function registerIpcHandlers() {
  handle('orbit:read', () => store.read());

  // Renderer edits go through a validated patch of renderer-owned fields only, so the UI
  // can never overwrite sync results, caches or connection state with a stale copy.
  handle('orbit:patch', async (patch: DataPatch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Invalid data payload.');
    }
    const before = await store.read();
    const next = await store.patch(patch);
    if (
      next.settings.refreshMinutes !== before.settings.refreshMinutes ||
      next.settings.syncOnStartup !== before.settings.syncOnStartup
    ) {
      await scheduler.start();
    }
    return next;
  });

  handle('orbit:store-secret', async (key: unknown, value: unknown) => {
    if (typeof key !== 'string' || !RENDERER_WRITABLE_SECRETS.has(key)) {
      throw new Error('This credential cannot be changed from the UI.');
    }
    const secret = requireString(value, 'Secret', 500).trim();
    await vault.setSecret(key, secret);
    await store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ai: { ...prev.sourcesHealth.ai, connected: Boolean(secret), status: secret ? 'idle' : 'disconnected' }
      }
    }));
    return { ok: true };
  });

  handle('orbit:has-secret', async (key: unknown) => {
    if (typeof key !== 'string' || !RENDERER_CHECKABLE_SECRETS.has(key)) return false;
    return vault.hasSecret(key);
  });

  handle('orbit:delete-secret', async (key: unknown) => {
    if (typeof key !== 'string' || !RENDERER_WRITABLE_SECRETS.has(key)) {
      throw new Error('This credential cannot be changed from the UI.');
    }
    await vault.deleteSecret(key);
    await store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ai: { ...prev.sourcesHealth.ai, connected: false, status: 'disconnected' }
      }
    }));
    return { ok: true };
  });

  // Google OAuth Handlers
  handle('orbit:google-auth', async (clientId?: unknown, clientSecret?: unknown) => {
    const id = clientId === undefined || clientId === null ? '' : requireString(clientId, 'Client ID', 300);
    const secret = clientSecret === undefined || clientSecret === null ? '' : requireString(clientSecret, 'Client secret', 300);
    const tokens = await oauth.startOAuthFlow(id, secret);
    await store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, connected: true, status: 'idle', lastError: null },
        gsc: { ...prev.sourcesHealth.gsc, connected: true, status: 'idle', lastError: null }
      }
    }));
    // Pull data right away instead of leaving the dashboards empty until the next timer tick.
    scheduler.syncAll('Initial sync after Google sign-in').catch((err) =>
      console.error('[Main] Post sign-in sync failed:', err)
    );
    return { success: true, email: tokens.email };
  });

  handle('orbit:google-disconnect', async () => {
    await oauth.disconnect();
    await store.update((prev) => ({
      ...prev,
      ga4Cache: null,
      gscCache: null,
      settings: { ...prev.settings, selectedGa4PropertyId: undefined, selectedGscSiteUrl: undefined },
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: { ...prev.sourcesHealth.ga4, connected: false, status: 'disconnected', syncInProgress: false, lastError: null },
        gsc: { ...prev.sourcesHealth.gsc, connected: false, status: 'disconnected', syncInProgress: false, lastError: null }
      }
    }));
    return { ok: true };
  });

  handle('orbit:google-status', async () => {
    const connected = await oauth.isConnected();
    const email = await oauth.getAccountEmail();
    const hasClientId = await vault.hasSecret('google_client_id');
    return { connected, email, hasClientId };
  });

  // GA4 / Search Console property pickers
  handle('orbit:ga4-list-properties', () => ga4.listProperties());
  handle('orbit:gsc-list-sites', () => gsc.listSites());

  // Public Research Handlers
  handle('orbit:public-research', async (query: unknown, category?: unknown) => {
    const q = requireString(query, 'Search query', 300).trim();
    if (!q) throw new Error('Please enter a search query.');
    const cat = RESEARCH_CATEGORIES.includes(category as ResearchCategory) ? (category as ResearchCategory) : 'general';

    const items = await research.search(q, cat);
    await store.update((prev) => {
      const history = [q, ...prev.searchHistory.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 20);
      return {
        ...prev,
        searchHistory: history,
        lastResearchResults: items.length > 0 ? items : prev.lastResearchResults
      };
    });
    return items;
  });

  handle('orbit:scan-competitors', () => scheduler.syncResearch('Manual competitor scan'));

  // AI Handler
  handle('orbit:ai-analyze', async (prompt: unknown, model?: unknown) => {
    const currentData = await store.read();
    return ai.analyze(
      { prompt: requireString(prompt, 'Prompt', 4000), model: typeof model === 'string' ? model : undefined },
      currentData
    );
  });

  // Synchronization Handlers
  handle('orbit:sync-now', (source?: unknown) => {
    if (source === 'ga4') return scheduler.syncGA4('Manual trigger');
    if (source === 'gsc') return scheduler.syncGSC('Manual trigger');
    if (source === 'research') return scheduler.syncResearch('Manual trigger');
    if (source === undefined || source === 'all') return scheduler.syncAll('Manual full sync');
    throw new Error('Unknown sync source.');
  });

  // Backup / Restore Handlers
  handle('orbit:export-backup', () => store.exportBackup());

  handle('orbit:import-backup', (jsonString: unknown) => {
    return store.importBackup(requireString(jsonString, 'Backup file', MAX_BACKUP_BYTES));
  });

  // External Links
  handle('orbit:open-external', async (url: unknown) => {
    if (!isHttpUrl(url)) {
      throw new Error('Only valid HTTP(S) links are permitted.');
    }
    await shell.openExternal(url);
    return true;
  });
}

// A second instance would fight over the same data file and OAuth callback port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    // Restrictive Content Security Policy (dev server sources only in development)
    const devSources = isDev ? ` ${DEV_SERVER_URL} ws://127.0.0.1:5173` : '';
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
              `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}; ` +
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "font-src 'self' https://fonts.gstatic.com data:; " +
              "img-src 'self' data: https:; " +
              `connect-src 'self'${devSources};`
          ]
        }
      });
    });

    await store.init();

    // Reconcile connection state with the credential vault. Failures here (e.g. DPAPI
    // unavailable or a key that can no longer be decrypted) must not stop the app opening.
    let googleConnected = false;
    let hasAiKey = false;
    try {
      googleConnected = await oauth.isConnected();
      hasAiKey = await vault.hasSecret('openai_api_key');
    } catch (err) {
      console.error('[Main] Could not read credential vault:', err);
    }

    await store.update((prev) => ({
      ...prev,
      sourcesHealth: {
        ...prev.sourcesHealth,
        ga4: {
          ...prev.sourcesHealth.ga4,
          connected: googleConnected,
          status: googleConnected ? (prev.sourcesHealth.ga4.status === 'error' ? 'error' : 'idle') : 'disconnected'
        },
        gsc: {
          ...prev.sourcesHealth.gsc,
          connected: googleConnected,
          status: googleConnected ? (prev.sourcesHealth.gsc.status === 'error' ? 'error' : 'idle') : 'disconnected'
        },
        ai: { ...prev.sourcesHealth.ai, connected: hasAiKey, status: hasAiKey ? 'idle' : 'disconnected' }
      }
    }));

    // Push every store change to the UI so it never works from a stale copy.
    store.onChange((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('orbit:data-changed', data);
      }
    });

    registerIpcHandlers();
    createWindow();

    // Start background sync scheduler
    await scheduler.start({ runStartupSync: true });

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
}
