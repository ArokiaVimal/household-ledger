// Reads a PDF's text with positions. unpdf bundles a serverless-friendly build of pdf.js (no worker or canvas needed).
// We never ask for a PDF password: an encrypted file is refused with instructions to unlock a copy locally.
import { getDocumentProxy } from "unpdf";
import type { PdfPage } from "@/domain/import/pdf/types";
import { FileError } from "./files";

const MAX_PAGES = 40;

export async function readPdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // Copy: pdf.js transfers the buffer to its worker and would detach the caller's bytes.
    doc = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") {
      throw new FileError("This PDF is password protected. Open it in Preview (enter the password yourself), choose File > Export as PDF without a password, and upload that copy. We never ask for statement passwords.");
    }
    throw new FileError("Could not open that PDF. It may be damaged.");
  }
  if (doc.numPages > MAX_PAGES) throw new FileError(`That PDF has ${doc.numPages} pages; the limit is ${MAX_PAGES}.`);
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push({
      number: n,
      items: content.items.flatMap((i) => ("str" in i && i.str.trim() ? [{ x: i.transform[4] as number, y: i.transform[5] as number, text: i.str }] : [])),
    });
  }
  if (pages.every((p) => p.items.length === 0)) throw new FileError("This PDF has no readable text (it looks like a scanned image). Ask your bank for the text version or a CSV.");
  return pages;
}
