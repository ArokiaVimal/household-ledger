import { describe, expect, it } from "vitest";
import { inferCategory, merchantFromNotes } from "./categorize";
import type { Category, ExpenseRecord } from "./types";

const cats: Category[] = [["groceries", "Groceries"], ["food_delivery", "Food delivery"], ["restaurants", "Restaurants & cafes"], ["fuel", "Fuel"], ["utilities", "Utilities"], ["shopping", "Shopping"], ["subscriptions", "Subscriptions"], ["uncategorized", "Uncategorized"]].map(([id, name]) => ({ id, name }));
let n = 0;
const rec = (merchant: string, categoryId: string): ExpenseRecord => ({ id: `r${++n}`, merchant, categoryId, status: "reviewed", kind: "purchase" } as ExpenseRecord);
const base = { merchant: "", notes: "", records: [] as ExpenseRecord[], rules: [], categories: cats };

describe("category guess without AI", () => {
  it("uses what you usually file the merchant under before anything else", () => {
    const g = inferCategory({ ...base, merchant: "Zepto", notes: "late night snacks", records: [rec("zepto", "groceries"), rec("Zepto", "groceries"), rec("Zepto", "restaurants")] });
    expect(g).toMatchObject({ categoryId: "groceries", reason: "history" });
  });
  it("uses your own merchant rules next", () => {
    expect(inferCategory({ ...base, merchant: "BPCL Pump 12", rules: [{ merchant: "BPCL", categoryId: "fuel" }] })).toMatchObject({ categoryId: "fuel", reason: "rule" });
  });
  it("reads everyday words in the note, then the merchant, and says which", () => {
    expect(inferCategory({ ...base, notes: "bought milk and eggs" })).toMatchObject({ categoryId: "groceries", reason: "keyword", detail: expect.stringContaining("note") });
    expect(inferCategory({ ...base, merchant: "Netflix" })).toMatchObject({ categoryId: "subscriptions", detail: expect.stringContaining("merchant") });
    expect(inferCategory({ ...base, merchant: "Amazon", notes: "dinner with friends" })).toMatchObject({ categoryId: "restaurants" }); // the note wins over the merchant
    expect(inferCategory({ ...base, notes: "TNEB electricity" })).toMatchObject({ categoryId: "utilities" });
  });
  it("skips categories you do not have, never suggests Uncategorized, and returns null when nothing fits", () => {
    expect(inferCategory({ ...base, categories: cats.filter((c) => c.id !== "groceries"), notes: "vegetables" })).toBeNull();
    expect(inferCategory({ ...base, notes: "something odd" })).toBeNull();
    expect(inferCategory({ ...base, merchant: "X", records: [rec("X", "uncategorized")] })).toBeNull();
    expect(inferCategory({ ...base, categories: [...cats.filter((c) => c.id !== "groceries"), { id: "food_stuff", name: "Groceries & Food" }], notes: "vegetables" })).toMatchObject({ categoryId: "food_stuff" }); // resolved by name
  });
  it("finds a known merchant named in the note", () => {
    expect(merchantFromNotes("Swiggy dinner with Varru", ["Zepto", "Swiggy", "Amazon"])).toBe("Swiggy");
    expect(merchantFromNotes("Amazon Fresh groceries", ["Amazon", "Amazon Fresh"])).toBe("Amazon Fresh");
    expect(merchantFromNotes("swiggying", ["Swiggy"])).toBeNull();
    expect(merchantFromNotes("ok", ["Ok"])).toBeNull();
    expect(merchantFromNotes("", ["Zepto"])).toBeNull();
  });
});
