import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/api";

/**
 * A browser <img>/<video> element cannot send an Authorization header, but the
 * attachment and hero file routes are bearer-auth gated (requireAuth reads the
 * token from the header only). Pointing a media element straight at the file
 * URL therefore 401s and renders as a broken/empty image.
 *
 * This hook fetches the bytes with the auth header attached, wraps them in an
 * object URL, and returns that for the media element to use. The object URL is
 * revoked on unmount / url change so we don't leak blobs.
 */
export function useAuthedObjectUrl(url: string | null | undefined): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      return;
    }
    let alive = true;
    let created: string | null = null;

    fetch(url, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (alive) setObjectUrl(null);
      });

    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return objectUrl;
}
