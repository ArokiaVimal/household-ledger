import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

export const PROJECT = "demo-ledger-test";
export const OWNER = "u-owner";
export const SPOUSE = "u-spouse";
export const OTHER = "u-other"; // member of a different household
export const STRANGER = "u-stranger"; // signed in, member of nothing

export async function setup(): Promise<RulesTestEnvironment> {
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
  return env;
}

/** Firestore's client rejects `undefined`, so drop keys the caller wants absent. */
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const record = (o: Record<string, unknown> = {}) => defined({
  date: "2026-09-05", merchant: "Zepto", originalDescription: "ZEPTO MARKETPLACE BLR", amountPaise: 64200, currency: "INR",
  accountId: "cc_hdfc", categoryId: "groceries", kind: "purchase", payerId: "me", shared: false, split: { mode: "personal", participantIds: ["me"] },
  excluded: false, status: "reviewed", importSource: "HDFC_Sep2026.csv", referenceId: "CC0905A", ...o,
});

export const settlement = (o: Record<string, unknown> = {}) => ({ date: "2026-09-18", fromId: "karthik", toId: "me", amountPaise: 100000, ...o });
