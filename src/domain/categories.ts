// Household category rules. Pure and shared by the UI and (later) the server.
import type { Category } from "./types";

/** "Uncategorized" is the fallback for imports and manual entry, so it can be renamed but never deleted. */
export const PROTECTED_CATEGORY_IDS: readonly string[] = ["uncategorized"];
export const MAX_CATEGORY_NAME = 40;

export function validateCategoryName(name: string, existing: Category[], selfId?: string): string | null {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length === 0) return "Enter a category name.";
  if (n.length > MAX_CATEGORY_NAME) return `Keep it under ${MAX_CATEGORY_NAME} characters.`;
  if (!/^[\p{L}\p{N} &'’,.()/+-]+$/u.test(n)) return "Use letters, numbers and simple punctuation only.";
  if (existing.some((c) => c.id !== selfId && c.name.toLowerCase() === n.toLowerCase())) return "A category with that name already exists.";
  return null;
}

export const cleanCategoryName = (name: string) => name.trim().replace(/\s+/g, " ");

/** Stable id from the name; suffixes -2, -3 on collision. Ids never change when a category is renamed. */
export function makeCategoryId(name: string, existingIds: string[]): string {
  const slug = cleanCategoryName(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "category";
  let id = `c_${slug}`;
  for (let i = 2; existingIds.includes(id); i++) id = `c_${slug}-${i}`;
  return id;
}

export const categoryUsage = (rows: { categoryId: string }[], id: string) => rows.filter((r) => r.categoryId === id).length;

export type DeleteCheck = { ok: true; needsMove: boolean } | { ok: false; reason: string };

/** Records and rules can be moved to another category; recurring items and the protected fallback block deletion. */
export function checkDelete(id: string, use: { records: number; recurringItems: string[] }): DeleteCheck {
  if (PROTECTED_CATEGORY_IDS.includes(id)) return { ok: false, reason: "This is the fallback category and cannot be deleted. You can rename it." };
  if (use.recurringItems.length > 0) return { ok: false, reason: `Used by recurring item${use.recurringItems.length > 1 ? "s" : ""}: ${use.recurringItems.join(", ")}. Change those first.` };
  return { ok: true, needsMove: use.records > 0 };
}

export function reassign<T extends { categoryId: string }>(rows: T[], from: string, to: string): T[] {
  return rows.map((r) => (r.categoryId === from ? { ...r, categoryId: to } : r));
}
