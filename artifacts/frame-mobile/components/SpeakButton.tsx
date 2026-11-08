import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { loadVoicePrefs, saveVoicePrefs, speakReply, stopSpeaking, voiceAvailable } from "@/lib/voiceReplies";
import { speechText, type VoicePrefs } from "@/lib/speechText";
import { FONT, TEXT_PRIMARY, TEXT_SECONDARY } from "@/constants/typography";

const ACCENT = "#8A6A2F";

/** Per-message "read aloud" control under a coach reply. Hidden when voice is off or unavailable. */
export function SpeakButton({ content }: { content: string }) {
  const { userId } = useAuth();
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!userId) return;
    void loadVoicePrefs(userId).then(setPrefs);
  }, [userId]);
  // Leaving the screen / unmounting the message stops its speech.
  useEffect(() => () => { if (speaking) stopSpeaking(); }, [speaking]);

  if (!voiceAvailable() || !prefs?.enabled || !speechText(content)) return null;

  const toggle = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(speakReply(content, () => setSpeaking(false)));
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={10}
      style={s.btn}
      accessibilityRole="button"
      accessibilityLabel={speaking ? "Stop reading aloud" : "Read this reply aloud"}
    >
      <Feather name={speaking ? "square" : "volume-2"} size={14} color={speaking ? ACCENT : TEXT_SECONDARY} />
      <Text style={s.label}>{speaking ? "Stop" : "Listen"}</Text>
    </Pressable>
  );
}

/** Profile: turn voice replies on/off (stored on this device). */
export function VoiceSettings() {
  const { userId } = useAuth();
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);

  useEffect(() => {
    if (!userId) return;
    void loadVoicePrefs(userId).then(setPrefs);
  }, [userId]);

  if (!voiceAvailable() || !userId || !prefs) return null;

  const toggle = async (on: boolean) => {
    if (!on) stopSpeaking();
    const next = { ...prefs, enabled: on };
    setPrefs(next);
    await saveVoicePrefs(userId, next);
  };

  return (
    <View style={s.settings}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Voice replies</Text>
          <Text style={s.sub}>Adds a Listen button to FRAME's replies in Chat.</Text>
        </View>
        <Switch
          value={prefs.enabled}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: ACCENT, false: "#222" }}
          accessibilityLabel="Voice replies"
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8 },
  label: { fontFamily: FONT.regular, fontSize: 12, color: TEXT_SECONDARY },
  settings: { paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: FONT.medium, fontSize: 15, color: TEXT_PRIMARY },
  sub: { fontFamily: FONT.regular, fontSize: 13, color: TEXT_SECONDARY },
});
