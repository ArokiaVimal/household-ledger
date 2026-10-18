// Validates configuration once and fails with a readable message listing every
// missing or malformed variable. Pure: takes a source object so it is testable.
// The prototype does not call this yet; Firebase slices will call it at startup.
import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

const serverSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().includes("PRIVATE KEY"),
  /** Comma-separated sign-in allowlist until household membership (slice 3) replaces it. */
  ALLOWED_EMAILS: z.string().min(3),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
});

export class EnvError extends Error {}

function parse<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>, label: string): z.infer<T> {
  const res = schema.safeParse(source);
  if (res.success) return res.data;
  // Report names only, never values: they may be secrets.
  const names = [...new Set(res.error.issues.map((i) => String(i.path[0])))];
  throw new EnvError(`Invalid ${label} configuration. Fix these variables in .env.local (see .env.example): ${names.join(", ")}`);
}

export const parseClientEnv = (source: Record<string, string | undefined>) => parse(clientSchema, source, "client");

/** Server-only. Never import from client components. */
export const parseServerEnv = (source: Record<string, string | undefined>) => {
  const env = parse(serverSchema, source, "server");
  // Hosts differ: some keep the surrounding quotes and literal \n sequences from a pasted .env line. Normalise both.
  const key = env.FIREBASE_ADMIN_PRIVATE_KEY.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\\n/g, "\n");
  return { ...env, FIREBASE_ADMIN_PRIVATE_KEY: key };
};
