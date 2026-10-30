import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AppStore, applyPatch, defaultData } from '../electron/store';

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
    expect(data.settings.reportDays).toBe(30);
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

  it('does not lose updates when many run concurrently', async () => {
    await store.init();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.update((prev) => ({
          ...prev,
          businessRecords: [
            ...prev.businessRecords,
            { id: `c-${i}`, date: '2026-10-30', label: `Concurrent ${i}`, amount: i, kind: 'revenue' as const }
          ]
        }))
      )
    );

    const reloaded = await new AppStore(testDir).read();
    expect(reloaded.businessRecords).toHaveLength(25);
    expect(new Set(reloaded.businessRecords.map((r) => r.id)).size).toBe(25);
  });

  it('keeps a concurrent cache write and a sync-history write (the two sync paths)', async () => {
    await store.init();
    await Promise.all([
      store.update((prev) => ({ ...prev, ga4Cache: { propertyId: '123' } as any })),
      store.update((prev) => ({ ...prev, syncHistory: [{ id: 'log-1' } as any, ...prev.syncHistory] })),
      store.patch({ settings: { aiModel: 'gpt-4o' } })
    ]);
    const data = await new AppStore(testDir).read();
    expect(data.ga4Cache?.propertyId).toBe('123');
    expect(data.syncHistory[0].id).toBe('log-1');
    expect(data.settings.aiModel).toBe('gpt-4o');
  });

  it('notifies change listeners after every persisted write', async () => {
    await store.init();
    const seen: number[] = [];
    store.onChange((d) => seen.push(d.businessRecords.length));
    await store.patch({ businessRecords: [{ id: 'a', date: '2026-10-30', label: 'A', amount: 1, kind: 'revenue' }] });
    expect(seen).toEqual([1]);
  });

  it('recovers from corrupt primary data file using backup copy without clobbering the backup', async () => {
    await store.init();
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
    expect(recovered.businessRecords.some((r) => r.label === 'Backup Record')).toBe(true);

    // The corrupted file is preserved, and the backup still holds valid data.
    const files = await fs.readdir(testDir);
    expect(files.some((f) => f.startsWith('orbit-data.corrupt-'))).toBe(true);
    const bak = JSON.parse(await fs.readFile(path.join(testDir, 'orbit-data.json.bak'), 'utf8'));
    expect(bak.businessRecords.some((r: any) => r.label === 'Backup Record')).toBe(true);
    // The primary file is valid again.
    const primaryText = await fs.readFile(primaryFile, 'utf8');
    expect(() => JSON.parse(primaryText)).not.toThrow();
  });

  it('migrates legacy v1 data, drops persisted demo records and resets interrupted syncs', async () => {
    const legacyV1Data = {
      settings: { refreshMinutes: 15, competitors: ['Apple', 'Microsoft'] },
      businessRecords: [
        { id: 'v1-1', label: 'V1 Sale', amount: 1500, kind: 'revenue' },
        { id: 'sample-rec-1', label: 'Demo', amount: 10, kind: 'revenue', isSample: true }
      ],
      sourcesHealth: { ga4: { connected: true, syncInProgress: true, status: 'syncing' } },
      lastRefresh: '2026-10-20T10:00:00Z'
    };

    const primaryFile = path.join(testDir, 'orbit-data.json');
    await fs.writeFile(primaryFile, JSON.stringify(legacyV1Data), 'utf8');

    const migrated = await new AppStore(testDir).read();

    expect(migrated.version).toBe(2);
    expect(migrated.settings.refreshMinutes).toBe(15);
    expect(migrated.settings.syncOnStartup).toBe(true); // default added
    expect(migrated.settings.reportDays).toBe(30);
    expect(migrated.businessRecords.map((r) => r.id)).toEqual(['v1-1']);
    expect(migrated.sourcesHealth.ga4.syncInProgress).toBe(false);
    expect(migrated.sourcesHealth.ga4.status).toBe('idle');
    expect(migrated.sourcesHealth.gsc.connected).toBe(false);
  });

  it('exports sanitized backup JSON and restores records into an empty workspace', async () => {
    await store.init();
    await store.update((prev) => ({
      ...prev,
      businessRecords: [{ id: 'b1', date: '2026-10-30', label: 'Exportable', amount: 500, kind: 'revenue' }]
    }));

    const exportedJson = await store.exportBackup();
    expect(exportedJson).toContain('Exportable');
    expect(exportedJson).not.toContain('ga4Cache');
    expect(exportedJson).not.toContain('syncHistory');

    const restoreDir = path.join(testDir, 'restore');
    const restoreStore = new AppStore(restoreDir);
    await restoreStore.init();
    const res = await restoreStore.importBackup(exportedJson);
    expect(res).toEqual({ success: true, count: 1 });

    const reloaded = await restoreStore.read();
    expect(reloaded.businessRecords.length).toBe(1);
    expect(reloaded.businessRecords[0].label).toBe('Exportable');

    // Importing the same backup again adds nothing new.
    expect(await restoreStore.importBackup(exportedJson)).toEqual({ success: true, count: 0 });
  });

  it('rejects malformed backups', async () => {
    await store.init();
    expect((await store.importBackup('not json')).success).toBe(false);
    expect((await store.importBackup('{"foo":1}')).success).toBe(false);
  });
});

describe('applyPatch (renderer-originated changes)', () => {
  const base = JSON.parse(JSON.stringify(defaultData));

  it('only changes renderer-owned fields', () => {
    const prev = { ...base, ga4Cache: { propertyId: 'keep' } };
    const next = applyPatch(prev, { settings: { aiModel: 'gpt-4o' }, ga4Cache: null, syncHistory: [] } as any);
    expect(next.ga4Cache).toEqual({ propertyId: 'keep' });
    expect(next.settings.aiModel).toBe('gpt-4o');
    expect(next.settings.competitors).toEqual(base.settings.competitors);
  });

  it('never persists sample records and normalizes record fields', () => {
    const next = applyPatch(base, {
      businessRecords: [
        { id: 's', date: '2026-10-30', label: 'Demo', amount: 5, kind: 'revenue', isSample: true },
        { id: 'r', date: 'not-a-date', label: '  Real  ', amount: NaN as any, kind: 'weird' as any }
      ]
    });
    expect(next.businessRecords).toHaveLength(1);
    expect(next.businessRecords[0]).toMatchObject({ id: 'r', label: 'Real', amount: 0, kind: 'revenue' });
    expect(next.businessRecords[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ignores invalid setting values', () => {
    const next = applyPatch(base, {
      settings: {
        refreshMinutes: 0.001,
        aiModel: 'not-a-model',
        reportDays: 12,
        selectedGa4PropertyId: 'properties/987',
        selectedGscSiteUrl: 'javascript:alert(1)',
        competitors: ['Acme', 'acme', '  ', 'Beta']
      }
    });
    expect(next.settings.refreshMinutes).toBe(base.settings.refreshMinutes);
    expect(next.settings.aiModel).toBe(base.settings.aiModel);
    expect(next.settings.reportDays).toBe(30);
    expect(next.settings.selectedGa4PropertyId).toBe('987');
    expect(next.settings.selectedGscSiteUrl).toBeUndefined();
    expect(next.settings.competitors).toEqual(['Acme', 'Beta']);
  });
});
