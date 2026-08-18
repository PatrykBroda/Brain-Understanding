import { type ImgHTMLAttributes } from "react";
import { useAuthedObjectUrl } from "@/lib/useAuthedObjectUrl";

type AuthedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

/**
 * <img> replacement for bearer-auth-gated file URLs (hero images, attachments).
 * A plain <img> can't send the Authorization header the file routes require, so
 * the request 401s and the image renders broken. This loads the bytes with the
 * auth header and points the element at an authed object URL instead. Renders
 * nothing until the image has loaded.
 */
export function AuthedImage({ src, ...rest }: AuthedImageProps) {
  const objectUrl = useAuthedObjectUrl(src);
  if (!objectUrl) return null;
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={objectUrl} {...rest} />;
}
