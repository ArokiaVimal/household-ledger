// The built-in icon set. Icons are never fetched from anywhere: AI (or the name matcher) can only choose one of these keys,
// so a made-up or hostile value can never reach the screen.
export const ICON_KEYS = [
  "basket", "utensils", "coffee", "pizza", "beer", "cookie", "fuel", "bus", "car", "bike", "train", "plane", "truck", "bag", "store", "package", "shirt", "scissors",
  "zap", "wifi", "droplets", "flame", "phone", "tv", "home", "sofa", "hammer", "wrench", "film", "music", "gamepad", "camera", "book", "graduation", "dumbbell", "baby",
  "heart", "pill", "stethoscope", "shield", "landmark", "repeat", "trend", "banknote", "wallet", "card", "ticket", "receipt", "gift", "paw", "leaf", "briefcase", "sparkles", "tag",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];
export const isIconKey = (v: unknown): v is IconKey => typeof v === "string" && (ICON_KEYS as readonly string[]).includes(v);

/** Name matching: the icon a category gets before anyone (or AI) has chosen one. */
const KEYWORDS: { re: RegExp; key: IconKey }[] = [
  { re: /grocer|supermarket|vegetable/i, key: "basket" }, { re: /food delivery|delivery|swiggy|zomato/i, key: "utensils" }, { re: /restaurant|cafe|dining|coffee|eating/i, key: "coffee" },
  { re: /fuel|petrol|diesel/i, key: "fuel" }, { re: /transport|cab|taxi|metro|auto|commute/i, key: "bus" }, { re: /shop|cloth|fashion|apparel|wear/i, key: "bag" },
  { re: /utilit|electric|water|bill/i, key: "zap" }, { re: /broadband|internet|wifi/i, key: "wifi" }, { re: /rent|house|home|maintenance|household/i, key: "home" },
  { re: /travel|flight|hotel|trip|holiday/i, key: "plane" }, { re: /entertain|movie|stream|subscription|game/i, key: "film" }, { re: /health|medic|pharma|doctor|fitness|gym/i, key: "heart" },
  { re: /education|school|course|tuition|book/i, key: "graduation" }, { re: /insur|premium/i, key: "landmark" }, { re: /emi|loan|credit card|card bill/i, key: "repeat" },
  { re: /invest|sip|mutual|stock/i, key: "trend" }, { re: /salary|income|refund|cashback/i, key: "banknote" }, { re: /gift|donat|charity/i, key: "gift" }, { re: /pet/i, key: "paw" },
  { re: /mobile|phone|recharge/i, key: "phone" }, { re: /personal care|salon|beauty|grooming/i, key: "sparkles" }, { re: /repair|service/i, key: "wrench" }, { re: /fee|tax|charge/i, key: "receipt" },
];
/** The icon the name matcher picks, or null when it has no idea (those are the ones worth asking AI about). */
export const iconByName = (name: string): IconKey | null => KEYWORDS.find((k) => k.re.test(name))?.key ?? null;

