// Spotting a transfer between your own accounts. A bank statement shows it as a UPI payment to yourself ("UPI/<your name>/<your UPI id>/...");
// it is neither spending nor income. Conservative: it needs the payee to be you by name (every word of the payee is a word of your own name)
// or by UPI id (the part before @ equals the start of your sign-in email).

/** How the signed-in person is called, so their own transfers can be told from payments to others. */
export interface SelfIdentity { names: string[]; emails: string[] }

const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];

export function selfIdentityOf(people: { name?: string | null; email?: string | null }[]): SelfIdentity {
  return {
    names: people.flatMap((p) => (p.name?.trim() ? [p.name.trim()] : [])),
    emails: people.flatMap((p) => (p.email?.includes("@") ? [p.email.trim().toLowerCase()] : [])),
  };
}

export function isSelfTransfer(description: string, self?: SelfIdentity): boolean {
  if (!self || !/^\s*upi[/-]/i.test(description)) return false;
  const parts = description.split(/[/-]/).map((p) => p.trim());
  const payee = parts[1] ?? "";
  const vpa = parts.find((p) => p.includes("@")) ?? "";
  const local = vpa.split("@")[0].toLowerCase();
  if (local.length >= 5 && self.emails.some((e) => e.split("@")[0] === local)) return true;
  const mine = new Set(self.names.flatMap(words));
  const theirs = words(payee);
  return theirs.length >= 2 && theirs.every((w) => mine.has(w)) && theirs.some((w) => w.length >= 4);
}
