import { describe, expect, it } from "vitest";
import { decodeImageDataUrl } from "./imageUpload";

describe("image upload validation", () => {
  it("decodes an allowed image data URL with its MIME type and extension", () => {
    const image = decodeImageDataUrl("data:image/png;base64,aGVsbG8=");
    expect(image.mimeType).toBe("image/png");
    expect(image.extension).toBe("png");
    expect(image.bytes.toString()).toBe("hello");
  });

  it("rejects unsupported formats and malformed image data URLs", () => {
    expect(() => decodeImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toThrow("JPG, PNG, or WEBP");
    expect(() => decodeImageDataUrl("not-an-image")).toThrow("JPG, PNG, or WEBP");
  });
});
