import { BusinessRecord, RecordKind } from '../vite-env';
import { localDateString, parseLocalDate } from './dates';

export function exportRecordsToCsv(records: BusinessRecord[]): string {
  const headers = ['id', 'date', 'label', 'kind', 'amount', 'category', 'notes'];
  const rows = records.map((r) => [
    escapeCsv(r.id),
    escapeCsv(r.date),
    escapeCsv(r.label),
    escapeCsv(r.kind),
    String(r.amount),
    escapeCsv(r.category || 'General'),
    escapeCsv(r.notes || '')
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

export function parseCsvToRecords(csvText: string): { records: BusinessRecord[]; errors: string[] } {
  const rows = parseCsv(csvText.replace(/^﻿/, '')).filter((cells) => cells.some((c) => c.trim()));

  if (rows.length < 2) {
    return { records: [], errors: ['CSV file is empty or missing data rows.'] };
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());

  // Find column indexes
  const dateIdx = headers.findIndex((h) => h.includes('date'));
  const labelIdx = headers.findIndex((h) => h.includes('label') || h.includes('desc') || h.includes('title') || h.includes('name'));
  const kindIdx = headers.findIndex((h) => h.includes('kind') || h.includes('type'));
  const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('value') || h.includes('price') || h.includes('total'));
  const catIdx = headers.findIndex((h) => h.includes('cat'));
  const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('comment') || h.includes('memo'));

  if (labelIdx === -1) {
    return { records: [], errors: ['CSV must have a column for description/label.'] };
  }

  const records: BusinessRecord[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowNumber = i + 1;

    const label = unescapeFormula((cells[labelIdx] || '').trim());
    if (!label) {
      errors.push(`Row ${rowNumber}: Missing description.`);
      continue;
    }

    const rawDate = dateIdx !== -1 ? (cells[dateIdx] || '').trim() : '';
    let date = parseCsvDate(rawDate);
    if (!date) {
      if (rawDate) errors.push(`Row ${rowNumber}: Unrecognized date "${rawDate}", used today's date instead.`);
      date = localDateString();
    }

    let kind: RecordKind = 'revenue';
    const hasKind = kindIdx !== -1 && Boolean(cells[kindIdx]?.trim());
    if (hasKind) {
      const k = cells[kindIdx].trim().toLowerCase();
      if (k.includes('exp') || k.includes('debit') || k.includes('cost')) kind = 'expense';
      else if (k.includes('lead')) kind = 'lead';
    }

    let amount = 0;
    if (kind !== 'lead' && amountIdx !== -1 && cells[amountIdx]?.trim()) {
      const parsed = parseAmount(cells[amountIdx]);
      if (parsed === null) {
        errors.push(`Row ${rowNumber}: Invalid amount "${cells[amountIdx].trim()}".`);
        continue;
      }
      // Without a type column, the sign carries the meaning (e.g. bank exports: -45.00 is money out).
      if (parsed < 0 && !hasKind) kind = 'expense';
      amount = Math.abs(parsed);
    }

    const category = catIdx !== -1 && cells[catIdx] ? unescapeFormula(cells[catIdx].trim()) : 'General';
    const notes = notesIdx !== -1 && cells[notesIdx] ? unescapeFormula(cells[notesIdx].trim()) : '';

    records.push({
      id: crypto.randomUUID(),
      date,
      label,
      kind,
      amount,
      category: category || 'General',
      notes
    });
  }

  return { records, errors };
}

// Accepts "1,234.56", "$1,234.56", "-45", "(45.00)" (accounting negative). Returns null if unparseable.
function parseAmount(raw: string): number | null {
  let text = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const clean = text.replace(/[^0-9.-]/g, '');
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(clean)) return null;
  const value = parseFloat(clean);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

// Returns a local YYYY-MM-DD date, or null if the value isn't a recognizable date.
function parseCsvDate(raw: string): string | null {
  if (!raw) return null;
  if (parseLocalDate(raw)) return raw;
  // Strings like "10/05/2026" or "Oct 5, 2026" parse as local time; ISO date-times keep their own offset.
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : localDateString(d);
}

// Reverses the formula-injection prefix added by escapeCsv, so exports re-import unchanged.
function unescapeFormula(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function escapeCsv(val: string): string {
  let text = val;
  // Prevent spreadsheet formula injection: a cell starting with = + - @ (or tab/CR)
  // would be executed by Excel/Sheets when the export is opened.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text) || text !== val) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// RFC 4180 parser: handles quoted fields containing commas, quotes and line breaks.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
