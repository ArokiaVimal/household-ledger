// Reads the old Excel format (.xls, "BIFF8") that some banks still export (HDFC NetBanking does): text and numbers of every worksheet.
// Only what a statement needs: shared strings, text cells, numbers, and formula results. Formatting, dates-as-numbers and macros are ignored.
// The file is a "compound file" container (read with the small `cfb` package) holding a stream of records: [type u16][length u16][data].
import * as CFB from "cfb";

export const isOldExcel = (bytes: Uint8Array) => [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b);

const SST = 0x00fc, CONTINUE = 0x003c, LABELSST = 0x00fd, NUMBER = 0x0203, RK = 0x027e, MULRK = 0x00bd, LABEL = 0x0204, FORMULA = 0x0006, STRING = 0x0207, BOF = 0x0809, EOF = 0x000a, BOUNDSHEET = 0x0085;
const MAX_CELLS = 400_000;

interface Rec { type: number; data: Uint8Array }

function records(stream: Uint8Array): Rec[] {
  const out: Rec[] = [];
  for (let p = 0; p + 4 <= stream.length;) {
    const type = stream[p] | (stream[p + 1] << 8), len = stream[p + 2] | (stream[p + 3] << 8);
    if (p + 4 + len > stream.length) break;
    out.push({ type, data: stream.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }
  return out;
}

const view = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);

/** An Excel string, which may run on into the next CONTINUE record (where the character width is stated again). */
class Chunks {
  private i = 0; private p = 0;
  constructor(private parts: Uint8Array[]) {}
  get done() { return this.i >= this.parts.length; }
  private fix() { while (this.i < this.parts.length && this.p >= this.parts[this.i].length) { this.i++; this.p = 0; } }
  u8(): number { this.fix(); return this.parts[this.i][this.p++]; }
  u16(): number { return this.u8() | (this.u8() << 8); }
  u32(): number { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n: number) { while (n > 0) { this.fix(); if (this.done) return; const k = Math.min(n, this.parts[this.i].length - this.p); this.p += k; n -= k; } }
  string(): string {
    const cch = this.u16(), flags = this.u8();
    const rich = flags & 0x08 ? this.u16() : 0, ext = flags & 0x04 ? this.u32() : 0;
    let wide = !!(flags & 0x01), text = "";
    for (let n = 0; n < cch;) {
      if (this.p >= this.parts[this.i].length) { this.i++; this.p = 0; if (this.done) break; wide = !!(this.parts[this.i][this.p++] & 0x01); } // a continued string states its width again
      const part = this.parts[this.i];
      const room = part.length - this.p, take = Math.min(cch - n, wide ? Math.floor(room / 2) : room);
      if (take <= 0) { this.p = part.length; continue; }
      for (let k = 0; k < take; k++) text += String.fromCharCode(wide ? part[this.p + 2 * k] | (part[this.p + 2 * k + 1] << 8) : part[this.p + k]);
      this.p += wide ? take * 2 : take; n += take;
    }
    this.skip(rich * 4 + ext);
    return text;
  }
}

function rk(v: number): number {
  const div = v & 1 ? 100 : 1;
  if (v & 2) return (v >> 2) / div;
  const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, (v & 0xfffffffc) >>> 0, true);
  return b.getFloat64(0, true) / div;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export interface XlsSheet { sheet: string; data: string[][] }

export function readXls(bytes: Uint8Array): XlsSheet[] {
  const file = CFB.read(Buffer.from(bytes), { type: "buffer" });
  const entry = CFB.find(file, "/Workbook") ?? CFB.find(file, "/Book");
  if (!entry || !entry.content) throw new Error("not an Excel workbook");
  const recs = records(entry.content as Uint8Array);

  // Shared strings and sheet names live before the first worksheet.
  const names: string[] = [];
  const strings: string[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === BOUNDSHEET) { const cch = r.data[6]; names.push(Buffer.from(r.data.subarray(8, 8 + (r.data[7] & 1 ? cch * 2 : cch))).toString(r.data[7] & 1 ? "utf16le" : "latin1")); }
    if (r.type === SST) {
      const parts = [r.data.subarray(8)];
      while (recs[i + 1]?.type === CONTINUE) parts.push(recs[++i].data);
      const c = new Chunks(parts);
      const unique = view(r.data).getUint32(4, true);
      for (let k = 0; k < unique && !c.done; k++) strings.push(c.string());
    }
  }

  const sheets: XlsSheet[] = [];
  let cells: Map<string, string> | null = null, maxR = 0, maxC = 0, pendingFormula: string | null = null, seen = 0, total = 0, depth = 0;
  const put = (r: number, c: number, v: string) => { if (!cells) return; if (++total > MAX_CELLS) throw new Error("too many cells"); cells.set(`${r},${c}`, v); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); };
  for (const r of recs) {
    const d = r.data;
    if (r.type === BOF) {
      depth++; // a chart or macro sheet can nest its own BOF/EOF pair inside a worksheet
      if (depth === 1 && d.length >= 4 && (d[2] | (d[3] << 8)) === 0x0010) { cells = new Map(); maxR = -1; maxC = -1; }
      continue;
    }
    if (r.type === EOF) {
      depth--;
      if (depth === 0 && cells) {
        const grid: string[][] = [];
        for (let y = 0; y <= maxR; y++) { const row: string[] = []; for (let x = 0; x <= maxC; x++) row.push(cells.get(`${y},${x}`) ?? ""); grid.push(row); }
        sheets.push({ sheet: names[seen] ?? `Sheet${seen + 1}`, data: grid }); seen++; cells = null;
      }
      continue;
    }
    if (!cells) continue;
    const dv = view(d);
    if (r.type === LABELSST) put(dv.getUint16(0, true), dv.getUint16(2, true), strings[dv.getUint32(6, true)] ?? "");
    else if (r.type === NUMBER) put(dv.getUint16(0, true), dv.getUint16(2, true), num(dv.getFloat64(6, true)));
    else if (r.type === RK) put(dv.getUint16(0, true), dv.getUint16(2, true), num(rk(dv.getUint32(6, true))));
    else if (r.type === MULRK) {
      const row = dv.getUint16(0, true), first = dv.getUint16(2, true), n = (d.length - 6) / 6;
      for (let k = 0; k < n; k++) put(row, first + k, num(rk(dv.getUint32(4 + k * 6 + 2, true))));
    } else if (r.type === LABEL) put(dv.getUint16(0, true), dv.getUint16(2, true), new Chunks([d.subarray(6)]).string());
    else if (r.type === FORMULA) {
      const row = dv.getUint16(0, true), col = dv.getUint16(2, true);
      if (d[12] === 0xff && d[13] === 0xff && d[6] === 0) pendingFormula = `${row},${col}`; // the text arrives in the STRING record that follows
      else if (!(d[12] === 0xff && d[13] === 0xff)) put(row, col, num(dv.getFloat64(6, true)));
    } else if (r.type === STRING && pendingFormula) {
      const [y, x] = pendingFormula.split(",").map(Number); pendingFormula = null;
      put(y, x, new Chunks([d]).string());
    }
  }
  return sheets.map((s) => ({ sheet: s.sheet, data: s.data.map((row) => row.map((c) => c.trim())) }));
}
