import Link from "next/link";
import { LogoMark } from "@/components/logo";

export const metadata = { title: "Privacy policy" };

const CONTACT = "arokiavimal@gmail.com";
const UPDATED = "October 20, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

/** Public page: no sign-in needed, so it can be linked from Google's consent screen and the sign-in page. */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-10 sm:py-14">
      <header className="space-y-3">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"><LogoMark size={28} />Personal Finance App</Link>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>
        <p className="text-[15px] leading-relaxed">Personal Finance App helps you track your own spending and split costs with people you choose. It is private by design: your money data is yours, it is not sold, and it is not used for advertising.</p>
      </header>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Your account:</b> your name, email address and profile photo from Google sign-in (or the email you sign up with).</li>
          <li><b>Money data you add or import:</b> transactions, payment methods, categories, bills, recurring items, balances, notes, receipts and settlements.</li>
          <li><b>People you add:</b> names, optional nicknames, photos and emails of friends and family you split with. An email is only used to recognize them if they join later.</li>
          <li><b>Imports you choose:</b> statements (PDF, CSV, Excel), pasted text, bills and screenshots. Original imported lines are kept unchanged so you can always see what was imported.</li>
          <li><b>Device settings:</b> small preferences stored on your device, such as the month or group you last picked, and a push notification address if you turn on reminders.</li>
        </ul>
      </Section>

      <Section title="Gmail access (optional)">
        <p>If you connect Gmail, the app asks for <b>read-only</b> access. It searches only for emails from banks, card issuers and UPI apps, reads them to find transactions and card bills, and adds the results to your Transactions as Unverified. It never sends, deletes or changes email, and it ignores everything else in your mailbox. Your connection token is stored encrypted. You can disconnect at any time in Settings, which also revokes access at Google, or at myaccount.google.com/permissions.</p>
        <p>The app&apos;s use and transfer of information received from Google APIs adheres to the <a className="text-accent underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Gmail data is used only to show you your own transactions and bills. It is not sold, not used for advertising, not used to train AI models, and not read by people, except where needed for security or required by law.</p>
      </Section>

      <Section title="Bank texts (optional)">
        <p>If you set up SMS capture, your phone sends each matching bank text to a private link that only you hold. Offers and one-time passwords are ignored. You can switch it off or replace the link at any time in Settings.</p>
      </Section>

      <Section title="AI features (optional)">
        <p>Some features use Anthropic&apos;s Claude, and only when you tap an AI button: naming merchants, suggesting categories, reading statements, notes, bills and screenshots, and monthly tips. What is sent is the text or picture you chose, with long account numbers, emails and phone numbers hidden first (a picture is sent as it is, so hide anything private before choosing it). We do not store your pictures. AI suggestions are never final: they appear as Unverified until you verify them.</p>
      </Section>

      <Section title="How we use your data">
        <p>Only to run the app for you: show your totals and reports, find and flag duplicates, remember your merchant and category choices, split costs with people you choose, remind you about bills, and keep an activity log so you can undo changes. We do not sell your data, share it with advertisers, or build profiles about you.</p>
      </Section>

      <Section title="Who can see it">
        <p>Only you, by default. If you link with a partner or a friend, they see only the expenses you split with them, and payments between you. They never see your bank text, payment methods, balances or other transactions. You can unlink at any time.</p>
        <p>We use these services to run the app: Google Firebase (sign-in and database), Vercel (hosting) and, if you use AI features, Anthropic. They process data on our behalf and under their own security commitments.</p>
      </Section>

      <Section title="Security">
        <p>Data is sent over encrypted connections. Access is checked on the server for every request and again by database rules. Banking passwords, UPI PINs and card numbers are never requested or stored.</p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>Your data stays until you delete it. In Settings → Your data you can download a full backup, restore it, or delete everything in your space permanently. Deleting your data does not delete your sign-in account; email {CONTACT} to have that removed too.</p>
      </Section>

      <Section title="Children">
        <p>The app is not meant for children under 13, and we do not knowingly collect their data.</p>
      </Section>

      <Section title="Changes and contact">
        <p>If this policy changes, the date above changes. Questions or requests: <a className="text-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </Section>
    </main>
  );
}
