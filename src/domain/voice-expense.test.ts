import { describe, expect, it } from "vitest";
import { matchAccounts, matchContacts, resolveVoice, spokenNumbers, validateFacts, EMPTY_FACTS, type AccountLite, type ContactLite } from "./voice-expense";

const contacts: ContactLite[] = [{ id: "p_varru", name: "Sri Varalakshmi", nickname: "Varru" }, { id: "p_meera", name: "Meera Iyer" }, { id: "p_karthik1", name: "Karthik K" }, { id: "p_karthik2", name: "Karthik R" }, { id: "p_priya", name: "Priya" }, { id: "p_priya2", name: "Priya Sharma" }];
const accounts: AccountLite[] = [
  { id: "a_amex1", name: "Amex Platinum Travel", type: "credit_card" }, { id: "a_amex2", name: "Amex Gold", type: "credit_card" },
  { id: "a_hdfc", name: "HDFC BizGrow Card", type: "credit_card" }, { id: "a_gpay", name: "GPay", type: "upi" }, { id: "a_old", name: "Old Axis Card", type: "credit_card", archived: true },
];
const categories = [{ id: "restaurants", name: "Restaurants & cafes" }, { id: "groceries", name: "Groceries" }];

describe("spokenNumbers", () => {
  it("reads digits, shorthand and number words", () => {
    expect(spokenNumbers("breakfast for ₹365 split by 3")).toEqual(expect.arrayContaining([365, 3]));
    expect(spokenNumbers("1,200 rupees")).toContain(1200);
    expect(spokenNumbers("it was 1.2k")).toContain(1200);
    expect(spokenNumbers("two lakh")).toContain(200000);
    expect(spokenNumbers("twelve hundred")).toContain(1200);
    expect(spokenNumbers("five hundred and sixty rupees")).toContain(560);
    expect(spokenNumbers("two thousand five hundred")).toContain(2500);
    expect(spokenNumbers("three sixty five")).toContain(365);
  });
  it("finds nothing in a sentence without numbers", () => { expect(spokenNumbers("lunch at the usual place")).toEqual([]); });
});

describe("validateFacts", () => {
  const ctx = { transcript: "breakfast with Varru and Meera at A2B for ₹365 split by 3 used Amex", today: "2026-10-22", categoryNames: ["Restaurants & cafes", "Groceries"] };
  const raw = { merchant: " A2B ", amount: 365, date: "2026-10-22", category: "restaurants & cafes", note: "Breakfast", people: ["Varru", "Meera", "me", "Varru", "I"], paidBy: "me", splitCount: 3, paymentMethod: "Amex" };
  it("keeps what holds up and cleans the rest", () => {
    const { facts, warnings } = validateFacts(raw, ctx);
    expect(warnings).toEqual([]);
    expect(facts).toEqual({ merchant: "A2B", amount: 365, date: "2026-10-22", category: "Restaurants & cafes", note: "Breakfast", people: ["Varru", "Meera"], paidBy: null, splitCount: 3, paymentMethod: "Amex" });
  });
  it("drops an amount that was never said, and says so", () => {
    const { facts, warnings } = validateFacts({ ...raw, amount: 400 }, ctx);
    expect(facts.amount).toBeNull();
    expect(warnings.join(" ")).toMatch(/amount/i);
  });
  it("drops an unreal, far-future or very old date and a category that is not yours", () => {
    expect(validateFacts({ ...raw, date: "2026-10-30" }, ctx).facts.date).toBeNull();
    expect(validateFacts({ ...raw, date: "2019-01-01" }, ctx).facts.date).toBeNull();
    expect(validateFacts({ ...raw, date: "2026-13-45" }, ctx).facts.date).toBeNull();
    expect(validateFacts({ ...raw, category: "Space travel" }, ctx).facts.category).toBeNull();
    expect(validateFacts({ ...raw, date: "2026-10-21" }, ctx).facts.date).toBe("2026-10-21");
  });
  it("returns empty facts for garbage and keeps who paid when it is someone else", () => {
    expect(validateFacts("nonsense", ctx).facts).toEqual(EMPTY_FACTS);
    expect(validateFacts({ ...raw, paidBy: "Varru" }, ctx).facts.paidBy).toBe("Varru");
    expect(validateFacts({ ...raw, splitCount: 1 }, ctx).facts.splitCount).toBeNull();
  });
});

describe("matchContacts", () => {
  it("matches a nickname, a first name, and a name the transcriber spelled one letter off", () => {
    expect(matchContacts("Varru", contacts).map((c) => c.id)).toEqual(["p_varru"]);
    expect(matchContacts("Varu", contacts).map((c) => c.id)).toEqual(["p_varru"]);
    expect(matchContacts("Meera", contacts).map((c) => c.id)).toEqual(["p_meera"]);
  });
  it("prefers the exact name and reports a real ambiguity instead of picking", () => {
    expect(matchContacts("Priya", contacts).map((c) => c.id)).toEqual(["p_priya"]);
    expect(matchContacts("Karthik", contacts).map((c) => c.id).sort()).toEqual(["p_karthik1", "p_karthik2"]);
  });
  it("finds nobody for an unknown name and never matches the speaker", () => {
    expect(matchContacts("Zubin", contacts)).toEqual([]);
    expect(matchContacts("Meera", contacts, "p_meera")).toEqual([]);
  });
});

describe("matchAccounts", () => {
  it("returns every card of the issuer when the word is not enough", () => {
    expect(matchAccounts("Amex", accounts).map((a) => a.id).sort()).toEqual(["a_amex1", "a_amex2"]);
  });
  it("narrows by a distinguishing word, and matches banks and apps", () => {
    expect(matchAccounts("Amex Platinum card", accounts).map((a) => a.id)).toEqual(["a_amex1"]);
    expect(matchAccounts("my HDFC card", accounts).map((a) => a.id)).toEqual(["a_hdfc"]);
    expect(matchAccounts("Google Pay", accounts).map((a) => a.id)).toEqual(["a_gpay"]);
  });
  it("skips archived methods and finds nothing for an unknown one", () => {
    expect(matchAccounts("Axis", accounts)).toEqual([]);
    expect(matchAccounts("Zebra", accounts)).toEqual([]);
  });
});

describe("resolveVoice: the breakfast example", () => {
  const facts = { merchant: "A2B", amount: 365, date: "2026-10-22", category: "Restaurants & cafes", note: "Breakfast", people: ["Varru", "Meera"], paidBy: null, splitCount: 3, paymentMethod: "Amex" };
  it("fills the form, shares it three ways, and asks which Amex", () => {
    const f = resolveVoice(facts, { meId: "me", contacts, accounts, categories });
    expect(f).toMatchObject({ merchant: "A2B", amountPaise: 36500, date: "2026-10-22", categoryId: "restaurants", note: "Breakfast", withIds: ["p_varru", "p_meera"], equalSplit: true });
    expect(f.accountId).toBeUndefined();
    expect(f.accountOptions.map((a) => a.id).sort()).toEqual(["a_amex1", "a_amex2"]);
    expect(f.unknownPeople).toEqual([]);
    expect(f.warnings).toEqual([]);
  });
  it("offers to add a person who is not a contact and flags a split count that does not match", () => {
    const f = resolveVoice({ ...facts, people: ["Varru", "Zubin"], splitCount: 4 }, { meId: "me", contacts, accounts, categories });
    expect(f.withIds).toEqual(["p_varru"]);
    expect(f.unknownPeople).toEqual(["Zubin"]);
    expect(f.warnings.join(" ")).toMatch(/split 4 ways/);
  });
  it("picks the one matching card and treats a named payer as part of the split", () => {
    const f = resolveVoice({ ...facts, paymentMethod: "HDFC", paidBy: "Meera", people: ["Varru"], splitCount: null }, { meId: "me", contacts, accounts, categories });
    expect(f.accountId).toBe("a_hdfc");
    expect(f.payerId).toBe("p_meera");
    expect(f.withIds.sort()).toEqual(["p_meera", "p_varru"]);
    expect(f.equalSplit).toBe(false);
  });
  it("leaves unmatched things blank and says so", () => {
    const f = resolveVoice({ ...EMPTY_FACTS, merchant: "Zepto", paymentMethod: "Mystery wallet" }, { meId: "me", contacts, accounts, categories });
    expect(f.accountId).toBeUndefined();
    expect(f.warnings.join(" ")).toMatch(/could not match/);
    expect(f.amountPaise).toBeUndefined();
  });
});
