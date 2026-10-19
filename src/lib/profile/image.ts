import { MAX_AVATAR_BYTES } from "./profile";

/** Centre-crop to a square and re-encode as a small JPEG, so a stored photo is tiny and always a JPEG. Browser only. */
export async function toSquareJpeg(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  for (const q of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (Math.floor(((url.length - 23) * 3) / 4) <= MAX_AVATAR_BYTES) return url;
  }
  throw new Error("too large");
}
