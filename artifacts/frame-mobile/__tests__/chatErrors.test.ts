import { describe, expect, it } from "vitest";
import { sendErrorMessage, streamErrorMessage, uploadErrorMessage } from "../lib/chatErrors";

const apiError = (status: number, message = "x") => Object.assign(new Error(message), { status });

describe("streamErrorMessage", () => {
  it("explains a rejected image instead of 'Something broke'", () => {
    expect(streamErrorMessage("IMAGE_REJECTED", true)).toMatch(/couldn't read that image/);
  });
  it("falls back by whether a file was attached when the code is unknown (older server)", () => {
    expect(streamErrorMessage(undefined, true)).toMatch(/attachment/);
    expect(streamErrorMessage(undefined, false)).toBe("FRAME couldn't reply to that. Try again.");
  });
});

describe("sendErrorMessage", () => {
  it("prefers the watchdog timeout", () => {
    expect(sendErrorMessage(new Error("Aborted"), { timedOut: true })).toMatch(/hung/);
  });
  it("maps HTTP statuses", () => {
    expect(sendErrorMessage(apiError(401), { timedOut: false })).toMatch(/session expired/);
    expect(sendErrorMessage(apiError(403, "attachment not in conversation"), { timedOut: false })).toMatch(/attach it again/);
    expect(sendErrorMessage(apiError(500), { timedOut: false })).toMatch(/server hit a problem/);
  });
  it("treats non-HTTP failures as a dropped connection", () => {
    expect(sendErrorMessage(new TypeError("Network request failed"), { timedOut: false })).toMatch(/Connection dropped/);
  });
});

describe("uploadErrorMessage", () => {
  it("maps upload failures to actionable copy", () => {
    expect(uploadErrorMessage(apiError(413))).toMatch(/max 12MB/);
    expect(uploadErrorMessage(apiError(415))).toMatch(/isn't supported/);
    expect(uploadErrorMessage(apiError(404))).toMatch(/reset/);
    expect(uploadErrorMessage(new TypeError("Network request failed"))).toMatch(/connection/);
  });
  it("never shows the raw server text", () => {
    expect(uploadErrorMessage(apiError(413, "file too large (max 12582912 bytes)"))).not.toContain("12582912");
  });
});

describe("send reliability helpers", () => {
  it("client message ids are short, safe and distinct", async () => {
    const { newClientMessageId } = await import("../lib/chatErrors");
    const a = newClientMessageId();
    const b = newClientMessageId();
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("only a reply tagged with the send's id counts as complete", async () => {
    const { hasCompleteReply } = await import("../lib/chatErrors");
    const thread = [
      { role: "user", clientMessageId: "m_1" },
      { role: "assistant", clientMessageId: null }, // partial left by a dropped stream
    ];
    expect(hasCompleteReply(thread, "m_1")).toBe(false);
    expect(hasCompleteReply([...thread, { role: "assistant", clientMessageId: "m_1" }], "m_1")).toBe(true);
    expect(hasCompleteReply([{ role: "user", clientMessageId: "m_2" }], "m_2")).toBe(false);
  });
});
