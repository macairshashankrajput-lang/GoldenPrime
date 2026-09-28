import { uploadGoldenPrimeImage } from "./supabaseStorage";

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function decodeImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Upload a JPG, PNG, or WEBP image.");
  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image must be between 1 byte and 5 MB.");
  const extension = ALLOWED_IMAGE_TYPES.get(mimeType);
  if (!extension) throw new Error("Unsupported image format.");
  return { bytes, mimeType, extension };
}

export async function uploadImageDataUrl(input: { dataUrl: string; userId: number; purpose: "building" | "room" | "meter" | "receipt" | "payment_qr" }) {
  const image = decodeImageDataUrl(input.dataUrl);
  return uploadGoldenPrimeImage({ ...image, purpose: input.purpose, userId: input.userId });
}
