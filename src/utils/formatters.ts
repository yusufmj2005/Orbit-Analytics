export function formatCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

export function formatNumber(val: number): string {
  if (!Number.isFinite(val)) return '0';
  if (val >= 1_000_000) {
    return (val / 1_000_000).toFixed(1) + 'M';
  }
  if (val >= 1_000) {
    return (val / 1_000).toFixed(1) + 'k';
  }
  return val.toLocaleString();
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0.0%';
  const pct = ratio > 1 ? ratio : ratio * 100;
  return `${pct.toFixed(1)}%`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Not synced yet';
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return 'Unknown';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

