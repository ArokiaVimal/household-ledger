import { describe, expect, it } from "vitest";
import { ExpenseRecordSchema, ParticipantSchema, ReceiptSchema, RecurringItemSchema, SettlementSchema } from "./schemas";
import { accounts, categories, initialReceipts, initialRecords, initialSettlements, participants, recurringItems } from "./mock";

describe("schemas accept the mock data", () => {
  it("records, settlements, receipts, recurring, participants", () => {
    for (const r of initialRecords) expect(ExpenseRecordSchema.safeParse(r).success, r.id).toBe(true);
    for (const s of initialSettlements) expect(SettlementSchema.safeParse(s).success, s.id).toBe(true);
    for (const r of initialReceipts) expect(ReceiptSchema.safeParse(r).success, r.id).toBe(true);
    for (const r of recurringItems) expect(RecurringItemSchema.safeParse(r).success, r.id).toBe(true);
    for (const p of participants) expect(ParticipantSchema.safeParse(p).success).toBe(true);
    expect(accounts.length + categories.length).toBeGreaterThan(0);
  });
});

describe("schemas reject bad financial input", () => {
  const base = initialRecords[0];
  it("non-integer or non-positive amounts", () => {
    expect(ExpenseRecordSchema.safeParse({ ...base, amountPaise: 10.5 }).success).toBe(false);
    expect(ExpenseRecordSchema.safeParse({ ...base, amountPaise: 0 }).success).toBe(false);
    expect(ExpenseRecordSchema.safeParse({ ...base, amountPaise: -5 }).success).toBe(false);
  });
  it("split that does not add up", () => {
    const bad = { ...base, shared: true, split: { mode: "custom" as const, participantIds: ["me", "wife"], values: { me: 1, wife: 1 } } };
    const res = ExpenseRecordSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });
  it("shared flag must match split mode", () => {
    expect(ExpenseRecordSchema.safeParse({ ...base, shared: !base.shared }).success).toBe(false);
  });
  it("bad dates and self settlements", () => {
    expect(ExpenseRecordSchema.safeParse({ ...base, date: "05/09/2026" }).success).toBe(false);
    expect(ExpenseRecordSchema.safeParse({ ...base, date: "2026-13-45" }).success).toBe(false);
    expect(SettlementSchema.safeParse({ id: "s", date: "2026-09-01", fromId: "me", toId: "me", amountPaise: 100 }).success).toBe(false);
  });
});
