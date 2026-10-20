"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LayoutGrid, Lock, Pencil, Plug, ShieldCheck, Sparkles, Tags, UserRound, Users, Wallet, Bell, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { AiFeatureCard, Badge, Button, Card, CardTitle, ChipGroup, CompactChips, ConfirmDialog, Dialog, Field, Input, PageHeader } from "@/components/ui";
import { THEME_STYLE, themeFor } from "@/components/card-mockup";
import { useStore } from "@/data/store";
import { SUGGESTED_ACCOUNTS } from "@/domain/defaults";
import { checkFriendDelete, friendUsage } from "@/domain/friends";
import { parseRupees } from "@/domain/money";
import { CARD_THEMES, type Account, type CardTheme } from "@/domain/types";
import { MerchantAvatar } from "@/components/txn-row";
import { SortableList } from "@/components/sortable";
import { orderByUse, planUpiSetup } from "@/domain/accounts";
import { CaptureCard } from "./capture-card";
import { GmailCard } from "./gmail-card";
import { PartnerCard } from "./partner-card";
import { IconsCard } from "./icons-card";
import { SyncCard } from "./sync-card";
import { DataCard } from "./data-card";
import { GroupsCard } from "./groups-card";
import { ContactsCard } from "./contacts-card";
import { CategoriesView } from "../categories/categories-view";
import { ProfileForm } from "../profile/profile-form";
import { RemindersCard } from "./reminders-card";

const typeLabel: Record<Account["type"], string> = { credit_card: "Credit card", bank: "Bank account", upi: "UPI app", cash: "Cash", wallet: "Wallet" };

const MENU: { id: string; group: string; label: string; hint: string; icon: LucideIcon; liveOnly?: boolean }[] = [
  { id: "methods", group: "Set up", label: "Payment methods", hint: "Cards, UPI apps, bank accounts", icon: Wallet },
  { id: "groups", group: "Set up", label: "Payment groups", hint: "View spending by person", icon: LayoutGrid },
  { id: "categories", group: "Set up", label: "Categories and rules", hint: "Rename, add, auto-sort", icon: Tags },
  { id: "sharing", group: "Set up", label: "Friends & Family", hint: "People you split with", icon: Users },
  { id: "icons", group: "Set up", label: "Icons", hint: "Pictures for categories and merchants", icon: Sparkles },
  { id: "ai", group: "Smart tools", label: "Smart import", hint: "AI and import help", icon: Sparkles, liveOnly: true },
  { id: "integrations", group: "Smart tools", label: "Integrations", hint: "SMS and Gmail capture", icon: Plug, liveOnly: true },
  { id: "reminders", group: "Smart tools", label: "Reminders", hint: "Card bill alerts", icon: Bell, liveOnly: true },
  { id: "profile", group: "Account", label: "Profile", hint: "Name, photo, greeting", icon: UserRound },
  { id: "data", group: "Account", label: "Your data", hint: "Back up, restore, delete", icon: ShieldCheck },
];
const GROUPS = ["Set up", "Smart tools", "Account"];
const OpenSection = createContext<string | null>(null);

function Section({ id, icon, title, tagline, children }: { id: string; icon: ReactNode; title: string; tagline: string; children: ReactNode }) {
  if (useContext(OpenSection) !== id) return null;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="min-w-0 scroll-mt-4 space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">{icon}</span>
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-3xl text-sm text-muted">{tagline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { today, live, aiEnabled, records, staged, settlements, participants, accounts, recurringItems, meId, addAccount, updateAccount, deleteAccount, reorderAccounts, setupUpiApps, addSuggestedAccounts, deleteParticipant } = useStore();
  // One dialog adds and edits payment methods. `parent` is set when adding a sub payment method.
  const [open, setOpenRaw] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setOpenRaw(new URLSearchParams(window.location.search).get("s"));
    read(); window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const go = (id: string | null) => { window.history.pushState(null, "", id ? `?s=${id}` : window.location.pathname); setOpenRaw(id); window.scrollTo({ top: 0 }); };
  const current = MENU.find((m) => m.id === open && (live || !m.liveOnly));
  const [dlg, setDlg] = useState<{ acc?: Account; parent?: string } | null>(null);
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState<Account["type"]>("credit_card");
  const [fParent, setFParent] = useState("");
  const [fTheme, setFTheme] = useState<CardTheme | "">("");
  const [fError, setFError] = useState<string | null>(null);
  const [fBalance, setFBalance] = useState("");
  const [fAsOf, setFAsOf] = useState("");
  const [deletingAcc, setDeletingAcc] = useState<Account | null>(null);
  const upiPlan = planUpiSetup(accounts);
  const [upiMsg, setUpiMsg] = useState<string | null>(null);
  const roots = accounts.filter((a) => !a.parentId || !accounts.some((x) => x.id === a.parentId));
  const childrenOf = (id: string) => accounts.filter((c) => c.parentId === id);
  /** Every id in the order wanted: primaries in `rootIds` order, each followed by its sub methods (reordered where `subs` says so). */
  const fullOrder = (rootIds: string[], subs: Record<string, string[]> = {}) => rootIds.flatMap((r) => [r, ...(subs[r] ?? childrenOf(r).map((c) => c.id))]);
  const openDialog = (d: { acc?: Account; parent?: string }) => {
    setDlg(d); setFError(null);
    setFName(d.acc?.name ?? ""); setFType(d.acc?.type ?? (d.parent ? "wallet" : "credit_card"));
    setFParent(d.acc?.parentId ?? d.parent ?? ""); setFTheme(d.acc?.theme ?? "");
    setFBalance(d.acc?.balance ? (d.acc.balance.amountPaise / 100).toFixed(2) : ""); setFAsOf(d.acc?.balance?.asOf ?? today);
  };
  const subTypes: Account["type"][] = ["wallet", "upi", "cash"];
  const isSub = !!fParent;
  const canBeSub = !dlg?.acc || childrenOf(dlg.acc.id).length === 0;
  const parentOptions = roots.filter((p) => (p.type === "credit_card" || p.type === "bank") && p.id !== dlg?.acc?.id);
  const balancePaise = fBalance.trim() === "" ? null : parseRupees(fBalance);
  const saveDialog = () => {
    if (fBalance.trim() !== "" && (balancePaise === null || !/^\d{4}-\d{2}-\d{2}$/.test(fAsOf))) return setFError("Enter the balance as a number and pick the date it was read.");
    const type = isSub && fType !== "wallet" && fType !== "upi" && fType !== "cash" ? "wallet" : fType;
    const err = dlg?.acc
      ? updateAccount(dlg.acc.id, { name: fName, type, parentId: fParent || null, theme: type === "credit_card" && !isSub && fTheme ? fTheme : null, ...(type === "bank" || type === "cash" ? { balance: balancePaise === null ? null : { amountPaise: balancePaise, asOf: fAsOf } } : {}) })
      : addAccount(fName, type, fParent || undefined, type === "credit_card" && !isSub && fTheme ? fTheme : undefined);
    if (err) setFError(err); else setDlg(null);
  };
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removingPerson = participants.find((p) => p.id === removing);
  const removeCheck = removing ? checkFriendDelete(removingPerson, meId, friendUsage(removing, { records: [...records, ...staged], settlements, recurring: recurringItems })) : null;
  const missingSuggested = SUGGESTED_ACCOUNTS.filter((s) => !accounts.some((a) => a.id === s.id)).length;


  const usedBy = (id: string) => [...records, ...staged].filter((r) => r.accountId === id).length;

  return (
    <>
      {current ? (
        <button type="button" onClick={() => go(null)} className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-full pr-3 text-sm font-medium text-accent hover:underline"><ChevronLeft size={16} aria-hidden />Settings</button>
      ) : (
        <>
          <PageHeader title="Settings" actions={!live ? <Badge tone="warn">Prototype</Badge> : undefined} />
          <nav aria-label="Settings menu" className="space-y-5">
            {GROUPS.map((g) => {
              const items = MENU.filter((m) => m.group === g && (live || !m.liveOnly));
              return items.length === 0 ? null : (
                <section key={g} aria-label={g}>
                  <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted/80">{g}</h2>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {items.map(({ id, label, hint, icon: I }) => (
                      <button key={id} type="button" onClick={() => go(id)} className="group flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] bg-surface p-3 text-left transition-shadow hover:shadow-md">
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><I size={18} /></span>
                        <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span><span className="block truncate text-sm text-muted">{hint}</span></span>
                        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </nav>
        </>
      )}

      <OpenSection.Provider value={current?.id ?? null}>
      <div className="min-w-0 space-y-10">
        <Section id="methods" icon={<Wallet size={20} aria-hidden />} title="Payment methods" tagline="Cards, UPI apps and bank accounts.">
          <Card className="space-y-3">
            <CardTitle tip="Drag to reorder. A sub method sits inside a main one, like Amazon Pay under your Amex." action={<span className="text-xs text-muted">{accounts.length} added</span>}>Your payment methods</CardTitle>
            <SortableList className="space-y-4 text-sm" ids={roots.map((r) => r.id)} label="payment method" onReorder={(ids) => reorderAccounts(fullOrder(ids))}>
              {(rootId, handle) => {
                const a = accounts.find((x) => x.id === rootId)!;
                const subs = childrenOf(a.id);
                return (
                  <div className={`space-y-2 ${a.archived ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-2">
                      {handle}
                      <MerchantAvatar name={a.name} size={40} />
                      <div className="min-w-0 flex-1"><div className="truncate font-medium">{a.name}</div><div className="text-xs text-muted">{typeLabel[a.type]} · {usedBy(a.id) === 0 ? "No transactions yet" : `${usedBy(a.id)} transaction${usedBy(a.id) === 1 ? "" : "s"}`}{a.archived ? " · Hidden" : ""}</div></div>
                      <button type="button" aria-label={`Edit ${a.name}`} title="Edit" onClick={() => openDialog({ acc: a })} className="grid size-11 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={16} aria-hidden /></button>
                    </div>
                    {(subs.length > 0 || a.type === "credit_card" || a.type === "bank") && (
                      <div className="ml-12 border-l-2 border-accent/20 pl-3">
                        <SortableList className="space-y-1" ids={subs.map((c) => c.id)} label="sub payment method" onReorder={(ids) => reorderAccounts(fullOrder(roots.map((r) => r.id), { [a.id]: ids }))}>
                          {(cid, h) => {
                            const c = accounts.find((x) => x.id === cid)!;
                            return (
                              <div className={`flex items-center gap-2 py-1 ${c.archived ? "opacity-60" : ""}`}>
                                {h}
                                <MerchantAvatar name={c.name} size={30} />
                                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.name}</span><span className="block text-xs text-muted">{typeLabel[c.type]} · {usedBy(c.id)} transaction{usedBy(c.id) === 1 ? "" : "s"}{c.archived ? " · Hidden" : ""}</span></span>
                                <button type="button" aria-label={`Edit ${c.name}`} title="Edit" onClick={() => openDialog({ acc: c })} className="grid size-11 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={16} aria-hidden /></button>
                              </div>
                            );
                          }}
                        </SortableList>
                        {(a.type === "credit_card" || a.type === "bank") && !a.archived && <button type="button" onClick={() => openDialog({ parent: a.id })} className="min-h-9 rounded-full px-1 text-xs text-muted hover:text-accent hover:underline" aria-label={`Add a sub method to ${a.name}`}>+ Add sub method</button>}
                      </div>
                    )}
                  </div>
                );
              }}
            </SortableList>
            {upiMsg && <p role="status" className="text-sm text-good">{upiMsg}</p>}
            {accounts.length === 0 && <p className="py-3 text-sm text-muted">Nothing here yet. Add your first card, UPI app or bank account to start tracking.</p>}
            <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => openDialog({})}>+ Add primary payment method</Button>{accounts.length > 1 && <Button onClick={() => reorderAccounts(orderByUse(accounts, usedBy))}>Sort by most used</Button>}{upiPlan.add.length + upiPlan.hide.length > 0 && <Button onClick={() => setUpiMsg(`Added ${setupUpiApps()} UPI apps under your banks.`)}>Put UPI apps under each bank</Button>}{missingSuggested > 0 && <Button onClick={addSuggestedAccounts}>Add my usual cards, UPI apps and banks ({missingSuggested})</Button>}</div>
          </Card>
        </Section>

        <Section id="groups" icon={<LayoutGrid size={20} aria-hidden />} title="Payment groups" tagline="View spending by person or group.">
          <GroupsCard />
        </Section>

        <Section id="sharing" icon={<Users size={20} aria-hidden />} title="Friends & Family" tagline="People you split with.">
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
            <PartnerCard />
            <ContactsCard onRemove={(id) => { setRemoving(id); setRemoveError(null); }} />
          </div>
        </Section>

        {live && (
          <Section id="ai" icon={<Sparkles size={20} aria-hidden />} title="Smart import" tagline="Import and sort faster. You approve everything.">
            <AiFeatureCard enabled={aiEnabled} title="AI assistant">
              <p>{aiEnabled
                ? "AI is on. Claude names merchants, picks categories and reads statements and notes. It learns from what you approve."
                : "AI is off. Everything else still works. Turn it on to read statements and notes with Claude."}</p>
              <p className="text-xs">{aiEnabled
                ? "Claude sees only text you send, after you click an AI button. Account numbers, emails and phone numbers are hidden first."
                : "To turn it on, add an Anthropic API key to the server. Until then, nothing is sent to AI."}</p>
              <Link href="/import" className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium hover:bg-background">Go to Import</Link>
            </AiFeatureCard>
          </Section>
        )}

        {live && (
          <Section id="integrations" icon={<Plug size={20} aria-hidden />} title="Integrations" tagline="Connect accounts. Everything waits for your review.">
            <p className="-mt-2 flex items-start gap-2 rounded-xl bg-accent/5 px-4 py-3 text-sm"><Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" /><span>Connections are private. Not even your partner can see them.</span></p>
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2"><CaptureCard /><GmailCard /></div>
          </Section>
        )}

        {live && (
          <Section id="reminders" icon={<Bell size={20} aria-hidden />} title="Reminders" tagline="Get a nudge when a card bill is due.">
            <RemindersCard />
          </Section>
        )}

        <Section id="categories" icon={<Tags size={20} aria-hidden />} title="Categories and rules" tagline="Rename, add and auto-sort.">
          <CategoriesView embedded />
        </Section>

        <Section id="icons" icon={<Sparkles size={20} aria-hidden />} title="Icons" tagline="Pictures for categories and merchants.">
          <IconsCard live={live} aiEnabled={aiEnabled} />
        </Section>

        <Section id="profile" icon={<UserRound size={20} aria-hidden />} title="Profile" tagline="Your name, photo and greeting.">
          <ProfileForm embedded />
        </Section>

        <Section id="data" icon={<ShieldCheck size={20} aria-hidden />} title="Your data" tagline="Back up, restore or delete.">
          <SyncCard />
          <DataCard />
        </Section>
      </div>
      </OpenSection.Provider>

      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.acc ? `Edit ${dlg.acc.name}` : isSub ? "Add a sub payment method" : "Add a primary payment method"}>
        {dlg && (
          <div className="space-y-3 pb-1 text-sm">
            <Field label="Name" error={fError}><Input value={fName} onChange={(e) => { setFName(e.target.value); setFError(null); }} placeholder={isSub ? "e.g. Amazon Pay" : "e.g. Axis Magnus Credit Card"} maxLength={60} /></Field>
            {isSub
              ? <ChipGroup label="Type" options={subTypes.map((t) => ({ id: t, label: typeLabel[t] }))} value={subTypes.includes(fType) ? fType : "wallet"} onChange={setFType} />
              : <ChipGroup label="Type" options={(Object.keys(typeLabel) as Account["type"][]).map((t) => ({ id: t, label: typeLabel[t] }))} value={fType} onChange={setFType} />}
            {(canBeSub && parentOptions.length > 0) && (
              <div className="space-y-1.5"><div className="text-xs font-medium text-muted">Sits inside</div><CompactChips label="Sits inside" options={[{ id: "", label: "Nothing (primary)" }, ...parentOptions.map((p) => ({ id: p.id, label: p.name }))]} selected={[fParent]} onPick={(id) => { setFParent(id); setFError(null); }} /><p className="text-xs text-muted">Pick a card or bank to make this a sub payment method, for example Amazon Pay inside your Amex.</p></div>
            )}
            {dlg.acc && !isSub && (fType === "bank" || fType === "cash") && (
              <div className="space-y-2 rounded-2xl bg-background p-3">
                <div className="text-xs font-medium text-muted">Recorded balance (optional)</div>
                <div className="grid grid-cols-2 gap-2"><Field label="Balance (₹)"><Input inputMode="decimal" value={fBalance} onChange={(e) => { setFBalance(e.target.value); setFError(null); }} placeholder="e.g. 48,250.00" /></Field><Field label="As of"><Input type="date" value={fAsOf} onChange={(e) => setFAsOf(e.target.value)} /></Field></div>
                <p className="text-xs text-muted">From your bank app or statement. Timeline forecasts from this. Optional.</p>
              </div>
            )}
            {!isSub && fType === "credit_card" && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted">Card color</div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Card color">
                  {CARD_THEMES.map((t) => <button key={t} type="button" aria-label={THEME_STYLE[t].label} aria-pressed={(fTheme || themeFor(fName, undefined)) === t} onClick={() => setFTheme(t)} className={`size-9 rounded-full border-2 ${(fTheme || themeFor(fName, undefined)) === t ? "border-accent" : "border-transparent"}`} style={{ background: THEME_STYLE[t].bg }} />)}
                </div>
              </div>
            )}
            {fError && !fName.trim() ? null : fError && <p role="alert" className="text-danger">{fError}</p>}
            {dlg.acc && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button onClick={() => { const err = updateAccount(dlg.acc!.id, { archived: !dlg.acc!.archived }); if (err) setFError(err); else setDlg(null); }}>{dlg.acc.archived ? "Show again" : "Hide from lists"}</Button>
                <Button variant="danger" onClick={() => setDeletingAcc(dlg.acc!)}>Delete…</Button>
                <p className="w-full text-xs text-muted">Hiding keeps its transactions. Delete only works when it&apos;s unused.</p>
              </div>
            )}
            <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" disabled={!fName.trim()} onClick={saveDialog}>{dlg.acc ? "Save" : "Add"}</Button></div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!deletingAcc} onClose={() => setDeletingAcc(null)} title={`Delete ${deletingAcc?.name ?? "payment method"}?`} onConfirm={() => { if (!deletingAcc) return; const err = deleteAccount(deletingAcc.id); if (err) setFError(err); else setDlg(null); }}>
        <p>{deletingAcc?.name} will be removed. This only works when no transaction, bill or import uses it; otherwise hide it instead.</p>
      </ConfirmDialog>
      <ConfirmDialog open={!!removing && removeCheck?.ok === true} onClose={() => setRemoving(null)} title={`Remove ${removingPerson?.name ?? "this friend"}?`} confirmLabel="Remove friend" onConfirm={() => { if (removing) setRemoveError(deleteParticipant(removing)); }}>
        <p>{removingPerson?.name} is not in any transaction, split, settlement or recurring item, so nothing changes for anyone. They can be added again later.</p>
      </ConfirmDialog>
      <Dialog open={!!removing && removeCheck?.ok === false} onClose={() => setRemoving(null)} title={`Can't remove ${removingPerson?.name ?? "this friend"}`}>
        <p className="text-sm" role="alert">{removeCheck && !removeCheck.ok ? removeCheck.reason : ""}</p>
        <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end border-t border-border bg-surface px-4 py-3"><Button onClick={() => setRemoving(null)}>Close</Button></div>
      </Dialog>
      {removeError && <p role="alert" className="mt-3 text-sm text-danger">{removeError}</p>}
    </>
  );
}
