import http from 'node:http';
import { shell } from 'electron';
import { SecureCredentialVault } from './crypto';
import { fetchWithTimeout, readApiError } from './http';
import { generateCodeChallenge, generateCodeVerifier, generateState, statesMatch } from './pkce';

const OAUTH_PORT = 8234;
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/oauth2callback`;
const SIGN_IN_TIMEOUT_MS = 180_000;

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp ms
  email?: string;
}

export interface TokenProvider {
  getValidAccessToken(): Promise<string>;
}

interface PendingAuth {
  server: http.Server;
  timer: NodeJS.Timeout;
  reject: (err: Error) => void;
}

export class GoogleOAuthManager implements TokenProvider {
  private vault: SecureCredentialVault;
  private pendingAuth: PendingAuth | null = null;
  // Shared so GA4 and Search Console syncs starting together trigger a single refresh.
  private refreshInFlight: Promise<string> | null = null;

  constructor(vault: SecureCredentialVault) {
    this.vault = vault;
  }

  public async getStoredTokens(): Promise<GoogleAuthTokens | null> {
    const raw = await this.vault.getSecret('google_tokens');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.accessToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  public async getValidAccessToken(): Promise<string> {
    const tokens = await this.getStoredTokens();
    if (!tokens) {
      throw new Error('Google account is not connected.');
    }

    // If token expires in less than 2 minutes, refresh it
    if (Date.now() >= tokens.expiresAt - 120_000) {
      if (!tokens.refreshToken) {
        throw new Error('Google session expired and no refresh token is available. Please re-authenticate.');
      }
      if (!this.refreshInFlight) {
        this.refreshInFlight = this.refreshAccessToken(tokens.refreshToken).finally(() => {
          this.refreshInFlight = null;
        });
      }
      return this.refreshInFlight;
    }

    return tokens.accessToken;
  }

  public async refreshAccessToken(refreshToken: string): Promise<string> {
    const clientId = await this.vault.getSecret('google_client_id');
    const clientSecret = await this.vault.getSecret('google_client_secret');

    if (!clientId) {
      throw new Error('Google OAuth Client ID is missing.');
    }

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    if (clientSecret) {
      bodyParams.append('client_secret', clientSecret);
    }

    const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const err = await readApiError(response, 'Google token refresh failed');
      console.error('[GoogleOAuth]', err.message);
      if (response.status === 400 || response.status === 401) {
        // invalid_grant: the refresh token was revoked or expired. Drop it so the app
        // reports "not connected" instead of failing every sync.
        await this.vault.deleteSecret('google_tokens');
        throw new Error('Google authorization was revoked or has expired. Please sign in with Google again.');
      }
      throw err;
    }

    const data: any = await response.json();
    const existing = await this.getStoredTokens();

    const updatedTokens: GoogleAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || existing?.refreshToken || refreshToken,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      email: existing?.email
    };

    await this.vault.setSecret('google_tokens', JSON.stringify(updatedTokens));
    return updatedTokens.accessToken;
  }

  public async startOAuthFlow(clientIdInput?: string, clientSecretInput?: string): Promise<GoogleAuthTokens> {
    const storedClientId = (await this.vault.getSecret('google_client_id')) || '';
    const clientId = clientIdInput?.trim() || storedClientId;
    let clientSecret = clientSecretInput?.trim() || '';

    if (!clientId) {
      throw new Error('Please provide a Google OAuth Client ID before starting authentication.');
    }

    if (!clientSecret && clientId === storedClientId) {
      clientSecret = (await this.vault.getSecret('google_client_secret')) || '';
    }

    // Save client credentials securely. A new client ID without a secret must not keep
    // the previous client's secret, or the token exchange fails with invalid_client.
    await this.vault.setSecret('google_client_id', clientId);
    if (clientSecret) {
      await this.vault.setSecret('google_client_secret', clientSecret);
    } else {
      await this.vault.deleteSecret('google_client_secret');
    }

    // A newer sign-in attempt replaces any pending one; settle the old promise so its
    // caller doesn't wait forever.
    this.cancelPendingAuth(new Error('Sign-in was restarted.'));

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err: Error | null, tokens?: GoogleAuthTokens) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          server.close();
        } catch {}
        if (this.pendingAuth?.server === server) this.pendingAuth = null;
        if (err) reject(err);
        else resolve(tokens!);
      };

      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_PORT}`);
          if (reqUrl.pathname !== '/oauth2callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }

          const queryState = reqUrl.searchParams.get('state');
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          // Requests that don't carry our state (stray or forged) are refused but don't
          // abort the sign-in the user is completing in their browser.
          if (!statesMatch(state, queryState)) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h3>Invalid OAuth callback state. This request was ignored.</h3>');
            return;
          }

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090a12;color:#f2f1fb;padding:40px;text-align:center;">
                <h2 style="color:#f2b6c1;">Authorization Denied</h2>
                <p>Google OAuth returned an error: <strong>${escapeHtml(error)}</strong></p>
                <p>You can close this tab and return to Orbit Analytics.</p>
              </body></html>
            `);
            finish(new Error(`Google authorization was denied or failed: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h3>Missing authorization code.</h3>');
            finish(new Error('Google did not return an authorization code.'));
            return;
          }

          // Exchange auth code for tokens
          const tokenParams = new URLSearchParams({
            client_id: clientId,
            code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
          });
          if (clientSecret) {
            tokenParams.append('client_secret', clientSecret);
          }

          const tokenResp = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString()
          });

          if (!tokenResp.ok) {
            throw await readApiError(tokenResp, 'Token exchange failed');
          }

          const tokenData: any = await tokenResp.json();

          // Fetch user profile to verify identity and test credentials
          let userEmail = '';
          try {
            const userResp = await fetchWithTimeout('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            if (userResp.ok) {
              const userInfo: any = await userResp.json();
              userEmail = userInfo.email || '';
            }
          } catch {}

          const tokens: GoogleAuthTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000,
            email: userEmail
          };

          await this.vault.setSecret('google_tokens', JSON.stringify(tokens));

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html><html>
            <body style="font-family:sans-serif;background:#090a12;color:#f2f1fb;display:flex;align-items:center;justify-content:center;height:90vh;margin:0;">
              <div style="background:#141522;border:1px solid #302b48;border-radius:14px;padding:36px;max-width:440px;text-align:center;">
                <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#9477e9,#d09be7);display:grid;place-items:center;margin:0 auto 16px;color:#100d1e;font-weight:bold;font-size:24px;">&#10003;</div>
                <h2 style="margin:0 0 8px;font-size:20px;">Orbit Analytics Connected!</h2>
                <p style="color:#9a9cb4;font-size:13px;line-height:1.6;margin:0 0 20px;">Google account <strong>${escapeHtml(userEmail || 'Account')}</strong> was successfully authenticated.</p>
                <p style="color:#777b94;font-size:11px;">You may safely close this browser window and return to the Orbit desktop application.</p>
              </div>
            </body></html>
          `);

          finish(null, tokens);
        } catch (err: any) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
          }
          res.end(`<h3>Authentication error: ${escapeHtml(err?.message || 'Unknown')}</h3>`);
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });

      const timer = setTimeout(() => {
        finish(new Error('Google sign-in timed out. Please try again.'));
      }, SIGN_IN_TIMEOUT_MS);

      this.pendingAuth = { server, timer, reject: (err) => finish(err) };

      server.on('error', (err: any) => {
        finish(new Error(`Failed to bind OAuth listener on port ${OAUTH_PORT}: ${err.message}`));
      });

      server.listen(OAUTH_PORT, '127.0.0.1', () => {
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', GOOGLE_SCOPES);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');

        shell.openExternal(authUrl.toString()).catch((err) => {
          finish(new Error(`Could not open the browser for Google sign-in: ${err?.message || err}`));
        });
      });
    });
  }

  private cancelPendingAuth(reason: Error): void {
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending?.reject(reason);
  }

  public async disconnect(): Promise<void> {
    this.cancelPendingAuth(new Error('Google account was disconnected.'));
    let tokens: GoogleAuthTokens | null = null;
    try {
      tokens = await this.getStoredTokens();
    } catch {}
    // Revoking the refresh token revokes the whole grant, including access tokens.
    const token = tokens?.refreshToken || tokens?.accessToken;
    if (token) {
      try {
        await fetchWithTimeout(
          'https://oauth2.googleapis.com/revoke',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }).toString()
          },
          10_000
        );
      } catch {
        // Continue even if network revocation fails
      }
    }
    await this.vault.deleteSecret('google_tokens');
  }

  public async isConnected(): Promise<boolean> {
    try {
      const tokens = await this.getStoredTokens();
      return Boolean(tokens?.accessToken);
    } catch (err: any) {
      console.error('[GoogleOAuth] Could not read stored tokens:', err?.message || err);
      return false;
    }
  }

  public async getAccountEmail(): Promise<string | null> {
    try {
      const tokens = await this.getStoredTokens();
      return tokens?.email || null;
    } catch {
      return null;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
