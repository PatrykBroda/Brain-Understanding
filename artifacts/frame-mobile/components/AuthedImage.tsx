import { type ComponentProps, useEffect, useState } from "react";
import { Image } from "react-native";
import { useAuth } from "@/context/AuthContext";

type ImgProps = ComponentProps<typeof Image>;

/**
 * Network images served by the API (the profile hero cover and chat
 * attachments) sit behind `requireAuth`, which only accepts a Bearer *header*.
 * A bare `<Image source={{ uri }} />` can't send that header, so those requests
 * 401 and the image never renders — which showed up as "photo uploads don't
 * work" (the upload POST succeeds and stores fine; only the display fails).
 *
 * This resolves the current JWT and attaches it as an Authorization header on
 * the image request. Local `file://` URIs (freshly-picked drafts) need no auth
 * and are rendered directly.
 */
export function AuthedImage({
  uri,
  style,
  resizeMode = "cover",
}: {
  uri: string;
  style?: ImgProps["style"];
  resizeMode?: ImgProps["resizeMode"];
}) {
  const isRemote = /^https?:/i.test(uri);
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isRemote) return;
    let alive = true;
    getToken().then((t) => {
      if (alive) setToken(t);
    });
    return () => {
      alive = false;
    };
  }, [isRemote, getToken, uri]);

  if (!isRemote) {
    return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
  }

  // Hold the render until the token resolves — a network Image that first loads
  // without the header caches the 401 and won't retry once the token arrives.
  if (!token) return null;

  return (
    <Image
      source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
      style={style}
      resizeMode={resizeMode}
    />
  );
}
