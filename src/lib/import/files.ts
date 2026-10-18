// Turns an uploaded file's bytes into a table of strings, or explains why it cannot. No file is stored.
import readExcelFile from "read-excel-file/node";
import { parseCsv } from "@/domain/import/csv";
import { detectLayout } from "@/domain/import/columns";
import { MAX_FILE_BYTES } from "./service";

export type FileKind = "csv" | "xlsx";
export class FileError extends Error {}

const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** Decides the format from the content, not just the name, and refuses everything we cannot read yet. */
export function sniffKind(name: string, bytes: Uint8Array): FileKind {
  if (bytes.length === 0) throw new FileError("That file is empty.");
  if (bytes.length > MAX_FILE_BYTES) throw new FileError(`That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Export a shorter date range.`);
  const lower = name.toLowerCase();
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head.startsWith("%PDF")) throw new FileError("PDF statements can't be read yet. Download the CSV or Excel version from your bank if it offers one.");
  if (ZIP.every((b, i) => bytes[i] === b)) {
    if (!lower.endsWith(".xlsx")) throw new FileError("That looks like a zip or Office file. Upload a .xlsx or .csv statement.");
    return "xlsx";
  }
  if (lower.endsWith(".xls")) throw new FileError("Old .xls files aren't supported. Save it as .xlsx or .csv and try again.");
  if (!/\.(csv|txt)$/.test(lower)) throw new FileError("Upload a .csv or .xlsx statement.");
  if (bytes.subarray(0, 4096).includes(0)) throw new FileError("That file is not a text CSV.");
  return "csv";
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v).trim();
};

/** CSV/TSV text, or the first worksheet (of any) that contains a recognisable transaction table. */
export async function readTable(kind: FileKind, bytes: Uint8Array): Promise<string[][]> {
  if (kind === "csv") return parseCsv(new TextDecoder("utf-8").decode(bytes));
  let sheets: { sheet: string; data: unknown[][] }[];
  try { sheets = (await readExcelFile(Buffer.from(bytes))) as unknown as { sheet: string; data: unknown[][] }[]; } catch { throw new FileError("Could not open that Excel file. It may be damaged or password protected."); }
  let last: string[][] = [];
  for (const { data } of sheets.slice(0, 8)) {
    const table = data.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ""));
    if (detectLayout(table)) return table;
    last = table;
  }
  return last;
}
