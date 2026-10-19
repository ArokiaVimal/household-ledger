// Small round pictures: a coloured icon for a category, and a coloured initial for a person. Decorative (the name is always next to them).
import { Banknote, Bus, Clapperboard, Coffee, Fuel, Gift, GraduationCap, HeartPulse, Home, Landmark, PawPrint, Plane, Receipt, Repeat, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Tag, TrendingUp, Utensils, Wrench, Zap, type LucideIcon } from "lucide-react";

const CATEGORY_ICONS: { re: RegExp; icon: LucideIcon; tone: string }[] = [
  { re: /grocer|supermarket|vegetable/i, icon: ShoppingBasket, tone: "bg-emerald-100 text-emerald-700" },
  { re: /food delivery|delivery|swiggy|zomato/i, icon: Utensils, tone: "bg-orange-100 text-orange-700" },
  { re: /restaurant|cafe|dining|coffee|eating/i, icon: Coffee, tone: "bg-amber-100 text-amber-700" },
  { re: /fuel|petrol|diesel|gas\b/i, icon: Fuel, tone: "bg-slate-200 text-slate-700" },
  { re: /transport|cab|taxi|metro|auto|commute/i, icon: Bus, tone: "bg-sky-100 text-sky-700" },
  { re: /shop|cloth|fashion|apparel/i, icon: ShoppingBag, tone: "bg-pink-100 text-pink-700" },
  { re: /utilit|electric|water|broadband|internet|bill/i, icon: Zap, tone: "bg-yellow-100 text-yellow-700" },
  { re: /rent|house|home|maintenance|household/i, icon: Home, tone: "bg-indigo-100 text-indigo-700" },
  { re: /travel|flight|hotel|trip|holiday/i, icon: Plane, tone: "bg-cyan-100 text-cyan-700" },
  { re: /entertain|movie|stream|subscription|game/i, icon: Clapperboard, tone: "bg-purple-100 text-purple-700" },
  { re: /health|medic|pharma|doctor|fitness|gym/i, icon: HeartPulse, tone: "bg-rose-100 text-rose-700" },
  { re: /education|school|course|tuition|book/i, icon: GraduationCap, tone: "bg-blue-100 text-blue-700" },
  { re: /insur|premium/i, icon: Landmark, tone: "bg-teal-100 text-teal-700" },
  { re: /emi|loan|credit card|card bill/i, icon: Repeat, tone: "bg-red-100 text-red-700" },
  { re: /invest|sip|mutual|stock/i, icon: TrendingUp, tone: "bg-green-100 text-green-700" },
  { re: /salary|income|refund|cashback/i, icon: Banknote, tone: "bg-lime-100 text-lime-700" },
  { re: /gift|donat|charity/i, icon: Gift, tone: "bg-fuchsia-100 text-fuchsia-700" },
  { re: /pet/i, icon: PawPrint, tone: "bg-stone-200 text-stone-700" },
  { re: /mobile|phone|recharge/i, icon: Smartphone, tone: "bg-violet-100 text-violet-700" },
  { re: /personal care|salon|beauty|grooming/i, icon: Sparkles, tone: "bg-pink-100 text-pink-700" },
  { re: /repair|service|maintenance/i, icon: Wrench, tone: "bg-zinc-200 text-zinc-700" },
  { re: /clothes|wear/i, icon: Shirt, tone: "bg-pink-100 text-pink-700" },
  { re: /fee|tax|charge/i, icon: Receipt, tone: "bg-gray-200 text-gray-700" },
];

/** The picture for a category, chosen from its name. Unknown names get a plain tag. */
export function CategoryGlyph({ name, size = 24 }: { name: string; size?: number }) {
  const hit = CATEGORY_ICONS.find((c) => c.re.test(name));
  const Icon = hit?.icon ?? Tag;
  return <span aria-hidden style={{ width: size, height: size }} className={`grid shrink-0 place-items-center rounded-full ${hit?.tone ?? "bg-slate-100 text-slate-600"}`}><Icon size={Math.round(size * 0.55)} /></span>;
}

const PERSON_TONES = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-fuchsia-500", "bg-indigo-500"];
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/** A coloured circle with the person's initial; the colour stays the same for the same person. */
export function PersonGlyph({ name, id, size = 24 }: { name: string; id?: string; size?: number }) {
  return <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }} className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${PERSON_TONES[hash(id ?? name) % PERSON_TONES.length]}`}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}
