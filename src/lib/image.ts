// Browser-only helpers for sending a picture or PDF to the server.
const MAX_SIDE = 1600;

/** Shrinks an image to a JPEG data URL (long side 1600 px) so it uploads fast and fits the size limit. */
export async function imageToJpegDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** An image becomes a shrunk JPEG; a PDF is sent as it is (3 MB at most). Throws a short message for anything else. */
export async function billFileToDataUrl(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    if (file.size > 3 * 1024 * 1024) throw new Error("That PDF is over 3 MB.");
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("Could not open that file.")); r.readAsDataURL(file); });
  }
  if (!/^image\//.test(file.type)) throw new Error("Use a photo or a PDF.");
  try { return await imageToJpegDataUrl(file); } catch { throw new Error("Could not open that image."); }
}
