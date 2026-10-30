import React from 'react';
import {
  LayoutDashboard,
  Globe2,
  BriefcaseBusiness,
  Search,
  BrainCircuit,
  Activity,
  Settings2,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { AppDataSchema } from '../vite-env';

interface SidebarProps {
  activePage: string;
  onSelectPage: (page: string) => void;
  onOpenSettings: () => void;
  data: AppDataSchema;
  isSampleMode: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  onOpenSettings,
  data,
  isSampleMode
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'website',
      label: 'Website Analytics',
      icon: Globe2,
      badge: data.sourcesHealth.ga4.connected || data.ga4Cache ? 'Live' : undefined
    },
    {
      id: 'business',
      label: 'Business Ledger',
      icon: BriefcaseBusiness,
      count: data.businessRecords.length
    },
    {
      id: 'research',
      label: 'Internet Research',
      icon: Search,
      count: data.lastResearchResults.length > 0 ? data.lastResearchResults.length : undefined
    },
    {
      id: 'insights',
      label: 'AI Insights',
      icon: BrainCircuit,
      badge: data.sourcesHealth.ai.connected ? 'Active' : undefined
    },
    {
      id: 'status',
      label: 'Sync & Status',
      icon: Activity
    }
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="brand">
        <div className="brand-icon">
          <Activity size={22} />
        </div>
        <div>
          <div className="brand-name">
            Orbit<span>.</span>
          </div>
          <div className="brand-sub">ANALYTICS STUDIO</div>
        </div>
      </div>

      {/* Workspace Badge */}
      <div className="workspace">
        <div className="workspace-avatar">AI</div>
        <div className="workspace-text">
          <strong>Almost Intelligent</strong>
          <small>Desktop Business Suite</small>
        </div>
        {isSampleMode && <span className="sample-indicator-pill">DEMO</span>}
      </div>

      {/* Navigation */}
      <div className="nav-caption">NAVIGATION</div>
      <nav>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectPage(item.id)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
              {item.badge && <span className="nav-badge-pill">{item.badge}</span>}
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="nav-count">{item.count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-bottom">
        {/* Source Health Glance */}
        <div className="connection-mini" onClick={() => onSelectPage('status')} style={{ cursor: 'pointer' }}>
          <div className="health-dots">
            <span
              className={`status-dot ${data.sourcesHealth.ga4.connected ? 'online' : ''}`}
              title="Google Analytics 4"
            />
            <span
              className={`status-dot ${data.sourcesHealth.gsc.connected ? 'online' : ''}`}
              title="Google Search Console"
            />
            <span
              className={`status-dot ${data.sourcesHealth.ai.connected ? 'online' : ''}`}
              title="OpenAI Analyst"
            />
          </div>
          <div>
            <strong>Integration Status</strong>
            <small>
              {data.sourcesHealth.ga4.connected || data.sourcesHealth.ai.connected
                ? 'Services Connected'
                : 'Local Mode Only'}
            </small>
          </div>
          <ChevronRight size={13} style={{ marginLeft: 'auto', color: '#777b95' }} />
        </div>

        <button className="nav-item" onClick={onOpenSettings}>
          <Settings2 size={17} />
          <span>Settings & Connections</span>
        </button>

        <div className="profile">
          <div className="profile-avatar">
            <ShieldCheck size={16} />
          </div>
          <div>
            <strong>Private Workspace</strong>
            <small>Data stored locally</small>
          </div>
        </div>
      </div>
    </aside>
  );
};

