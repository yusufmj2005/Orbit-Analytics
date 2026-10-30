import { BusinessRecord, RecordKind } from '../vite-env';

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
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { records: [], errors: ['CSV file is empty or missing data rows.'] };
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().trim());

  // Find column indexes
  const dateIdx = headers.findIndex((h) => h.includes('date'));
  const labelIdx = headers.findIndex((h) => h.includes('label') || h.includes('desc') || h.includes('title') || h.includes('name'));
  const kindIdx = headers.findIndex((h) => h.includes('kind') || h.includes('type'));
  const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('val') || h.includes('price') || h.includes('total'));
  const catIdx = headers.findIndex((h) => h.includes('cat'));
  const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('comment'));

  if (labelIdx === -1) {
    return { records: [], errors: ['CSV must have a column for description/label.'] };
  }

  const records: BusinessRecord[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cells = parseCsvLine(rawLine);
    if (cells.length === 0 || cells.every((c) => !c.trim())) continue;

    const label = (cells[labelIdx] || '').trim();
    if (!label) {
      errors.push(`Row ${i + 1}: Missing description.`);
      continue;
    }

    let date = dateIdx !== -1 && cells[dateIdx] ? cells[dateIdx].trim() : '';
    if (!date || isNaN(new Date(date).getTime())) {
      date = new Date().toISOString().slice(0, 10);
    } else {
      date = new Date(date).toISOString().slice(0, 10);
    }

    let kind: RecordKind = 'revenue';
    if (kindIdx !== -1 && cells[kindIdx]) {
      const k = cells[kindIdx].trim().toLowerCase();
      if (k.includes('exp')) kind = 'expense';
      else if (k.includes('lead')) kind = 'lead';
      else kind = 'revenue';
    }

    let amount = 0;
    if (amountIdx !== -1 && cells[amountIdx]) {
      const cleanNum = cells[amountIdx].replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleanNum);
      if (Number.isFinite(parsed)) amount = Math.abs(parsed);
    }

    const category = catIdx !== -1 && cells[catIdx] ? cells[catIdx].trim() : 'General';
    const notes = notesIdx !== -1 && cells[notesIdx] ? cells[notesIdx].trim() : '';

    records.push({
      id: crypto.randomUUID(),
      date,
      label,
      kind,
      amount,
      category: category || 'General',
      notes,
      isSample: false
    });
  }

  return { records, errors };
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

