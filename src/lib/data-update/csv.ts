/** Minimal CSV parser (RFC4180-ish) for admin attribute updates. */

export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function parseCsvText(text: string): CsvTable {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

export async function parseCsvFile(file: File): Promise<CsvTable> {
  const text = await file.text();
  return parseCsvText(text);
}

/** Case-insensitive header lookup → original header name. */
export function findHeader(headers: string[], candidates: string[]): string | null {
  const lower = new Map(headers.map((h) => [h.toLowerCase().replace(/[^a-z0-9]/g, ""), h]));
  for (const c of candidates) {
    const key = c.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = lower.get(key);
    if (hit) return hit;
  }
  return null;
}

export function parseNumber(value: string): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
