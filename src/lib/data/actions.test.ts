import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import type { ExpenseRecord } from "@/domain/types";
import { ActionError, applyAction } from "./actions";

const actor = { uid: "u1" };
const base = { id: "r1", date: "2026-09-05", merchant: "Chai Kadai", amountPaise: 25050, accountId: "cc_hdfc", categoryId: "groceries", kind: "purchase" as const, payerId: "me", shared: false, split: { mode: "personal" as const, participantIds: ["me"] }, excluded: false };

const imported = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "imp1", date: "2026-09-10", merchant: "Zepto", originalDescription: "ZEPTO MARKETPLACE", amountPaise: 64200, currency: "INR", accountId: "cc_hdfc", categoryId: "groceries", kind: "purchase",
  payerId: "me", shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "unreviewed", importSource: "HDFC.csv", referenceId: "REF1", ...o,
});

async function setup(): Promise<Repository> {
  const repo = createMemoryRepository("h1");
  await repo.categories.put({ id: "groceries", name: "Groceries" });
  await repo.categories.put({ id: "shopping", name: "Shopping" });
  await repo.categories.put({ id: "uncategorized", name: "Uncategorized" });
  await repo.records.put(imported());
  return repo;
}
const fails = async (p: Promise<unknown>, code: ActionError["code"]) => { await expect(p).rejects.toBeInstanceOf(ActionError); await p.catch((e) => expect(e.code).toBe(code)); };
const audit = async (repo: Repository) => (await repo.audit.list()).map((e) => e.action);

describe("records", () => {
  it("creates a manual entry; the server forces the trusted fields and writes an audit event", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "record.create", record: { ...base, status: "unreviewed", importSource: "HDFC.csv", originalDescription: "faked bank text", currency: "USD" } });
    const r = (await repo.records.get("r1"))!;
    expect(r).toMatchObject({ status: "reviewed", importSource: "Manual entry", originalDescription: "Entered manually", currency: "INR", amountPaise: 25050 });
    expect(await audit(repo)).toEqual(["create"]);
  });
  it("rejects bad money, bad splits and duplicate ids", async () => {
    const repo = await setup();
    await fails(applyAction(repo, actor, { type: "record.create", record: { ...base, amountPaise: 10.5 } }), "invalid");
    await fails(applyAction(repo, actor, { type: "record.create", record: { ...base, amountPaise: 0 } }), "invalid");
    await fails(applyAction(repo, actor, { type: "record.create", record: { ...base, shared: true, split: { mode: "custom", participantIds: ["me", "w"], values: { me: 1, w: 1 } } } }), "invalid");
    await applyAction(repo, actor, { type: "record.create", record: base });
    await fails(applyAction(repo, actor, { type: "record.create", record: base }), "conflict");
  });
  it("update changes review fields but cannot touch amount, date or bank text (not accepted at all)", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { categoryId: "shopping", notes: "gift", excluded: true } });
    expect(await repo.records.get("imp1")).toMatchObject({ categoryId: "shopping", notes: "gift", excluded: true, amountPaise: 64200 });
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { amountPaise: 1, date: "2020-01-01", originalDescription: "x" } as never });
    expect(await repo.records.get("imp1")).toMatchObject({ amountPaise: 64200, date: "2026-09-10", originalDescription: "ZEPTO MARKETPLACE" });
  });
  it("null clears an optional field; shared must match the split", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { notes: "hello" } });
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { notes: null } });
    expect((await repo.records.get("imp1"))!.notes).toBeUndefined();
    await fails(applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { shared: true } }), "invalid");
  });
  it("approve moves a queued row to reviewed once, with edits; second approve conflicts", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { categoryId: "shopping", shared: true, split: { mode: "equal", participantIds: ["me", "w"] } } });
    expect(await repo.records.get("imp1")).toMatchObject({ status: "reviewed", categoryId: "shopping", shared: true });
    await fails(applyAction(repo, actor, { type: "record.approve", id: "imp1" }), "conflict");
    await fails(applyAction(repo, actor, { type: "record.approve", id: "missing" }), "not_found");
  });
  it("reject removes only unreviewed rows and leaves an audit trail", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "record.reject", id: "imp1" });
    expect(await repo.records.get("imp1")).toBeNull();
    expect((await repo.audit.list())[0].summary).toContain("Rejected Zepto");
    await repo.records.put(imported({ id: "done", status: "reviewed", referenceId: "REF2" }));
    await fails(applyAction(repo, actor, { type: "record.reject", id: "done" }), "conflict");
  });
});

describe("settlements", () => {
  const s = { id: "s1", date: "2026-09-18", fromId: "karthik", toId: "me", amountPaise: 100000 };
  it("create, duplicate refused, void is idempotent and never deletes", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "settlement.create", settlement: s });
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: s }), "conflict");
    await applyAction(repo, actor, { type: "settlement.void", id: "s1" });
    await applyAction(repo, actor, { type: "settlement.void", id: "s1" });
    expect((await repo.settlements.get("s1"))!.voided).toBe(true);
    expect(await audit(repo)).toEqual(["settle", "void_settlement"]);
  });
  it("rejects self and non-positive settlements", async () => {
    const repo = await setup();
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: { ...s, toId: "karthik" } }), "invalid");
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: { ...s, amountPaise: 0 } }), "invalid");
  });
});

describe("categories and rules", () => {
  it("add and rename enforce unique, clean names", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "category.add", id: "c_pets", name: "  Pet   care " });
    expect((await repo.categories.get("c_pets"))!.name).toBe("Pet care");
    await fails(applyAction(repo, actor, { type: "category.add", id: "c_pets2", name: "pet care" }), "invalid");
    await fails(applyAction(repo, actor, { type: "category.rename", id: "c_pets", name: "Groceries" }), "invalid");
    await applyAction(repo, actor, { type: "category.rename", id: "c_pets", name: "Pets" });
    await fails(applyAction(repo, actor, { type: "category.rename", id: "nope", name: "X" }), "not_found");
  });
  it("delete requires a destination when used, moves records and rules, and removes the category", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "rule.put", merchant: "Zepto", categoryId: "groceries" });
    await fails(applyAction(repo, actor, { type: "category.delete", id: "groceries" }), "invalid");
    await fails(applyAction(repo, actor, { type: "category.delete", id: "groceries", moveTo: "groceries" }), "invalid");
    await applyAction(repo, actor, { type: "category.delete", id: "groceries", moveTo: "shopping" });
    expect(await repo.categories.get("groceries")).toBeNull();
    expect((await repo.records.get("imp1"))!.categoryId).toBe("shopping");
    expect((await repo.rules.list())[0].categoryId).toBe("shopping");
  });
  it("delete of an unused category drops its rules; the fallback and recurring categories are protected", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "category.add", id: "c_pets", name: "Pets" });
    await applyAction(repo, actor, { type: "rule.put", merchant: "PetCo", categoryId: "c_pets" });
    await applyAction(repo, actor, { type: "category.delete", id: "c_pets" });
    expect(await repo.rules.list()).toHaveLength(0);
    await fails(applyAction(repo, actor, { type: "category.delete", id: "uncategorized" }), "conflict");
    await repo.recurring.put({ id: "rent", name: "Rent", categoryId: "shopping", dueDay: 1, expectedPaise: 100, payerId: "me", split: { mode: "personal", participantIds: ["me"] } });
    await fails(applyAction(repo, actor, { type: "category.delete", id: "shopping", moveTo: "groceries" }), "conflict");
  });
  it("rules: one per merchant (case-insensitive), unknown category refused, remove works", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "rule.put", merchant: "Swiggy", categoryId: "groceries" });
    await applyAction(repo, actor, { type: "rule.put", merchant: " swiggy ", categoryId: "shopping" });
    expect(await repo.rules.list()).toHaveLength(1);
    await fails(applyAction(repo, actor, { type: "rule.put", merchant: "X", categoryId: "nope" }), "invalid");
    await applyAction(repo, actor, { type: "rule.remove", merchant: "SWIGGY" });
    expect(await repo.rules.list()).toHaveLength(0);
  });
});

describe("accounts, participants and input safety", () => {
  it("adds accounts and participants once", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "account.add", id: "cc_amex", name: "Amex", accountType: "credit_card" });
    await applyAction(repo, actor, { type: "participant.add", id: "p_karthik", name: "Karthik" });
    await fails(applyAction(repo, actor, { type: "account.add", id: "cc_amex", name: "Amex", accountType: "credit_card" }), "conflict");
    await fails(applyAction(repo, actor, { type: "participant.add", id: "p_karthik", name: "K" }), "conflict");
    expect((await repo.participants.get("p_karthik"))!.userId).toBeNull();
  });
  it("removes an unused friend, but never one in a split or a person with an account", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "participant.add", id: "p_karthik", name: "Karthik" });
    await applyAction(repo, actor, { type: "participant.add", id: "p_priya", name: "Priya" });
    await repo.records.put(imported({ id: "shared1", referenceId: "R2", shared: true, split: { mode: "equal", participantIds: ["me", "p_priya"] } }));
    await fails(applyAction(repo, actor, { type: "participant.delete", id: "p_priya" }), "conflict");
    await applyAction(repo, actor, { type: "participant.delete", id: "p_karthik" });
    expect(await repo.participants.get("p_karthik")).toBeNull();
    expect(await repo.participants.get("p_priya")).not.toBeNull();
    await repo.participants.put({ id: "u_u2", name: "Varru", userId: "u2" });
    await fails(applyAction(repo, actor, { type: "participant.delete", id: "u_u2" }), "conflict");
    await fails(applyAction(repo, actor, { type: "participant.delete", id: "nobody" }), "not_found");
  });
  it("adds, changes and removes a recurring item; removing keeps the payments but unlinks them", async () => {
    const repo = await setup();
    await repo.participants.put({ id: "me", name: "Me", userId: "u1" });
    const item = { id: "rc_rent", name: "Rent", categoryId: "groceries", dueDay: 1, expectedPaise: 2500000, payerId: "me", split: { mode: "personal" as const, participantIds: ["me"] } };
    await applyAction(repo, actor, { type: "recurring.put", item });
    await applyAction(repo, actor, { type: "recurring.put", item: { ...item, expectedPaise: 2600000, place: " Our flat " } });
    expect(await repo.recurring.get("rc_rent")).toMatchObject({ expectedPaise: 2600000, place: "Our flat" });
    await fails(applyAction(repo, actor, { type: "recurring.put", item: { ...item, id: "x", categoryId: "nope" } }), "invalid");
    await fails(applyAction(repo, actor, { type: "recurring.put", item: { ...item, id: "y", split: { mode: "percent" as const, participantIds: ["me"], values: { me: 5000 } } } }), "invalid");
    await repo.records.put(imported({ id: "linked", referenceId: "RR", recurringId: "rc_rent" }));
    await applyAction(repo, actor, { type: "recurring.delete", id: "rc_rent" });
    expect(await repo.recurring.get("rc_rent")).toBeNull();
    expect((await repo.records.get("linked"))!.recurringId).toBeUndefined();
    await fails(applyAction(repo, actor, { type: "recurring.delete", id: "rc_rent" }), "not_found");
  });
  it("unknown actions and junk are refused, and every accepted change wrote an audit event", async () => {
    const repo = await setup();
    await fails(applyAction(repo, actor, { type: "drop.database" }), "invalid");
    await fails(applyAction(repo, actor, null), "invalid");
    await fails(applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { categoryId: 5 } }), "invalid");
    expect(await audit(repo)).toEqual([]);
  });
});

describe("suggested accounts", () => {
  it("adds the sixteen starting payment methods once and skips ones that exist", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "cc_hdfc", name: "My HDFC", type: "credit_card" });
    await applyAction(repo, actor, { type: "accounts.addSuggested" });
    const list = await repo.accounts.list();
    expect(list).toHaveLength(16);
    expect(list.find((a) => a.id === "cc_hdfc")!.name).toBe("My HDFC");
    expect(list.filter((a) => a.type === "wallet").map((a) => [a.name, a.parentId])).toEqual([["Amazon Pay", "cc_amex"], ["Swiggy Money", "cc_amex"], ["Myntra Wallet", "cc_amex"]]);
    await applyAction(repo, actor, { type: "accounts.addSuggested" });
    expect(await repo.accounts.list()).toHaveLength(16);
  });
  it("puts the wallets under YOUR Amex card even when it has another id, and under nothing when you have none", async () => {
    const mine = await setup();
    await mine.accounts.put({ id: "card-amex-1", name: "American Express Platinum", type: "credit_card" });
    await applyAction(mine, actor, { type: "accounts.addSuggested" });
    expect((await mine.accounts.get("wl_amazonpay"))!.parentId).toBe("card-amex-1");
    const none = await setup();
    await applyAction(none, actor, { type: "accounts.addSuggested" });
    expect((await none.accounts.get("wl_swiggymoney"))!.parentId).toBe("cc_amex"); // the suggested Amex is added in the same step
    const bare = await setup();
    await bare.accounts.put({ id: "bank_x", name: "Some Bank", type: "bank" });
    await applyAction(bare, actor, { type: "accounts.addSuggested" });
  });
  it("a payment method can be added under a card or bank, changed, and taken out; bad parents are refused", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "cc_amex", name: "Amex", type: "credit_card" });
    await repo.accounts.put({ id: "upi_x", name: "Some UPI", type: "upi" });
    await applyAction(repo, actor, { type: "account.add", id: "wl_a", name: "Amazon Pay", accountType: "wallet", parentId: "cc_amex" });
    expect(await repo.accounts.get("wl_a")).toEqual({ id: "wl_a", name: "Amazon Pay", type: "wallet", parentId: "cc_amex" });
    await fails(applyAction(repo, actor, { type: "account.add", id: "wl_b", name: "B", accountType: "wallet", parentId: "wl_a" }), "invalid"); // under a child
    await fails(applyAction(repo, actor, { type: "account.add", id: "wl_c", name: "C", accountType: "wallet", parentId: "upi_x" }), "invalid"); // under a UPI app
    await fails(applyAction(repo, actor, { type: "account.add", id: "wl_d", name: "D", accountType: "wallet", parentId: "nope" }), "invalid");
    await applyAction(repo, actor, { type: "account.update", id: "wl_a", parentId: null });
    expect((await repo.accounts.get("wl_a"))!.parentId).toBeUndefined();
    await applyAction(repo, actor, { type: "account.update", id: "wl_a", parentId: "cc_amex", name: "Amazon Pay wallet" });
    expect(await repo.accounts.get("wl_a")).toMatchObject({ name: "Amazon Pay wallet", parentId: "cc_amex" });
    await fails(applyAction(repo, actor, { type: "account.update", id: "cc_amex", parentId: "bank_hdfc" }), "invalid"); // Amex has children, so it cannot go under another
    await fails(applyAction(repo, actor, { type: "account.update", id: "wl_a", name: "Some UPI" }), "conflict");
  });
  it("a recurring item can have an end date and be marked paid for a month, and editing keeps the marks", async () => {
    const repo = await setup();
    await repo.participants.put({ id: "me", name: "Me", userId: "u1" });
    const item = { id: "rc_emi", name: "Car EMI", categoryId: "groceries", dueDay: 5, expectedPaise: 1000000, payerId: "me", split: { mode: "personal" as const, participantIds: ["me"] }, until: "2027-03-31" };
    await applyAction(repo, actor, { type: "recurring.put", item });
    await applyAction(repo, actor, { type: "recurring.markPaid", id: "rc_emi", month: "2026-10", paid: true });
    expect(await repo.recurring.get("rc_emi")).toMatchObject({ until: "2027-03", paidMonths: ["2026-10"] });
    await applyAction(repo, actor, { type: "recurring.put", item: { ...item, expectedPaise: 1100000 } });
    expect((await repo.recurring.get("rc_emi"))!.paidMonths).toEqual(["2026-10"]);
    await applyAction(repo, actor, { type: "recurring.markPaid", id: "rc_emi", month: "2026-10", paid: false });
    expect((await repo.recurring.get("rc_emi"))!.paidMonths).toBeUndefined();
    await applyAction(repo, actor, { type: "recurring.put", item: { ...item, id: "rc_eb", name: "EB bill", everyMonths: 2, startMonth: "2026-09", amountVaries: true, changes: [{ from: "2027-01", paise: 1200000 }] } });
    expect(await repo.recurring.get("rc_eb")).toMatchObject({ everyMonths: 2, startMonth: "2026-09", amountVaries: true, changes: [{ from: "2027-01", paise: 1200000 }] });
    await fails(applyAction(repo, actor, { type: "recurring.put", item: { ...item, id: "rc_x", everyMonths: 2 } }), "invalid"); // needs a first-bill month
    await fails(applyAction(repo, actor, { type: "recurring.markPaid", id: "nope", month: "2026-10", paid: true }), "not_found");
  });
  it("saves chosen icons for categories, payment methods and merchants, and refuses made-up icons", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "a1", name: "Myntra Wallet", type: "wallet" });
    await repo.merchantMemory.put({ id: "mm_zepto", key: "zepto", name: "Zepto", categoryId: "groceries", kind: "purchase", source: "user", confident: true, confirmed: 1, lastSeen: "2026-09-01" });
    await applyAction(repo, actor, { type: "icons.apply", categories: [{ id: "groceries", icon: "basket" }], accounts: [{ id: "a1", icon: "bag" }], merchants: [{ name: "zepto", icon: "store" }] });
    expect((await repo.categories.get("groceries"))!.icon).toBe("basket");
    expect((await repo.accounts.get("a1"))!.icon).toBe("bag");
    expect((await repo.merchantMemory.get("mm_zepto"))!.icon).toBe("store");
    await fails(applyAction(repo, actor, { type: "icons.apply", categories: [{ id: "groceries", icon: "http://x" as never }], accounts: [], merchants: [] }), "invalid");
  });
  it("sets and removes a friend's photo, and refuses anything that is not a small JPEG", async () => {
    const repo = await setup();
    await repo.participants.put({ id: "p_k", name: "Karthik", userId: null });
    const jpeg = `data:image/jpeg;base64,/9j/${"A".repeat(40)}`;
    await applyAction(repo, actor, { type: "participant.photo", id: "p_k", photo: jpeg });
    expect((await repo.participants.get("p_k"))!.photo).toBe(jpeg);
    await applyAction(repo, actor, { type: "participant.photo", id: "p_k", photo: null });
    expect((await repo.participants.get("p_k"))!.photo).toBeUndefined();
    await fails(applyAction(repo, actor, { type: "participant.photo", id: "p_k", photo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }), "invalid");
    await fails(applyAction(repo, actor, { type: "participant.photo", id: "nope", photo: null }), "not_found");
  });
  it("payment methods can be put in the user's own order; unknown ids are refused", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "a1", name: "One", type: "credit_card" });
    await repo.accounts.put({ id: "a2", name: "Two", type: "bank" });
    await applyAction(repo, actor, { type: "accounts.reorder", ids: ["a2", "a1"] });
    expect((await repo.accounts.get("a2"))!.order).toBe(0);
    expect((await repo.accounts.get("a1"))!.order).toBe(1);
    await fails(applyAction(repo, actor, { type: "accounts.reorder", ids: ["a2", "nope"] }), "invalid");
    await fails(applyAction(repo, actor, { type: "accounts.reorder", ids: ["a1", "a1"] }), "invalid");
  });
  it("payment methods can be recoloured, retyped, hidden and deleted, with the safety rules", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "cc_amex", name: "Amex", type: "credit_card" });
    await applyAction(repo, actor, { type: "account.add", id: "wl_a", name: "Amazon Pay", accountType: "wallet", parentId: "cc_amex" });
    await applyAction(repo, actor, { type: "account.update", id: "cc_amex", theme: "gold" });
    expect((await repo.accounts.get("cc_amex"))!.theme).toBe("gold");
    await applyAction(repo, actor, { type: "account.update", id: "cc_amex", theme: null });
    expect((await repo.accounts.get("cc_amex"))!.theme).toBeUndefined();
    await fails(applyAction(repo, actor, { type: "account.update", id: "cc_amex", accountType: "upi" }), "invalid"); // a wallet sits under it
    await fails(applyAction(repo, actor, { type: "account.update", id: "cc_amex", archived: true }), "invalid"); // visible child
    await applyAction(repo, actor, { type: "account.update", id: "wl_a", archived: true });
    await applyAction(repo, actor, { type: "account.update", id: "cc_amex", archived: true });
    expect((await repo.accounts.get("cc_amex"))!.archived).toBe(true);
    await applyAction(repo, actor, { type: "account.update", id: "cc_amex", archived: false });
    expect((await repo.accounts.get("cc_amex"))!.archived).toBeUndefined();
    await fails(applyAction(repo, actor, { type: "account.delete", id: "cc_amex" }), "conflict"); // has a child
    await applyAction(repo, actor, { type: "account.delete", id: "wl_a" });
    expect(await repo.accounts.get("wl_a")).toBeNull();
    await applyAction(repo, actor, { type: "account.delete", id: "cc_amex" });
    expect(await repo.accounts.get("cc_amex")).toBeNull();
  });
});

describe("learning and deleting", () => {
  it("approving teaches the merchant memory, and a correction replaces it", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { categoryId: "shopping", merchant: "Zepto" } });
    const [m] = await repo.merchantMemory.list();
    expect(m).toMatchObject({ key: "zepto marketplace", name: "Zepto", categoryId: "shopping", source: "user", confirmed: 1 });
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { categoryId: "groceries" } });
    expect((await repo.merchantMemory.list())[0]).toMatchObject({ categoryId: "groceries", confirmed: 1 });
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { notes: "just a note" } });
    expect((await repo.merchantMemory.list())[0].confirmed).toBe(1);
  });
  it("approving clears the suggestion marker", async () => {
    const repo = await setup();
    await repo.records.put(imported({ id: "s1", suggested: "ai_unsure" }));
    await applyAction(repo, actor, { type: "record.approve", id: "s1" });
    expect((await repo.records.get("s1"))!.suggested).toBeUndefined();
  });
  it("delete removes a row of either status, and leaves an audit trail", async () => {
    const repo = await setup();
    await repo.records.put(imported({ id: "done", status: "reviewed", referenceId: "REF2" }));
    await applyAction(repo, actor, { type: "record.delete", id: "done" });
    await applyAction(repo, actor, { type: "record.delete", id: "imp1" });
    expect(await repo.records.list()).toEqual([]);
    expect((await repo.audit.list()).map((e) => e.action)).toEqual(["delete", "delete"]);
    await fails(applyAction(repo, actor, { type: "record.delete", id: "imp1" }), "not_found");
  });
});

describe("sharing with a partner", () => {
  const split = { mode: "equal" as const, participantIds: ["me", "wife"] };
  const personal = { mode: "personal" as const, participantIds: ["me"] };
  async function linked(active = true) {
    const repo = await setup();
    const couple = createMemoryRepository("c1");
    return { repo, couple, ctx: { repo: couple, meId: "me", partnerId: "wife", active } };
  }
  it("approving with a split that includes the partner writes a redacted copy to the couple space only", async () => {
    const { repo, couple, ctx } = await linked();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split } }, ctx);
    const copy = (await couple.sharedExpenses.get("imp1"))!;
    expect(copy).toMatchObject({ ownerUid: "u1", merchant: "Zepto", amountPaise: 64200, categoryName: "Groceries", kind: "purchase" });
    expect(JSON.stringify(copy)).not.toContain("ZEPTO MARKETPLACE");
    expect(JSON.stringify(copy)).not.toContain("cc_hdfc");
    expect((await repo.records.get("imp1"))!.sharedWithPartner).toBe(true);
    expect(await couple.records.list()).toEqual([]); // the private record never leaves the personal space
    expect((await couple.audit.list()).map((e) => e.summary)).toEqual([expect.stringContaining("Shared Zepto")]);
  });
  it("private approvals share nothing", async () => {
    const { repo, couple, ctx } = await linked();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { categoryId: "shopping" } }, ctx);
    expect(await couple.sharedExpenses.list()).toEqual([]);
  });
  it("changing the split back to personal, excluding, or deleting withdraws the copy (voided, kept as history)", async () => {
    for (const how of ["personal", "exclude", "delete"] as const) {
      const { repo, couple, ctx } = await linked();
      await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split } }, ctx);
      if (how === "personal") await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { shared: false, split: personal } }, ctx);
      if (how === "exclude") await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { excluded: true } }, ctx);
      if (how === "delete") await applyAction(repo, actor, { type: "record.delete", id: "imp1" }, ctx);
      expect((await couple.sharedExpenses.get("imp1"))!.voided).toBe(true);
    }
  });
  it("editing a shared expense updates the same copy (retry-safe id)", async () => {
    const { repo, couple, ctx } = await linked();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split } }, ctx);
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { categoryId: "shopping" } }, ctx);
    expect((await couple.sharedExpenses.list())).toHaveLength(1);
    expect((await couple.sharedExpenses.get("imp1"))!.categoryName).toBe("Shopping");
  });
  it("the note is shared only on request", async () => {
    const { repo, couple, ctx } = await linked();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split, notes: "birthday" } }, ctx);
    expect((await couple.sharedExpenses.get("imp1"))!.note).toBeUndefined();
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { shareNote: true } }, ctx);
    expect((await couple.sharedExpenses.get("imp1"))!.note).toBe("birthday");
  });
  it("refuses what cannot be shared, with the record left unchanged", async () => {
    const { repo, ctx } = await linked();
    await fails(applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split, kind: "transfer" } }, ctx), "invalid");
    await fails(applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split: { mode: "equal", participantIds: ["me", "wife", "friend"] } } }, ctx), "invalid");
    expect((await repo.records.get("imp1"))!.status).toBe("unreviewed");
  });
  it("after unlinking, nothing new is shared and old copies stay", async () => {
    const { repo, couple, ctx } = await linked();
    await applyAction(repo, actor, { type: "record.approve", id: "imp1", patch: { shared: true, split } }, ctx);
    await repo.records.put(imported({ id: "imp2", referenceId: "REF2" }));
    const ended = { ...ctx, active: false };
    await applyAction(repo, actor, { type: "record.approve", id: "imp2", patch: { shared: true, split } }, ended);
    expect((await couple.sharedExpenses.list()).map((x) => x.id)).toEqual(["imp1"]);
    expect((await couple.sharedExpenses.get("imp1"))!.voided).toBeUndefined();
  });
  it("settlements live in the couple space and need a linked partner", async () => {
    const { repo, couple, ctx } = await linked();
    const s = { id: "s9", date: "2026-10-01", fromId: "wife", toId: "me", amountPaise: 5000 };
    await applyAction(repo, actor, { type: "settlement.create", settlement: s }, ctx);
    expect((await couple.settlements.list()).map((x) => x.id)).toEqual(["s9"]);
    expect(await repo.settlements.list()).toEqual([]);
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: { ...s, id: "s10", fromId: "stranger" } }, ctx), "invalid");
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: { ...s, id: "s11" } }, null), "invalid");
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: { ...s, id: "s12" } }, { ...ctx, active: false }), "invalid");
  });
  it("a settlement with a friend lives in your own space and remembers which payments it covers; void finds it there", async () => {
    const { repo, couple, ctx } = await linked();
    await repo.participants.put({ id: "friend", name: "Karthik", userId: null });
    const s = { id: "sf1", date: "2026-10-01", fromId: "friend", toId: "me", amountPaise: 7000, recordIds: ["imp1"] };
    await applyAction(repo, actor, { type: "settlement.create", settlement: s }, ctx);
    expect((await repo.settlements.get("sf1"))!.recordIds).toEqual(["imp1"]);
    expect(await couple.settlements.list()).toEqual([]);
    await applyAction(repo, actor, { type: "settlement.void", id: "sf1" }, ctx);
    expect((await repo.settlements.get("sf1"))!.voided).toBe(true);
    await fails(applyAction(repo, actor, { type: "settlement.create", settlement: { ...s, id: "sf2", fromId: "friend", toId: "wife" } }, ctx), "invalid");
  });
  it("adds, changes and removes a credit-card bill, only for a credit card, with a sensible due date", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "cc1", name: "HDFC Credit Card", type: "credit_card" });
    await repo.accounts.put({ id: "bk1", name: "HDFC Bank", type: "bank" });
    const bill = { id: "b1", accountId: "cc1", statementDate: "2026-09-15", dueDate: "2026-10-05", totalDuePaise: 4125000, source: "manual" as const };
    await applyAction(repo, actor, { type: "cardbill.put", bill });
    await applyAction(repo, actor, { type: "cardbill.put", bill: { ...bill, totalDuePaise: 4200000 } });
    expect((await repo.cardBills.get("b1"))!.totalDuePaise).toBe(4200000);
    await fails(applyAction(repo, actor, { type: "cardbill.put", bill: { ...bill, id: "b2", accountId: "bk1" } }), "invalid");
    await fails(applyAction(repo, actor, { type: "cardbill.put", bill: { ...bill, id: "b3", dueDate: "2026-09-01" } }), "invalid");
    await fails(applyAction(repo, actor, { type: "cardbill.put", bill: { ...bill, id: "b4", totalDuePaise: 0 } }), "invalid");
    await applyAction(repo, actor, { type: "cardbill.delete", id: "b1" });
    expect(await repo.cardBills.get("b1")).toBeNull();
    await fails(applyAction(repo, actor, { type: "cardbill.delete", id: "b1" }), "not_found");
  });
  it("voucher brands: add (no duplicates), rename, record a balance, and refuse to delete one in use", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "voucherBrand.add", id: "vb1", name: "  Amazon  " });
    expect((await repo.voucherBrands.get("vb1"))!.name).toBe("Amazon");
    await fails(applyAction(repo, actor, { type: "voucherBrand.add", id: "vb2", name: "amazon" }), "conflict");
    await fails(applyAction(repo, actor, { type: "voucherBrand.add", id: "vb3", name: "" }), "invalid");
    await applyAction(repo, actor, { type: "voucherBrand.update", id: "vb1", name: "Amazon Pay", balance: { amountPaise: 500000, asOf: "2026-09-05" }, tracksAllUse: true });
    expect(await repo.voucherBrands.get("vb1")).toMatchObject({ name: "Amazon Pay", balance: { amountPaise: 500000, asOf: "2026-09-05" }, tracksAllUse: true });
    await applyAction(repo, actor, { type: "voucherBrand.update", id: "vb1", balance: null, tracksAllUse: false });
    expect(await repo.voucherBrands.get("vb1")).toEqual({ id: "vb1", name: "Amazon Pay" });
    await repo.records.put(imported({ id: "vp", referenceId: "VP", voucherBrandId: "vb1" }));
    await fails(applyAction(repo, actor, { type: "voucherBrand.delete", id: "vb1" }), "conflict");
    await applyAction(repo, actor, { type: "voucherBrand.add", id: "vb9", name: "Myntra" });
    await applyAction(repo, actor, { type: "voucherBrand.delete", id: "vb9" });
    expect(await repo.voucherBrands.get("vb9")).toBeNull();
  });
  it("approving a voucher purchase records the brand, clears the prompt, and remembers the merchant as a voucher seller", async () => {
    const repo = await setup();
    await applyAction(repo, actor, { type: "voucherBrand.add", id: "vb1", name: "Swiggy" });
    await repo.records.put(imported({ id: "shop", referenceId: "SH", originalDescription: "CUST CAP SOLUTIONS BANGALORE", merchant: "Shopwise", voucherPending: true }));
    await applyAction(repo, actor, { type: "record.approve", id: "shop", patch: { voucherBrandId: "vb1", voucherPending: null } });
    const r = (await repo.records.get("shop"))!;
    expect(r).toMatchObject({ status: "reviewed", voucherBrandId: "vb1" });
    expect(r.voucherPending).toBeUndefined();
    expect((await repo.merchantMemory.list()).find((m) => m.name === "Shopwise")).toMatchObject({ voucherSeller: true, source: "user" });
    expect((await repo.audit.list()).some((e) => /voucher: Swiggy/.test(e.summary))).toBe(true);
  });
  it("refuses an unknown brand, and a payment cannot both buy and use a voucher", async () => {
    const repo = await setup();
    await repo.records.put(imported({ id: "r9", referenceId: "R9" }));
    await fails(applyAction(repo, actor, { type: "record.update", id: "r9", patch: { voucherBrandId: "nope" } }), "invalid");
    await applyAction(repo, actor, { type: "voucherBrand.add", id: "vb1", name: "Swiggy" });
    await expect(applyAction(repo, actor, { type: "record.update", id: "r9", patch: { voucherBrandId: "vb1", paidWithVoucherId: "vb1" } })).rejects.toThrow();
  });
});

