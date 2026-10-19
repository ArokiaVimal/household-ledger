/** A private capture link: whoever holds the token can add messages to the owner's review queue, nothing else. */
export interface CaptureToken {
  uid: string;
  householdId: string;
  /** Where a message goes when it does not say which card or bank it is about. */
  defaultAccountId: string;
  createdAt: string;
  lastUsedAt?: string;
  /** Messages accepted today (YYYY-MM-DD in IST), to cap abuse of a leaked link. */
  day?: string;
  count?: number;
}

export interface CaptureStore {
  get(hash: string): Promise<CaptureToken | null>;
  put(hash: string, t: CaptureToken): Promise<void>;
  listByUser(uid: string): Promise<{ hash: string; token: CaptureToken }[]>;
  remove(hash: string): Promise<void>;
}

export const DAILY_LIMIT = 300;
export const MAX_MESSAGE_CHARS = 2000;
