import React, { useEffect, useState } from 'react';
import { RefreshCw, Settings2, Wifi, WifiOff, AlertTriangle, Play } from 'lucide-react';
import { formatRelativeTime } from '../utils/formatters';

interface TopBarProps {
  pageTitle: string;
  lastRefresh: string | null;
  onRefreshAll: () => void;
  isSyncing: boolean;
  onOpenSettings: () => void;
  isSampleMode: boolean;
  onToggleSampleMode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  pageTitle,
  lastRefresh,
  onRefreshAll,
  isSyncing,
  onOpenSettings,
  isSampleMode,
  onToggleSampleMode
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Orbit Workspace</span>
        <span className="crumb-slash">/</span>
        <strong>{pageTitle}</strong>
      </div>

      <div className="top-actions">
        {/* Sample Mode Toggle */}
        <button
          className={`sample-mode-btn ${isSampleMode ? 'active' : ''}`}
          onClick={onToggleSampleMode}
          title={isSampleMode ? 'Clear demo sample data' : 'Preview dashboard with sample data'}
        >
          {isSampleMode ? (
            <>
              <AlertTriangle size={13} />
              <span>Sample Mode (Active)</span>
            </>
          ) : (
            <>
              <Play size={13} />
              <span>Preview Demo Data</span>
            </>
          )}
        </button>

        {/* Online Status */}
        <div className="live-status">
          {isOnline ? (
            <>
              <span className="status-dot online" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff size={13} color="#f2b6c1" />
              <span style={{ color: '#f2b6c1' }}>Offline</span>
            </>
          )}
        </div>

        {/* Sync All Button */}
        <button
          className="sync-button"
          onClick={onRefreshAll}
          disabled={isSyncing}
          title={`Last refresh: ${formatRelativeTime(lastRefresh)}`}
        >
          <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'Syncing...' : 'Sync All'}</span>
        </button>

        {/* Settings Button */}
        <button className="settings-button" onClick={onOpenSettings}>
          <Settings2 size={15} />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};

