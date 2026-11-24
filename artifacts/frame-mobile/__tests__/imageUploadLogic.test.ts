import { describe, expect, it } from "vitest";
import { filenameForImageMime, supportedImageMime } from "../lib/imageUploadLogic";

describe("image upload normalization", () => {
  it("recognizes image formats accepted by the API", () => {
    expect(supportedImageMime("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
    expect(supportedImageMime("image/png")).toBe("image/png");
    expect(supportedImageMime(null, "photo.WEBP")).toBe("image/webp");
  });

  it("marks iPhone HEIC/HEIF images for JPEG conversion", () => {
    expect(supportedImageMime("image/heic", "IMG_0001.HEIC")).toBeNull();
    expect(supportedImageMime("image/heif", "IMG_0002.HEIF")).toBeNull();
    expect(supportedImageMime("application/octet-stream", "photo.jpg")).toBeNull();
  });

  it("uses an extension that matches the uploaded MIME type", () => {
    expect(filenameForImageMime("IMG_0001.HEIC", "image/jpeg")).toBe("IMG_0001.jpg");
    expect(filenameForImageMime("avatar", "image/png")).toBe("avatar.png");
  });
});
