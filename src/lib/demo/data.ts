// The demo: fictional data shown on the REAL screens, so the demo always looks like the latest build. Nothing here touches a server;
// the fake API in ./api.ts answers every call the screens make.
import { ME, MOCK_TODAY, accounts, cardBills, categories, historyRecords, initialReceipts, initialRecords, initialSettlements, merchantRules, participants, paymentGroups, recurringItems, voucherBrands, voucherRecords } from "@/data/mock";
import type { LiveInit } from "@/data/store";
import type { Profile } from "@/lib/profile/profile";

export const DEMO_PROFILE: Profile = { email: "demo@example.com", displayName: "Vimal", nickname: "Vimal", phone: "", defaultView: "personal", avatarDataUrl: null, providerPhotoUrl: null, dismissedRecurring: [] };

export function demoLiveInit(): LiveInit {
  return {
    demo: true, ready: true, aiEnabled: true, meId: ME, today: MOCK_TODAY,
    data: {
      records: [...initialRecords, ...voucherRecords, ...historyRecords], settlements: initialSettlements, receipts: initialReceipts, recurring: recurringItems,
      cardBills, voucherBrands, paymentGroups, splitGroups: [], splitSettlements: [], merchantIcons: {}, merchantLogos: {}, participants, accounts, categories,
      rules: merchantRules.map((r) => ({ merchant: r.merchant, categoryId: r.categoryId })), importBatches: [],
    },
  };
}
