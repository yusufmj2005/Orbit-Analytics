import http from 'node:http';
import crypto from 'node:crypto';
import { shell } from 'electron';
import { SecureCredentialVault } from './crypto';

const OAUTH_PORT = 8234;
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/oauth2callback`;

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

export class GoogleOAuthManager {
  private vault: SecureCredentialVault;
  private pendingAuth: {
    server: http.Server | null;
    state: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
    resolve: (tokens: GoogleAuthTokens) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(vault: SecureCredentialVault) {
    this.vault = vault;
  }

  // Base64URL encoding without padding
  private base64UrlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private generateCodeVerifier(): string {
    return this.base64UrlEncode(crypto.randomBytes(32));
  }

  private generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return this.base64UrlEncode(hash);
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
      return this.refreshAccessToken(tokens.refreshToken);
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

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[GoogleOAuth] Token refresh failed:', errText);
      throw new Error(`Google token refresh failed (HTTP ${response.status}). Authorization may have been revoked.`);
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
    const clientId = clientIdInput?.trim() || (await this.vault.getSecret('google_client_id')) || '';
    const clientSecret = clientSecretInput?.trim() || (await this.vault.getSecret('google_client_secret')) || '';

    if (!clientId) {
      throw new Error('Please provide a Google OAuth Client ID before starting authentication.');
    }

    // Save client credentials securely
    await this.vault.setSecret('google_client_id', clientId);
    if (clientSecret) {
      await this.vault.setSecret('google_client_secret', clientSecret);
    }

    // Cancel any previous pending auth
    if (this.pendingAuth?.server) {
      try {
        this.pendingAuth.server.close();
      } catch {}
      this.pendingAuth = null;
    }

    const state = crypto.randomBytes(24).toString('hex');
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    return new Promise((resolve, reject) => {
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

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090a12;color:#f2f1fb;padding:40px;text-align:center;">
                <h2 style="color:#f2b6c1;">Authorization Denied</h2>
                <p>Google OAuth returned an error: <strong>${escapeHtml(error)}</strong></p>
                <p>You can close this tab and return to Orbit Analytics.</p>
              </body></html>
            `);
            server.close();
            this.pendingAuth = null;
            reject(new Error(`Google authorization was denied or failed: ${error}`));
            return;
          }

          if (queryState !== state || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h3>Invalid OAuth callback state or missing authorization code.</h3>');
            server.close();
            this.pendingAuth = null;
            reject(new Error('Invalid state received from OAuth callback. Request aborted for security.'));
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

          const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString()
          });

          if (!tokenResp.ok) {
            const errBody = await tokenResp.text();
            throw new Error(`Token exchange failed (HTTP ${tokenResp.status}): ${errBody}`);
          }

          const tokenData: any = await tokenResp.json();

          // Fetch user profile to verify identity and test credentials
          let userEmail = '';
          try {
            const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            if (userResp.ok) {
              const userInfo = await userResp.json();
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

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html><html>
            <body style="font-family:sans-serif;background:#090a12;color:#f2f1fb;display:flex;align-items:center;justify-content:center;height:90vh;margin:0;">
              <div style="background:#141522;border:1px solid #302b48;border-radius:14px;padding:36px;max-width:440px;text-align:center;">
                <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#9477e9,#d09be7);display:grid;place-items:center;margin:0 auto 16px;color:#100d1e;font-weight:bold;font-size:24px;">✓</div>
                <h2 style="margin:0 0 8px;font-size:20px;">Orbit Analytics Connected!</h2>
                <p style="color:#9a9cb4;font-size:13px;line-height:1.6;margin:0 0 20px;">Google account <strong>${escapeHtml(userEmail || 'Account')}</strong> was successfully authenticated.</p>
                <p style="color:#777b94;font-size:11px;">You may safely close this browser window and return to the Orbit desktop application.</p>
              </div>
            </body></html>
          `);

          server.close();
          this.pendingAuth = null;
          resolve(tokens);
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h3>Authentication error: ${escapeHtml(err?.message || 'Unknown')}</h3>`);
          server.close();
          this.pendingAuth = null;
          reject(err);
        }
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

        shell.openExternal(authUrl.toString());

        this.pendingAuth = {
          server,
          state,
          codeVerifier,
          clientId,
          clientSecret,
          resolve,
          reject
        };
      });

      server.on('error', (err: any) => {
        this.pendingAuth = null;
        reject(new Error(`Failed to bind OAuth listener on port ${OAUTH_PORT}: ${err.message}`));
      });

      // 3-minute timeout for user to complete sign-in
      setTimeout(() => {
        if (this.pendingAuth && this.pendingAuth.state === state) {
          try {
            server.close();
          } catch {}
          this.pendingAuth = null;
          reject(new Error('Google sign-in timed out. Please try again.'));
        }
      }, 180_000);
    });
  }

  public async disconnect(): Promise<void> {
    const tokens = await this.getStoredTokens();
    if (tokens?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.accessToken)}`, {
          method: 'POST'
        });
      } catch {
        // Continue even if network revocation fails
      }
    }
    await this.vault.deleteSecret('google_tokens');
  }

  public async isConnected(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    return Boolean(tokens?.accessToken);
  }

  public async getAccountEmail(): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    return tokens?.email || null;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

