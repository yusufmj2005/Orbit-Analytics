import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { localDateString, parseLocalDate, daysAgoLocal } from '../src/utils/dates';
import { formatDate, formatPercent } from '../src/utils/formatters';
import { filterRecords, getRevenueExpensesTrend } from '../src/utils/calculations';
import { parseCsvToRecords } from '../src/utils/csv';
import { buildPatch } from '../src/utils/patch';
import { defaultData } from '../electron/store';
import { AppDataSchema } from '../src/vite-env';

const originalTZ = process.env.TZ;

describe('Local calendar dates west of UTC (America/Los_Angeles)', () => {
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('displays ledger dates on the day they were recorded', () => {
    expect(formatDate('2026-10-05')).toBe('Oct 5, 2026');
  });

  it('imports US-style CSV dates without shifting them', () => {
    const { records } = parseCsvToRecords('date,description,amount\n10/05/2026,Sale,10');
    expect(records[0].date).toBe('2026-10-05');
  });
});

describe('Local calendar dates east of UTC (Asia/Kolkata, early morning)', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
    vi.useFakeTimers();
    // 02:00 local on Oct 30 is still Oct 29 in UTC.
    vi.setSystemTime(new Date('2026-10-30T02:00:00+05:30'));
  });
  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  it("uses the local date for 'today'", () => {
    expect(localDateString()).toBe('2026-10-30');
    expect(daysAgoLocal(7)).toBe('2026-10-23');
  });

  it("includes today's records in the trend chart and date filters", () => {
    const records = [{ id: '1', date: '2026-10-30', label: 'Today', amount: 100, kind: 'revenue' as const }];
    const trend = getRevenueExpensesTrend(records, 3);
    expect(trend.map((t) => t.date)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
    expect(trend[2].revenue).toBe(100);
    expect(filterRecords(records, { dateRange: '7d' })).toHaveLength(1);
  });
});

describe('parseLocalDate', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(parseLocalDate('2026-02-28')).not.toBeNull();
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('10/05/2026')).toBeNull();
  });
});

describe('formatPercent', () => {
  it('always treats input as a ratio', () => {
    expect(formatPercent(0.256)).toBe('25.6%');
    expect(formatPercent(1.5)).toBe('150.0%');
    expect(formatPercent(NaN)).toBe('0.0%');
  });
});

describe('buildPatch (renderer → main process)', () => {
  const prev: AppDataSchema = JSON.parse(JSON.stringify(defaultData));

  it('sends only the settings keys that changed', () => {
    const next = { ...prev, settings: { ...prev.settings, aiModel: 'gpt-4o' } };
    expect(buildPatch(prev, next)).toEqual({ settings: { aiModel: 'gpt-4o' } });
  });

  it('never includes main-process-owned fields or sample records', () => {
    const next: AppDataSchema = {
      ...prev,
      ga4Cache: null,
      syncHistory: [],
      businessRecords: [
        { id: 's', date: '2026-10-01', label: 'Demo', amount: 1, kind: 'revenue', isSample: true },
        { id: 'r', date: '2026-10-01', label: 'Real', amount: 1, kind: 'revenue' }
      ]
    };
    const patch = buildPatch(prev, next);
    expect(Object.keys(patch)).toEqual(['businessRecords']);
    expect(patch.businessRecords!.map((r) => r.id)).toEqual(['r']);
  });

  it('is empty when nothing changed', () => {
    expect(buildPatch(prev, { ...prev })).toEqual({});
  });
});
