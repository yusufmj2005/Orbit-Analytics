import { describe, it, expect } from 'vitest';
import { exportRecordsToCsv, parseCsv, parseCsvToRecords } from '../src/utils/csv';
import { BusinessRecord } from '../src/vite-env';

describe('CSV Ingestion and Export', () => {
  const records: BusinessRecord[] = [
    {
      id: 'rec-1',
      date: '2026-10-20',
      label: 'Acme Corp Consulting, Inc.',
      kind: 'revenue',
      amount: 4500.5,
      category: 'Consulting',
      notes: 'Contains a comma, and "quotes"'
    },
    {
      id: 'rec-2',
      date: '2026-10-21',
      label: 'Server Costs',
      kind: 'expense',
      amount: 250,
      category: 'Infrastructure',
      notes: 'Line one\nLine two'
    }
  ];

  it('exports records into valid CSV format with proper quoting', () => {
    const csv = exportRecordsToCsv(records);
    expect(csv).toContain('id,date,label,kind,amount,category,notes');
    expect(csv).toContain('"Acme Corp Consulting, Inc."');
    expect(csv).toContain('""quotes""');
    expect(csv).toContain('4500.5');
  });

  it('round-trips its own export, including multi-line notes', () => {
    const { records: parsed, errors } = parseCsvToRecords(exportRecordsToCsv(records));
    expect(errors).toEqual([]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ label: 'Acme Corp Consulting, Inc.', amount: 4500.5, notes: 'Contains a comma, and "quotes"' });
    expect(parsed[1]).toMatchObject({ label: 'Server Costs', kind: 'expense', notes: 'Line one\nLine two', date: '2026-10-21' });
  });

  it('parses valid CSV text back into business records', () => {
    const csv = `date,description,type,amount,category,notes\n2026-10-25,"Contract Signed",revenue,12500,Sales,"Q4 Deal"`;
    const { records: parsed, errors } = parseCsvToRecords(csv);

    expect(errors.length).toBe(0);
    expect(parsed.length).toBe(1);
    expect(parsed[0].label).toBe('Contract Signed');
    expect(parsed[0].kind).toBe('revenue');
    expect(parsed[0].amount).toBe(12500);
    expect(parsed[0].category).toBe('Sales');
    expect(parsed[0].notes).toBe('Q4 Deal');
    expect(parsed[0]).not.toHaveProperty('isSample');
  });

  it('handles a UTF-8 BOM and CRLF line endings (Excel exports)', () => {
    const csv = '﻿Date,Name,Amount\r\n2026-10-01,Widget sale,"$1,234.50"\r\n';
    const { records: parsed } = parseCsvToRecords(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ date: '2026-10-01', label: 'Widget sale', amount: 1234.5 });
  });

  it('treats negative amounts as expenses when there is no type column', () => {
    const csv = 'date,description,amount\n2026-10-01,Client payment,500\n2026-10-02,Coffee,-4.50\n2026-10-03,Refund,(20.00)';
    const { records: parsed } = parseCsvToRecords(csv);
    expect(parsed.map((r) => [r.kind, r.amount])).toEqual([
      ['revenue', 500],
      ['expense', 4.5],
      ['expense', 20]
    ]);
  });

  it('reports invalid amounts and dates instead of silently using 0 or today', () => {
    const csv = 'date,description,amount\nyesterday-ish,Bad date,10\n2026-10-02,Bad amount,abc';
    const { records: parsed, errors } = parseCsvToRecords(csv);
    expect(parsed).toHaveLength(1);
    expect(errors.some((e) => e.includes('Unrecognized date'))).toBe(true);
    expect(errors.some((e) => e.includes('Invalid amount'))).toBe(true);
  });

  it('neutralizes spreadsheet formulas on export and restores the text on import', () => {
    const risky: BusinessRecord[] = [
      { id: 'x', date: '2026-10-01', label: '=HYPERLINK("http://evil","click")', kind: 'revenue', amount: 1, notes: '@SUM(A1)' }
    ];
    const csv = exportRecordsToCsv(risky);
    expect(csv).not.toMatch(/,=HYPERLINK/);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    const { records: parsed } = parseCsvToRecords(csv);
    expect(parsed[0].label).toBe('=HYPERLINK("http://evil","click")');
    expect(parsed[0].notes).toBe('@SUM(A1)');
  });

  it('parses quoted fields per RFC 4180', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,"2\n3",4')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2\n3', '4']
    ]);
  });

  it('gracefully handles missing description and bad input', () => {
    const resEmpty = parseCsvToRecords('');
    expect(resEmpty.errors.length).toBeGreaterThan(0);
    expect(resEmpty.records.length).toBe(0);

    const resBad = parseCsvToRecords('col1,col2,col3\n1,2,3');
    expect(resBad.errors).toContain('CSV must have a column for description/label.');
  });
});
