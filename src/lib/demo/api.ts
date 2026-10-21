// A fake server for the demo. It replaces `fetch` for /api/* so every screen (import, bill scan, screenshots, activity, AI) runs
// end to end on fictional data. Nothing is saved anywhere and nothing leaves the browser.
import type { Preview, PreviewRow } from "@/lib/import/service";
import { DEMO_PROFILE } from "./data";

const paise = (rupees: number) => Math.round(rupees * 100);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NOT_IN_DEMO = { error: "This is not available in the demo." };

const row = (line: number, date: string, merchant: string, description: string, rupees: number, o: Partial<PreviewRow> = {}): PreviewRow => ({
  line, date, description, merchant, amountPaise: paise(rupees), direction: "debit", kind: "purchase", categoryId: "uncategorized", status: "new", accountId: "cc_amex", action: "import", ...o,
});

function preview(filename: string, rows: PreviewRow[], format: Preview["format"] = "pdf", readBy: Preview["readBy"] = "parser"): Preview {
  const debit = rows.filter((r) => r.direction === "debit"), credit = rows.filter((r) => r.direction === "credit");
  return {
    accountId: "cc_amex", filename, fileHash: "demo", positiveIsDebit: true, singleAmountColumn: format === "csv" || format === "xlsx", columns: ["Date", "Description", "Amount"], format, readBy,
    detected: { chosen: false, confidence: "sure", reason: "The statement mentions american express and reads like a credit-card statement." },
    unverified: [], checks: [{ name: "Totals match the statement", ok: true, detail: "Debits and credits agree with the statement's own totals." }], warnings: [],
    rows, skipped: [],
    totals: { debitPaise: debit.reduce((s, r) => s + r.amountPaise, 0), creditPaise: credit.reduce((s, r) => s + r.amountPaise, 0), debitCount: debit.length, creditCount: credit.length },
    counts: { rows: rows.length, new: rows.filter((r) => r.status === "new").length, duplicate: rows.filter((r) => r.status === "duplicate").length, possible: rows.filter((r) => r.status === "possible").length, unreadable: 0, toImport: rows.filter((r) => r.action === "import").length },
    smart: { aiEnabled: true, fromMemory: 3, fromAi: 2, needYou: 2, ai: { asked: 2, calls: 1, inputTokens: 900, outputTokens: 120 } },
  };
}

const sampleRows = (): PreviewRow[] => [
  row(1, "2026-09-28", "Swiggy", "Swiggy Bangalore", 735, { categoryId: "food-delivery", suggested: "memory" }),
  row(2, "2026-09-27", "Zepto", "PayU*ZEPTO MARKETPLACE", 571.95, { categoryId: "groceries", suggested: "memory" }),
  row(3, "2026-09-26", "Shopwise", "CUSTCAP SOLUTIONS PVT L THANE", 5088.5, { voucher: true }),
  row(4, "2026-09-25", "Netflix", "NETFLIX.COM", 649, { categoryId: "subscriptions", suggested: "ai", recurring: true }),
  row(5, "2026-09-24", "Apollo Pharmacy", "APOLLO PHARMACY 603112", 340, { status: "possible", categoryId: "health", suggested: "memory" }),
  row(6, "2026-09-22", "Payment Received. Thank You", "PAYMENT RECEIVED. THANK YOU", 29086.79, { direction: "credit", kind: "cc_payment", categoryId: "transfers" }),
  row(7, "2026-09-21", "Orbgen Technologies", "Razorpay*ORBGEN TECHNOL", 861.6, { suggested: "ai_unsure" }),
];

const shotItems = () => [
  { date: "2026-09-03", merchant: "Shopwise", amountPaise: paise(10000), direction: "debit", status: "done", voucherBrand: "Amazon Pay", faceValuePaise: paise(9800), orderId: "A0HMRKQBWFLK" },
  { date: "2026-09-20", merchant: "Shopwise", amountPaise: paise(5088.5), direction: "debit", status: "done", voucherBrand: "Amazon Pay", faceValuePaise: paise(5000), orderId: "B0HM3AUD1ZC3" },
  { date: "2026-09-25", merchant: "Shopwise", amountPaise: paise(2000), direction: "debit", status: "failed", voucherBrand: "Swiggy Money", faceValuePaise: paise(2000), orderId: "A0HMRKQBWSZ5" },
];

const bill = () => ({
  merchant: "Saravana Bhavan", date: "2026-09-22", totalPaise: paise(1180), extraPaise: paise(180),
  items: [{ name: "2 x Masala Dosa", amountPaise: paise(240) }, { name: "Filter Coffee", amountPaise: paise(60) }, { name: "Meals", amountPaise: paise(600) }, { name: "Gulab Jamun", amountPaise: paise(100) }],
});

const changes = () => {
  const at = (h: number) => new Date(Date.UTC(2026, 8, 24, 10 - h)).toISOString();
  return [
    { id: "a1", at: at(0), actorId: "demo", action: "approve", entity: "record", entityId: "r1", summary: "Approved Swiggy ₹735.00", undoable: true, undone: false },
    { id: "a2", at: at(2), actorId: "demo", action: "edit", entity: "record", entityId: "r2", summary: "Edited Zepto ₹899.00 (category Groceries)", undoable: true, undone: false },
    { id: "a3", at: at(5), actorId: "demo", action: "create", entity: "settlement", entityId: "s1", summary: "Recorded a payment from Karthik ₹1,000.00", undoable: false, undone: false },
  ];
};

const analysis = () => ({
  summary: "September spending was ₹76,762, mostly rent and EMIs. Food and shopping stayed steady.",
  highlights: [{ title: "Rent and loans are half of the month", detail: "₹37,750 of ₹76,762 went to rent, home and EMIs." }, { title: "Groceries are under control", detail: "₹5,125 across Zepto, BigBasket and Blinkit." }],
  tips: [{ title: "Move small subscriptions to one card", detail: "Four subscriptions renew on different dates, which makes bills harder to track.", saveRupees: 0 }],
  watch: ["SBI card bill is 2 days overdue."],
});

async function handle(path: string, init?: RequestInit): Promise<{ status?: number; body: unknown }> {
  const method = (init?.method ?? "GET").toUpperCase();
  const json = (): Record<string, unknown> => { try { return JSON.parse(String(init?.body ?? "{}")); } catch { return {}; } };
  if (path === "/api/data") return { body: { ok: true } };
  if (path === "/api/dismissed") return { body: { ok: true } };
  if (path === "/api/version") return { body: { version: "dev" } };
  if (path === "/api/import" || path === "/api/import/text") {
    const form = init?.body instanceof FormData ? init.body : null;
    const b = form ? {} : json();
    const mode = form ? String(form.get("mode") ?? "preview") : String(b.action ?? "preview");
    if (mode === "commit") return { body: { ok: true, result: { batchId: "demo", counts: { rows: 7, new: 6, duplicate: 0, possible: 1, unreadable: 0, toImport: 7, staged: 7, skipped: 0 } } } };
    const name = form ? (form.get("file") as File | null)?.name ?? "statement.pdf" : "Pasted text";
    const text = !form;
    await wait(500);
    return { body: { ok: true, preview: text ? preview(name, sampleRows().slice(0, 3), "text", b.mode === "ai" ? "ai" : "parser") : preview(name, sampleRows()), extraction: text && b.mode === "ai" ? { calls: 1, inputTokens: 600, outputTokens: 90 } : undefined } };
  }
  if (path === "/api/import/screenshot") {
    const b = json();
    if (b.action === "read") { await wait(900); return { body: { ok: true, items: shotItems(), unreadable: 0, warnings: [] } }; }
    return { body: { ok: true, result: { batchId: "demo", counts: { staged: Array.isArray(b.rows) ? b.rows.length : 0, skipped: 0, unreadable: 0 } } } };
  }
  if (path === "/api/bill") { await wait(900); return { body: { ok: true, bill: bill(), warnings: [] } }; }
  if (path === "/api/activity") return { body: { ok: true, changes: changes(), imports: [{ id: "i1", filename: "Amex_Sep2026.pdf", uploadedAt: "2026-09-22T08:00:00.000Z", rows: 14, rolledBackAt: null, approved: 9, waiting: 5 }] } };
  if (path === "/api/insights") { await wait(900); return { body: { ok: true, analysis: analysis(), generatedAt: new Date().toISOString() } }; }
  if (path === "/api/notes") return { body: { ok: true, read: 0, proposals: [], partial: null } };
  if (path === "/api/push/subscribe" && method === "GET") return { body: { enabled: false, publicKey: null } };
  if (path === "/api/profile" && method === "PUT") return { body: { ok: true, profile: { ...DEMO_PROFILE, ...json() } } };
  return { status: 400, body: NOT_IN_DEMO };
}

/** Replaces `fetch` for /api/* with the fake server above. Safe to call more than once. */
export function installDemoApi() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __demoApi?: boolean };
  if (w.__demoApi) return;
  w.__demoApi = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.origin).pathname;
    if (!path.startsWith("/api/")) return real(input, init);
    const r = await handle(path, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
}
