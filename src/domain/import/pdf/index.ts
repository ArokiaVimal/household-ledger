import { detectAmexIndia, parseAmexIndia } from "./amex-india";
import type { PdfPage, PdfParseResult } from "./types";

export type { PdfPage, PdfParseResult, PdfRow, StatementCheck, StatementSummary } from "./types";

/** Picks the parser for the statement's issuer. Unknown layouts are refused, never guessed. */
export function parseStatementPdf(pages: PdfPage[]): PdfParseResult {
  if (detectAmexIndia(pages)) return parseAmexIndia(pages);
  return { ok: false, error: "This PDF's layout is not supported yet. Supported: American Express (India) credit-card statements. For other banks, download the CSV or Excel version if offered." };
}
