"use client";
// Prototype store: in-memory only, resets on reload. Replaced by a Firebase
// adapter in Stage 3. All calculations live in src/domain.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { pairBalances } from "@/domain/balances";
import { summarize } from "@/domain/reports";
import type { ExpenseRecord, Receipt, Settlement } from "@/domain/types";
import { signedShare } from "@/domain/reports";
import { recurringStatuses } from "@/domain/recurring";
import { MOCK_TODAY, ME, accounts, categories, initialReceipts, recurringItems, initialRecords, initialSettlements, participants } from "./mock";

export type View = "household" | "personal";

interface Store {
  /** The ledger: only approved records. Everything in reports, balances and recurring comes from here. */
  records: ExpenseRecord[];
  /** Review queue: imported rows waiting for manual approval. Never counted in reports until approved. */
  staged: ExpenseRecord[];
  settlements: Settlement[];
  receipts: Receipt[];
  month: string;
  setMonth: (m: string) => void;
  view: View;
  setView: (v: View) => void;
  /** Records in the selected month and view. Personal = ones where I paid or hold a share. */
  scoped: ExpenseRecord[];
  summary: ReturnType<typeof summarize>;
  balances: ReturnType<typeof pairBalances>;
  /** Status of each recurring item for the selected month. */
  recurring: ReturnType<typeof recurringStatuses>;
  updateRecord: (id: string, patch: Partial<ExpenseRecord>) => void;
  /** Manual entry. Id is generated here; `importSource` marks it as not imported. */
  addRecord: (r: ExpenseRecord) => void;
  stageRecords: (rs: ExpenseRecord[]) => void;
  /** Save edits to a queued row without approving it. */
  updateStaged: (id: string, patch: Partial<ExpenseRecord>) => void;
  /** Move a queued row into the ledger, marking it reviewed. */
  approveStaged: (id: string, patch?: Partial<ExpenseRecord>) => void;
  rejectStaged: (id: string) => void;
  addSettlement: (s: Omit<Settlement, "id">) => void;
  voidSettlement: (id: string) => void;
  linkReceipt: (receiptId: string, recordId: string | null) => void;
  nameOf: (id: string) => string;
  recurringName: (id: string) => string;
  categoryName: (id: string) => string;
  accountName: (id: string) => string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initialView = "household" }: { children: ReactNode; initialView?: View }) {
  const [records, setRecords] = useState(() => initialRecords.filter((r) => r.status === "reviewed"));
  const [staged, setStaged] = useState(() => initialRecords.filter((r) => r.status === "unreviewed"));
  const [settlements, setSettlements] = useState(initialSettlements);
  const [receipts] = useState(initialReceipts);
  const [month, setMonth] = useState("2026-09");
  const [view, setView] = useState<View>(initialView);

  const scoped = useMemo(
    () =>
      records.filter(
        (r) => r.date.startsWith(month) && (view === "household" || r.payerId === ME || signedShare(r, ME) !== 0 || !r.shared && r.split.participantIds.includes(ME)),
      ),
    [records, month, view],
  );
  const summary = useMemo(() => summarize(scoped, ME), [scoped]);
  const recurring = useMemo(() => recurringStatuses(recurringItems, records, month, MOCK_TODAY), [records, month]);
  const balances = useMemo(() => pairBalances(records, settlements), [records, settlements]);

  const updateRecord = useCallback((id: string, patch: Partial<ExpenseRecord>) => setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);
  const addRecord = useCallback((r: ExpenseRecord) => setRecords((rs) => [...rs, { ...r, id: `m${rs.length + 1}-${Date.now().toString(36)}` }]), []);
  const stageRecords = useCallback((rs: ExpenseRecord[]) => setStaged((x) => [...x, ...rs.map((r, i) => ({ ...r, id: `q${Date.now().toString(36)}-${x.length + i}`, status: "unreviewed" as const }))]), []);
  const updateStaged = useCallback((id: string, patch: Partial<ExpenseRecord>) => setStaged((xs) => xs.map((r) => (r.id === id ? { ...r, ...patch, status: "unreviewed" as const } : r))), []);
  const approveStaged = useCallback((id: string, patch: Partial<ExpenseRecord> = {}) => {
    const r = staged.find((x) => x.id === id);
    if (!r) return;
    setRecords((rs) => (rs.some((x) => x.id === id) ? rs : [...rs, { ...r, ...patch, status: "reviewed" }]));
    setStaged((xs) => xs.filter((x) => x.id !== id));
  }, [staged]);
  const rejectStaged = useCallback((id: string) => setStaged((xs) => xs.filter((x) => x.id !== id)), []);
  const addSettlement = useCallback((s: Omit<Settlement, "id">) => setSettlements((x) => [...x, { ...s, id: `s${x.length + 1}` }]), []);
  const voidSettlement = useCallback((id: string) => setSettlements((x) => x.map((s) => (s.id === id ? { ...s, voided: true } : s))), []);
  const linkReceipt = useCallback((receiptId: string, recordId: string | null) => {
    setRecords((rs) => rs.map((r) => (r.receiptId === receiptId ? { ...r, receiptId: undefined } : r)).map((r) => (r.id === recordId ? { ...r, receiptId } : r)));
  }, []);

  const value: Store = {
    records, staged, settlements, receipts, month, setMonth, view, setView, scoped, summary, balances, recurring,
    updateRecord, addRecord, stageRecords, updateStaged, approveStaged, rejectStaged, addSettlement, voidSettlement, linkReceipt,
    recurringName: (id) => { const i = recurringItems.find((x) => x.id === id); return i ? (i.place ? `${i.name} · ${i.place}` : i.name) : id; },
    nameOf: (id) => participants.find((p) => p.id === id)?.name ?? id,
    categoryName: (id) => categories.find((c) => c.id === id)?.name ?? id,
    accountName: (id) => accounts.find((a) => a.id === id)?.name ?? id,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
