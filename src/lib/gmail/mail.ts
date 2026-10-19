// Picking out the bank mail worth reading and turning a Gmail message into plain text. Pure helpers.
/** Only mail from these senders is ever read. Anything else in the mailbox is never fetched. */
export const BANK_DOMAINS = [
  "hdfcbank.net", "hdfcbank.com", "icicibank.com", "sbi.co.in", "sbicard.com", "axisbank.com", "kotak.com", "yesbank.in", "idfcfirstbank.com",
  "indusind.com", "indusindbank.com", "rblbank.com", "federalbank.co.in", "bankofbaroda.com", "pnb.co.in", "canarabank.com", "unionbankofindia.co.in",
  "americanexpress.com", "aexp.com", "citi.com", "sc.com", "hsbc.co.in", "onecard.in", "slicepay.in", "paytm.com", "phonepe.com", "cred.club", "amazonpay.in",
];

/** Gmail search for recent bank mail. `afterEpoch` keeps repeat syncs short. */
export function buildQuery(afterEpoch: number): string {
  const from = BANK_DOMAINS.map((d) => `from:${d}`).join(" OR ");
  return `after:${Math.floor(afterEpoch)} (${from})`;
}

/** The sender's domain, checked against the list again after fetching (never trust the search alone). */
export function senderAllowed(from: string): boolean {
  const m = from.toLowerCase().match(/@([a-z0-9.-]+)/);
  if (!m) return false;
  const host = m[1];
  return BANK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface Part { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] }
const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#8377;|&rupee;/gi, "₹").replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n\s*\n+/g, "\n").trim();
}

/** The readable text of a message: the plain-text part when there is one, otherwise the HTML turned into text. */
export function extractText(payload: Part | undefined): string {
  if (!payload) return "";
  const plain: string[] = [], html: string[] = [];
  const walk = (p: Part) => {
    if (p.body?.data && p.mimeType === "text/plain") plain.push(decode(p.body.data));
    else if (p.body?.data && p.mimeType === "text/html") html.push(decode(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(payload);
  return (plain.length ? plain.join("\n") : html.map(htmlToText).join("\n")).trim();
}

export const header = (payload: Part | undefined, name: string) => payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Subject plus the start of the body, without links and long runs of boilerplate, capped for parsing. */
export function messageText(subject: string, body: string, max = 1500): string {
  const clean = body.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  return `${subject.trim()}. ${clean}`.slice(0, max);
}
