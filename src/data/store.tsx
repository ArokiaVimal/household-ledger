"use client";
// Client store with two modes.
// - Demo (no `live` prop): fictional data in memory, nothing is saved.
// - Live: starts from the household's data loaded on the server and sends every change to /api/data.
//   The screen updates immediately; if the server rejects a change the message is shown and the data is re-synced.
// All calculations live in src/domain.
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { pairBalances } from "@/domain/balances";
import { categoryUsage, checkDelete, cleanCategoryName, makeCategoryId, reassign, validateCategoryName } from "@/domain/categories";
import { suggestedWithParents } from "@/domain/accounts";
import { SUGGESTED_ACCOUNTS } from "@/domain/defaults";
import { recurringStatuses } from "@/domain/recurring";
import { summarize } from "@/domain/reports";
import type { MerchantRule } from "@/domain/rules";
import { scopeRecords, sharedToRecord } from "@/domain/sharing";
import { OWNER_SHARE_BPS } from "@/domain/defaults";
import type { Account, CardBill, VoucherBrand, Category, ExpenseRecord, ImportBatch, Participant, Receipt, RecurringItem, Settlement, SharedExpense } from "@/domain/types";
import type { CoupleData } from "@/lib/data/couple";
import type { HouseholdData } from "@/lib/data/load";
import { pickMonth } from "@/domain/months";
import { checkFriendDelete, friendUsage } from "@/domain/friends";
import { validateSplit } from "@/domain/splits";
import { MOCK_TODAY, ME, accounts as mockAccounts, categories as mockCategories, initialReceipts, initialRecords, initialSettlements, merchantRules, participants as mockParticipants, recurringItems as mockRecurring, cardBills as mockCardBills, voucherBrands as mockVoucherBrands, voucherRecords as mockVoucherRecords, trendHistory as mockTrend } from "./mock";

export type View = "household" | "personal";

export interface LiveInit {
  data: HouseholdData;
  /** Participant id of the signed-in user. */
  meId: string;
  /** Today's date (YYYY-MM-DD) from the server, so server and client agree. */
  today: string;
  /** False when the signed-in user has no household yet (the data is empty and changes cannot be saved). */
  ready: boolean;
  /** Set when the user is linked (or was linked) with a partner: the shared expenses and settlements live here. */
  couple?: CoupleData;
  /** The server has an AI key, so import suggestions use Claude (merchant memory works either way). */
  aiEnabled?: boolean;
}

interface Store {
  /** True when AI-powered suggestions are switched on for this app. */
  aiEnabled: boolean;
  /** True when connected to the household's saved data; false in demo mode. */
  live: boolean;
  /** Live mode only: whether the user belongs to a household. Always true in demo mode. */
  householdReady: boolean;
  /** Participant id of the signed-in user, and the first other household participant (for presets). */
  meId: string;
  /** The couple's usual split: `leaderId` bears `leaderBps` (6400 = 64%), the partner the rest. 50/50 until a couple sets it. */
  splitRatio: { leaderId: string; leaderBps: number };
  partnerId: string | null;
  /** An invited partner who has not accepted yet (usable in splits under the name typed at invite time). */
  pendingPartner: Participant | null;
  /** Live mode: the linked partner, if any. `active` is false after unlinking (history only). */
  partner: { name: string; participantId: string; active: boolean; endedAt?: string } | null;
  /** Expenses shared between the partners (both people's), as ledger rows. Empty without a partner. */
  sharedRecords: ExpenseRecord[];
  today: string;
  participants: Participant[];
  accounts: Account[];
  recurringItems: RecurringItem[];
  /** Static prior-month totals for the demo trend chart (empty in live mode). */
  trendHistory: Record<string, number>;
  /** True while only imported (unreviewed) rows exist: screens show them as a labelled preview. Never true once anything is approved. */
  previewing: boolean;
  /** What the screens are built from: the approved ledger, or the waiting rows while previewing. */
  shown: ExpenseRecord[];
  /** The ledger: only approved records. Everything in reports, balances and recurring comes from here. */
  records: ExpenseRecord[];
  /** Review queue: imported rows waiting for manual approval. Never counted in reports until approved. */
  staged: ExpenseRecord[];
  settlements: Settlement[];
  receipts: Receipt[];
  /** Statement upload history, newest first (live mode). */
  importBatches: ImportBatch[];
  month: string;
  setMonth: (m: string) => void;
  view: View;
  setView: (v: View) => void;
  /** Records in the selected month and view. Personal = ones where I paid or hold a share. */
  scoped: ExpenseRecord[];
  summary: ReturnType<typeof summarize>;
  balances: ReturnType<typeof pairBalances>;
  /** Every payment that can create a debt between two people (see `personLedger`). */
  ledgerRecords: ExpenseRecord[];
  /** Status of each recurring item for the selected month. */
  recurring: ReturnType<typeof recurringStatuses>;
  /** Household categories (editable) and the merchant rules that point at them. */
  categories: Category[];
  rules: MerchantRule[];
  /** Each returns an error message, or null on success. */
  addCategory: (name: string) => Added;
  renameCategory: (id: string, name: string) => string | null;
  /** If the category is in use, `moveTo` says where its records and rules go. */
  deleteCategory: (id: string, moveTo?: string) => string | null;
  addRule: (r: MerchantRule) => void;
  removeRule: (merchant: string) => void;
  addAccount: (name: string, type: Account["type"], parentId?: string) => string | null;
  /** Rename a payment method or put it under another (null takes it out). Returns an error message, or null. */
  updateAccount: (id: string, patch: { name?: string; parentId?: string | null }) => string | null;
  addSuggestedAccounts: () => void;
  addParticipant: (name: string) => Added;
  /** Removes a friend (no account) that nothing refers to. Returns an error message, or null when removed. */
  deleteParticipant: (id: string) => string | null;
  /** Adds or changes a recurring commitment (new when `id` is omitted). Returns an error message, or null when saved. */
  saveRecurring: (item: Omit<RecurringItem, "id"> & { id?: string }) => string | null;
  /** Removes a recurring item; the payments linked to it stay but are unlinked. */
  deleteRecurring: (id: string) => void;
  /** Credit-card bills: the full amount due and the due date. */
  cardBills: CardBill[];
  /** Adds or changes a bill (new when `id` is omitted). Returns an error message, or null when saved. */
  saveCardBill: (bill: Omit<CardBill, "id"> & { id?: string }) => string | null;
  deleteCardBill: (id: string) => void;
  /** Voucher brands (Amazon, Swiggy, Myntra, or ones you add). */
  voucherBrands: VoucherBrand[];
  addVoucherBrand: (name: string) => Added;
  updateVoucherBrand: (id: string, patch: { name?: string; balance?: VoucherBrand["balance"] | null; tracksAllUse?: boolean }) => string | null;
  deleteVoucherBrand: (id: string) => string | null;
  updateRecord: (id: string, patch: Partial<ExpenseRecord>) => void;
  /** Manual entry. In live mode the id is generated here and the server forces the trusted fields. */
  addRecord: (r: ExpenseRecord) => void;
  /** Demo only: real imports arrive with the statement parsers. */
  stageRecords: (rs: ExpenseRecord[]) => void;
  /** Save edits to a queued row without approving it. */
  updateStaged: (id: string, patch: Partial<ExpenseRecord>) => void;
  /** Move a queued row into the ledger, marking it reviewed. */
  approveStaged: (id: string, patch?: Partial<ExpenseRecord>) => void;
  rejectStaged: (id: string) => void;
  /** Permanently removes records (ledger or review queue). The original statement lines stay in the import history. */
  deleteRecords: (ids: string[]) => void;
  addSettlement: (s: Omit<Settlement, "id">) => void;
  voidSettlement: (id: string) => void;
  linkReceipt: (receiptId: string, recordId: string | null) => void;
  nameOf: (id: string) => string;
  recurringName: (id: string) => string;
  categoryName: (id: string) => string;
  accountName: (id: string) => string;
  /** Last save problem, shown once. */
  syncError: string | null;
  dismissSyncError: () => void;
}

const Ctx = createContext<Store | null>(null);

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Fields a person can change on an existing record; undefined means "clear it" on the wire. */
const EDITABLE = ["merchant", "categoryId", "kind", "payerId", "shared", "split", "excluded", "notes", "recurringId", "fundedBy", "paidCardId", "recurringHint", "voucherBrandId", "paidWithVoucherId", "voucherPending", "receiptId"] as const;
function toWirePatch(patch: Partial<ExpenseRecord>) {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in patch) out[k] = patch[k] === undefined ? null : patch[k];
  return out;
}

/** Result of adding something by name: its new id, or what is wrong with the name. */
export type Added = { id: string; error?: undefined } | { id?: undefined; error: string };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "item";

function seed(live?: LiveInit) {
  if (live) {
    const d = live.data;
    const c = live.couple;
    // Names of both partners are needed to show a split, whichever space they were first stored in.
    const people = [...d.participants, ...(c?.participants ?? []).filter((p) => !d.participants.some((x) => x.id === p.id))];
    return {
      records: d.records.filter((r) => r.status === "reviewed"), staged: d.records.filter((r) => r.status === "unreviewed"), categories: d.categories, rules: d.rules, settlements: [...(c?.settlements ?? []), ...d.settlements.filter((x) => !(c?.settlements ?? []).some((y) => y.id === x.id))],
      shared: c?.shared ?? ([] as SharedExpense[]),
      receipts: d.receipts, participants: people, accounts: d.accounts, recurringItems: d.recurring, importBatches: d.importBatches, cardBills: d.cardBills, voucherBrands: d.voucherBrands,
    };
  }
  return {
    records: [...initialRecords, ...mockVoucherRecords].filter((r) => r.status === "reviewed"), staged: [...initialRecords, ...mockVoucherRecords].filter((r) => r.status === "unreviewed"), categories: mockCategories, rules: merchantRules,
    settlements: initialSettlements, shared: [] as SharedExpense[], receipts: initialReceipts, participants: mockParticipants, accounts: mockAccounts, recurringItems: mockRecurring, importBatches: [] as ImportBatch[], cardBills: mockCardBills, voucherBrands: mockVoucherBrands,
  };
}

export function StoreProvider({ children, initialView = "personal", live }: { children: ReactNode; initialView?: View; live?: LiveInit }) {
  const router = useRouter();
  const init = useMemo(() => seed(live), [live]);
  const [records, setRecords] = useState(init.records);
  const [staged, setStaged] = useState(init.staged);
  const [categories, setCategories] = useState<Category[]>(init.categories);
  const [rules, setRules] = useState<MerchantRule[]>(init.rules);
  const [settlements, setSettlements] = useState(init.settlements);
  const [shared, setShared] = useState(init.shared);
  const [receipts, setReceipts] = useState(init.receipts);
  const [participants, setParticipants] = useState<Participant[]>(init.participants);
  const [accounts, setAccounts] = useState<Account[]>(init.accounts);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>(init.recurringItems);
  const [cardBills, setCardBills] = useState<CardBill[]>(init.cardBills);
  const [voucherBrands, setVoucherBrands] = useState<VoucherBrand[]>(init.voucherBrands);
  const today = live?.today ?? MOCK_TODAY;
  const [month, setMonth] = useState(() => pickMonth(today, [...init.records, ...init.staged].map((r) => r.date)));
  const [view, setView] = useState<View>(initialView);
  const [syncError, setSyncError] = useState<string | null>(null);
  const meId = live?.meId ?? ME;
  const couple = live?.couple;
  // In live mode a partner exists only once linked: friends in the list are not a "usual split" partner.
  // An invited partner who has not accepted yet is already usable in splits, under the name typed at invite time.
  const pendingPartner = participants.find((p) => p.pendingEmail) ?? null;
  const partnerId = couple?.partner.participantId ?? (live ? pendingPartner?.id ?? null : participants.find((p) => p.id !== meId && p.userId)?.id ?? participants.find((p) => p.id !== meId)?.id ?? null);
  const splitRatio = useMemo(() => (live ? (couple ? { leaderId: couple.ratio.leaderId, leaderBps: couple.ratio.leaderBps } : { leaderId: meId, leaderBps: pendingPartner ? pendingPartner.inviterShareBps ?? 6400 : 5000 }) : { leaderId: ME, leaderBps: OWNER_SHARE_BPS }), [live, couple, meId, pendingPartner]);
  const trendHistory = live ? {} : mockTrend;

  // After a failed save the server re-sends the household's data; adopt it (React's "adjust state on prop change" pattern).
  const [prevInit, setPrevInit] = useState(init);
  if (prevInit !== init) {
    setPrevInit(init);
    setRecords(init.records); setStaged(init.staged); setCategories(init.categories); setRules(init.rules); setSettlements(init.settlements); setShared(init.shared);
    setReceipts(init.receipts); setParticipants(init.participants); setAccounts(init.accounts); setRecurringItems(init.recurringItems); setCardBills(init.cardBills); setVoucherBrands(init.voucherBrands);
    // New data may live in a month other than the one on screen (e.g. an older statement): keep the month if it has data, else move to one that does.
    const dates = [...init.records, ...init.staged].map((r) => r.date);
    setMonth((m) => (dates.length === 0 || dates.some((d) => d.startsWith(m)) ? m : pickMonth(today, dates)));
  }

  /** Sends a change to the server (live mode only). On failure, shows why and re-syncs from the server. */
  const send = useCallback(async (action: object) => {
    if (!live) return;
    try {
      const res = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save that change.");
    } catch (e) {
      setSyncError((e as Error).message || "Could not save that change.");
      router.refresh();
    }
  }, [live, router]);

  // Until the first approval nothing is "in" the ledger, so the screens would be empty right after an import. In that
  // one situation they show the waiting rows as a clearly labelled preview (see the banner in the app shell).
  const previewing = !!live && records.length === 0 && staged.length > 0;
  const shown = previewing ? staged : records;
  // Live with a partner: shared expenses (both people's) as ledger rows. Mine = my own records plus my share of what my
  // partner paid; Together = only what is shared. My own shared expenses appear once, from my records.
  const sharedRecords = useMemo(() => shared.map(sharedToRecord), [shared]);
  const together = !!live && !!couple;
  const scoped = useMemo(() => scopeRecords({ own: shown, shared: sharedRecords, coupled: together, view, meId, month }), [shown, sharedRecords, together, month, view, meId]);
  const summary = useMemo(() => summarize(scoped, meId), [scoped, meId]);
  const recurring = useMemo(() => recurringStatuses(recurringItems, records, month, today), [recurringItems, records, month, today]);
  // Everything that can make one person owe another: what is shared with your partner (couple space) plus what you split with
  // friends and an invited partner (your own space). A record already shared with your partner is counted once, from the couple copy.
  const ledgerRecords = useMemo(() => (live ? [...sharedRecords, ...records.filter((r) => !r.sharedWithPartner && r.split.participantIds.some((id) => id !== meId))] : records), [live, sharedRecords, records, meId]);
  const balances = useMemo(() => pairBalances(ledgerRecords, settlements), [ledgerRecords, settlements]);

  const updateRecord = useCallback((id: string, patch: Partial<ExpenseRecord>) => {
    if (live && !records.some((r) => r.id === id)) { setSyncError("Only the person who shared this expense can change it."); return; }
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    void send({ type: "record.update", id, patch: toWirePatch(patch) });
  }, [live, records, send]);
  const addRecord = useCallback((r: ExpenseRecord) => {
    const rec = { ...r, id: live ? uuid() : `m${Date.now().toString(36)}` };
    setRecords((rs) => [...rs, rec]);
    void send({
      type: "record.create",
      record: { id: rec.id, date: rec.date, merchant: rec.merchant, amountPaise: rec.amountPaise, accountId: rec.accountId, categoryId: rec.categoryId, kind: rec.kind, payerId: rec.payerId, shared: rec.shared, split: rec.split, excluded: rec.excluded, notes: rec.notes, recurringId: rec.recurringId, fundedBy: rec.fundedBy, paidCardId: rec.paidCardId, voucherBrandId: rec.voucherBrandId, paidWithVoucherId: rec.paidWithVoucherId },
    });
  }, [live, send]);
  const stageRecords = useCallback((rs: ExpenseRecord[]) => {
    if (live) return; // real imports need the statement parsers
    setStaged((x) => [...x, ...rs.map((r, i) => ({ ...r, id: `q${Date.now().toString(36)}-${x.length + i}`, status: "unreviewed" as const }))]);
  }, [live]);
  const updateStaged = useCallback((id: string, patch: Partial<ExpenseRecord>) => {
    setStaged((xs) => xs.map((r) => (r.id === id ? { ...r, ...patch, status: "unreviewed" as const } : r)));
    void send({ type: "record.update", id, patch: toWirePatch(patch) });
  }, [send]);
  const approveStaged = useCallback((id: string, patch: Partial<ExpenseRecord> = {}) => {
    const r = staged.find((x) => x.id === id);
    if (!r) return;
    setRecords((rs) => (rs.some((x) => x.id === id) ? rs : [...rs, { ...r, ...patch, status: "reviewed" }]));
    setStaged((xs) => xs.filter((x) => x.id !== id));
    void send({ type: "record.approve", id, patch: toWirePatch(patch) });
  }, [staged, send]);
  const rejectStaged = useCallback((id: string) => {
    setStaged((xs) => xs.filter((x) => x.id !== id));
    void send({ type: "record.reject", id });
  }, [send]);

  const deleteRecords = useCallback((ids: string[]) => {
    if (live && ids.some((id) => !records.some((r) => r.id === id) && !staged.some((r) => r.id === id))) { setSyncError("Only the person who shared this expense can remove it."); return; }
    const gone = new Set(ids);
    setRecords((rs) => rs.filter((r) => !gone.has(r.id)));
    setStaged((xs) => xs.filter((r) => !gone.has(r.id)));
    for (const id of ids) void send({ type: "record.delete", id });
  }, [live, records, staged, send]);

  const addCategory = useCallback((name: string) => {
    const err = validateCategoryName(name, categories);
    if (err) return { error: err };
    const id = makeCategoryId(name, categories.map((c) => c.id));
    setCategories((cs) => [...cs, { id, name: cleanCategoryName(name) }]);
    void send({ type: "category.add", id, name });
    return { id };
  }, [categories, send]);
  const renameCategory = useCallback((id: string, name: string) => {
    const err = validateCategoryName(name, categories, id);
    if (err) return err;
    setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, name: cleanCategoryName(name) } : c)));
    void send({ type: "category.rename", id, name });
    return null;
  }, [categories, send]);
  const deleteCategory = useCallback((id: string, moveTo?: string) => {
    const used = categoryUsage(records, id) + categoryUsage(staged, id);
    const check = checkDelete(id, { records: used, recurringItems: recurringItems.filter((i) => i.categoryId === id).map((i) => i.name) });
    if (!check.ok) return check.reason;
    if (check.needsMove && (!moveTo || moveTo === id || !categories.some((c) => c.id === moveTo))) return "Choose a category to move them to.";
    if (moveTo && check.needsMove) {
      setRecords((rs) => reassign(rs, id, moveTo));
      setStaged((xs) => reassign(xs, id, moveTo));
    }
    // Rules never point at a missing category: move them with the records, or drop them if nothing to move to.
    setRules((rs) => (moveTo ? reassign(rs, id, moveTo) : rs.filter((r) => r.categoryId !== id)));
    setCategories((cs) => cs.filter((c) => c.id !== id));
    void send({ type: "category.delete", id, moveTo: check.needsMove ? moveTo : undefined });
    return null;
  }, [categories, records, staged, recurringItems, send]);
  const addRule = useCallback((r: MerchantRule) => {
    setRules((rs) => [...rs.filter((x) => x.merchant.toLowerCase() !== r.merchant.toLowerCase()), r]);
    void send({ type: "rule.put", merchant: r.merchant, categoryId: r.categoryId });
  }, [send]);
  const removeRule = useCallback((merchant: string) => {
    setRules((rs) => rs.filter((r) => r.merchant !== merchant));
    void send({ type: "rule.remove", merchant });
  }, [send]);

  const parentProblem = useCallback((id: string, parentId: string): string | null => {
    const parent = accounts.find((a) => a.id === parentId);
    if (!parent || parent.id === id) return "Pick a different payment method to put it under.";
    if (parent.parentId) return `${parent.name} is itself under another payment method.`;
    if (parent.type !== "credit_card" && parent.type !== "bank") return "Only a card or a bank account can have payment methods under it.";
    if (accounts.some((a) => a.parentId === id)) return "Other payment methods are under this one, so it cannot go under another.";
    return null;
  }, [accounts]);
  const addAccount = useCallback((name: string, type: Account["type"], parentId?: string) => {
    const n = name.trim();
    if (!n || n.length > 60) return "Enter a name (up to 60 characters).";
    if (accounts.some((a) => a.name.toLowerCase() === n.toLowerCase())) return "You already have a payment method with that name.";
    let id = `${type === "credit_card" ? "cc" : type}_${slug(n)}`;
    for (let i = 2; accounts.some((a) => a.id === id); i++) id = `${id.replace(/-\d+$/, "")}-${i}`;
    if (parentId) { const bad = parentProblem(id, parentId); if (bad) return bad; }
    setAccounts((as) => [...as, { id, name: n, type, ...(parentId ? { parentId } : {}) }]);
    void send({ type: "account.add", id, name: n, accountType: type, ...(parentId ? { parentId } : {}) });
    return null;
  }, [accounts, send, parentProblem]);
  const updateAccount = useCallback((id: string, patch: { name?: string; parentId?: string | null }) => {
    const cur = accounts.find((a) => a.id === id);
    if (!cur) return "Payment method not found.";
    const next = { ...cur };
    if (patch.name !== undefined) {
      const n = patch.name.trim();
      if (!n || n.length > 60) return "Enter a name (up to 60 characters).";
      if (accounts.some((a) => a.id !== id && a.name.toLowerCase() === n.toLowerCase())) return "You already have a payment method with that name.";
      next.name = n;
    }
    if (patch.parentId === null) delete next.parentId;
    else if (patch.parentId) { const bad = parentProblem(id, patch.parentId); if (bad) return bad; next.parentId = patch.parentId; }
    setAccounts((as) => as.map((a) => (a.id === id ? next : a)));
    void send({ type: "account.update", id, ...(patch.name !== undefined ? { name: next.name } : {}), ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}) });
    return null;
  }, [accounts, send, parentProblem]);
  const addSuggestedAccounts = useCallback(() => {
    setAccounts((as) => [...as, ...suggestedWithParents(SUGGESTED_ACCOUNTS.filter((s) => !as.some((a) => a.id === s.id)), as)]);
    void send({ type: "accounts.addSuggested" });
  }, [send]);
  const addParticipant = useCallback((name: string) => {
    const n = name.trim();
    if (!n || n.length > 60) return { error: "Enter a name (up to 60 characters)." };
    if (participants.some((p) => p.name.toLowerCase() === n.toLowerCase())) return { error: "Someone with that name already exists." };
    const id = `p_${slug(n)}-${uuid().slice(0, 6)}`;
    setParticipants((ps) => [...ps, { id, name: n, userId: null }]);
    void send({ type: "participant.add", id, name: n });
    return { id };
  }, [participants, send]);

  const deleteParticipant = useCallback((id: string) => {
    const check = checkFriendDelete(participants.find((p) => p.id === id), meId, friendUsage(id, { records: [...records, ...staged], settlements, recurring: recurringItems }));
    if (!check.ok) return check.reason;
    setParticipants((ps) => ps.filter((p) => p.id !== id));
    void send({ type: "participant.delete", id });
    return null;
  }, [participants, meId, records, staged, settlements, recurringItems, send]);

  const saveRecurring = useCallback((draft: Omit<RecurringItem, "id"> & { id?: string }) => {
    const name = draft.name.trim();
    if (!name) return "Give it a name.";
    if (!Number.isInteger(draft.expectedPaise) || draft.expectedPaise <= 0) return "Enter the usual monthly amount.";
    if (!Number.isInteger(draft.dueDay) || draft.dueDay < 1 || draft.dueDay > 28) return "Pick a due day between 1 and 28.";
    const splitError = validateSplit(draft.expectedPaise, draft.split);
    if (splitError) return splitError;
    const id = draft.id ?? `rc_${slug(name)}-${uuid().slice(0, 6)}`;
    const place = draft.place?.trim();
    const item: RecurringItem = { id, name, categoryId: draft.categoryId, dueDay: draft.dueDay, expectedPaise: draft.expectedPaise, payerId: draft.payerId, split: draft.split, ...(place ? { place } : {}) };
    setRecurringItems((xs) => (xs.some((x) => x.id === id) ? xs.map((x) => (x.id === id ? item : x)) : [...xs, item]));
    void send({ type: "recurring.put", item });
    return null;
  }, [send]);
  const deleteRecurring = useCallback((id: string) => {
    setRecurringItems((xs) => xs.filter((x) => x.id !== id));
    setRecords((rs) => rs.map((r) => { if (r.recurringId !== id) return r; const { recurringId: _gone, ...rest } = r; void _gone; return rest; }));
    void send({ type: "recurring.delete", id });
  }, [send]);

  const saveCardBill = useCallback((draft: Omit<CardBill, "id"> & { id?: string }) => {
    if (!accounts.some((a) => a.id === draft.accountId && a.type === "credit_card")) return "Pick one of your credit cards.";
    if (!Number.isInteger(draft.totalDuePaise) || draft.totalDuePaise <= 0) return "Enter the full amount due.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.statementDate)) return "Pick the statement date and the due date.";
    if (draft.dueDate < draft.statementDate) return "The due date cannot be before the statement date.";
    const bill: CardBill = { id: draft.id ?? uuid(), accountId: draft.accountId, statementDate: draft.statementDate, dueDate: draft.dueDate, totalDuePaise: draft.totalDuePaise, source: draft.source, ...(draft.batchId ? { batchId: draft.batchId } : {}), ...(draft.paid ? { paid: true } : {}) };
    setCardBills((xs) => (xs.some((x) => x.id === bill.id) ? xs.map((x) => (x.id === bill.id ? bill : x)) : [...xs, bill]));
    void send({ type: "cardbill.put", bill });
    return null;
  }, [accounts, send]);
  const deleteCardBill = useCallback((id: string) => {
    setCardBills((xs) => xs.filter((x) => x.id !== id));
    void send({ type: "cardbill.delete", id });
  }, [send]);

  const addVoucherBrand = useCallback((name: string): Added => {
    const n = name.replace(/\s+/g, " ").trim();
    if (!n || n.length > 40) return { error: "Enter a voucher name (up to 40 characters)." };
    if (voucherBrands.some((b) => b.name.toLowerCase() === n.toLowerCase())) return { error: "You already have a voucher with that name." };
    const id = `vb_${slug(n)}-${uuid().slice(0, 6)}`;
    setVoucherBrands((bs) => [...bs, { id, name: n }].sort((a, b) => a.name.localeCompare(b.name)));
    void send({ type: "voucherBrand.add", id, name: n });
    return { id };
  }, [voucherBrands, send]);
  const updateVoucherBrand = useCallback((id: string, patch: { name?: string; balance?: VoucherBrand["balance"] | null; tracksAllUse?: boolean }) => {
    const cur = voucherBrands.find((b) => b.id === id);
    if (!cur) return "Voucher not found.";
    const next: VoucherBrand = { ...cur };
    if (patch.name !== undefined) {
      const n = patch.name.replace(/\s+/g, " ").trim();
      if (!n || n.length > 40) return "Enter a voucher name (up to 40 characters).";
      if (voucherBrands.some((b) => b.id !== id && b.name.toLowerCase() === n.toLowerCase())) return "You already have a voucher with that name.";
      next.name = n;
    }
    if (patch.balance === null) delete next.balance; else if (patch.balance) next.balance = patch.balance;
    if (patch.tracksAllUse !== undefined) { if (patch.tracksAllUse) next.tracksAllUse = true; else delete next.tracksAllUse; }
    setVoucherBrands((bs) => bs.map((b) => (b.id === id ? next : b)).sort((a, b) => a.name.localeCompare(b.name)));
    void send({ type: "voucherBrand.update", id, ...(patch.name !== undefined ? { name: next.name } : {}), ...(patch.balance !== undefined ? { balance: patch.balance } : {}), ...(patch.tracksAllUse !== undefined ? { tracksAllUse: patch.tracksAllUse } : {}) });
    return null;
  }, [voucherBrands, send]);
  const deleteVoucherBrand = useCallback((id: string) => {
    const used = [...records, ...staged].filter((r) => r.voucherBrandId === id || r.paidWithVoucherId === id).length;
    if (used > 0) return `${used} transaction${used === 1 ? " is" : "s are"} attributed to it, so it cannot be removed. Rename it instead.`;
    setVoucherBrands((bs) => bs.filter((b) => b.id !== id));
    void send({ type: "voucherBrand.delete", id });
    return null;
  }, [records, staged, send]);

  const addSettlement = useCallback((s: Omit<Settlement, "id">) => {
    const id = live ? uuid() : `s${Date.now().toString(36)}`;
    setSettlements((x) => [...x, { ...s, id }]);
    void send({ type: "settlement.create", settlement: { id, date: s.date, fromId: s.fromId, toId: s.toId, amountPaise: s.amountPaise, note: s.note, recordIds: s.recordIds } });
  }, [live, send]);
  const voidSettlement = useCallback((id: string) => {
    setSettlements((x) => x.map((s) => (s.id === id ? { ...s, voided: true } : s)));
    void send({ type: "settlement.void", id });
  }, [send]);
  const linkReceipt = useCallback((receiptId: string, recordId: string | null) => {
    // Receipts are matched in demo mode only until real receipt upload exists (slice 6).
    setReceipts((x) => x);
    setRecords((rs) => rs.map((r) => (r.receiptId === receiptId ? { ...r, receiptId: undefined } : r)).map((r) => (r.id === recordId ? { ...r, receiptId } : r)));
  }, []);

  const value: Store = {
    aiEnabled: !!live?.aiEnabled, live: !!live, householdReady: live ? live.ready : true, meId, splitRatio, partnerId, pendingPartner, sharedRecords: live ? sharedRecords : [],
    partner: couple ? { name: couple.partner.name, participantId: couple.partner.participantId, active: couple.active, endedAt: couple.endedAt } : null, today, participants, accounts, recurringItems, trendHistory,
    previewing, shown, records, staged, settlements, receipts, importBatches: init.importBatches, month, setMonth, view, setView, scoped, summary, balances, ledgerRecords, recurring,
    categories, rules, addCategory, renameCategory, deleteCategory, addRule, removeRule, addAccount, updateAccount, addSuggestedAccounts, addParticipant, deleteParticipant, saveRecurring, deleteRecurring, cardBills, saveCardBill, deleteCardBill, voucherBrands, addVoucherBrand, updateVoucherBrand, deleteVoucherBrand,
    updateRecord, addRecord, stageRecords, updateStaged, approveStaged, rejectStaged, deleteRecords, addSettlement, voidSettlement, linkReceipt,
    recurringName: (id) => { const i = recurringItems.find((x) => x.id === id); return i ? (i.place ? `${i.name} · ${i.place}` : i.name) : id; },
    nameOf: (id) => participants.find((p) => p.id === id)?.name ?? id,
    categoryName: (id) => categories.find((c) => c.id === id)?.name ?? id,
    accountName: (id) => (id === "shared" ? "Shared" : accounts.find((a) => a.id === id)?.name ?? id),
    syncError, dismissSyncError: () => setSyncError(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
