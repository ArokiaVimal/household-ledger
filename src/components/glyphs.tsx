// Small round pictures: a coloured icon for a category, and a coloured initial for a person. Decorative (the name is always next to them).
import { Banknote, Baby, Beer, Bike, BookOpen, Briefcase, Bus, Camera, Car, Clapperboard, Coffee, Cookie, CreditCard, Droplets, Dumbbell, Flame, Fuel, Gamepad2, Gift, GraduationCap, Hammer, HeartPulse, Home, Landmark, Leaf, Music, Package, PawPrint, Pill, Pizza, Plane, Receipt, Repeat, Scissors, ShieldCheck, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag, Ticket, Train, TrendingUp, Truck, Tv, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon } from "lucide-react";
import { iconByName, isIconKey, type IconKey } from "@/domain/icons";

const ICON_MAP: Record<IconKey, { icon: LucideIcon; tone: string }> = {
  basket: { icon: ShoppingBasket, tone: "bg-emerald-100 text-emerald-700" }, utensils: { icon: Utensils, tone: "bg-orange-100 text-orange-700" }, coffee: { icon: Coffee, tone: "bg-amber-100 text-amber-700" },
  pizza: { icon: Pizza, tone: "bg-orange-100 text-orange-700" }, beer: { icon: Beer, tone: "bg-yellow-100 text-yellow-700" }, cookie: { icon: Cookie, tone: "bg-amber-100 text-amber-700" },
  fuel: { icon: Fuel, tone: "bg-slate-200 text-slate-700" }, bus: { icon: Bus, tone: "bg-sky-100 text-sky-700" }, car: { icon: Car, tone: "bg-sky-100 text-sky-700" }, bike: { icon: Bike, tone: "bg-sky-100 text-sky-700" },
  train: { icon: Train, tone: "bg-sky-100 text-sky-700" }, plane: { icon: Plane, tone: "bg-cyan-100 text-cyan-700" }, truck: { icon: Truck, tone: "bg-stone-200 text-stone-700" },
  bag: { icon: ShoppingBag, tone: "bg-pink-100 text-pink-700" }, store: { icon: Store, tone: "bg-pink-100 text-pink-700" }, package: { icon: Package, tone: "bg-amber-100 text-amber-700" },
  shirt: { icon: Shirt, tone: "bg-pink-100 text-pink-700" }, scissors: { icon: Scissors, tone: "bg-fuchsia-100 text-fuchsia-700" },
  zap: { icon: Zap, tone: "bg-yellow-100 text-yellow-700" }, wifi: { icon: Wifi, tone: "bg-blue-100 text-blue-700" }, droplets: { icon: Droplets, tone: "bg-cyan-100 text-cyan-700" },
  flame: { icon: Flame, tone: "bg-red-100 text-red-700" }, phone: { icon: Smartphone, tone: "bg-violet-100 text-violet-700" }, tv: { icon: Tv, tone: "bg-purple-100 text-purple-700" },
  home: { icon: Home, tone: "bg-indigo-100 text-indigo-700" }, sofa: { icon: Sofa, tone: "bg-indigo-100 text-indigo-700" }, hammer: { icon: Hammer, tone: "bg-zinc-200 text-zinc-700" }, wrench: { icon: Wrench, tone: "bg-zinc-200 text-zinc-700" },
  film: { icon: Clapperboard, tone: "bg-purple-100 text-purple-700" }, music: { icon: Music, tone: "bg-purple-100 text-purple-700" }, gamepad: { icon: Gamepad2, tone: "bg-purple-100 text-purple-700" },
  camera: { icon: Camera, tone: "bg-slate-200 text-slate-700" }, book: { icon: BookOpen, tone: "bg-blue-100 text-blue-700" }, graduation: { icon: GraduationCap, tone: "bg-blue-100 text-blue-700" },
  dumbbell: { icon: Dumbbell, tone: "bg-rose-100 text-rose-700" }, baby: { icon: Baby, tone: "bg-pink-100 text-pink-700" }, heart: { icon: HeartPulse, tone: "bg-rose-100 text-rose-700" },
  pill: { icon: Pill, tone: "bg-rose-100 text-rose-700" }, stethoscope: { icon: Stethoscope, tone: "bg-rose-100 text-rose-700" }, shield: { icon: ShieldCheck, tone: "bg-teal-100 text-teal-700" },
  landmark: { icon: Landmark, tone: "bg-teal-100 text-teal-700" }, repeat: { icon: Repeat, tone: "bg-red-100 text-red-700" }, trend: { icon: TrendingUp, tone: "bg-green-100 text-green-700" },
  banknote: { icon: Banknote, tone: "bg-lime-100 text-lime-700" }, wallet: { icon: Wallet, tone: "bg-violet-100 text-violet-700" }, card: { icon: CreditCard, tone: "bg-indigo-100 text-indigo-700" },
  ticket: { icon: Ticket, tone: "bg-fuchsia-100 text-fuchsia-700" }, receipt: { icon: Receipt, tone: "bg-gray-200 text-gray-700" }, gift: { icon: Gift, tone: "bg-fuchsia-100 text-fuchsia-700" },
  paw: { icon: PawPrint, tone: "bg-stone-200 text-stone-700" }, leaf: { icon: Leaf, tone: "bg-green-100 text-green-700" }, briefcase: { icon: Briefcase, tone: "bg-slate-200 text-slate-700" },
  sparkles: { icon: Sparkles, tone: "bg-pink-100 text-pink-700" }, tag: { icon: Tag, tone: "bg-slate-100 text-slate-600" },
};

/** A round coloured icon from the built-in set. */
export function Glyph({ iconKey, size = 24 }: { iconKey: string; size?: number }) {
  const hit = ICON_MAP[isIconKey(iconKey) ? iconKey : "tag"];
  const Icon = hit.icon;
  return <span aria-hidden style={{ width: size, height: size }} className={`grid shrink-0 place-items-center rounded-full ${hit.tone}`}><Icon size={Math.round(size * 0.55)} /></span>;
}

/** The picture for a category: the chosen icon, else one matched from its name, else a plain tag. */
export function CategoryGlyph({ name, icon, size = 24 }: { name: string; icon?: string; size?: number }) {
  return <Glyph iconKey={isIconKey(icon) ? icon : iconByName(name) ?? "tag"} size={size} />;
}

const PERSON_TONES = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-fuchsia-500", "bg-indigo-500"];
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/** A coloured circle with the person's initial; the colour stays the same for the same person. */
export function PersonGlyph({ name, id, size = 24 }: { name: string; id?: string; size?: number }) {
  return <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }} className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${PERSON_TONES[hash(id ?? name) % PERSON_TONES.length]}`}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}

/** A round tinted circle around any lucide icon, for option chips such as Type or Recurring. */
export function Dot({ icon: Icon, tone = "bg-slate-100 text-slate-600", size = 24 }: { icon: LucideIcon; tone?: string; size?: number }) {
  return <span aria-hidden style={{ width: size, height: size }} className={`grid shrink-0 place-items-center rounded-full ${tone}`}><Icon size={Math.round(size * 0.55)} /></span>;
}
