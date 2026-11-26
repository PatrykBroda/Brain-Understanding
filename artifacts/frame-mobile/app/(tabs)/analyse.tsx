import { BootLoader } from "@/components/BootLoader";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { FONT, label } from "@/constants/typography";
import {
  ANALYSE_LOAD_TIMEOUT_MS,
  ANALYSE_READY_MESSAGE,
  classifyAnalyseNavigation,
  isWrongAnalysePage,
} from "@/lib/analyseWebViewNavigation";

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
  // Bumped by "Try again" to remount the WebView. `ready` flips when the page says it has mounted.
  const [attempt, setAttempt] = useState(0);
  const ready = useRef(false);
  // Free members keep the Analyse page while they have free analyses left (server-enforced);
  // FRAME+ is unlimited. Unknown allowance -> open the page and let the server decide.
  // Latched per user so spending the last free analysis doesn't yank the report away mid-view.
  const accessNow =
    entitlement?.plan === "frame_plus" ||
    (entitlement?.plan === "free" && (entitlement.freeAnalyses?.remaining ?? 1) > 0);
  const latch = useRef<{ userId: string | null; granted: boolean }>({ userId: null, granted: false });
  if (latch.current.userId !== (userId ?? null)) latch.current = { userId: userId ?? null, granted: false };
  if (accessNow) latch.current.granted = true;
  const hasAccess = accessNow || latch.current.granted;

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const origin = domain ? `https://${domain}` : null;
  const url = origin ? `${origin}/analyse?frameMobile=1` : null;

  useEffect(() => {
    let alive = true;
    setToken(null);
    setTokenChecked(false);
    if (hasAccess) {
      void getToken().then((value) => {
        if (alive) {
          setToken(value);
          setTokenChecked(true);
        }
      });
    }
    return () => { alive = false; };
  }, [hasAccess, getToken, userId]);

  const loading = isPending || (hasAccess && !tokenChecked);
  const showingWebView =
    !loading && !isError && !!entitlement && !!url && hasAccess && !!token && !loadError && Platform.OS !== "web";

  // The WebView must never sit on a loading screen forever: if the Analyse page does not report
  // ready in time (wrong page served, hung request, offline), show the error + retry instead.
  useEffect(() => {
    if (!showingWebView) return;
    ready.current = false;
    const timer = setTimeout(() => {
      if (!ready.current) setLoadError(true);
    }, ANALYSE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [showingWebView, attempt]);

  if (loading) {
    return <BootLoader label="Loading" />;
  }
  if (isError || !entitlement || !url || (hasAccess && !token)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Analyse unavailable</Text>
        <Text style={styles.body}>We couldn't verify your access or load the analysis screen. Check your connection and try again.</Text>
        <Pressable style={styles.button} onPress={() => { setLoadError(false); void refetch(); }}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!hasAccess) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom + 48 }]}>
        <Feather name="film" size={30} color="#8A6A2F" />
        <Text style={styles.title}>Video analysis</Text>
        <Text style={styles.body}>You've used your {entitlement.freeAnalyses?.limit ?? 2} free analyses. Keep analysing your footage and uncovering movement patterns with FRAME+.</Text>
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Unlock video analysis with FRAME Plus"
          onPress={() => router.push("/paywall")}
        >
          <Text style={styles.buttonText}>Unlock with FRAME+</Text>
        </Pressable>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Can't load analyse</Text>
        <Text style={styles.body}>The analysis screen needs a connection. Your footage has not been uploaded.</Text>
        <Pressable style={styles.button} onPress={() => { setLoadError(false); setAttempt((n) => n + 1); }}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  // A WebView cannot display in the static browser preview. The iPhone uses
  // WKWebView; the browser opens the same on-device pose page in its own tab.
  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Pressable style={styles.button} onPress={() => void Linking.openURL(url)}>
          <Text style={styles.buttonText}>Open analyse</Text>
        </Pressable>
      </View>
    );
  }

  const bootstrap = `window.__FRAME_MOBILE_TOKEN__ = ${JSON.stringify(token)}; true;`;
  return (
    <View style={[styles.webHost, { paddingTop: insets.top, paddingBottom: 50 + insets.bottom }]}>
      <WebView
        key={`${userId ?? "anonymous"}:${attempt}`}
        source={{ uri: url }}
        injectedJavaScriptBeforeContentLoaded={bootstrap}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={false}
        onError={() => setLoadError(true)}
        onMessage={(event) => {
          if (event.nativeEvent.data === ANALYSE_READY_MESSAGE) ready.current = true;
        }}
        onNavigationStateChange={(nav) => {
          if (isWrongAnalysePage(nav.url, origin)) setLoadError(true);
        }}
        onHttpError={(event) => {
          if (event.nativeEvent.url.startsWith(`${origin}/analyse`) && event.nativeEvent.statusCode >= 400) setLoadError(true);
        }}
        onOpenWindow={(event) => {
          const decision = classifyAnalyseNavigation(
            { url: event.nativeEvent.targetUrl, isTopFrame: true },
            origin,
          );
          if (decision.action === "openExternal") void Linking.openURL(decision.url);
        }}
        onShouldStartLoadWithRequest={(request) => {
          const decision = classifyAnalyseNavigation(request, origin);
          if (decision.action === "openExternal") void Linking.openURL(decision.url);
          return decision.action === "allow";
        }}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webHost: { flex: 1, backgroundColor: "#050505" },
  webview: { flex: 1, backgroundColor: "#050505" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: "#050505", gap: 20 },
  title: { fontFamily: FONT.medium, fontSize: 16, color: "#e0e0e0", textAlign: "center", letterSpacing: 0 },
  body: { fontFamily: "Outfit", fontSize: 15, lineHeight: 23, color: "#999", textAlign: "center" },
  button: { borderColor: "#8A6A2F", borderWidth: 1, paddingVertical: 15, paddingHorizontal: 26, marginTop: 12 },
  buttonText: { ...label, fontSize: 13, lineHeight: 17, color: "#d9bc84", textAlign: "center" },
});