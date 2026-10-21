import { describe, expect, it } from "vitest";
import { isValidUpiId, upiPayLink } from "./upi";

describe("UPI ids and pay links", () => {
  it("accepts real-looking ids and rejects junk", () => {
    for (const ok of ["asha@okhdfcbank", "asha.rao-1@ybl", "9444000000@paytm", " Asha@OKICICI "]) expect(isValidUpiId(ok)).toBe(true);
    for (const bad of ["", "asha", "asha@", "@ybl", "a b@ybl", "asha@@ybl", "asha@yb l", "javascript:alert(1)"]) expect(isValidUpiId(bad)).toBe(false);
  });
  it("builds a link with payee, rupee amount and note", () => {
    const l = upiPayLink({ upiId: "Asha@OKHDFCBANK", name: "Asha Rao", amountPaise: 123456, note: "Goa trip" });
    expect(l).toBe("upi://pay?pa=asha%40okhdfcbank&pn=Asha%20Rao&am=1234.56&cu=INR&tn=Goa%20trip");
  });
  it("keeps paise exact and leaves out an empty note", () => {
    expect(upiPayLink({ upiId: "a@ybl", name: "A", amountPaise: 5 })).toBe("upi://pay?pa=a%40ybl&pn=A&am=0.05&cu=INR");
  });
});
