import { FrameLogo } from "@/components/frame-logo";

// The FRAME® wordmark (client artwork rebuilt as vector). Used in the Home, Chat and State
// headers. `size` is kept for call-site compatibility: it is the old octagon size, mapped to
// the logo height.
export function FrameWordmark({ size = 30 }: { size?: number }) {
  return <FrameLogo height={Math.round(size * 0.62)} />;
}
