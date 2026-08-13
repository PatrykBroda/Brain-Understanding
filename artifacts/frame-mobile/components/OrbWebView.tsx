import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

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

/** Origin serving the chrome-less web orb route (coach app, `/orb`). */
const ORB_ORIGIN = "https://ajsajjajds.com";

/**
 * Maps the mobile capitalized state to the web app's lowercase OrbState union.
 * Falls back to "stable" — the same default the /orb route uses — so an
 * unexpected value never yields a blank frame.
 */
function toWebState(state: OrbState): string {
  return state.toLowerCase();
}

/**
 * Drop-in replacement for <FrameOrb>: instead of the cheap native 2D orb, this
 * embeds the real WebGL CosmicOrb from the web app through a transparent,
 * non-interactive WebView so the mobile hub matches the website exactly.
 *
 * Props mirror FrameOrb (`state` + optional `size`). The WebView is sized to
 * the same square footprint each FrameOrb call site used.
 */
export function OrbWebView({ state = "Dormant", size = 180 }: Props) {
  const uri = `${ORB_ORIGIN}/orb?state=${toWebState(state)}`;

  // On web (react-native-web export / the /mobile preview), react-native-webview
  // renders nothing — so the orb would be blank. Use a real DOM iframe there so
  // the exact same /orb scene shows in the browser preview too. Native keeps the
  // WebView below.
  if (Platform.OS === "web") {
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
    <View
      style={[styles.container, { width: size, height: size }]}
      pointerEvents="none"
    >
      <WebView
        source={{ uri }}
        style={styles.webview}
        // Transparent so the orb sits on the app's #050505 background, not white.
        opaque={false}
        backgroundColor="transparent"
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
        // Keep it a passive visual: don't let the page navigate elsewhere.
        setSupportMultipleWindows={false}
      />
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
