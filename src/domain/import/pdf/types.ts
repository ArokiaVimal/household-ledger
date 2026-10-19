/** A piece of text on a PDF page with its position (PDF points; y grows upward). */
export interface PdfItem { x: number; y: number; text: string }
export interface PdfPage { number: number; items: PdfItem[] }

export interface StatementCheck { name: string; ok: boolean; detail: string }

export interface StatementSummary {
  issuer: string;
  periodStart?: string;
  periodEnd?: string;
  openingPaise?: number;
  newCreditsPaise?: number;
  newDebitsPaise?: number;
  closingPaise?: number;
  minimumDuePaise?: number;
  /** Payment due date as printed (best effort; absent when not found). */
  dueDate?: string;
}

export interface PdfRow {
  /** Page and order, used as the row's "line" so a person can find it. */
  page: number;
  index: number;
  date: string;
  description: string;
  amountPaise: number;
  direction: "debit" | "credit";
  /** Text as printed: date, description, amount, marker. Kept as the immutable raw record. */
  raw: string[];
}

export type PdfParseResult =
  | { ok: true; summary: StatementSummary; rows: PdfRow[]; checks: StatementCheck[]; warnings: string[] }
  | { ok: false; error: string };
