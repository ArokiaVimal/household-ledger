// Makes the two secrets Gmail capture needs and saves them to .env.local on your Mac. Nothing is printed except what was added.
//   node scripts/make-secrets.mjs
// GMAIL_TOKEN_KEY encrypts the stored Gmail refresh token (do not lose or change it). CRON_SECRET lets Vercel Cron run the daily jobs.
// Then copy the lines into Vercel: grep -E '^(GMAIL_TOKEN_KEY|CRON_SECRET)=' .env.local | pbcopy
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../.env.local", import.meta.url));
const have = existsSync(path) ? readFileSync(path, "utf8") : "";
const added = [];
const lines = [];
const set = (name, value) => { if (!new RegExp(`^${name}=.+`, "m").test(have)) { lines.push(`${name}=${value}`); added.push(name); } };
set("GMAIL_TOKEN_KEY", randomBytes(32).toString("base64"));
set("CRON_SECRET", randomBytes(32).toString("hex"));
if (lines.length) appendFileSync(path, `${have.endsWith("\n") || have === "" ? "" : "\n"}${lines.join("\n")}\n`);
console.log(added.length ? `Saved ${added.join(" and ")} to .env.local.` : "GMAIL_TOKEN_KEY and CRON_SECRET are already in .env.local. Nothing changed.");
