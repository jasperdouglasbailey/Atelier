/**
 * Minimal CSV utilities — no external deps.
 * Handles quoted fields and commas inside values.
 */

/** Escape a single CSV cell value. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  // Quote if contains comma, newline, or double-quote
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV row from an array of values. */
export function csvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(csvCell).join(',');
}

/** Build a complete CSV string from headers + rows. */
export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  return [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
}

/**
 * Parse a CSV string into an array of row objects.
 * Handles double-quote escaping and quoted fields.
 * Returns parsed rows as `Record<string, string>` keyed by header.
 *
 * Limitations:
 *   - Assumes first row is the header
 *   - No support for multi-line values inside quotes
 *   - Trims whitespace from header names
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvRow(lines[0]).map((h) => h.trim());
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? '').trim();
    }
    results.push(row);
  }

  return results;
}

/** Split a single CSV row, respecting quoted fields. */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let inQuote = false;
  let cell = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote
          cell += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  cells.push(cell);
  return cells;
}
