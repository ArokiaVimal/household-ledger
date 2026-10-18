import { describe, expect, it } from "vitest";
import { categoryUsage, checkDelete, cleanCategoryName, makeCategoryId, reassign, validateCategoryName } from "./categories";

const cats = [{ id: "groceries", name: "Groceries" }, { id: "uncategorized", name: "Uncategorized" }];

describe("category names", () => {
  it("accepts good names and cleans whitespace", () => {
    expect(validateCategoryName("  Pet   care ", cats)).toBeNull();
    expect(cleanCategoryName("  Pet   care ")).toBe("Pet care");
    expect(validateCategoryName("Kids' school (fees)", cats)).toBeNull();
    expect(validateCategoryName("Café & Bakery", cats)).toBeNull();
  });
  it("rejects empty, long, odd characters and case-insensitive duplicates", () => {
    expect(validateCategoryName("   ", cats)).toMatch(/Enter/);
    expect(validateCategoryName("x".repeat(41), cats)).toMatch(/under/);
    expect(validateCategoryName("<script>", cats)).toMatch(/letters/);
    expect(validateCategoryName("groceries", cats)).toMatch(/already/);
  });
  it("allows keeping your own name when renaming", () => expect(validateCategoryName("Groceries", cats, "groceries")).toBeNull());
});

describe("category ids", () => {
  it("slugs and avoids collisions", () => {
    expect(makeCategoryId("Pet care", [])).toBe("c_pet_care");
    expect(makeCategoryId("Pet care", ["c_pet_care"])).toBe("c_pet_care-2");
    expect(makeCategoryId("Pet care", ["c_pet_care", "c_pet_care-2"])).toBe("c_pet_care-3");
    expect(makeCategoryId("!!!", [])).toBe("c_category");
  });
});

describe("deleting", () => {
  it("blocks the fallback and recurring items, asks to move used ones", () => {
    expect(checkDelete("uncategorized", { records: 0, recurringItems: [] })).toMatchObject({ ok: false });
    expect(checkDelete("rent", { records: 3, recurringItems: ["Rent"] })).toMatchObject({ ok: false });
    expect(checkDelete("pets", { records: 2, recurringItems: [] })).toEqual({ ok: true, needsMove: true });
    expect(checkDelete("pets", { records: 0, recurringItems: [] })).toEqual({ ok: true, needsMove: false });
  });
  it("reassigns only the matching rows and counts usage", () => {
    const rows = [{ categoryId: "a" }, { categoryId: "b" }, { categoryId: "a" }];
    expect(categoryUsage(rows, "a")).toBe(2);
    expect(reassign(rows, "a", "c").map((r) => r.categoryId)).toEqual(["c", "b", "c"]);
  });
});
