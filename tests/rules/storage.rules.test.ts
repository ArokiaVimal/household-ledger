import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { OTHER, OWNER, SPOUSE, STRANGER, setup } from "./helpers";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `households/h1/members/${OWNER}`), { role: "owner" });
    await setDoc(doc(db, `households/h1/members/${SPOUSE}`), { role: "member" });
    await setDoc(doc(db, `households/h2/members/${OTHER}`), { role: "owner" });
    await uploadBytes(ref(ctx.storage(), "households/h1/files/existing.pdf"), new Uint8Array([1, 2, 3]), { contentType: "application/pdf" });
  });
});

const st = (uid: string) => env.authenticatedContext(uid).storage();
const bytes = (n: number) => new Uint8Array(n).fill(7);
const file = (uid: string, path: string) => ref(st(uid), path);

describe("private files", () => {
  it("members can read and upload; outsiders and anonymous users cannot", async () => {
    await assertSucceeds(getBytes(file(OWNER, "households/h1/files/existing.pdf")));
    await assertSucceeds(getBytes(file(SPOUSE, "households/h1/files/existing.pdf")));
    for (const uid of [OTHER, STRANGER]) {
      await assertFails(getBytes(file(uid, "households/h1/files/existing.pdf")));
      await assertFails(uploadBytes(file(uid, "households/h1/files/x.pdf"), bytes(10), { contentType: "application/pdf" }));
    }
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), "households/h1/files/existing.pdf")));
  });
  it("accepts statement and receipt types only", async () => {
    await assertSucceeds(uploadBytes(file(OWNER, "households/h1/files/a.pdf"), bytes(10), { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(file(OWNER, "households/h1/files/a.csv"), bytes(10), { contentType: "text/csv" }));
    await assertSucceeds(uploadBytes(file(OWNER, "households/h1/files/a.jpg"), bytes(10), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(file(OWNER, "households/h1/files/a.html"), bytes(10), { contentType: "text/html" }));
    await assertFails(uploadBytes(file(OWNER, "households/h1/files/a.svg"), bytes(10), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(file(OWNER, "households/h1/files/a.exe"), bytes(10), { contentType: "application/octet-stream" }));
  });
  it("enforces the 15 MB limit and rejects empty files", async () => {
    await assertSucceeds(uploadBytes(file(OWNER, "households/h1/files/ok.pdf"), bytes(15 * 1024 * 1024), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(file(OWNER, "households/h1/files/big.pdf"), bytes(15 * 1024 * 1024 + 1), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(file(OWNER, "households/h1/files/empty.pdf"), bytes(0), { contentType: "application/pdf" }));
  });
  it("uploads are write-once and only the owner can delete", async () => {
    await assertFails(uploadBytes(file(OWNER, "households/h1/files/existing.pdf"), bytes(10), { contentType: "application/pdf" }));
    await assertFails(deleteObject(file(SPOUSE, "households/h1/files/existing.pdf")));
    await assertSucceeds(deleteObject(file(OWNER, "households/h1/files/existing.pdf")));
  });
  it("paths outside households/{id}/files are closed", async () => {
    await assertFails(uploadBytes(file(OWNER, "public/x.pdf"), bytes(10), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(file(OWNER, "households/h1/other/x.pdf"), bytes(10), { contentType: "application/pdf" }));
  });
});
