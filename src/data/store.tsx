"use client";
// Prototype store: in-memory only, resets on reload. Replaced by a Firebase
// adapter in Stage 3. All calculations live in src/domain.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { pairBalances } from "@/domain/balances";
import { summarize } from "@/domain/reports";
import type { ExpenseRecord, Receipt, Settlement } from "@/domain/types";
import { signedShare } from "@/domain/reports";
import { ME, accounts, categories, initialReceipts, initialRecords, initialSettlements, participants } from "./mock";

export type View = "household" | "personal";

interface Store {
  records: ExpenseRecord[];
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
  updateRecord: (id: string, patch: Partial<ExpenseRecord>) => void;
  addSettlement: (s: Omit<Settlement, "id">) => void;
  voidSettlement: (id: string) => void;
  linkReceipt: (receiptId: string, recordId: string | null) => void;
  nameOf: (id: string) => string;
  categoryName: (id: string) => string;
  accountName: (id: string) => string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState(initialRecords);
  const [settlements, setSettlements] = useState(initialSettlements);
  const [receipts] = useState(initialReceipts);
  const [month, setMonth] = useState("2026-09");
  const [view, setView] = useState<View>("household");

  const scoped = useMemo(
    () =>
      records.filter(
        (r) => r.date.startsWith(month) && (view === "household" || r.payerId === ME || signedShare(r, ME) !== 0 || !r.shared && r.split.participantIds.includes(ME)),
      ),
    [records, month, view],
  );
  const summary = useMemo(() => summarize(scoped, ME), [scoped]);
  const balances = useMemo(() => pairBalances(records, settlements), [records, settlements]);

  const updateRecord = useCallback((id: string, patch: Partial<ExpenseRecord>) => setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);
  const addSettlement = useCallback((s: Omit<Settlement, "id">) => setSettlements((x) => [...x, { ...s, id: `s${x.length + 1}` }]), []);
  const voidSettlement = useCallback((id: string) => setSettlements((x) => x.map((s) => (s.id === id ? { ...s, voided: true } : s))), []);
  const linkReceipt = useCallback((receiptId: string, recordId: string | null) => {
    setRecords((rs) => rs.map((r) => (r.receiptId === receiptId ? { ...r, receiptId: undefined } : r)).map((r) => (r.id === recordId ? { ...r, receiptId } : r)));
  }, []);

  const value: Store = {
    records, settlements, receipts, month, setMonth, view, setView, scoped, summary, balances,
    updateRecord, addSettlement, voidSettlement, linkReceipt,
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
