import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
    return <View style={styles.center}><ActivityIndicator color="#8A6A2F" /></View>;
  }
  if (isError || !entitlement || !url || (entitlement.plan === "frame_plus" && !token)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>ANALYSE UNAVAILABLE</Text>
        <Text style={styles.body}>We couldn't verify your access or load the analysis screen. Check your connection and try again.</Text>
        <Pressable style={styles.button} onPress={() => { setLoadError(false); void refetch(); }}>
          <Text style={styles.buttonText}>RETRY</Text>
        </Pressable>
      </View>
    );
  }
  if (entitlement.plan === "free") {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom + 48 }]}>
        <Feather name="film" size={30} color="#8A6A2F" />
        <Text style={styles.title}>VIDEO ANALYSIS</Text>
        <Text style={styles.body}>Analyse your footage and uncover movement patterns with FRAME+.</Text>
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Unlock video analysis with FRAME Plus"
          onPress={() => router.push("/paywall")}
        >
          <Text style={styles.buttonText}>UNLOCK WITH FRAME+</Text>
        </Pressable>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>CAN'T LOAD ANALYSE</Text>
        <Text style={styles.body}>The analysis screen needs a connection. Your footage has not been uploaded.</Text>
        <Pressable style={styles.button} onPress={() => setLoadError(false)}>
          <Text style={styles.buttonText}>TRY AGAIN</Text>
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
          <Text style={styles.buttonText}>OPEN ANALYSE</Text>
        </Pressable>
      </View>
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

const styles = StyleSheet.create({
  webHost: { flex: 1, backgroundColor: "#050505" },
  webview: { flex: 1, backgroundColor: "#050505" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: "#050505", gap: 20 },
  title: { fontFamily: "SpaceMono", fontSize: 16, color: "#e0e0e0", letterSpacing: 3, textAlign: "center" },
  body: { fontFamily: "Outfit", fontSize: 15, lineHeight: 23, color: "#999", textAlign: "center" },
  button: { borderColor: "#8A6A2F", borderWidth: 1, paddingVertical: 15, paddingHorizontal: 26, marginTop: 12 },
  buttonText: { fontFamily: "SpaceMono", fontSize: 11, letterSpacing: 2, color: "#d9bc84", textAlign: "center" },
});