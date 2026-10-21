// UPI payment links. "upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<note>" opens the person's UPI app on a phone with the
// payee, amount and note filled in. The person still confirms and enters their PIN in that app; nothing is paid from here.
const UPI_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}@[a-zA-Z][a-zA-Z0-9]{1,31}$/;

export const normalizeUpiId = (s: string) => s.trim().toLowerCase();
export const isValidUpiId = (s: string) => UPI_ID.test(s.trim());

export function upiPayLink(o: { upiId: string; name: string; amountPaise: number; note?: string }): string {
  const q = new URLSearchParams();
  q.set("pa", normalizeUpiId(o.upiId));
  q.set("pn", o.name.trim().slice(0, 40));
  q.set("am", (Math.round(o.amountPaise) / 100).toFixed(2));
  q.set("cu", "INR");
  if (o.note?.trim()) q.set("tn", o.note.trim().slice(0, 50));
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
