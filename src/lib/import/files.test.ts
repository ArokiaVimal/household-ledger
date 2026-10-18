import writeExcelFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import { extractRows } from "@/domain/import/rows";
import { FileError, readTable, sniffKind } from "./files";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sniffKind", () => {
  it("accepts csv by content and name; refuses PDFs, old xls and binary junk with guidance", () => {
    expect(sniffKind("a.csv", enc("Date,Narration\n1,2"))).toBe("csv");
    expect(() => sniffKind("a.pdf", enc("%PDF-1.7 ..."))).toThrow(/PDF/);
    expect(() => sniffKind("renamed.csv", enc("%PDF-1.7 ..."))).toThrow(/PDF/);
    expect(() => sniffKind("a.xls", enc("xx"))).toThrow(FileError);
    expect(() => sniffKind("a.csv", new Uint8Array([65, 0, 66]))).toThrow(/not a text CSV/);
    expect(() => sniffKind("a.csv", new Uint8Array(0))).toThrow(/empty/);
    expect(() => sniffKind("a.exe", enc("hello"))).toThrow(/\.csv or \.xlsx/);
  });
  it("recognises xlsx by its zip signature", () => {
    expect(sniffKind("s.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBe("xlsx");
    expect(() => sniffKind("s.zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toThrow(FileError);
  });
});

describe("readTable", () => {
  it("reads CSV text", async () => {
    expect(await readTable("csv", enc("Date,Narration\n01/09/26,Shop"))).toEqual([["Date", "Narration"], ["01/09/26", "Shop"]]);
  });
  it("reads a real .xlsx (dates, numbers, text) into a table the extractor understands, skipping a preamble", async () => {
    const buf = await writeExcelFile([
      [{ value: "Account Statement", type: String }],
      [{ value: "Date", type: String }, { value: "Narration", type: String }, { value: "Withdrawal Amt.", type: String }, { value: "Deposit Amt.", type: String }],
      [{ value: new Date(Date.UTC(2026, 8, 1)), type: Date, format: "dd/mm/yyyy" }, { value: "UPI-SWIGGY-swiggy@icici", type: String }, { value: 612, type: Number }, null],
      [{ value: new Date(Date.UTC(2026, 8, 2)), type: Date, format: "dd/mm/yyyy" }, { value: "SALARY", type: String }, null, { value: 185000.1, type: Number }],
    ]).toBuffer();
    const table = await readTable("xlsx", new Uint8Array(buf));
    const r = extractRows(table);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows.map((x) => [x.date, x.direction, x.amountPaise])).toEqual([["2026-09-01", "debit", 61200], ["2026-09-02", "credit", 18500010]]);
  });
  it("rejects a corrupt .xlsx with a readable error", async () => {
    await expect(readTable("xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]))).rejects.toBeInstanceOf(FileError);
  });
});
