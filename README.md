# Orbit Analytics — Desktop Business Intelligence Application

[![Platform: Windows 10/11](https://img.shields.io/badge/Platform-Windows%2010%2F11-blue.svg)](https://microsoft.com/windows)
[![Engine: Electron + React + Vite](https://img.shields.io/badge/Stack-Electron%20%7C%20React%20%7C%20TypeScript%20%7C%20Vite-purple.svg)](https://electronjs.org)
[![Security: Windows DPAPI SafeStorage](https://img.shields.io/badge/Security-DPAPI%20safeStorage-green.svg)](https://electronjs.org/docs/latest/api/safe-storage)
[![Deliverable: NSIS & Portable](https://img.shields.io/badge/Build-NSIS%20Installer%20%26%20Portable-success.svg)](release/)

A commercial-grade native Windows desktop business intelligence application developed for **Almost Intelligent**. Orbit aggregates authorized business data, web analytics, search performance, and public market signals into an executive dark dashboard with local-first security.

---

## Deliverables & Generated Binaries

Production Windows binaries are generated in the `release/` directory:

| Deliverable | File Path | Format / Size | Description |
| :--- | :--- | :--- | :--- |
| **Windows Installer** | `release/Orbit Analytics Setup.exe` | NSIS Setup (~85 MB) | Standard interactive Windows installer with custom destination directory support and uninstaller |
| **Portable Executable** | `release/Orbit Analytics Portable.exe` | Standalone Executable (~85 MB) | Zero-install standalone desktop executable for USB or portable environments |
| **Unpacked Application** | `release/win-unpacked/Orbit Analytics.exe` | Win32 Binary Folder | Direct unpacked binaries for enterprise deployment or staging |

---

## Product Features & Screens

Orbit Analytics features seven primary views conforming to the Orbit reference design:

### 1. Executive Overview
- **Executive Snapshot**: KPIs for Recorded Revenue, Recorded Expenses, Net Income, GA4 Sessions, Search Console Clicks, and Connected Sources.
- **Visual Trend Area Chart**: 14-day daily financial activity visualizing revenue vs expenses.
- **Source Health Glance**: Real-time status and sync timestamps for each integration.
- **Market Signals Feed**: Recent competitor headlines fetched from public RSS news feeds.
- **Demo Mode**: Explicitly tagged `[SAMPLE PREVIEW MODE]` allowing prospective users to preview charts and tables without fabricating live account connections.

### 2. Website Analytics (GA4 & Search Console)
- **Google Analytics 4**:
  - Live ingestion from Google Analytics Data API (`analyticsdata.googleapis.com/v1beta`).
  - Active Users, Total Users, Sessions, Screen Pageviews, Engagement Rate, Average Session Duration, and Conversions.
  - Interactive AreaChart tracking daily session and user trends over 7, 30, or 90 days.
  - Traffic Acquisition Channels table (Organic Search, Direct, Referral, Paid, etc.).
  - Top Landing Pages table with view counts and session metrics.
  - Property selector supporting multiple GA4 properties.
- **Google Search Console**:
  - Live ingestion from Google Search Analytics API (`webmasters.v3`).
  - Search Clicks, Search Impressions, Average CTR, and Average SERP Position.
  - Search Visibility trend chart over customizable date intervals.
  - Top Search Queries keyword breakdown (clicks, impressions, CTR, position).
  - Top Performing Pages URL breakdown.
  - Device breakdown (Desktop, Mobile, Tablet) and country breakdown.
  - Honest distinction between unavailable metrics and actual zero values.

### 3. Business Performance (Financial Ledger)
- **Comprehensive CRUD Operations**: Create, read, update, and delete transactions with confirmation dialogs.
- **Multi-Kind Tracking**: Revenue, expenses, and prospective business leads.
- **Search & Filtering**: Real-time search across descriptions, categories, and notes. Filter by type (All, Revenue, Expense, Lead) and date range (7d, 30d, 90d, this year).
- **Sorting & Pagination**: Column sorting by Date, Description, and Amount; paginated table for high record counts.
- **Visual Analytics**: Daily cashflow comparison chart and category expense breakdown.
- **CSV Data Ingestion & Export**:
  - Export filtered ledger records to RFC 4180 CSV files.
  - Import records from CSV spreadsheets with column auto-mapping and format validation.
- **Source Integrity**: Manually entered records are visibly badged from imported records and sample data.

### 4. Internet & Competitor Research
- **Public News Search**: Queries Google News RSS endpoints with automatic facet queries (Company, Competitor, Technology, Industry).
- **Competitor Watchlist**: Local watchlist manager with one-click "Scan All Competitors" automation.
- **Saved Searches & History**: Pin high-priority search queries and quickly re-run recent inquiries.
- **Deduplication**: Multi-feed URL and title hash deduplication to eliminate redundant articles.
- **Article Reader**: Displays source badge, publication date, snippet, and launches original articles in the system default browser via sanitized IPC.

### 5. Orbit AI Analyst
- **Privilege Separation**: Queries execute strictly within Electron's privileged process using the decrypted OpenAI API key. Credentials are never exposed to renderer logs or the UI.
- **Strict Evidence-Based Reasoning**: Context dynamically includes the user's local ledger totals, GA4 metrics, Search Console signals, and competitor headlines with source timestamps.
- **Honest Gap Disclosure**: Forbids hallucinated metrics. If GA4 or GSC is disconnected, the analyst explicitly states: *"Conversion cannot be calculated because Google Analytics 4 is not connected."*
- **Source Citations**: Automatically attributes observations to `[Source: Local Ledger]`, `[Source: Google Analytics 4]`, or `[Source: Public RSS]`.
- **Configurable Models**: Supports `gpt-4o-mini`, `gpt-4o`, and `gpt-4.1-mini`.
- **Cost Disclaimer**: Explains that API token usage is billed directly to the user's OpenAI account.

### 6. Integration Status & Refresh History
- **Source Health Cards**: Real-time status for Google Analytics 4, Search Console, Public RSS, and OpenAI.
- **Sync History Audit Trail**: Searchable historical log of all manual and automated sync events, status (Success / Partial / Error), duration in milliseconds, and detailed error messages.
- **Individual Controls**: Trigger immediate synchronization for individual sources or all sources at once.

### 7. Settings & Connections
- **Google OAuth Setup**: Desktop OAuth Client ID and Secret configuration with callback instructions.
- **OpenAI Key Vault**: DPAPI-encrypted API key storage with test status.
- **Background Scheduler**: Configurable polling intervals (Manual, 15m, 30m, 1h, 6h, 24h) and startup sync toggle.
- **Database Backup & Migration**: Export database to JSON and restore from backup files.
- **Privacy Statement**: Comprehensive transparency notice on local-first storage and external data transmission.

---

## Security & Architecture

Orbit Analytics is engineered according to commercial desktop security standards:

```
┌─────────────────────────────────────────────────────────────┐
│                       Renderer Process                      │
│      React 18 + TypeScript + Vite + Recharts + CSS          │
│               contextIsolation: true, nodeIntegration: false│
└──────────────────────────────┬──────────────────────────────┘
                               │
                Minimal Validated IPC Bridge
                     (window.orbit.*)
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Electron Main Process                    │
│                                                             │
│   ┌────────────────────┐          ┌───────────────────────┐ │
│   │     AppStore       │          │ SecureCredentialVault │ │
│   │ (Atomic JSON Store)│          │ (Windows DPAPI Vault) │ │
│   └────────────────────┘          └───────────────────────┘ │
│                                                             │
│   ┌────────────────────┐          ┌───────────────────────┐ │
│   │  SyncScheduler     │          │  GoogleOAuthManager   │ │
│   │ (Mutex, Backoff)   │          │ (Loopback, PKCE S256) │ │
│   └────────────────────┘          └───────────────────────┘ │
│                                                             │
│   ┌───────────────────────────────────────────────────────┐ │
│   │               External Secure Connectors              │ │
│   │    GA4 API  ·  GSC API  ·  RSS Feed  ·  OpenAI API    │ │
│   └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

1. **Process Isolation**: Renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. No unrestricted filesystem or Node.js primitives are exposed to the UI.
2. **OS-Backed Credential Vault**: Secrets (OAuth tokens, refresh tokens, OpenAI keys) are encrypted using Electron's `safeStorage`, which leverages the Windows Data Protection API (DPAPI). Orbit refuses to fall back to plaintext.
3. **PKCE & State Validation**: The Google OAuth desktop authorization flow uses cryptographic `code_verifier` / `code_challenge` (S256) and a 48-character random `state` token to prevent authorization code interception and CSRF.
4. **Content Security Policy (CSP)**: Strict CSP in `index.html` restricts scripts, styles, fonts, and network connections.
5. **Atomic Persistence**: Local JSON storage writes to temporary files first (`.tmp`) and safely renames to target, creating automatic `.bak` backups on every write cycle to guard against unexpected power loss or crashes.
6. **Network Hygiene**: External links are validated to allow only `https://` or `http://` protocols and opened through the default OS browser. Certificate validation is never disabled.

---

## Google OAuth 2.0 Setup Guide

To pull real live metrics from Google Analytics 4 and Google Search Console:

### Step 1: Create OAuth Client in Google Cloud Console
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Orbit Analytics Desktop`).
3. Enable the required APIs:
   - **Google Analytics Admin API**
   - **Google Analytics Data API**
   - **Google Search Console API**
4. Configure the **OAuth Consent Screen**:
   - User Type: **External** (or Internal for Google Workspace domains).
   - Scopes:
     - `https://www.googleapis.com/auth/analytics.readonly`
     - `https://www.googleapis.com/auth/webmasters.readonly`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Add your Google account under **Test users** while the app is in testing mode.
5. Create Credentials:
   - Click **Create Credentials** → **OAuth client ID**.
   - Application type: **Desktop app**.
   - Add the Authorized redirect URI:
     ```
     http://127.0.0.1:8234/oauth2callback
     ```
   - Copy the generated **Client ID** and **Client Secret**.

### Step 2: Authenticate in Orbit
1. Launch Orbit Analytics.
2. Open **Settings & Connections** → **Integrations & OAuth**.
3. Paste your **Google OAuth Client ID** and **Client Secret**.
4. Click **Sign in with Google**.
5. Your default browser will open to Google's consent page. Grant read-only access.
6. Upon approval, Orbit's local loopback server validates the state, stores encrypted refresh tokens in DPAPI, and displays a success confirmation.
7. Return to Orbit: your GA4 properties and verified Search Console sites are now available in the dropdowns.

---

## OpenAI API Configuration

1. Generate an API key in your [OpenAI Platform Dashboard](https://platform.openai.com/api-keys).
2. Open Orbit → **Settings & Connections** → **Integrations & OAuth**.
3. Paste the key into the **OpenAI API Key** field and click **Save Key**.
4. Select your preferred model (`gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`).
5. Open the **AI Insights** tab and ask analytical questions regarding your business metrics.

---

## Building and Running from Source

### Prerequisites
- **Windows 10 or 11 (64-bit)**
- **Node.js 20+ LTS** (Tested with Node.js v26.13.0 and npm 11.20.0)
- **PowerShell 5.1+**

### 1. Install Dependencies
```powershell
npm install
```

### 2. Run Automated Test Suite
```powershell
npm test
```
Executes all 21 automated unit tests across financial calculations, CSV parsing, atomic persistence, schema migration, OAuth PKCE, sync scheduler mutex, and AI context assembly.

### 3. Launch in Development Mode
```powershell
npm run dev
```
Starts Vite on `http://127.0.0.1:5173` with Hot Module Replacement (HMR) and launches the Electron application window.

### 4. Build Production Application
```powershell
npm run build
```
Typechecks the codebase (`tsc -b`), bundles the React frontend via Vite (`vite build`), and compiles the Electron privileged process (`tsc -p electron/tsconfig.json`).

### 5. Build Windows Installer & Portable Executable
```powershell
npm run dist:win
```
Produces the verified installation packages in the `release/` folder:
- `release/Orbit Analytics Setup.exe`
- `release/Orbit Analytics Portable.exe`

---

## Automated Test Coverage

Orbit includes a comprehensive test suite in `tests/`:

- `tests/calculations.test.ts`: Validates ledger revenue, expense, net income, profit margin, date filtering (7d, 30d, 90d, this year), search filtering, daily trend grouping, and category breakdown proportions.
- `tests/csv.test.ts`: Tests RFC 4180 CSV generation, quote escaping, multiline note handling, header variations, column auto-mapping, and corrupt input recovery.
- `tests/store.test.ts`: Verifies atomic temp-file-and-rename writes, corrupt file recovery via automatic `.bak` fallback, v1 to v2 schema migrations, and sanitized JSON backup/restore.
- `tests/oauth-and-sync.test.ts`: Tests S256 code challenge generation, random state verification, synchronization mutex locking (preventing overlapping duplicate jobs), and bounded exponential backoff calculations.
- `tests/ai-context.test.ts`: Tests prompt context formatting, source citations parsing, secret isolation (ensuring API keys are never included in context), and explicit disclosure of missing data.

---

## Troubleshooting & Diagnostics

- **Google OAuth port 8234 already in use**:
  Ensure no other instance of Orbit is currently waiting for authorization. You can close pending browser tabs or restart Orbit.
- **Credential encryption unavailable**:
  Orbit requires Windows DPAPI support. If running in a restricted Windows virtual machine or sandbox where DPAPI is disabled, Orbit will alert the user and refuse to store credentials in plaintext.
- **Google 403 Access Denied**:
  Verify that your Google Cloud OAuth consent screen is configured with the user as an authorized Test User, and that the GA4 Data API and Search Console API are enabled in your Google Cloud Project.
- **Search Console returns 0 queries**:
  Google Search Console aggregates data with a 2–3 day delay. Ensure the date range selected contains recorded impressions.

---

## License & Developer Identity

- **Product**: Orbit Analytics Desktop Application
- **Brand / Developer**: Almost Intelligent
- **Target Platform**: Windows 10/11 (64-bit)
