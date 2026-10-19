import "server-only";
import { randomUUID } from "node:crypto";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { createFirebaseAccountDirectory, createFirestoreContactIndex, createFirestoreLinkStore } from "./firestore";
import type { LinkDeps } from "./service";

/** Production wiring for the linking service: real Firestore, Firebase Auth as the verified-email authority, real clock. */
export function createLinkDeps(): LinkDeps {
  return {
    store: createFirestoreLinkStore(), index: createFirestoreContactIndex(), accounts: createFirebaseAccountDirectory(),
    households: createFirestoreHouseholdStore(), repoFor: (id) => createFirestoreRepository(id), now: () => Date.now(), newId: () => randomUUID(),
  };
}
