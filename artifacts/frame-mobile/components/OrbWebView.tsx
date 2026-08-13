import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";

/**
 * Mobile-side orb states, matching the capitalized labels used across the app
 * (see app/(tabs)/home.tsx `deriveState`). The web orb ("streaming") has no
 * mobile equivalent, so it is intentionally omitted here.
 */
type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

interface Props {
  state?: OrbState;
  size?: number;
}

/**
 * The real WebGL CosmicOrb, bundled as a single self-contained offline HTML
 * (assets/orb.html — Three.js + react-three-fiber inlined, zero network at
 * runtime). Loaded from local storage so the orb renders on-device with no
 * connection. `html` is registered in metro.config.js assetExts.
 */
const ORB_ASSET = require("../assets/orb.html");

/** Web-only fallback origin (see the Platform.OS === "web" branch below). */
const ORB_ORIGIN = "https://ajsajjajds.com";

/**
 * Maps the mobile capitalized state to the web app's lowercase OrbState union.
 * Falls back to "stable" — the same default the bundle uses — so an unexpected
 * value never yields a blank frame.
 */
function toWebState(state: OrbState): string {
  return state.toLowerCase();
}

/**
 * Drop-in replacement for <FrameOrb>: instead of the cheap native 2D orb, this
 * embeds the real WebGL CosmicOrb through a transparent, non-interactive WebView
 * so the mobile hub matches the website exactly — but fully OFFLINE on native.
 *
 * Props mirror FrameOrb (`state` + optional `size`).
 */
export function OrbWebView({ state = "Dormant", size = 180 }: Props) {
  const webState = toWebState(state);

  // On web (react-native-web export / the /mobile preview), react-native-webview
  // renders nothing and the metro-bundled local asset isn't trivially loadable
  // as an iframe src with injected state. Keep the remote /orb iframe for the
  // browser preview ONLY; native (below) is the local offline bundle.
  if (Platform.OS === "web") {
    const uri = `${ORB_ORIGIN}/orb?state=${webState}`;
    return (
      <View
        style={[styles.container, { width: size, height: size }]}
        pointerEvents="none"
      >
        {React.createElement("iframe", {
          src: uri,
          width: size,
          height: size,
          frameBorder: "0",
          scrolling: "no",
          allowTransparency: true,
          style: {
            border: "none",
            background: "transparent",
            width: size,
            height: size,
          },
        })}
      </View>
    );
  }

  return (
    <NativeOrb state={webState} size={size} />
  );
}

/**
 * Native WebView host. Resolves the bundled orb.html to a local file URI via
 * expo-asset, then drives state through injected globals (no URL query, since a
 * local file can't rely on ?state=).
 */
function NativeOrb({ state, size }: { state: string; size: number }) {
  const webviewRef = React.useRef<WebView>(null);
  const [localUri, setLocalUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const asset = Asset.fromModule(ORB_ASSET);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!cancelled) setLocalUri(uri);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // On state prop change, imperatively update the already-loaded page.
  React.useEffect(() => {
    webviewRef.current?.injectJavaScript(
      `window.__setOrbState && window.__setOrbState(${JSON.stringify(state)}); true;`,
    );
  }, [state]);

  // Set the initial state before the bundle's script runs.
  const beforeLoad = `window.__ORB_STATE__ = ${JSON.stringify(state)}; true;`;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      pointerEvents="none"
    >
      {localUri ? (
        <WebView
          ref={webviewRef}
          source={{ uri: localUri }}
          style={styles.webview}
          // Local file access for the offline WebGL bundle.
          originWhitelist={["*"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          // Transparency is via style.backgroundColor:"transparent" (below) so the
          // orb sits on the app's #050505 background, not white.
          // Purely decorative surface — no scroll, no input, no bounce.
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          // Needed for the WebGL <canvas> / requestAnimationFrame to run inline.
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          androidLayerType="hardware"
          injectedJavaScriptBeforeContentLoaded={beforeLoad}
          // Keep it a passive visual: don't let the page navigate elsewhere.
          setSupportMultipleWindows={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    // Match the surrounding app background so any pre-paint frame isn't white.
    backgroundColor: "transparent",
  },
  webview: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
});
