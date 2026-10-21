import { describe, expect, it } from "vitest";
import type { Participant } from "@/domain/types";
import { uidOf, withProfilePhotos } from "./photos";

const people: Participant[] = [
  { id: "me", name: "Vimal", userId: "u1" },
  { id: "wife", name: "Varru", userId: "u2", photo: "data:old" },
  { id: "friend", name: "Karthik", userId: null, linkId: "u1__u3" },
  { id: "plain", name: "Priya", userId: null, photo: "data:mine" },
];
const linkUid = { "u1__u3": "u3" };
const photos = { u2: "data:varru-new", u3: "data:karthik" };

describe("withProfilePhotos", () => {
  it("shows a partner's and a linked friend's own photo, replacing the one you set", () => {
    const out = withProfilePhotos(people, "u1", linkUid, photos);
    expect(out.find((p) => p.id === "wife")?.photo).toBe("data:varru-new");
    expect(out.find((p) => p.id === "friend")?.photo).toBe("data:karthik");
  });
  it("leaves friends without an account, and people with no profile photo, as they were", () => {
    const out = withProfilePhotos(people, "u1", linkUid, { u3: "data:karthik" });
    expect(out.find((p) => p.id === "plain")?.photo).toBe("data:mine");
    expect(out.find((p) => p.id === "wife")?.photo).toBe("data:old");
    expect(out.find((p) => p.id === "me")?.photo).toBeUndefined();
  });
  it("never looks up yourself", () => {
    expect(uidOf(people[0], "u1", linkUid)).toBeNull();
    expect(uidOf(people[2], "u1", linkUid)).toBe("u3");
  });
});
