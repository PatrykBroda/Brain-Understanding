// Image source for the authenticated hero photo (GET /fighter/hero/file).
//
// React Native's Image sends no auth header of its own, and the token resolves
// asynchronously. On a cold start the fighter (and so `hasHero`) is known from
// the on-disk cache before the token is, so rendering the Image straight away
// fires a header-less request that 401s. Once the token lands only the headers
// change, not the uri, and the native image view does not reload for that, so
// the photo stayed blank until it was picked again. Hold the Image back until
// there is a token to send.
export type HeroImageSource = { uri: string; headers: { Authorization: string } };

export function heroImageSource(
  url: string | null,
  token: string | null,
): HeroImageSource | null {
  if (!url || !token) return null;
  return { uri: url, headers: { Authorization: `Bearer ${token}` } };
}
