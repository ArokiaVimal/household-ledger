const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function valid(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const year2 = (yy: number) => (yy < 70 ? 2000 + yy : 1900 + yy);

/**
 * Statement dates to YYYY-MM-DD. Day-first for slashed/dashed numeric dates (Indian banks): 03/09/2026 is 3 September.
 * Also: 2026-09-03, 3 Sep 2026, 03-Sep-26, "3 Sep, 2026", a trailing time is ignored, and Excel serial numbers.
 */
export function parseStatementDate(input: string | number | Date | null | undefined): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : valid(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  if (typeof input === "number" || /^\d{5}(\.\d+)?$/.test(String(input).trim())) {
    const serial = Math.floor(Number(input));
    if (serial < 25000 || serial > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(input).trim().replace(/[,]/g, " ").replace(/\s+/g, " ").replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s?[ap]m)?$/i, "");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return valid(year2(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[ -/.]([A-Za-z]{3,9})[ -/.](\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    return valid(m[3].length === 2 ? year2(+m[3]) : +m[3], mi + 1, +m[1]);
  }
  return null;
}
