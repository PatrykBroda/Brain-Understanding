import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Display, EmptyState, FadeIn, GlassCard, Screen } from "@/components/ui";
import { palette, SCREEN_PAD } from "@/constants/theme";

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
    return (
      <Notice top={insets.top} bottom={insets.bottom + 48} bare>
        <EmptyState kind="loading" title="Preparing Analyse" body="Checking your access." />
      </Notice>
    );
  }
  if (isError || !entitlement || !url || (entitlement.plan === "frame_plus" && !token)) {
    return (
      <Notice top={insets.top} bottom={insets.bottom + 48} bare>
        <EmptyState
          kind="error"
          title="Analyse unavailable"
          body="We couldn't verify your access or load the analysis screen. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoadError(false);
            void refetch();
          }}
        />
      </Notice>
    );
  }
  if (entitlement.plan === "free") {
    return (
      <Notice top={insets.top} bottom={insets.bottom + 48}>
        <View style={styles.iconDisc}>
          <Feather name="film" size={22} color={palette.textMid} />
        </View>
        <Display size="heading" style={styles.title}>Video analysis</Display>
        <Body style={styles.body}>Analyse your footage and uncover movement patterns with FRAME+.</Body>
        <Button
          title="Unlock with FRAME+"
          accessibilityLabel="Unlock video analysis with FRAME Plus"
          onPress={() => router.push("/paywall")}
          style={styles.fullBtn}
        />
      </Notice>
    );
  }
  if (loadError) {
    return (
      <Notice top={insets.top} bottom={insets.bottom + 48} bare>
        <EmptyState
          kind="error"
          title="Can't load Analyse"
          body="The analysis screen needs a connection. Your footage has not been uploaded."
          actionLabel="Try again"
          onAction={() => setLoadError(false)}
        />
      </Notice>
    );
  }
  // A WebView cannot display in the static browser preview. The iPhone uses
  // WKWebView; the browser opens the same on-device pose page in its own tab.
  if (Platform.OS === "web") {
    return (
      <Notice top={insets.top} bottom={insets.bottom + 48}>
        <View style={styles.iconDisc}>
          <Feather name="film" size={22} color={palette.textMid} />
        </View>
        <Display size="heading" style={styles.title}>Video analysis</Display>
        <Body style={styles.body}>Pose analysis runs on your device. Your footage stays with you until you choose to share results.</Body>
        <Button title="Open Analyse" onPress={() => void Linking.openURL(url)} style={styles.fullBtn} />
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

/** Solid notice card on the canvas: idle / paywall / loading / error chrome. `bare` = children bring their own card. */
function Notice({
  children,
  top = 0,
  bottom = 0,
  bare = false,
}: {
  children: React.ReactNode;
  top?: number;
  bottom?: number;
  bare?: boolean;
}) {
  return (
    <Screen light="silver" focus="topRight">
      <View style={[styles.center, { paddingTop: top, paddingBottom: bottom }]}>
        <FadeIn style={styles.fade}>
          {bare ? (
            children
          ) : (
            <GlassCard padding={24} style={styles.card}>
              <View style={styles.stack}>{children}</View>
            </GlassCard>
          )}
        </FadeIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  webHost: { flex: 1, backgroundColor: palette.bg },
  webview: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SCREEN_PAD },
  fade: { alignSelf: "stretch" },
  card: { alignSelf: "stretch" },
  stack: { alignItems: "center", gap: 12 },
  iconDisc: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", marginBottom: 4 },
  fullBtn: { alignSelf: "stretch", marginTop: 8 },
});
