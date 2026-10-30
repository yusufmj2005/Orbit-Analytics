import { describe, it, expect } from 'vitest';
import {
  calculateLedgerMetrics,
  filterRecords,
  getRevenueExpensesTrend,
  getCategoryBreakdown
} from '../src/utils/calculations';
import { BusinessRecord } from '../src/vite-env';

describe('Financial Ledger Calculations', () => {
  const sampleRecords: BusinessRecord[] = [
    {
      id: '1',
      date: '2026-10-25',
      label: 'Client Retainer',
      kind: 'revenue',
      amount: 5000,
      category: 'Consulting'
    },
    {
      id: '2',
      date: '2026-10-26',
      label: 'Software Subscription',
      kind: 'expense',
      amount: 1200,
      category: 'Software'
    },
    {
      id: '3',
      date: '2026-10-27',
      label: 'Cloud Hosting',
      kind: 'expense',
      amount: 800,
      category: 'Infrastructure'
    },
    {
      id: '4',
      date: '2026-10-28',
      label: 'Inbound Enterprise Lead',
      kind: 'lead',
      amount: 0,
      category: 'Sales'
    }
  ];

  it('calculates total revenue, expenses, net income, and profit margin accurately', () => {
    const summary = calculateLedgerMetrics(sampleRecords);
    expect(summary.revenue).toBe(5000);
    expect(summary.expenses).toBe(2000);
    expect(summary.netIncome).toBe(3000);
    expect(summary.profitMargin).toBe(60); // (3000 / 5000) * 100
    expect(summary.leads).toBe(1);
    expect(summary.transactionCount).toBe(4);
  });

  it('handles empty records cleanly without NaN or division by zero', () => {
    const summary = calculateLedgerMetrics([]);
    expect(summary.revenue).toBe(0);
    expect(summary.expenses).toBe(0);
    expect(summary.netIncome).toBe(0);
    expect(summary.profitMargin).toBe(0);
    expect(summary.leads).toBe(0);
    expect(summary.transactionCount).toBe(0);
  });

  it('filters records by kind correctly', () => {
    const revenues = filterRecords(sampleRecords, { kind: 'revenue' });
    expect(revenues.length).toBe(1);
    expect(revenues[0].id).toBe('1');

    const expenses = filterRecords(sampleRecords, { kind: 'expense' });
    expect(expenses.length).toBe(2);

    const leads = filterRecords(sampleRecords, { kind: 'lead' });
    expect(leads.length).toBe(1);
  });

  it('filters records by search query across label, category, and notes', () => {
    const result = filterRecords(sampleRecords, { search: 'cloud' });
    expect(result.length).toBe(1);
    expect(result[0].label).toBe('Cloud Hosting');

    const byCat = filterRecords(sampleRecords, { search: 'software' });
    expect(byCat.length).toBe(1);
  });

  it('computes category breakdowns with correct proportions', () => {
    const breakdown = getCategoryBreakdown(sampleRecords, 'expense');
    expect(breakdown.length).toBe(2);
    expect(breakdown[0].category).toBe('Software');
    expect(breakdown[0].amount).toBe(1200);
    expect(breakdown[0].percentage).toBe(60);

    expect(breakdown[1].category).toBe('Infrastructure');
    expect(breakdown[1].amount).toBe(800);
    expect(breakdown[1].percentage).toBe(40);
  });

  it('generates daily revenue vs expense trend points', () => {
    const trends = getRevenueExpensesTrend(sampleRecords, 7);
    expect(trends.length).toBe(7);
    trends.forEach((t) => {
      expect(t).toHaveProperty('date');
      expect(t).toHaveProperty('displayDate');
      expect(t).toHaveProperty('revenue');
      expect(t).toHaveProperty('expense');
      expect(t).toHaveProperty('net');
      expect(t.net).toBe(t.revenue - t.expense);
    });
  });
});

