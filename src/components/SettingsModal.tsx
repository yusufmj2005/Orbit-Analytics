import React, { useState, useEffect } from 'react';
import {
  X,
  Globe2,
  BrainCircuit,
  RefreshCw,
  Search,
  ShieldCheck,
  Plus,
  Trash2,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Lock,
  ExternalLink,
  Key
} from 'lucide-react';
import { AppDataSchema } from '../vite-env';

interface SettingsModalProps {
  data: AppDataSchema;
  onClose: () => void;
  onUpdateData: (updater: (prev: AppDataSchema) => AppDataSchema) => Promise<void>;
  onExportBackup: () => Promise<void>;
  onImportBackup: (jsonStr: string) => Promise<{ success: boolean; count: number; error?: string }>;
  onClearSampleData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  data,
  onClose,
  onUpdateData,
  onExportBackup,
  onImportBackup,
  onClearSampleData
}) => {
  const [activeTab, setActiveTab] = useState<'connections' | 'sync' | 'watchlist' | 'data' | 'privacy'>('connections');

  // Google OAuth Form
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null; hasClientId: boolean }>({
    connected: false,
    email: null,
    hasClientId: false
  });
  const [googleAuthBusy, setGoogleAuthBusy] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState('');

  // OpenAI Form
  const [openAiKey, setOpenAiKey] = useState('');
  const [hasAiKey, setHasAiKey] = useState(false);
  const [aiKeyNotice, setAiKeyNotice] = useState('');

  // Competitor input
  const [competitorInput, setCompetitorInput] = useState('');

  // Backup notice
  const [backupNotice, setBackupNotice] = useState('');

  useEffect(() => {
    window.orbit.googleStatus().then(setGoogleStatus).catch(() => {});
    window.orbit.hasSecret('openai_api_key').then(setHasAiKey).catch(() => {});
  }, []);

  const handleStartGoogleAuth = async () => {
    setGoogleAuthBusy(true);
    setGoogleAuthError('');
    try {
      const res = await window.orbit.googleAuth(googleClientId, googleClientSecret);
      setGoogleStatus({ connected: true, email: res.email || null, hasClientId: true });
      setGoogleClientId('');
      setGoogleClientSecret('');
    } catch (err: any) {
      setGoogleAuthError(err?.message || 'Google authentication was not completed.');
    } finally {
      setGoogleAuthBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await window.orbit.googleDisconnect();
    setGoogleStatus({ connected: false, email: null, hasClientId: false });
  };

  const handleSaveAiKey = async () => {
    if (!openAiKey.trim()) return;
    try {
      await window.orbit.storeSecret('openai_api_key', openAiKey.trim());
      setOpenAiKey('');
      setHasAiKey(true);
      setAiKeyNotice('OpenAI key encrypted and saved via Windows DPAPI.');
      setTimeout(() => setAiKeyNotice(''), 3500);
    } catch (err: any) {
      setAiKeyNotice(err?.message || 'Failed to save credential.');
    }
  };

  const handleDeleteAiKey = async () => {
    await window.orbit.deleteSecret('openai_api_key');
    setHasAiKey(false);
    setOpenAiKey('');
    setAiKeyNotice('OpenAI key deleted.');
    setTimeout(() => setAiKeyNotice(''), 3000);
  };

  const handleAddCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = competitorInput.trim();
    if (!name || data.settings.competitors.includes(name)) return;

    await onUpdateData((prev) => ({
      ...prev,
      settings: { ...prev.settings, competitors: [...prev.settings.competitors, name] }
    }));
    setCompetitorInput('');
  };

  const handleRemoveCompetitor = async (name: string) => {
    await onUpdateData((prev) => ({
      ...prev,
      settings: { ...prev.settings, competitors: prev.settings.competitors.filter((c) => c !== name) }
    }));
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const res = await onImportBackup(text);
    if (res.success) {
      setBackupNotice(`Backup restored! ${res.count} records imported.`);
    } else {
      setBackupNotice(`Restore failed: ${res.error}`);
    }
    setTimeout(() => setBackupNotice(''), 5000);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal-window">
        {/* Modal Header */}
        <div className="modal-head">
          <div>
            <div className="eyebrow">PREFERENCES & SECURITY</div>
            <h2>Settings & Connections</h2>
            <p>
              Credentials are encrypted using Windows OS-backed safeStorage (DPAPI). Never stored in plaintext.
            </p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="settings-nav-tabs">
          <button
            className={`settings-tab-btn ${activeTab === 'connections' ? 'active' : ''}`}
            onClick={() => setActiveTab('connections')}
          >
            <Globe2 size={14} /> Integrations & OAuth
          </button>
          <button
            className={`settings-tab-btn ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            <RefreshCw size={14} /> Background Refresh
          </button>
          <button
            className={`settings-tab-btn ${activeTab === 'watchlist' ? 'active' : ''}`}
            onClick={() => setActiveTab('watchlist')}
          >
            <Search size={14} /> Watchlist
          </button>
          <button
            className={`settings-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <Download size={14} /> Backup & Storage
          </button>
          <button
            className={`settings-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <ShieldCheck size={14} /> Privacy & Policy
          </button>
        </div>

        {/* TAB 1: INTEGRATIONS & OAUTH */}
        {activeTab === 'connections' && (
          <div className="settings-body-scroll">
            {/* Google OAuth Section */}
            <div className="settings-card-section">
              <div className="section-title-row">
                <Globe2 size={18} style={{ color: '#a78bfa' }} />
                <div>
                  <h4>Google Analytics 4 & Search Console</h4>
                  <p>Standard desktop OAuth 2.0 flow with loopback redirect validation.</p>
                </div>
              </div>

              {googleStatus.connected ? (
                <div className="connected-account-box">
                  <div className="account-info">
                    <CheckCircle2 size={18} style={{ color: '#5ed5a0' }} />
                    <div>
                      <strong>Google Account Connected</strong>
                      <small>{googleStatus.email || 'Authorized session active'}</small>
                    </div>
                  </div>
                  <button className="danger-outline" onClick={handleDisconnectGoogle}>
                    Disconnect Account
                  </button>
                </div>
              ) : (
                <div className="oauth-setup-form">
                  <p className="helper-text">
                    To authenticate with Google Analytics 4 and Google Search Console:
                    <br />
                    1. Create a <strong>Desktop Application</strong> OAuth client in Google Cloud Console.
                    <br />
                    2. Add <code>http://127.0.0.1:8234/oauth2callback</code> as an authorized redirect URI.
                    <br />
                    3. Paste your credentials below and click <strong>Sign in with Google</strong>.
                  </p>

                  <label className="field-label">Google OAuth Client ID</label>
                  <input
                    className="settings-input"
                    type="text"
                    placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                  />

                  <label className="field-label">Client Secret (Optional for PKCE Desktop clients)</label>
                  <input
                    className="settings-input"
                    type="password"
                    placeholder="GOCSPX-..."
                    value={googleClientSecret}
                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                  />

                  {googleAuthError && <div className="error-box">{googleAuthError}</div>}

                  <div className="oauth-btn-row">
                    <button
                      className="primary-button google-auth-btn"
                      onClick={handleStartGoogleAuth}
                      disabled={googleAuthBusy || (!googleClientId.trim() && !googleStatus.hasClientId)}
                    >
                      {googleAuthBusy ? (
                        <>
                          <RefreshCw size={14} className="spin" />
                          <span>Waiting for browser authorization...</span>
                        </>
                      ) : (
                        <>
                          <Lock size={14} />
                          <span>Sign in with Google</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* OpenAI API Key Section */}
            <div className="settings-card-section">
              <div className="section-title-row">
                <BrainCircuit size={18} style={{ color: '#c084fc' }} />
                <div>
                  <h4>OpenAI Analyst API</h4>
                  <p>Enables evidence-based summaries of your local financial and analytics data.</p>
                </div>
              </div>

              <div className="settings-field-group">
                <label className="field-label">OpenAI API Key</label>
                <div className="key-input-row">
                  <input
                    className="settings-input"
                    type="password"
                    placeholder={hasAiKey ? '•••••••••••••••• (Encrypted in safeStorage)' : 'Paste API key (starts with sk-...)'}
                    value={openAiKey}
                    onChange={(e) => setOpenAiKey(e.target.value)}
                  />
                  <button className="primary-button" onClick={handleSaveAiKey} disabled={!openAiKey.trim()}>
                    Save Key
                  </button>
                  {hasAiKey && (
                    <button className="danger-outline" onClick={handleDeleteAiKey}>
                      Remove
                    </button>
                  )}
                </div>
                {aiKeyNotice && <div className="toast success-toast" style={{ marginTop: '8px' }}>{aiKeyNotice}</div>}
              </div>

              <div className="settings-field-group" style={{ marginTop: '16px' }}>
                <label className="field-label">Default Analysis Model</label>
                <select
                  className="settings-input"
                  value={data.settings.aiModel}
                  onChange={(e) => {
                    const model = e.target.value;
                    onUpdateData((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, aiModel: model }
                    }));
                  }}
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast, Cost-efficient)</option>
                  <option value="gpt-4o">GPT-4o (High Accuracy, Deeper Reasoning)</option>
                  <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BACKGROUND REFRESH */}
        {activeTab === 'sync' && (
          <div className="settings-body-scroll">
            <div className="settings-card-section">
              <div className="section-title-row">
                <RefreshCw size={18} style={{ color: '#a78bfa' }} />
                <div>
                  <h4>Automated Background Synchronization</h4>
                  <p>Configure automated polling intervals for connected external providers.</p>
                </div>
              </div>

              <div className="settings-field-group">
                <label className="field-label">Synchronization Frequency</label>
                <select
                  className="settings-input"
                  value={data.settings.refreshMinutes}
                  onChange={async (e) => {
                    const mins = Number(e.target.value);
                    await window.orbit.syncUpdateSettings(mins, data.settings.syncOnStartup);
                    await onUpdateData((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, refreshMinutes: mins }
                    }));
                  }}
                >
                  <option value={0}>Manual triggers only (No background timer)</option>
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes (Recommended)</option>
                  <option value={60}>Every hour</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={1440}>Once a day (24 hours)</option>
                </select>
              </div>

              <div className="checkbox-row" style={{ marginTop: '18px' }}>
                <input
                  type="checkbox"
                  id="startupSync"
                  checked={data.settings.syncOnStartup}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    await window.orbit.syncUpdateSettings(data.settings.refreshMinutes, checked);
                    await onUpdateData((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, syncOnStartup: checked }
                    }));
                  }}
                />
                <label htmlFor="startupSync">
                  <strong>Sync on application startup</strong>
                  <small>Automatically refresh authorized sources 3 seconds after Orbit opens.</small>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WATCHLIST */}
        {activeTab === 'watchlist' && (
          <div className="settings-body-scroll">
            <div className="settings-card-section">
              <div className="section-title-row">
                <Search size={18} style={{ color: '#a78bfa' }} />
                <div>
                  <h4>Competitor Watchlist Manager</h4>
                  <p>Companies monitored during scheduled or manual public signal scans.</p>
                </div>
              </div>

              <div className="watchlist-chips" style={{ marginBottom: '16px' }}>
                {data.settings.competitors.map((name) => (
                  <span key={name} className="watch-chip">
                    <span>{name}</span>
                    <button type="button" onClick={() => handleRemoveCompetitor(name)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={handleAddCompetitor} className="two-field-row" style={{ gap: '10px' }}>
                <input
                  className="settings-input"
                  type="text"
                  placeholder="Enter company or competitor name..."
                  value={competitorInput}
                  onChange={(e) => setCompetitorInput(e.target.value)}
                />
                <button type="submit" className="primary-button" disabled={!competitorInput.trim()}>
                  <Plus size={14} /> Add
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: DATA & BACKUP */}
        {activeTab === 'data' && (
          <div className="settings-body-scroll">
            <div className="settings-card-section">
              <div className="section-title-row">
                <Download size={18} style={{ color: '#a78bfa' }} />
                <div>
                  <h4>Local Data Backup & Migration</h4>
                  <p>Export your business ledger, saved queries, and preferences to JSON.</p>
                </div>
              </div>

              <div className="actions-button-grid">
                <button className="outline-button" onClick={onExportBackup}>
                  <Download size={14} /> Export Backup JSON
                </button>

                <label className="outline-button" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> Import Backup JSON
                  <input
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleImportBackupFile}
                  />
                </label>

                <button className="outline-button" onClick={onClearSampleData}>
                  Clear Demo / Sample Data
                </button>
              </div>

              {backupNotice && <div className="toast success-toast" style={{ marginTop: '16px' }}>{backupNotice}</div>}
            </div>
          </div>
        )}

        {/* TAB 5: PRIVACY */}
        {activeTab === 'privacy' && (
          <div className="settings-body-scroll">
            <div className="settings-card-section">
              <div className="section-title-row">
                <ShieldCheck size={18} style={{ color: '#5ed5a0' }} />
                <div>
                  <h4>Privacy Statement & Data Handling</h4>
                  <p>Transparency regarding how Orbit Analytics protects your business records.</p>
                </div>
              </div>

              <div className="privacy-statement-text">
                <h5>1. Local-First Architecture</h5>
                <p>
                  All business ledger entries, settings, search history, and cached metrics reside locally on your Windows machine in an isolated JSON store with atomic file writes. Orbit does not operate a remote database, telemetry collector, or central cloud sync.
                </p>

                <h5>2. Windows DPAPI Encryption</h5>
                <p>
                  OAuth tokens, refresh tokens, and AI API keys are protected using Electron's <code>safeStorage</code> backed by the Windows Data Protection API (DPAPI). Orbit refuses to write unencrypted credentials in plaintext.
                </p>

                <h5>3. External Transmission</h5>
                <p>
                  Network connections leave your PC only when you explicitly connect or refresh:
                  <br />• <strong>Google APIs</strong>: Google Analytics Data API and Google Search Console APIs over HTTPS using authorized least-privilege read-only scopes.
                  <br />• <strong>Public RSS</strong>: Standard Google News RSS queries for public headlines.
                  <br />• <strong>OpenAI API</strong>: Only when you execute an AI Analyst query; sends strictly curated ledger summaries and retrieved headlines without personal device telemetry.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <span>
            <ShieldCheck size={14} /> Windows 10/11 Desktop Security Enabled
          </span>
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

