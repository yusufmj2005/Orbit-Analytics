// Calendar-date helpers that use the user's local timezone. Ledger dates are plain
// YYYY-MM-DD strings, so converting through toISOString() (UTC) shifts them by a day
// for anyone not on UTC.

const pad = (n: number) => String(n).padStart(2, '0');

export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgoLocal(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

// Parses a strict YYYY-MM-DD string as a local calendar date.
export function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && parseLocalDate(value) !== null;
}
