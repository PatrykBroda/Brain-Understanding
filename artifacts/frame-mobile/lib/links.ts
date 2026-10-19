// External links shown in the app. ONE place to change them (mobile and coach web each keep an identical copy).
export const SITE_URL = "https://framemma.ai";
export const SITE_LABEL = "framemma.ai";

// TODO(client): the exact Instagram destination has not been supplied (nothing in the repo or the
// site names it). Set it here and an "Instagram" row appears on Profile in both apps. Until then no
// Instagram link is shown, rather than guessing a handle.
export const INSTAGRAM_URL: string | null = null;

export function externalLinks(): { key: string; label: string; url: string }[] {
  const rows = [{ key: "website", label: `Website (${SITE_LABEL})`, url: SITE_URL }];
  if (INSTAGRAM_URL) rows.push({ key: "instagram", label: "Instagram", url: INSTAGRAM_URL });
  return rows;
}
