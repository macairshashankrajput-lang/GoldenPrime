import { describe, expect, it } from "vitest";
import { uploadImageDataUrl } from "./imageUpload";

describe("managed image storage integration", () => {
  it.skipIf(!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)("writes a Building profile image through the protected server-side storage path", async () => {
    const uploaded = await uploadImageDataUrl({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      userId: 0,
      purpose: "building",
    });

    expect(uploaded.key).toMatch(/^supabase\/pg\/0\/building\/building-\d+-[a-f0-9-]+\.png$/);
    expect(uploaded.url).toMatch(/^\/manus-storage\/supabase\/pg\/0\/building\/building-\d+-[a-f0-9-]+\.png$/);
  }, 15_000);
});
