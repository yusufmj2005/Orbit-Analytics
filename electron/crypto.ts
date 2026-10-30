import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

export interface SecretReader {
  getSecret(key: string): Promise<string | null>;
}

export class SecureCredentialVault implements SecretReader {
  private credPath: string;
  private cache: Record<string, string> | null = null;
  // Serializes vault mutations so concurrent setSecret calls (e.g. a token refresh racing
  // a sign-in) can't interleave file writes.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(customDir?: string) {
    const baseDir = customDir || app.getPath('userData');
    this.credPath = path.join(baseDir, 'credentials.enc.json');
  }

  public isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  private async loadVault(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      if (existsSync(this.credPath)) {
        const raw = await fs.readFile(this.credPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.cache = parsed && typeof parsed === 'object' ? parsed : {};
        return this.cache!;
      }
    } catch (e) {
      console.error('[CredentialVault] Failed to load credentials vault:', e);
      // Keep the unreadable file instead of silently overwriting it on the next save.
      await fs.copyFile(this.credPath, `${this.credPath}.corrupt-${Date.now()}`).catch(() => {});
    }
    this.cache = {};
    return this.cache;
  }

  private async saveVault(vault: Record<string, string>): Promise<void> {
    this.cache = vault;
    await fs.mkdir(path.dirname(this.credPath), { recursive: true });
    const tmpPath = `${this.credPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
    try {
      await fs.rename(tmpPath, this.credPath);
    } catch {
      await fs.copyFile(tmpPath, this.credPath);
      await fs.unlink(tmpPath).catch(() => {});
    }
  }

  public setSecret(key: string, secretValue: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      return Promise.reject(new Error('Secret key must be a valid non-empty string.'));
    }
    if (!this.isAvailable()) {
      return Promise.reject(
        new Error('OS credential encryption (Windows DPAPI) is unavailable on this device. Orbit will not store credentials in plaintext.')
      );
    }

    return this.enqueue(async () => {
      const trimmed = String(secretValue ?? '').trim();
      const vault = { ...(await this.loadVault()) };

      if (!trimmed) {
        delete vault[key];
      } else {
        vault[key] = safeStorage.encryptString(trimmed).toString('base64');
      }

      await this.saveVault(vault);
    });
  }

  public async getSecret(key: string): Promise<string | null> {
    if (!key) return null;
    const vault = await this.loadVault();
    const encryptedBase64 = vault[key];
    if (!encryptedBase64) return null;

    if (!this.isAvailable()) {
      throw new Error('OS credential encryption is unavailable. Cannot decrypt saved credentials.');
    }

    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err: any) {
      console.error(`[CredentialVault] Decryption failed for key ${key}:`, err?.message || err);
      throw new Error('Failed to decrypt credential. The encryption key may have changed.');
    }
  }

  public async hasSecret(key: string): Promise<boolean> {
    if (!key) return false;
    const vault = await this.loadVault();
    return Boolean(vault[key]);
  }

  public deleteSecret(key: string): Promise<void> {
    if (!key) return Promise.resolve();
    return this.enqueue(async () => {
      const vault = await this.loadVault();
      if (vault[key]) {
        const next = { ...vault };
        delete next[key];
        await this.saveVault(next);
      }
    });
  }
}
