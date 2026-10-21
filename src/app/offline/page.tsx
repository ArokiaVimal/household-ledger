import { LogoMark } from "@/components/logo";

export const metadata = { title: "Offline" };

/** Shown by the service worker when there is no connection. It holds no personal data on purpose. */
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={48} />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted">Your data stays private and isn&apos;t kept on this device. Reconnect to keep going.</p>
      {/* A plain link on purpose: a full reload is what retries the connection. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white">Try again</a>
    </main>
  );
}
