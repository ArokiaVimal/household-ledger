import { describe, expect, it } from "vitest";
import { attentionTotal, needsAttention } from "./attention";
import type { BillStatus } from "./cardbills";
import type { RecurringStatus } from "./recurring";

const bill = (state: BillStatus["state"], daysLeft: number) => ({ state, daysLeft }) as BillStatus;
const rec = (state: RecurringStatus["state"]) => ({ state }) as RecurringStatus;

describe("needs attention", () => {
  it("is empty when nothing needs a look", () => {
    expect(needsAttention({ waiting: 0, bills: [], recurring: [rec("paid"), rec("notdue")], uncategorized: 0 })).toEqual([]);
  });
  it("lists what is waiting, overdue or close, and totals it", () => {
    const items = needsAttention({ waiting: 9, bills: [bill("overdue", -2), bill("due", 2), bill("due", 20)], recurring: [rec("overdue"), rec("upcoming")], uncategorized: 4, suggestions: 1 });
    expect(items.map((x) => [x.key, x.count])).toEqual([["review", 9], ["bills-overdue", 1], ["bills-soon", 1], ["recurring-overdue", 1], ["suggestions", 1], ["uncategorized", 4]]);
    expect(attentionTotal(items)).toBe(17);
  });
});
