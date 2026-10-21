// Small decisions behind the app's self-healing, kept pure so they can be tested. A phone can freeze the page in the background, leave
// a request hanging, or keep an old copy of the app after a new version went live; these decide when to reload instead of waiting.

/** A tap on a link should reach its page. If it has not after this long, load the page the plain way. */
export const STUCK_NAVIGATION_MS = 8_000;
/** Back from the background after this long: the data on screen is old, so refresh. */
export const STALE_AFTER_MS = 60 * 60_000;
/** Back after this long: check whether a newer version of the app is live. */
export const CHECK_VERSION_AFTER_MS = 5 * 60_000;

/** The place a link points to on this site, as `path?query`, or null for anything that should be left alone (other sites, new tabs, downloads, same-page jumps, modified clicks). */
export function internalTarget(href: string | null, origin: string, here: string, opts: { target?: string | null; download?: boolean; modifier?: boolean } = {}): string | null {
  if (!href || opts.modifier || opts.download || (opts.target && opts.target !== "_self")) return null;
  let u: URL;
  try { u = new URL(href, origin + here); } catch { return null; }
  if (u.origin !== origin) return null;
  const to = u.pathname + u.search;
  if (u.hash && to === here.split("#")[0]) return null;
  return to === here ? null : to;
}

/** What to do when the app comes back to the front. */
export function resumeAction(hiddenMs: number, o: { formOpen: boolean; versionDiffers?: boolean }): "none" | "check_version" | "reload" {
  if (o.formOpen) return "none"; // never throw away something being typed
  if (hiddenMs >= STALE_AFTER_MS || (hiddenMs >= CHECK_VERSION_AFTER_MS && o.versionDiffers)) return "reload";
  return hiddenMs >= CHECK_VERSION_AFTER_MS ? "check_version" : "none";
}
