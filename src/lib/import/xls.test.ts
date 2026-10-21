import * as CFB from "cfb";
import { describe, expect, it } from "vitest";
import { isOldExcel, readXls } from "./xls";
import { readTable, sniffKind } from "./files";

// Builds a tiny old-format workbook by hand: one sheet, a shared-string table whose last string runs into a CONTINUE record,
// a text cell, a plain number, and an RK-packed number (the two ways Excel stores numbers).
const rec = (type: number, data: number[]) => [type & 255, type >> 8, data.length & 255, data.length >> 8, ...data];
const u16 = (n: number) => [n & 255, (n >> 8) & 255];
const u32 = (n: number) => [...u16(n & 0xffff), ...u16(n >>> 16)];
const f64 = (n: number) => [...new Uint8Array(new Float64Array([n]).buffer)];
const text = (s: string) => [...u16(s.length), 0, ...[...s].map((c) => c.charCodeAt(0))];

function workbook(): Uint8Array {
  const long = "Withdrawal Amt.";
  const chars = (t: string) => [...t].map((c) => c.charCodeAt(0));
  // two strings; the second is cut after five letters and goes on in a CONTINUE record, which states the character width again
  const sst = [...rec(0xfc, [...u32(2), ...u32(2), ...text("Date"), ...u16(long.length), 0, ...chars(long.slice(0, 5))]), ...rec(0x3c, [0, ...chars(long.slice(5))])];
  const globals = [...rec(0x809, [...u16(0x600), ...u16(0x05), ...u32(0)]), ...rec(0x85, [...u32(0), 0, 0, 4, 0, ...chars("Data")]), ...sst, ...rec(0x0a, [])];
  const sheet = [
    ...rec(0x809, [...u16(0x600), ...u16(0x10), ...u32(0)]),
    ...rec(0xfd, [...u16(0), ...u16(0), ...u16(0), ...u32(0)]), // A1 = "Date"
    ...rec(0xfd, [...u16(0), ...u16(1), ...u16(0), ...u32(1)]), // B1 = "Withdrawal Amt."
    ...rec(0x203, [...u16(1), ...u16(1), ...u16(0), ...f64(1234.56)]), // B2 = 1234.56
    ...rec(0x27e, [...u16(2), ...u16(1), ...u16(0), ...u32((16102 << 2) | 2)]), // B3 = 16102 (RK integer)
    ...rec(0x0a, []),
  ];
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "/Workbook", new Uint8Array([...globals, ...sheet]));
  return new Uint8Array(CFB.write(cfb, { type: "buffer" }) as Buffer);
}

describe("old Excel (.xls) files", () => {
  it("are recognised by content and read cell by cell", () => {
    const bytes = workbook();
    expect(isOldExcel(bytes)).toBe(true);
    const [sheet] = readXls(bytes);
    expect(sheet.sheet).toBe("Data");
    expect(sheet.data).toEqual([["Date", "Withdrawal Amt."], ["", "1234.56"], ["", "16102"]]);
  });
  it("go through the same table reading as .xlsx", async () => {
    const bytes = workbook();
    const kind = sniffKind("statement.xls", bytes) as "xlsx";
    expect(kind).toBe("xlsx");
    expect((await readTable(kind, bytes))[0]).toEqual(["Date", "Withdrawal Amt."]);
  });
  it("refuse a mismatched name and a broken file clearly", async () => {
    expect(() => sniffKind("statement.csv", workbook())).toThrow(/old Excel/);
    const broken = workbook().slice(0, 600);
    await expect(readTable("xlsx", broken)).rejects.toThrow(/Could not open/);
  });
});
