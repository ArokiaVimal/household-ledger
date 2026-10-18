import type { PdfItem, PdfPage } from "./types";

export interface PdfLine { page: number; y: number; items: PdfItem[]; text: string }

/** Groups items that share a baseline (within `tol` points) into lines, top to bottom, left to right. */
export function toLines(pages: PdfPage[], tol = 2.5): PdfLine[] {
  const out: PdfLine[] = [];
  for (const p of pages) {
    const items = p.items.filter((i) => i.text.trim() !== "").map((i) => ({ ...i, text: i.text.trim() })).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: PdfLine[] = [];
    for (const it of items) {
      const l = lines.find((l) => Math.abs(l.y - it.y) <= tol);
      if (l) l.items.push(it); else lines.push({ page: p.number, y: it.y, items: [it], text: "" });
    }
    for (const l of lines.sort((a, b) => b.y - a.y)) {
      l.items.sort((a, b) => a.x - b.x);
      l.text = l.items.map((i) => i.text).join(" ");
      out.push(l);
    }
  }
  return out;
}
