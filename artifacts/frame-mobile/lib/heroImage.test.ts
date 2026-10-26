import { describe, expect, it } from "vitest";
import { heroImageSource } from "./heroImage";

describe("heroImageSource", () => {
  const url = "https://api.example/fighter/hero/file?v=1";

  it("waits for the auth token before giving the Image a source", () => {
    expect(heroImageSource(url, null)).toBeNull();
  });

  it("sends the bearer token once it is known", () => {
    expect(heroImageSource(url, "tok")).toEqual({
      uri: url,
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("has no source when the fighter has no hero", () => {
    expect(heroImageSource(null, "tok")).toBeNull();
  });
});
