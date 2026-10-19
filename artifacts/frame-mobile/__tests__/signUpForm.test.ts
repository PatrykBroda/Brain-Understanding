import { describe, expect, it } from "vitest";
import { hasSignUpErrors, isPlausibleEmail, validateSignUp } from "../lib/signUpForm";

describe("validateSignUp", () => {
  it("says what is missing when everything is empty", () => {
    const e = validateSignUp({ name: "", email: "", password: "", acceptedLegal: false });
    expect(e.name).toMatch(/Enter your name/);
    expect(e.email).toMatch(/Enter your email/);
    expect(e.password).toMatch(/Choose a password/);
    expect(e.legal).toMatch(/Tick the box/);
  });
  it("sign-up asks for name, email and password and nothing else (plus the consent tick)", () => {
    const e = validateSignUp({ name: " ", email: "a@b.co", password: "password1", acceptedLegal: true });
    expect(Object.keys(e)).toEqual(["name"]);
    expect(validateSignUp({ name: "x".repeat(61), email: "a@b.co", password: "password1", acceptedLegal: true }).name).toMatch(/60/);
  });
  it("flags only the unticked box when the rest is fine (the silently disabled button)", () => {
    const e = validateSignUp({ name: "Pat", email: "a@b.co", password: "password1", acceptedLegal: false });
    expect(Object.keys(e)).toEqual(["legal"]);
  });
  it("rejects a short password and a typo'd email before the consent screen", () => {
    const e = validateSignUp({ name: "Pat", email: "me@gmail", password: "short", acceptedLegal: true });
    expect(e.email).toMatch(/typos/);
    expect(e.password).toMatch(/at least 8/);
  });
  it("passes a good form", () => {
    expect(hasSignUpErrors(validateSignUp({ name: "Pat", email: " me@example.com ", password: "12345678", acceptedLegal: true }))).toBe(false);
  });
});

describe("isPlausibleEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com", " pad@example.com "])("accepts %s", (v) => expect(isPlausibleEmail(v)).toBe(true));
  it.each(["", "plain", "a@b", "a b@c.com", "@x.com", "a@.com"])("rejects %s", (v) => expect(isPlausibleEmail(v)).toBe(false));
});
