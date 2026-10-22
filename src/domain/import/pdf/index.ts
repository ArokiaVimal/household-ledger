import { detectAmexIndia, parseAmexIndia } from "./amex-india";
import { detectHdfcCard, parseHdfcCard } from "./hdfc-card";
import { detectIciciBank, parseIciciBank } from "./icici-bank";
import { detectIciciCard, parseIciciCard } from "./icici-card";
import type { PdfPage, PdfParseResult } from "./types";

export type { PdfPage, PdfParseResult, PdfRow, StatementCheck, StatementSummary } from "./types";

/** Picks the parser for the statement's issuer. Unknown layouts are refused, never guessed. */
export function parseStatementPdf(pages: PdfPage[]): PdfParseResult {
  if (detectAmexIndia(pages)) return parseAmexIndia(pages);
  if (detectHdfcCard(pages)) return parseHdfcCard(pages);
  if (detectIciciCard(pages)) return parseIciciCard(pages);
  if (detectIciciBank(pages)) return parseIciciBank(pages);
  return { ok: false, error: "This PDF's layout is not supported yet. Supported: American Express (India), HDFC Bank and ICICI Bank credit-card statements, and ICICI Bank account statements. For other banks, download the CSV or Excel version if offered." };
}
