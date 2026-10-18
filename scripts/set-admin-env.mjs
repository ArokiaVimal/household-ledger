// Usage: node scripts/set-admin-env.mjs /path/to/service-account.json [env-file]
// Copies the three Firebase Admin values from a downloaded service-account key into
// .env.local without printing them. Run it yourself so the key never passes through a chat.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [keyPath, envPath = ".env.local"] = process.argv.slice(2);
if (!keyPath) {
  console.error("Usage: node scripts/set-admin-env.mjs /path/to/service-account.json [env-file]");
  process.exit(1);
}

let key;
try {
  key = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  console.error("Could not read that file as JSON.");
  process.exit(1);
}
if (key.type !== "service_account" || !key.project_id || !key.client_email || !String(key.private_key).includes("PRIVATE KEY")) {
  console.error("That does not look like a Firebase service-account key.");
  process.exit(1);
}

const values = {
  FIREBASE_ADMIN_PROJECT_ID: key.project_id,
  FIREBASE_ADMIN_CLIENT_EMAIL: key.client_email,
  // One line, quoted, with literal \n sequences, as env.ts expects.
  FIREBASE_ADMIN_PRIVATE_KEY: `"${key.private_key.replace(/\n/g, "\\n")}"`,
};

let lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split("\n") : [];
for (const [name, value] of Object.entries(values)) {
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0) lines[i] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
}
writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
console.log(`Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY for project "${key.project_id}" in ${envPath}.`);
console.log("Now delete the downloaded JSON file.");
