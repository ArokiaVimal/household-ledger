/** One Gmail connection per person. The refresh token is stored encrypted (see crypto.ts), never in plain text. */
export interface GmailLink {
  uid: string;
  householdId: string;
  email: string;
  refreshTokenEnc: string;
  /** Where a mail goes when it does not say which card or bank it is about. */
  defaultAccountId: string;
  connectedAt: string;
  lastSyncAt?: string;
  lastResult?: { scanned: number; added: number; bills: number; duplicates: number; skipped: number; unreadable: number };
  /** Google stopped allowing the connection; the person must connect again. */
  needsReconnect?: boolean;
}

export interface GmailStore {
  get(uid: string): Promise<GmailLink | null>;
  put(link: GmailLink): Promise<void>;
  remove(uid: string): Promise<void>;
  list(limit: number): Promise<GmailLink[]>;
}

export function createMemoryGmailStore(): GmailStore {
  const m = new Map<string, GmailLink>();
  return {
    async get(u) { return m.get(u) ? structuredClone(m.get(u)!) : null; },
    async put(l) { m.set(l.uid, structuredClone(l)); },
    async remove(u) { m.delete(u); },
    async list(n) { return [...m.values()].slice(0, n).map((l) => structuredClone(l)); },
  };
}
