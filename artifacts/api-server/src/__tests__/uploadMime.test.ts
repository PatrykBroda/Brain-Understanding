import { describe, expect, it } from "vitest";
import { cleanMime, resolveUploadMime, sniffMime } from "../lib/uploadMime";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
const ftyp = (brand: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(8)]);

describe("sniffMime", () => {
  it("identifies images and videos by magic bytes", () => {
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(Buffer.from("GIF89a....."))).toBe("image/gif");
    expect(sniffMime(ftyp("isom"))).toBe("video/mp4");
    expect(sniffMime(ftyp("qt  "))).toBe("video/quicktime");
    expect(sniffMime(ftyp("heic"))).toBe("heic");
    expect(sniffMime(Buffer.from("hello world!"))).toBeNull();
  });
});

describe("resolveUploadMime", () => {
  it("accepts a JPEG labelled image/jpg, empty, or octet-stream", () => {
    for (const declared of ["image/jpg", "", "application/octet-stream", "image/*"]) {
      expect(resolveUploadMime("image", declared, "IMG_1.JPG", JPEG)).toEqual({ ok: true, mime: "image/jpeg" });
    }
  });
  it("stores the real type when the declared one is wrong", () => {
    expect(resolveUploadMime("image", "image/jpeg", "a.jpg", PNG)).toEqual({ ok: true, mime: "image/png" });
  });
  it("rejects HEIC bytes even when labelled image/jpeg", () => {
    const r = resolveUploadMime("image", "image/jpeg", "a.jpg", ftyp("heic"));
    expect(r).toMatchObject({ ok: false, reason: "heic" });
  });
  it("still honours an allow-listed declared type for unrecognised bytes", () => {
    expect(resolveUploadMime("image", "image/png", "a.png", Buffer.from("xxxxxxxxxxxx"))).toEqual({ ok: true, mime: "image/png" });
  });
  it("falls back to the extension only when the declared type is generic", () => {
    expect(resolveUploadMime("image", "", "a.png", Buffer.from("xxxxxxxxxxxx"))).toEqual({ ok: true, mime: "image/png" });
    expect(resolveUploadMime("image", "text/plain", "a.png", Buffer.from("xxxxxxxxxxxx")).ok).toBe(false);
  });
  it("does not accept a video as an image or vice versa", () => {
    expect(resolveUploadMime("image", "image/png", "a.mp4", ftyp("isom")).ok).toBe(false);
    expect(resolveUploadMime("video", "video/mov", "a.mov", ftyp("qt  "))).toEqual({ ok: true, mime: "video/quicktime" });
  });
  it("normalises declared types", () => {
    expect(cleanMime("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
  });
});
