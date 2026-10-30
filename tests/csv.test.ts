import { describe, it, expect } from 'vitest';
import { exportRecordsToCsv, parseCsvToRecords } from '../src/utils/csv';
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
      notes: 'Monthly billing'
    }
  ];

  it('exports records into valid CSV format with proper quoting', () => {
    const csv = exportRecordsToCsv(records);
    expect(csv).toContain('id,date,label,kind,amount,category,notes');
    expect(csv).toContain('"Acme Corp Consulting, Inc."');
    expect(csv).toContain('""quotes""');
    expect(csv).toContain('4500.5');
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
  });

  it('gracefully handles missing description and bad input', () => {
    const emptyCsv = '';
    const resEmpty = parseCsvToRecords(emptyCsv);
    expect(resEmpty.errors.length).toBeGreaterThan(0);
    expect(resEmpty.records.length).toBe(0);

    const badHeader = 'col1,col2,col3\n1,2,3';
    const resBad = parseCsvToRecords(badHeader);
    expect(resBad.errors).toContain('CSV must have a column for description/label.');
  });
});

