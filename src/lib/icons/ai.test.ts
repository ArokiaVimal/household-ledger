import { describe, expect, it } from "vitest";
import { iconByName, isIconKey } from "@/domain/icons";
import { clean, pickIcons, validateIcons, type IconWant } from "./ai";

const wants: IconWant[] = [{ kind: "category", ref: "pets", name: "Pet care" }, { kind: "account", ref: "wl_x", name: "Myntra Wallet" }, { kind: "merchant", ref: "Zepto", name: "Zepto" }];

describe("icon choices", () => {
  it("only accepts keys from the built-in set, for real lines, once each", () => {
    const out = validateIcons({ items: [{ n: 1, icon: "paw" }, { n: 1, icon: "tag" }, { n: 2, icon: "http://evil/x.png" }, { n: 9, icon: "tag" }, { n: 3, icon: "basket" }] }, wants);
    expect(out).toEqual([{ ...wants[0], icon: "paw" }, { ...wants[2], icon: "basket" }]);
    expect(validateIcons("junk", wants)).toEqual([]);
  });
  it("takes a logo only for a merchant, and only one of our own logo files", () => {
    const w: IconWant[] = [{ kind: "merchant", ref: "Swiggy Instamart", name: "Swiggy Instamart" }, { kind: "merchant", ref: "Corner Shop", name: "Corner Shop" }, { kind: "account", ref: "wl_x", name: "Swiggy Money" }];
    const out = validateIcons({ items: [{ n: 1, icon: "basket", logo: "swiggy" }, { n: 2, icon: "store", logo: "http://evil/x.png" }, { n: 3, icon: "wallet", logo: "swiggy" }] }, w);
    expect(out).toEqual([{ ...w[0], icon: "basket", logo: "swiggy" }, { ...w[1], icon: "store" }, { ...w[2], icon: "wallet" }]);
  });
  it("sends only names to Claude and returns the validated picks", async () => {
    let sent = "";
    const fetchImpl = (async (_u: unknown, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify({ content: [{ type: "tool_use", input: { items: [{ n: 1, icon: "paw" }] } }], usage: { input_tokens: 5, output_tokens: 3 } }), { status: 200 }); }) as unknown as typeof fetch;
    const { picks, usage } = await pickIcons({ apiKey: "k", fetchImpl }, wants);
    expect(picks).toEqual([{ ...wants[0], icon: "paw" }]);
    expect(usage.error).toBeUndefined();
    expect(sent).toContain("Pet care");
    expect(sent).not.toMatch(/amount|₹/i);
  });
  it("reports a failure without picks, and cleans names", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const r = await pickIcons({ apiKey: "k", fetchImpl }, wants);
    expect(r.picks).toEqual([]);
    expect(r.usage.error).toBeTruthy();
    expect(clean("A|B\nC")).toBe("A B C");
  });
  it("name matching knows common categories and leaves odd ones for AI", () => {
    expect(iconByName("Groceries")).toBe("basket");
    expect(iconByName("Zzz thing")).toBeNull();
    expect(isIconKey("paw")).toBe(true);
    expect(isIconKey("nope")).toBe(false);
  });
});
