// Makes the push keys for bill reminders and saves them to .env.local on your Mac. Prints only the PUBLIC key (not a secret);
// the private key is never printed. Then copy the three lines from .env.local into Vercel (see docs/DEVELOPMENT_STATUS.md).
//   node scripts/make-vapid.mjs you@example.com
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const webpush = require("web-push");

const email = process.argv[2];
if (!email || !email.includes("@")) { console.error("Usage: node scripts/make-vapid.mjs you@example.com"); process.exit(1); }
const path = fileURLToPath(new URL("../.env.local", import.meta.url));
const have = existsSync(path) ? readFileSync(path, "utf8") : "";
if (/^VAPID_PRIVATE_KEY=/m.test(have)) { console.log("VAPID keys are already in .env.local. Nothing changed."); process.exit(0); }
const k = webpush.generateVAPIDKeys();
appendFileSync(path, `${have.endsWith("\n") || have === "" ? "" : "\n"}VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:${email}\n`);
console.log("Saved VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to .env.local.");
console.log("Public key:", k.publicKey);
