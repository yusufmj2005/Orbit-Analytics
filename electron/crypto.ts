import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

export class SecureCredentialVault {
  private credPath: string;
  private cache: Record<string, string> | null = null;

  constructor(customDir?: string) {
    const baseDir = customDir || app.getPath('userData');
    this.credPath = path.join(baseDir, 'credentials.enc.json');
  }

  public isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  private async loadVault(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      if (existsSync(this.credPath)) {
        const raw = await fs.readFile(this.credPath, 'utf8');
        this.cache = JSON.parse(raw);
        return this.cache!;
      }
    } catch (e) {
      console.error('[CredentialVault] Failed to load credentials vault:', e);
    }
    this.cache = {};
    return this.cache;
  }

  private async saveVault(vault: Record<string, string>): Promise<void> {
    this.cache = vault;
    await fs.mkdir(path.dirname(this.credPath), { recursive: true });
    await fs.writeFile(this.credPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
  }

  public async setSecret(key: string, secretValue: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new Error('Secret key must be a valid non-empty string.');
    }
    if (!this.isAvailable()) {
      throw new Error('OS credential encryption (Windows DPAPI) is unavailable on this device. Orbit will not store credentials in plaintext.');
    }

    const trimmed = secretValue.trim();
    const vault = await this.loadVault();

    if (!trimmed) {
      delete vault[key];
    } else {
      const encryptedBuffer = safeStorage.encryptString(trimmed);
      vault[key] = encryptedBuffer.toString('base64');
    }

    await this.saveVault(vault);
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
      console.error(`[CredentialVault] Decryption failed for key ${key}:`, err);
      throw new Error('Failed to decrypt credential. The encryption key may have changed.');
    }
  }

  public async hasSecret(key: string): Promise<boolean> {
    if (!key) return false;
    const vault = await this.loadVault();
    return Boolean(vault[key]);
  }

  public async deleteSecret(key: string): Promise<void> {
    if (!key) return;
    const vault = await this.loadVault();
    if (vault[key]) {
      delete vault[key];
      await this.saveVault(vault);
    }
  }
}

