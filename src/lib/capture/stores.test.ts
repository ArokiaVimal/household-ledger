import { describe, expect, it } from "vitest";
import { createMemoryGmailStore } from "@/lib/gmail/store";
import { createMemoryCaptureStore } from "./memory-store";

describe("integrations are per person", () => {
  it("capture links belong to one person: listing, switching off and replacing never touch anyone else's", async () => {
    const s = createMemoryCaptureStore();
    const t = (uid: string) => ({ uid, householdId: `h-${uid}`, defaultAccountId: "a", createdAt: "2026-10-19T00:00:00Z" });
    await s.put("hash-1", t("u1"));
    await s.put("hash-2", t("u2"));
    expect((await s.listByUser("u1")).map((x) => x.hash)).toEqual(["hash-1"]);
    for (const m of await s.listByUser("u1")) await s.remove(m.hash);
    expect(await s.get("hash-1")).toBeNull();
    expect((await s.get("hash-2"))!.uid).toBe("u2");
  });
  it("a Gmail connection is stored per person", async () => {
    const s = createMemoryGmailStore();
    const l = (uid: string) => ({ uid, householdId: "h", email: `${uid}@gmail.com`, refreshTokenEnc: "x", defaultAccountId: "a", connectedAt: "2026-10-19T00:00:00Z" });
    await s.put(l("u1")); await s.put(l("u2"));
    await s.remove("u1");
    expect(await s.get("u1")).toBeNull();
    expect((await s.get("u2"))!.email).toBe("u2@gmail.com");
  });
});
