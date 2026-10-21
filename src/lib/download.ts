/** Hands a text file to the browser as a download (a CSV, for example). Nothing is uploaded anywhere. */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  // A leading byte-order mark makes Excel read ₹ and other symbols correctly.
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A safe file name from a title: letters and digits, dashes between words. */
export const fileSafe = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "export";
