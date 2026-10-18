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
  it("unknown actions and junk are refused, and every accepted change wrote an audit event", async () => {
    const repo = await setup();
    await fails(applyAction(repo, actor, { type: "drop.database" }), "invalid");
    await fails(applyAction(repo, actor, null), "invalid");
    await fails(applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { categoryId: 5 } }), "invalid");
    expect(await audit(repo)).toEqual([]);
  });
});

describe("suggested accounts", () => {
  it("adds the ten starting payment methods once and skips ones that exist", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "cc_hdfc", name: "My HDFC", type: "credit_card" });
    await applyAction(repo, actor, { type: "accounts.addSuggested" });
    const list = await repo.accounts.list();
    expect(list).toHaveLength(10);
    expect(list.find((a) => a.id === "cc_hdfc")!.name).toBe("My HDFC");
    await applyAction(repo, actor, { type: "accounts.addSuggested" });
    expect(await repo.accounts.list()).toHaveLength(10);
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
});
