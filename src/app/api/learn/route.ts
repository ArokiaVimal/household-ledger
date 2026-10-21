import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { bestIcons, learnFromVerified } from "@/domain/learn";
import { participantIdFor } from "@/lib/data/load";
import { logoFor } from "@/lib/logos";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getCouple } from "@/lib/households/couple";
import { getProfile } from "@/lib/profile/store";
import { authorize } from "../import/shared";

export const maxDuration = 60;

/**
 * "Learn from my verified transactions": saves what your own verified history says to merchant memory (never replacing a choice you
 * made), then fills icons and brand logos for anything that has none. Uses only your data, no AI. Returns a plain-language list of
 * what was learned. Needs a signed-in member; the person pressing the button is the one asking for the writes.
 */
export async function POST() {
  const who = await authorize();
  if (!who.ok) return who.res;
  try {
    const repo = createFirestoreRepository(who.membership.household.id);
    const [records, memory, categories, accounts, people, brands] = await Promise.all([repo.records.list(), repo.merchantMemory.list(), repo.categories.list(), repo.accounts.list(), repo.participants.list(), repo.voucherBrands.list()]);
    const meId = participantIdFor(who.session.uid);
    // A linked partner lives in the shared space, so name them as you do elsewhere: your nickname for them, else their name.
    const couple = await getCouple(createFirestoreHouseholdStore(), who.session.uid).catch(() => null);
    const nick = (await getProfile(who.session).catch(() => null))?.partnerNickname?.trim();
    const partnerLabel = couple?.partner ? { id: participantIdFor(couple.partner.uid), name: nick || couple.partner.displayName } : null;
    const label = (id: string) => { const p = people.find((x) => x.id === id); return p ? p.nickname?.trim() || p.name : partnerLabel && id === partnerLabel.id ? partnerLabel.name : "Someone you split with"; };
    const learned = learnFromVerified(records, memory, {
      meId, nameOf: label,
      categoryName: (id) => categories.find((c) => c.id === id)?.name ?? id,
      accountName: (id) => accounts.find((a) => a.id === id)?.name ?? id,
      voucherName: (id) => brands.find((b) => b.id === id)?.name ?? id,
    });
    for (const m of learned.memory) await repo.merchantMemory.put(m);
    // Icons are filled on top of what memory now holds, so a merchant learned just now gets one too.
    const merged = [...new Map([...memory, ...learned.memory].map((m) => [m.id, m])).values()];
    const plan = bestIcons({ categories, accounts, memory: merged, logoFor });
    for (const x of plan.categories) { const c = categories.find((y) => y.id === x.id); if (c) await repo.categories.put({ ...c, icon: x.icon }); }
    for (const x of plan.accounts) { const a = accounts.find((y) => y.id === x.id); if (a) await repo.accounts.put({ ...a, icon: x.icon }); }
    for (const x of plan.merchants) await repo.merchantMemory.put({ ...x.memory, ...(x.logo ? { logo: x.logo } : { icon: x.icon }) });
    const iconCount = plan.categories.length + plan.accounts.length + plan.merchants.length;
    await repo.audit.append({ actorId: who.session.uid, action: "edit", entity: "household", entityId: "learn", summary: `Learned from ${learned.counts.verified} verified transactions: ${learned.counts.added} new and ${learned.counts.upgraded} upgraded merchants, ${iconCount} icons set` });
    return NextResponse.json({ ok: true, counts: { ...learned.counts, icons: iconCount, categories: plan.categories.length, accounts: plan.accounts.length, merchantIcons: plan.merchants.length }, lessons: learned.lessons });
  } catch (e) {
    console.error("learn failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not learn from your transactions. Nothing was lost; try again." }, { status: 500 });
  }
}
