import type { Account, Category } from "./types";

/** Starting categories for a new household (all editable). `uncategorized` is the protected fallback. */
export const DEFAULT_CATEGORIES: Category[] = [
  ["groceries", "Groceries"], ["food_delivery", "Food delivery"], ["restaurants", "Restaurants & cafes"], ["transport", "Transport"], ["fuel", "Fuel"],
  ["shopping", "Shopping"], ["utilities", "Utilities"], ["rent", "Rent & household"], ["travel", "Travel"], ["entertainment", "Entertainment"],
  ["health", "Health"], ["subscriptions", "Subscriptions"], ["emi", "Loans & EMI"], ["insurance", "Insurance"], ["fees", "Fees & charges"],
  ["income", "Income"], ["transfers", "Transfers"], ["refunds", "Refunds"], ["uncategorized", "Uncategorized"],
].map(([id, name]) => ({ id, name }));

/** One-click starting payment methods. Ids are stable so imports and rules can refer to them. */
export const SUGGESTED_ACCOUNTS: Account[] = [
  { id: "cc_hdfc", name: "HDFC Credit Card", type: "credit_card" },
  { id: "cc_sbi", name: "SBI Credit Card", type: "credit_card" },
  { id: "cc_icici", name: "ICICI Coral Credit Card", type: "credit_card" },
  { id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" },
  { id: "upi_gpay", name: "GPay", type: "upi" },
  { id: "upi_cred", name: "CRED", type: "upi" },
  { id: "upi_bhim", name: "BHIM UPI", type: "upi" },
  { id: "upi_paytm", name: "Paytm", type: "upi" },
  { id: "bank_hdfc", name: "HDFC Bank", type: "bank" },
  { id: "bank_icici", name: "ICICI Bank", type: "bank" },
];
