import type { Account, Category } from "./types";

/** Starting categories for a new household (all editable). `uncategorized` is the protected fallback. */
export const DEFAULT_CATEGORIES: Category[] = [
  ["groceries", "Groceries"], ["food_delivery", "Food delivery"], ["restaurants", "Restaurants & cafes"], ["transport", "Transport"], ["fuel", "Fuel"],
  ["shopping", "Shopping"], ["utilities", "Utilities"], ["rent", "Rent & home"], ["travel", "Travel"], ["entertainment", "Entertainment"],
  ["health", "Health"], ["subscriptions", "Subscriptions"], ["emi", "Loans & EMI"], ["insurance", "Insurance"], ["fees", "Fees & charges"],
  ["income", "Income"], ["transfers", "Transfers"], ["refunds", "Refunds"], ["uncategorized", "Uncategorized"],
].map(([id, name]) => ({ id, name }));

/** One-click starting payment methods. Ids are stable so imports and rules can refer to them. */
export const SUGGESTED_ACCOUNTS: Account[] = [
  { id: "cc_hdfc", name: "HDFC BizGrow Card", type: "credit_card" },
  { id: "cc_sbi", name: "SBI OCTANE BPCL Credit Card", type: "credit_card" },
  { id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" },
  { id: "bank_hdfc", name: "HDFC Bank", type: "bank" },
  { id: "bank_icici", name: "ICICI Bank", type: "bank" },
  // UPI apps are named for the bank behind them and sit under it (GPay HDFC UPI), so each payment shows which bank paid.
  ...(["hdfc", "icici"] as const).flatMap((b) => (["gpay", "cred", "paytm", "bhim"] as const).map((app) => ({
    id: `upi_${app}_bank_${b}`, name: `${{ gpay: "GPay", cred: "CRED", paytm: "Paytm", bhim: "BHIM" }[app]} ${b.toUpperCase()} UPI`, type: "upi" as const, parentId: `bank_${b}`,
  }))),
  // Wallets topped up with Amex purchases (see Vouchers): they sit under the Amex card.
  { id: "wl_amazonpay", name: "Amazon Pay", type: "wallet", parentId: "cc_amex" },
  { id: "wl_swiggymoney", name: "Swiggy Money", type: "wallet", parentId: "cc_amex" },
  { id: "wl_myntra", name: "Myntra Wallet", type: "wallet", parentId: "cc_amex" },
];

/** The usual split between the two partners: the household owner bears 64%, the partner 36% (basis points). */
export const OWNER_SHARE_BPS = 6400;

/** Voucher brands offered the first time you pick one. They are created only when you choose them, so nothing is added behind your back. */
export const SUGGESTED_VOUCHER_BRANDS = ["Amazon", "Swiggy", "Myntra"] as const;
