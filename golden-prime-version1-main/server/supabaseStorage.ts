import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const IMAGE_BUCKET = "golden-prime-images";
const SUPABASE_KEY_PREFIX = "supabase/";

type ImagePurpose = "building" | "room" | "meter" | "receipt" | "payment_qr";

let client: SupabaseClient | null = null;

function getSupabaseStorageClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Supabase Storage is not configured on the server.");

  client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export async function uploadGoldenPrimeImage(input: {
  bytes: Buffer;
  extension: string;
  mimeType: string;
  purpose: ImagePurpose;
  userId: number;
}) {
  const objectKey = `pg/${input.userId}/${input.purpose}/${input.purpose}-${Date.now()}-${crypto.randomUUID()}.${input.extension}`;
  const { error } = await getSupabaseStorageClient().storage
    .from(IMAGE_BUCKET)
    .upload(objectKey, input.bytes, { contentType: input.mimeType, upsert: false });

  if (error) throw new Error(`Supabase image upload failed: ${error.message}`);

  const key = `${SUPABASE_KEY_PREFIX}${objectKey}`;
  return { key, url: `/manus-storage/${key}` };
}

function isMissingStorageObject(error: { message?: string; statusCode?: string | number } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.statusCode === 404 || /not found|does not exist|no such object/.test(message);
}

export async function createGoldenPrimeImageSignedUrl(key: string) {
  if (!key.startsWith(SUPABASE_KEY_PREFIX)) return null;
  const objectKey = key.slice(SUPABASE_KEY_PREFIX.length);
  if (!objectKey) throw new Error("Supabase image key is invalid.");

  const { data, error } = await getSupabaseStorageClient().storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(objectKey, 60);

  if (error && isMissingStorageObject(error)) return null;
  if (error || !data?.signedUrl) throw new Error(`Supabase image access failed: ${error?.message ?? "signed URL was empty"}`);
  return data.signedUrl;
}
