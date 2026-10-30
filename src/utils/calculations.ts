import { BusinessRecord } from '../vite-env';

export interface LedgerSummary {
  revenue: number;
  expenses: number;
  netIncome: number;
  profitMargin: number;
  leads: number;
  transactionCount: number;
}

export function calculateLedgerMetrics(records: BusinessRecord[]): LedgerSummary {
  let revenue = 0;
  let expenses = 0;
  let leads = 0;

  for (const r of records) {
    if (r.kind === 'revenue') {
      revenue += r.amount;
    } else if (r.kind === 'expense') {
      expenses += r.amount;
    } else if (r.kind === 'lead') {
      leads += 1;
    }
  }

  const netIncome = revenue - expenses;
  const profitMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

  return {
    revenue,
    expenses,
    netIncome,
    profitMargin,
    leads,
    transactionCount: records.length
  };
}

export function filterRecords(
  records: BusinessRecord[],
  options: {
    kind?: 'all' | 'revenue' | 'expense' | 'lead';
    search?: string;
    category?: string;
    dateRange?: 'all' | '7d' | '30d' | '90d' | 'this_year';
  }
): BusinessRecord[] {
  let filtered = [...records];

  if (options.kind && options.kind !== 'all') {
    filtered = filtered.filter((r) => r.kind === options.kind);
  }

  if (options.category && options.category !== 'all') {
    filtered = filtered.filter((r) => (r.category || 'General').toLowerCase() === options.category?.toLowerCase());
  }

  if (options.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
    );
  }

  if (options.dateRange && options.dateRange !== 'all') {
    const now = new Date();
    let cutoff = new Date();
    if (options.dateRange === '7d') {
      cutoff.setDate(now.getDate() - 7);
    } else if (options.dateRange === '30d') {
      cutoff.setDate(now.getDate() - 30);
    } else if (options.dateRange === '90d') {
      cutoff.setDate(now.getDate() - 90);
    } else if (options.dateRange === 'this_year') {
      cutoff = new Date(now.getFullYear(), 0, 1);
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    filtered = filtered.filter((r) => r.date >= cutoffStr);
  }

  return filtered;
}

export function getRevenueExpensesTrend(
  records: BusinessRecord[],
  days = 14
): { date: string; displayDate: string; revenue: number; expense: number; net: number }[] {
  const result: { date: string; displayDate: string; revenue: number; expense: number; net: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dayRecords = records.filter((r) => r.date === dateStr);
    const rev = dayRecords.filter((r) => r.kind === 'revenue').reduce((s, r) => s + r.amount, 0);
    const exp = dayRecords.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);

    result.push({
      date: dateStr,
      displayDate,
      revenue: rev,
      expense: exp,
      net: rev - exp
    });
  }

  return result;
}

export function getCategoryBreakdown(
  records: BusinessRecord[],
  kind: 'revenue' | 'expense'
): { category: string; amount: number; percentage: number }[] {
  const matching = records.filter((r) => r.kind === kind);
  const total = matching.reduce((s, r) => s + r.amount, 0);

  const map = new Map<string, number>();
  for (const r of matching) {
    const cat = r.category || 'General';
    map.set(cat, (map.get(cat) || 0) + r.amount);
  }

  const breakdown: { category: string; amount: number; percentage: number }[] = [];
  for (const [cat, amt] of map.entries()) {
    breakdown.push({
      category: cat,
      amount: amt,
      percentage: total > 0 ? (amt / total) * 100 : 0
    });
  }

  return breakdown.sort((a, b) => b.amount - a.amount);
}

