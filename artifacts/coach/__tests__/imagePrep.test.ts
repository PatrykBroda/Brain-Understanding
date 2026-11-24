import { describe, expect, it } from "vitest";
import { declaredImageMime, jpegName, needsImageConversion } from "../src/lib/imagePrep";

const MB = 1024 * 1024;

describe("needsImageConversion", () => {
  it("passes small supported images straight through", () => {
    expect(needsImageConversion({ type: "image/jpeg", name: "a.jpg", size: 2 * MB })).toBe(false);
    expect(needsImageConversion({ type: "image/png", name: "a.png", size: 2 * MB })).toBe(false);
  });
  it("converts HEIC/HEIF and unknown types", () => {
    expect(needsImageConversion({ type: "image/heic", name: "IMG_1.HEIC", size: MB })).toBe(true);
    expect(needsImageConversion({ type: "", name: "IMG_1.heif", size: MB })).toBe(true);
    expect(needsImageConversion({ type: "image/tiff", name: "a.tif", size: MB })).toBe(true);
  });
  it("recovers a supported type from the extension when the browser gives none", () => {
    expect(declaredImageMime("", "photo.JPG")).toBe("image/jpeg");
    expect(declaredImageMime("application/octet-stream", "x.png")).toBe("image/png");
    expect(needsImageConversion({ type: "", name: "photo.jpg", size: MB })).toBe(false);
  });
  it("shrinks big photos but leaves GIFs alone", () => {
    expect(needsImageConversion({ type: "image/jpeg", name: "a.jpg", size: 15 * MB })).toBe(true);
    expect(needsImageConversion({ type: "image/gif", name: "a.gif", size: 15 * MB })).toBe(false);
  });
  it("names converted files .jpg", () => {
    expect(jpegName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
  });
});
