import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Display, FadeIn, GlassCard, Screen, media } from "@/components/ui";
import { palette } from "@/constants/theme";

import { useAuth } from "@/context/AuthContext";
import { useEntitlement } from "@/hooks/useEntitlement";

/**
 * The coach's Analyse page already runs the real MediaPipe pose pass locally
 * in the browser, then sends measured signals to the API. Reuse that page in
 * iOS WKWebView instead of the old mobile form, which only scored user input
 * and never inspected the selected video.
 */
export default function AnalyseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { data: entitlement, isPending, isError, refetch } = useEntitlement();
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const origin = domain ? `https://${domain}` : null;
  const url = origin ? `${origin}/analyse?frameMobile=1` : null;

  useEffect(() => {
    let alive = true;
    setToken(null);
    setTokenChecked(false);
    if (entitlement?.plan === "frame_plus") {
      void getToken().then((value) => {
        if (alive) {
          setToken(value);
          setTokenChecked(true);
        }
      });
    }
    return () => { alive = false; };
  }, [entitlement?.plan, getToken, userId]);

  const loading = isPending || (entitlement?.plan === "frame_plus" && !tokenChecked);
  if (loading) {
    return <Screen><View style={styles.center}><ActivityIndicator color={palette.goldLight} /></View></Screen>;
  }
  if (isError || !entitlement || !url || (entitlement.plan === "frame_plus" && !token)) {
    return (
      <Notice top={insets.top}>
        <Display size="heading" style={styles.title}>Analyse unavailable</Display>
        <Body style={styles.body}>We couldn't verify your access or load the analysis screen. Check your connection and try again.</Body>
        <Button title="Retry" onPress={() => { setLoadError(false); void refetch(); }} />
      </Notice>
    );
  }
  if (entitlement.plan === "free") {
    return (
      <Notice top={insets.top} bottom={insets.bottom + 48}>
        <View style={styles.iconDisc}>
          <Feather name="film" size={26} color={palette.goldLight} />
        </View>
        <Display size="heading" style={styles.title}>Video analysis</Display>
        <Body style={styles.body}>Analyse your footage and uncover movement patterns with FRAME+.</Body>
        <Button
          title="Unlock with FRAME+"
          accessibilityLabel="Unlock video analysis with FRAME Plus"
          onPress={() => router.push("/paywall")}
        />
      </Notice>
    );
  }
  if (loadError) {
    return (
      <Notice top={insets.top}>
        <Display size="heading" style={styles.title}>Can't load Analyse</Display>
        <Body style={styles.body}>The analysis screen needs a connection. Your footage has not been uploaded.</Body>
        <Button title="Try again" onPress={() => setLoadError(false)} />
      </Notice>
    );
  }
  // A WebView cannot display in the static browser preview. The iPhone uses
  // WKWebView; the browser opens the same on-device pose page in its own tab.
  if (Platform.OS === "web") {
    return (
      <Notice top={insets.top}>
        <Button title="Open Analyse" onPress={() => void Linking.openURL(url)} />
      </Notice>
    );
  }

  const bootstrap = `window.__FRAME_MOBILE_TOKEN__ = ${JSON.stringify(token)}; true;`;
  return (
    <View style={[styles.webHost, { paddingTop: insets.top, paddingBottom: 50 + insets.bottom }]}>
      <WebView
        key={userId ?? "anonymous"}
        source={{ uri: url }}
        injectedJavaScriptBeforeContentLoaded={bootstrap}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={false}
        onError={() => setLoadError(true)}
        onHttpError={(event) => {
          if (event.nativeEvent.url.startsWith(`${origin}/analyse`) && event.nativeEvent.statusCode >= 400) setLoadError(true);
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === "about:blank") return true;
          if (origin && request.url.startsWith(`${origin}/`)) return true;
          if (request.url.startsWith("https://")) void Linking.openURL(request.url);
          return false;
        }}
        style={styles.webview}
      />
    </View>
  );
}

/** Glass notice card on the Smoked Bronze backdrop — loading/error/consent chrome. */
function Notice({ children, top = 0, bottom = 0 }: { children: React.ReactNode; top?: number; bottom?: number }) {
  return (
    <Screen photo={media.stillA}>
      <View style={[styles.center, { paddingTop: top, paddingBottom: bottom }]}>
        <FadeIn style={styles.fade}>
          <GlassCard tone="gold" radius={28} padding={28} style={styles.card}>
            <View style={styles.stack}>{children}</View>
          </GlassCard>
        </FadeIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  webHost: { flex: 1, backgroundColor: "#050505" },
  webview: { flex: 1, backgroundColor: "#050505" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  fade: { alignSelf: "stretch" },
  card: { alignSelf: "stretch" },
  stack: { alignItems: "center", gap: 16 },
  iconDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", marginBottom: 4 },
});
