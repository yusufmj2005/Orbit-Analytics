import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AppStore } from '../electron/store';

describe('AppStore Persistence and Reliability', () => {
  let testDir: string;
  let store: AppStore;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `orbit-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    store = new AppStore(testDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('initializes default data structure when file does not exist', async () => {
    const data = await store.init();
    expect(data.version).toBe(2);
    expect(data.settings.refreshMinutes).toBe(30);
    expect(Array.isArray(data.businessRecords)).toBe(true);
    expect(data.businessRecords.length).toBe(0);
    expect(data.sourcesHealth).toHaveProperty('ga4');
    expect(data.sourcesHealth).toHaveProperty('gsc');
  });

  it('performs atomic writes and updates data cleanly', async () => {
    await store.init();
    await store.update((prev) => ({
      ...prev,
      businessRecords: [
        {
          id: 'test-1',
          date: '2026-10-30',
          label: 'Test Transaction',
          amount: 350,
          kind: 'revenue',
          category: 'Testing'
        }
      ]
    }));

    // Fresh store instance reading from disk
    const freshStore = new AppStore(testDir);
    const reloaded = await freshStore.read();
    expect(reloaded.businessRecords.length).toBe(1);
    expect(reloaded.businessRecords[0].label).toBe('Test Transaction');
    expect(reloaded.businessRecords[0].amount).toBe(350);
  });

  it('recovers from corrupt primary data file using backup copy', async () => {
    await store.init();
    // Save valid record
    await store.update((prev) => ({
      ...prev,
      businessRecords: [{ id: 'bak-1', date: '2026-10-30', label: 'Backup Record', amount: 999, kind: 'revenue' }]
    }));

    // Trigger another write so backup is created
    await store.update((prev) => ({
      ...prev,
      settings: { ...prev.settings, refreshMinutes: 60 }
    }));

    // Corrupt the primary JSON file
    const primaryFile = path.join(testDir, 'orbit-data.json');
    await fs.writeFile(primaryFile, 'CORRUPTED_{{{NOT_JSON', 'utf8');

    // Read with a new store instance
    const recoveryStore = new AppStore(testDir);
    const recovered = await recoveryStore.read();
    expect(recovered).toBeDefined();
    expect(recovered.businessRecords.some((r) => r.label === 'Backup Record')).toBe(true);
  });

  it('migrates legacy v1 data schema to v2 without losing records', async () => {
    const legacyV1Data = {
      settings: { refreshMinutes: 15, competitors: ['Apple', 'Microsoft'] },
      businessRecords: [{ id: 'v1-1', label: 'V1 Sale', amount: 1500, kind: 'revenue' }],
      lastRefresh: '2026-10-20T10:00:00Z'
    };

    const primaryFile = path.join(testDir, 'orbit-data.json');
    await fs.writeFile(primaryFile, JSON.stringify(legacyV1Data), 'utf8');

    const migrationStore = new AppStore(testDir);
    const migrated = await migrationStore.read();

    expect(migrated.version).toBe(2);
    expect(migrated.settings.refreshMinutes).toBe(15);
    expect(migrated.settings.syncOnStartup).toBe(true); // default added
    expect(migrated.businessRecords.length).toBe(1);
    expect(migrated.businessRecords[0].label).toBe('V1 Sale');
    expect(migrated.sourcesHealth).toBeDefined();
    expect(migrated.sourcesHealth.ga4.connected).toBe(false);
  });

  it('exports sanitized backup JSON and restores records correctly', async () => {
    await store.init();
    await store.update((prev) => ({
      ...prev,
      businessRecords: [{ id: 'b1', date: '2026-10-30', label: 'Exportable', amount: 500, kind: 'revenue' }]
    }));

    const exportedJson = await store.exportBackup();
    expect(exportedJson).toContain('Exportable');
    expect(exportedJson).not.toContain('connections'); // No credentials

    // Clear and restore
    const restoreStore = new AppStore(testDir);
    const res = await restoreStore.importBackup(exportedJson);
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);

    const reloaded = await restoreStore.read();
    expect(reloaded.businessRecords.length).toBe(1);
    expect(reloaded.businessRecords[0].label).toBe('Exportable');
  });
});

