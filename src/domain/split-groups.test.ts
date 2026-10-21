import { describe, expect, it } from "vitest";
import { directSettlements, suggestedPayments, checkGroupExpense, checkSplitGroup, groupBalances, groupExpenses, peopleInUse, settleUp, suggestSettlements, waitingForReview } from "./split-groups";
import type { ExpenseRecord, SplitConfig, SplitGroup, SplitSettlement } from "./types";

const group: SplitGroup = { id: "g1", name: "Goa trip", kind: "trip", participantIds: ["me", "a", "b", "c"], createdAt: "2026-10-01" };
let n = 0;
const rec = (o: Partial<ExpenseRecord> & { split: SplitConfig }): ExpenseRecord => ({
  id: `r${++n}`, date: "2026-10-02", merchant: "Shack", originalDescription: "x", amountPaise: 100000, currency: "INR", accountId: "cc", categoryId: "food", kind: "purchase", payerId: "me",
  shared: o.split.mode !== "personal", excluded: false, status: "reviewed", importSource: "Manual entry", splitGroupId: "g1", ...o,
});
const eq = (...ids: string[]): SplitConfig => ({ mode: "equal", participantIds: ids });
const settle = (o: Partial<SplitSettlement>): SplitSettlement => ({ id: `s${++n}`, groupId: "g1", date: "2026-10-05", fromId: "a", toId: "me", amountPaise: 1, ...o });
const bal = (b: ReturnType<typeof groupBalances>) => Object.fromEntries(b.people.map((p) => [p.id, p.balancePaise]));
const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

describe("group balances", () => {
  it("one payer, equal split: the payer is owed everyone else's share", () => {
    const b = groupBalances(group, [rec({ split: eq("me", "a", "b", "c") })], []);
    expect(bal(b)).toEqual({ me: 75000, a: -25000, b: -25000, c: -25000 });
    expect(b.totalPaise).toBe(100000);
    expect(b.expenseCount).toBe(1);
  });
  it("handles remainders in paise: balances always add up to zero", () => {
    const b = groupBalances(group, [rec({ amountPaise: 100001, split: eq("me", "a", "b") }), rec({ amountPaise: 99999, payerId: "a", split: eq("me", "a", "b", "c") })], []);
    expect(sum(bal(b))).toBe(0);
    expect(b.totalPaise).toBe(200000);
  });
  it("works with every split method (shares, exact, percent, by item)", () => {
    const shares: SplitConfig = { mode: "shares", participantIds: ["me", "a"], values: { me: 1, a: 2 } };
    const custom: SplitConfig = { mode: "custom", participantIds: ["a", "b"], values: { a: 30000, b: 70000 } };
    const items: SplitConfig = { mode: "items", participantIds: ["me", "b"], items: [{ id: "i1", name: "Fish", amountPaise: 60000, participantIds: ["me"] }, { id: "i2", name: "Beer", amountPaise: 30000, participantIds: ["b"] }] };
    const b = groupBalances(group, [rec({ amountPaise: 30000, split: shares }), rec({ payerId: "b", split: custom }), rec({ amountPaise: 100000, payerId: "a", split: items })], []);
    expect(sum(bal(b))).toBe(0);
    expect(b.people.find((p) => p.id === "me")!.sharePaise).toBe(10000 + 66667);
  });
  it("a payer who is not in the split is simply owed the whole amount", () => {
    expect(bal(groupBalances(group, [rec({ payerId: "c", split: eq("a", "b") })], []))).toMatchObject({ c: 100000, a: -50000, b: -50000 });
  });
  it("refunds take money back off", () => {
    const b = groupBalances(group, [rec({ split: eq("me", "a") }), rec({ kind: "refund", amountPaise: 20000, split: eq("me", "a") })], []);
    expect(bal(b)).toMatchObject({ me: 40000, a: -40000 });
    expect(b.totalPaise).toBe(80000);
  });
  it("only reviewed, counted records of this group take part", () => {
    const rs = [rec({ status: "unreviewed", split: eq("me", "a") }), rec({ excluded: true, split: eq("me", "a") }), rec({ kind: "income", split: eq("me", "a") }), rec({ splitGroupId: "other", split: eq("me", "a") }), rec({ splitGroupId: undefined, split: eq("me", "a") })];
    const b = groupBalances(group, rs, []);
    expect(b.expenseCount).toBe(0);
    expect(sum(bal(b))).toBe(0);
    expect(groupExpenses(rs, "g1")).toHaveLength(0);
    expect(waitingForReview(rs, "g1")).toBe(1);
  });
  it("settlements move balances, voided ones and other groups do not", () => {
    const rs = [rec({ split: eq("me", "a") })];
    expect(bal(groupBalances(group, rs, [settle({ amountPaise: 50000 })]))).toMatchObject({ me: 0, a: 0 });
    expect(bal(groupBalances(group, rs, [settle({ amountPaise: 50000, voided: true }), settle({ amountPaise: 50000, groupId: "other" })]))).toMatchObject({ me: 50000, a: -50000 });
    // overpaying flips the balance rather than being lost
    expect(bal(groupBalances(group, rs, [settle({ amountPaise: 60000 })]))).toMatchObject({ me: -10000, a: 10000 });
  });
  it("a settlement between two other people changes only their balances", () => {
    const rs = [rec({ payerId: "a", split: eq("a", "b", "c") })];
    expect(bal(groupBalances(group, rs, [settle({ fromId: "b", toId: "a", amountPaise: 33333 })]))).toMatchObject({ a: 33333, b: 0, c: -33333, me: 0 });
  });
  it("is a view only: spending is not derived from it, the same record counted once", () => {
    const r = rec({ split: eq("me", "a") });
    const once = groupBalances(group, [r], []);
    expect(once.totalPaise).toBe(r.amountPaise);
    expect(groupBalances(group, [r], []).totalPaise).toBe(once.totalPaise); // pure: no hidden state
  });
});

describe("suggested settlements", () => {
  const apply = (b: Record<string, number>, ts: ReturnType<typeof suggestSettlements>) => { const o = { ...b }; for (const t of ts) { o[t.fromId] += t.amountPaise; o[t.toId] -= t.amountPaise; } return o; };
  it("one person paid, three owe: three payments", () => {
    const b = { me: 75000, a: -25000, b: -25000, c: -25000 };
    const ts = suggestSettlements(b);
    expect(ts).toHaveLength(3);
    expect(ts.every((t) => t.toId === "me" && t.amountPaise === 25000)).toBe(true);
    expect(Object.values(apply(b, ts)).every((v) => v === 0)).toBe(true);
  });
  it("chains collapse: A owes B, B owes C becomes A pays C", () => {
    expect(suggestSettlements({ a: -100, b: 0, c: 100 })).toEqual([{ fromId: "a", toId: "c", amountPaise: 100 }]);
  });
  it("finds separate circles: two pairs need two payments, not three", () => {
    const b = { a: -100, b: 100, c: -250, d: 250 };
    const ts = suggestSettlements(b);
    expect(ts).toHaveLength(2);
    expect(Object.values(apply(b, ts)).every((v) => v === 0)).toBe(true);
  });
  it("never needs more than n − 1 payments, always clears everyone, and never overpays (random)", () => {
    let seed = 7;
    const rnd = (m: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
    for (let t = 0; t < 200; t++) {
      const k = 2 + rnd(9);
      const b: Record<string, number> = {};
      for (let i = 0; i < k - 1; i++) b[`p${i}`] = rnd(200001) - 100000;
      b[`p${k - 1}`] = -Object.values(b).reduce((s, v) => s + v, 0);
      const ts = suggestSettlements(b);
      const nonzero = Object.values(b).filter((v) => v !== 0).length;
      expect(ts.length).toBeLessThanOrEqual(Math.max(0, nonzero - 1));
      expect(Object.values(apply(b, ts)).every((v) => v === 0)).toBe(true);
      for (const x of ts) { expect(x.amountPaise).toBeGreaterThan(0); expect(Number.isInteger(x.amountPaise)).toBe(true); expect(x.fromId).not.toBe(x.toId); }
    }
  });
  it("is deterministic and leaves people who are even out", () => {
    const b = { z: -300, y: 300, x: 0 };
    expect(suggestSettlements(b)).toEqual(suggestSettlements({ x: 0, y: 300, z: -300 }));
    expect(suggestSettlements(b).flatMap((t) => [t.fromId, t.toId])).not.toContain("x");
  });
  it("large groups fall back to the greedy way and still clear everyone", () => {
    const b: Record<string, number> = {};
    for (let i = 0; i < 20; i++) b[`p${String(i).padStart(2, "0")}`] = i % 2 ? 1000 + i : -(1000 + i - 1);
    b.p19 += 20 - 0; b.p00 -= 20; // keep the total at zero
    const total = Object.values(b).reduce((s, v) => s + v, 0);
    b.p01 -= total;
    expect(Object.values(apply(b, suggestSettlements(b))).every((v) => v === 0)).toBe(true);
  });
  it("rejects balances that do not add up to zero", () => { expect(() => suggestSettlements({ a: 100, b: -50 })).toThrow(); });
  it("works on a real group", () => {
    const rs = [rec({ split: eq("me", "a", "b", "c") }), rec({ payerId: "a", split: eq("me", "a", "b", "c") })];
    expect(settleUp(groupBalances(group, rs, []))).toHaveLength(2);
  });
});

describe("group rules", () => {
  it("names the problem when a group is not valid", () => {
    expect(checkSplitGroup({ name: " ", participantIds: ["me", "a"] }, [])).toMatch(/name/);
    expect(checkSplitGroup({ name: "Goa trip", participantIds: ["me", "a"] }, [group])).toMatch(/already/);
    expect(checkSplitGroup({ name: "x", participantIds: ["me"] }, [])).toMatch(/two people/);
    expect(checkSplitGroup({ name: "x", participantIds: ["me", "me"] }, [])).toMatch(/twice/);
    expect(checkSplitGroup({ name: "Dinner", participantIds: ["me", "a"] }, [group])).toBeNull();
  });
  it("lists people who cannot be removed", () => {
    const used = peopleInUse("g1", [rec({ payerId: "a", split: eq("a", "b") })], [settle({ fromId: "c", toId: "me", amountPaise: 5 }), settle({ fromId: "x", toId: "y", amountPaise: 5, voided: true })]);
    expect([...used].sort()).toEqual(["a", "b", "c", "me"]);
  });
  it("only people in the group can be in its expenses", () => {
    expect(checkGroupExpense(group, { payerId: "me", kind: "purchase", split: eq("me", "a") })).toBeNull();
    expect(checkGroupExpense(group, { payerId: "me", kind: "purchase", split: eq("me", "zed") }, (id) => id.toUpperCase())).toMatch(/ZED is not in Goa trip/);
    expect(checkGroupExpense(group, { payerId: "zed", kind: "purchase", split: eq("me") })).toMatch(/not in/);
    expect(checkGroupExpense(group, { payerId: "me", kind: "income", split: eq("me") })).toMatch(/Only purchases/);
  });
});

describe("simplify payments off: pay back exactly who paid for you", () => {
  const chain = () => [rec({ payerId: "a", amountPaise: 20000, split: eq("a", "b") }), rec({ payerId: "b", amountPaise: 20000, split: eq("b", "c") })]; // b owes a 100, c owes b 100
  const g = (o: Partial<SplitGroup> = {}): SplitGroup => ({ ...group, participantIds: ["a", "b", "c"], ...o });
  it("keeps debts where they arose; simplified collapses the chain", () => {
    expect(directSettlements(group, chain(), [])).toEqual([{ fromId: "b", toId: "a", amountPaise: 10000 }, { fromId: "c", toId: "b", amountPaise: 10000 }].sort((x, y) => x.fromId.localeCompare(y.fromId)).sort((x, y) => y.amountPaise - x.amountPaise || x.fromId.localeCompare(y.fromId)));
    expect(suggestedPayments(g(), chain(), [])).toEqual([{ fromId: "c", toId: "a", amountPaise: 10000 }]);
    expect(suggestedPayments(g({ simplifyDebts: true }), chain(), [])).toHaveLength(1);
    expect(suggestedPayments(g({ simplifyDebts: false }), chain(), [])).toHaveLength(2);
  });
  it("nets what two people owe each other in both directions", () => {
    const rs = [rec({ payerId: "a", amountPaise: 30000, split: eq("a", "b") }), rec({ payerId: "b", amountPaise: 10000, split: eq("a", "b") })]; // b owes a 150, a owes b 50
    expect(directSettlements(group, rs, [])).toEqual([{ fromId: "b", toId: "a", amountPaise: 10000 }]);
  });
  it("payments made in the group count, and voided or other groups' do not", () => {
    const rs = chain();
    expect(directSettlements(group, rs, [settle({ fromId: "b", toId: "a", amountPaise: 10000 })])).toEqual([{ fromId: "c", toId: "b", amountPaise: 10000 }]);
    expect(directSettlements(group, rs, [settle({ fromId: "b", toId: "a", amountPaise: 10000, voided: true }), settle({ fromId: "b", toId: "a", amountPaise: 10000, groupId: "other" })])).toHaveLength(2);
  });
  it("only counts reviewed, counted expenses and always clears everyone (random)", () => {
    let seed = 11;
    const rnd = (m: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
    const ids = ["me", "a", "b", "c", "d"];
    for (let t = 0; t < 100; t++) {
      const rs: ExpenseRecord[] = [];
      for (let i = 0; i < 1 + rnd(6); i++) { const who = ids.filter(() => rnd(2) === 0); if (who.length === 0) who.push("me"); rs.push(rec({ payerId: ids[rnd(5)], amountPaise: 100 + rnd(100000), status: rnd(5) === 0 ? "unreviewed" : "reviewed", split: eq(...who) })); }
      const ss = rnd(2) ? [settle({ fromId: ids[rnd(5)], toId: ids[(rnd(4) + 1 + ids.indexOf("me")) % 5], amountPaise: 1 + rnd(5000) })] : [];
      const g2 = { ...group, participantIds: ids };
      const before = Object.fromEntries(groupBalances(g2, rs, ss).people.map((p) => [p.id, p.balancePaise]));
      const after = { ...before };
      for (const x of directSettlements(g2, rs, ss)) { expect(x.amountPaise).toBeGreaterThan(0); after[x.fromId] += x.amountPaise; after[x.toId] -= x.amountPaise; }
      if (ss[0] && ss[0].fromId === ss[0].toId) continue;
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
    }
  });
});
