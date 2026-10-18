// FICTIONAL DATA for the prototype only. Nothing here is real or persisted.
import type { Account, Category, ExpenseRecord, Participant, Receipt, RecurringItem, Settlement, SplitConfig, TxnKind } from "@/domain/types";

export const ME = "me";
export const MOCK_MONTH = "2026-09";

export const participants: Participant[] = [
  { id: "me", name: "Vimal", userId: "u_me" },
  { id: "wife", name: "Varru", userId: "u_wife" },
  { id: "karthik", name: "Karthik", userId: null },
  { id: "priya", name: "Priya", userId: null },
];

export const accounts: Account[] = [
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

export const categories: Category[] = [
  ["groceries", "Groceries"], ["food_delivery", "Food delivery"], ["restaurants", "Restaurants & cafes"],
  ["transport", "Transport"], ["fuel", "Fuel"], ["shopping", "Shopping"], ["utilities", "Utilities"],
  ["rent", "Rent & household"], ["travel", "Travel"], ["entertainment", "Entertainment"], ["health", "Health"],
  ["subscriptions", "Subscriptions"], ["emi", "Loans & EMI"], ["insurance", "Insurance"], ["fees", "Fees & charges"], ["income", "Income"], ["transfers", "Transfers"],
  ["refunds", "Refunds"], ["uncategorized", "Uncategorized"],
].map(([id, name]) => ({ id, name }));

const r = (rupees: number) => Math.round(rupees * 100);
const personal = (id = "me"): SplitConfig => ({ mode: "personal", participantIds: [id] });
const equal = (...ids: string[]): SplitConfig => ({ mode: "equal", participantIds: ids });
const HOUSE = ["me", "wife"];

interface Opts { kind?: TxnKind; payer?: string; split?: SplitConfig; shared?: boolean; status?: "reviewed" | "unreviewed"; ref?: string; dupOf?: string; excluded?: boolean; notes?: string; receiptId?: string; fundedBy?: string; rec?: string }
let n = 0;
function t(date: string, merchant: string, desc: string, rupees: number, accountId: string, categoryId: string, o: Opts = {}): ExpenseRecord {
  const split = o.split ?? personal(o.payer ?? "me");
  return {
    id: `t${String(++n).padStart(2, "0")}`, date, merchant, originalDescription: desc, amountPaise: r(rupees), currency: "INR",
    accountId, categoryId, kind: o.kind ?? "purchase", payerId: o.payer ?? "me",
    shared: o.shared ?? split.mode !== "personal", split, excluded: o.excluded ?? false, status: o.status ?? "reviewed",
    importSource: `${accountId}_Sep2026 (mock)`, referenceId: o.ref, notes: o.notes,
    duplicateOf: o.dupOf, receiptId: o.receiptId, fundedBy: o.fundedBy, recurringId: o.rec,
  };
}

export const initialRecords: ExpenseRecord[] = [
  t("2026-09-01", "Sis Safa (Rent)", "UPI/LANDLORD RENT SEP/6129", 35000, "upi_gpay", "rent", { split: equal(...HOUSE), notes: "September rent, Sis Safa", ref: "UPI6129", fundedBy: "bank_hdfc", rec: "rent" }),
  t("2026-09-01", "Employer Ltd", "NEFT CR SALARY SEP", 185000, "bank_hdfc", "income", { kind: "income", ref: "NEFT7781" }),
  t("2026-09-02", "BigBasket", "BIGBASKET BANGALORE IN", 2840.5, "cc_hdfc", "groceries", { split: equal(...HOUSE), ref: "CC0902A" }),
  t("2026-09-02", "Swiggy", "SWIGGY BANGALORE IN", 612, "cc_hdfc", "food_delivery", { split: equal(...HOUSE), ref: "CC0902B" }),
  t("2026-09-03", "Uber", "UBER INDIA SYSTEMS", 348, "cc_hdfc", "transport", { ref: "CC0903A" }),
  t("2026-09-03", "Indian Oil", "IOCL PETROL PUMP KORAMANGALA", 2500, "cc_sbi", "fuel", { ref: "CC0903B" }),
  t("2026-09-04", "Netflix", "NETFLIX.COM MUMBAI", 649, "cc_sbi", "subscriptions", { split: equal(...HOUSE), ref: "CC0904A" }),
  t("2026-09-04", "Spotify", "SPOTIFY INDIA", 119, "cc_sbi", "subscriptions", { ref: "CC0904B" }),
  t("2026-09-05", "Zepto", "ZEPTO MARKETPLACE BLR", 642, "cc_hdfc", "groceries", { split: equal(...HOUSE), ref: "CC0905A", status: "unreviewed" }),
  t("2026-09-05", "Zepto", "ZEPTO MARKETPLACE BLR", 642, "cc_hdfc", "groceries", { split: equal(...HOUSE), status: "unreviewed", dupOf: "t09", notes: "Possible duplicate of the Zepto entry above" }),
  t("2026-09-06", "Amazon", "AMAZON PAY INDIA PVT LTD", 1299, "cc_icici", "shopping", { ref: "CC0906A" }),
  t("2026-09-06", "Cafe Coffee Day", "CCD KORAMANGALA", 420, "cc_hdfc", "restaurants", { payer: "wife", split: equal(...HOUSE) }),
  t("2026-09-07", "TNEB (Sis Safa)", "TNEB ELECTRICITY BILL", 1860, "upi_cred", "utilities", { split: equal(...HOUSE), ref: "UPI7001", fundedBy: "bank_icici", rec: "eb_flat" }),
  t("2026-09-07", "ACT Fibernet", "ACT BROADBAND SEP", 1180, "upi_paytm", "utilities", { split: equal(...HOUSE), ref: "UPI7002", fundedBy: "bank_icici" }),
  t("2026-09-08", "Truffles", "TRUFFLES ICE AND SPICE", 3600, "cc_amex", "restaurants", { split: equal("me", "wife", "karthik", "priya"), notes: "Dinner with Karthik & Priya", ref: "CC0908A" }),
  t("2026-09-08", "Transfer to Varru", "UPI/TO VARRU/FAMILY", 10000, "upi_gpay", "transfers", { kind: "transfer", ref: "UPI8001", fundedBy: "bank_hdfc" }),
  t("2026-09-09", "Apollo Pharmacy", "APOLLO PHARMACY 412", 860, "cc_icici", "health", { split: personal("wife"), payer: "me", notes: "Paid by me, wife's expense" }),
  t("2026-09-10", "Blinkit", "BLINKIT GROFERS INDIA", 1175, "cc_hdfc", "groceries", { split: { mode: "percent", participantIds: HOUSE, values: { me: 6000, wife: 4000 } }, ref: "CC0910A" }),
  t("2026-09-10", "Ola", "ANI TECHNOLOGIES OLA", 275, "cc_hdfc", "transport", { payer: "wife", split: personal("wife") }),
  t("2026-09-11", "Swiggy", "SWIGGY BANGALORE IN", 450, "cc_hdfc", "food_delivery", { split: equal(...HOUSE), ref: "CC0911A", status: "unreviewed" }),
  t("2026-09-12", "IRCTC", "IRCTC E-TICKET BKG", 2340, "cc_amex", "travel", { split: { mode: "custom", participantIds: ["me", "karthik"], values: { me: r(1170), karthik: r(1170) } }, notes: "Train to Mysuru, Karthik's ticket too" }),
  t("2026-09-12", "BookMyShow", "BOOKMYSHOW MUMBAI", 900, "cc_amex", "entertainment", { split: equal(...HOUSE), ref: "CC0912A" }),
  t("2026-09-13", "Amazon", "AMAZON REFUND CR", 1299, "cc_icici", "refunds", { kind: "refund", ref: "CC0913R" }),
  t("2026-09-13", "Reliance Fresh", "RELIANCE FRESH KORAMANGALA", 1980.75, "cc_hdfc", "groceries", { split: equal(...HOUSE), ref: "CC0913A" }),
  t("2026-09-14", "Swiggy", "SWIGGY BANGALORE IN", 1180, "cc_hdfc", "food_delivery", { split: equal(...HOUSE), ref: "CC0914A", status: "unreviewed" }),
  t("2026-09-14", "Blinkit", "BLINKIT GROFERS INDIA", 455.5, "cc_hdfc", "groceries", { split: equal(...HOUSE), status: "unreviewed" }),
  t("2026-09-15", "HDFC Bank", "CC ANNUAL FEE + GST", 590, "cc_hdfc", "fees", { kind: "fee", ref: "CC0915F" }),
  t("2026-09-15", "Uber", "UBER INDIA SYSTEMS", 512, "cc_hdfc", "transport", { split: { mode: "custom", participantIds: ["me", "priya"], values: { me: r(256), priya: r(256) } }, notes: "Shared cab with Priya" }),
  t("2026-09-16", "Indian Oil", "IOCL PETROL PUMP KORAMANGALA", 2000, "cc_sbi", "fuel", { payer: "wife", split: equal(...HOUSE) }),
  t("2026-09-17", "Starbucks", "STARBUCKS COFFEE BLR", 780, "cc_hdfc", "restaurants", { status: "unreviewed" }),
  t("2026-09-18", "Swiggy", "SWIGGY REFUND CR", 180, "cc_hdfc", "refunds", { kind: "refund", split: equal(...HOUSE), ref: "CC0918R" }),
  t("2026-09-19", "Decathlon", "DECATHLON SPORTS INDIA", 3499, "cc_sbi", "shopping", { split: personal("wife"), payer: "wife", status: "unreviewed" }),
  t("2026-09-20", "HDFC Credit Card", "CC BILL PAYMENT AUG", 48210, "bank_hdfc", "transfers", { kind: "cc_payment", ref: "NEFT9910", notes: "Not a purchase" }),
  t("2026-09-21", "BigBasket", "BIGBASKET BANGALORE IN", 3120, "cc_hdfc", "groceries", { split: equal(...HOUSE), ref: "CC0921A" }),
  t("2026-09-22", "Rapido", "RAPIDO BIKE TAXI", 96, "upi_bhim", "transport", { ref: "UPI9922", fundedBy: "bank_hdfc" }),
  t("2026-09-23", "Truffles", "TRUFFLES ICE AND SPICE", 1240, "cc_amex", "restaurants", { split: equal("me", "wife", "karthik"), ref: "CC0923A" }),
  t("2026-09-24", "Apollo Pharmacy", "APOLLO PHARMACY 412", 340, "cc_icici", "health", { ref: "CC0924A" }),
  t("2026-09-25", "Zepto", "ZEPTO MARKETPLACE BLR", 899, "cc_hdfc", "groceries", { split: equal(...HOUSE), ref: "CC0925A" }),
  t("2026-09-26", "Unknown merchant", "POS 4821 MISC PURCHASE", 1450, "cc_hdfc", "uncategorized", { status: "unreviewed" }),
  t("2026-09-27", "Swiggy", "SWIGGY BANGALORE IN", 735, "cc_hdfc", "food_delivery", { ref: "CC0927A" }),
  t("2026-09-28", "Cult.fit", "CULTFIT HEALTH", 2499, "cc_icici", "health", { ref: "CC0928A" }),
  t("2026-09-29", "Amazon", "AMAZON PAY INDIA PVT LTD", 4799, "cc_icici", "shopping", { split: personal("me"), excluded: true, notes: "Gift for office, reimbursed — excluded from reports" }),
  t("2026-09-03", "Sis Safa (Maintenance)", "UPI/SIS SAFA APT MAINT SEP", 3500, "upi_gpay", "rent", { split: equal(...HOUSE), ref: "UPI7003", fundedBy: "bank_hdfc", rec: "maint" }),
  t("2026-09-05", "Car EMI", "ECS/AUTO LOAN EMI 4471", 18500, "bank_hdfc", "emi", { ref: "ECS4471", rec: "car_emi" }),
  t("2026-09-09", "TNEB (Park 63, Parents)", "TNEB ELECTRICITY BILL PARK63", 1240, "upi_cred", "utilities", { ref: "UPI7009", fundedBy: "bank_icici", rec: "eb_parents", notes: "Parents' house, Perungalathur" }),
];

export const initialSettlements: Settlement[] = [
  { id: "s1", date: "2026-09-18", fromId: "karthik", toId: "me", amountPaise: r(1000), note: "Part payment for dinner (UPI)" },
  { id: "s2", date: "2026-09-25", fromId: "wife", toId: "me", amountPaise: r(15000), note: "Towards shared expenses (UPI)" },
];

export const initialReceipts: Receipt[] = [
  { id: "rc1", merchant: "Swiggy", date: "2026-09-14", amountPaise: r(1180), orderId: "SW-48211093", filename: "swiggy-48211093.pdf" },
  { id: "rc2", merchant: "Blinkit", date: "2026-09-14", amountPaise: r(455.5), orderId: "BL-77120", filename: "blinkit-77120.pdf" },
  { id: "rc3", merchant: "Zepto", date: "2026-09-27", amountPaise: r(310), filename: "zepto-sep27.pdf" },
];

/** Simulated import preview rows (no file is actually parsed in the prototype). */
export const mockImportRows = [
  { date: "2026-09-30", merchant: "BigBasket", description: "BIGBASKET BANGALORE IN", amountPaise: r(2210), referenceId: "CC0930A", accountId: "cc_hdfc" },
  { date: "2026-09-21", merchant: "BigBasket", description: "BIGBASKET BANGALORE IN", amountPaise: r(3120), referenceId: "CC0921A", accountId: "cc_hdfc" },
  { date: "2026-09-17", merchant: "Starbucks", description: "STARBUCKS COFFEE BLR", amountPaise: r(780), referenceId: undefined, accountId: "cc_hdfc" },
  { date: "2026-09-30", merchant: "Uber", description: "UBER INDIA SYSTEMS", amountPaise: r(405), referenceId: "CC0930B", accountId: "cc_hdfc" },
  { date: "2026-09-30", merchant: "Indian Oil", description: "IOCL PETROL PUMP", amountPaise: r(1800), referenceId: "CC0930C", accountId: "cc_hdfc" },
];

/** Static prior-month net spend (paise) for the trend chart. MOCK; only Sept is computed from records. */
export const trendHistory: Record<string, number> = {
  "2026-04": r(78400), "2026-05": r(84150), "2026-06": r(91230), "2026-07": r(70610), "2026-08": r(88900),
};

/** "Today" for the prototype so recurring statuses are deterministic. */
export const MOCK_TODAY = "2026-09-24";

const REC_HOUSE = equal(...HOUSE);
export const recurringItems: RecurringItem[] = [
  { id: "rent", name: "Rent", categoryId: "rent", dueDay: 1, expectedPaise: r(35000), payerId: "me", split: REC_HOUSE, place: "Sis Safa, Orapakkam" },
  { id: "maint", name: "Maintenance", categoryId: "rent", dueDay: 3, expectedPaise: r(3500), payerId: "me", split: REC_HOUSE, place: "Sis Safa, Orapakkam" },
  { id: "car_emi", name: "Car EMI", categoryId: "emi", dueDay: 5, expectedPaise: r(18500), payerId: "me", split: personal() },
  { id: "eb_flat", name: "EB (electricity)", categoryId: "utilities", dueDay: 7, expectedPaise: r(1800), payerId: "me", split: REC_HOUSE, place: "Sis Safa, Orapakkam" },
  { id: "eb_parents", name: "EB (electricity)", categoryId: "utilities", dueDay: 9, expectedPaise: r(1250), payerId: "me", split: personal(), place: "Park 63, Perungalathur (parents)" },
  { id: "gas", name: "Gas", categoryId: "utilities", dueDay: 18, expectedPaise: r(1050), payerId: "me", split: REC_HOUSE, place: "Sis Safa, Orapakkam" },
  { id: "life_ins", name: "Life insurance", categoryId: "insurance", dueDay: 28, expectedPaise: r(4200), payerId: "me", split: personal() },
];

/** Starter merchant rules. Used to suggest categories during import review. */
export const merchantRules = [
  { merchant: "Swiggy", categoryId: "food_delivery" },
  { merchant: "Zepto", categoryId: "groceries" },
  { merchant: "Blinkit", categoryId: "groceries" },
  { merchant: "BigBasket", categoryId: "groceries" },
  { merchant: "Uber", categoryId: "transport" },
  { merchant: "Indian Oil", categoryId: "fuel" },
];
