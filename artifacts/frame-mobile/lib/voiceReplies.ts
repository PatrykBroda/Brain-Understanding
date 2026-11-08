import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { parseVoicePrefs, speechChunks, speechText, type VoicePrefs } from "@/lib/speechText";

const key = (userId: string) => `frame.voiceReplies.v1.${userId}`;

type SpeechModule = {
  speak: (text: string, opts?: { onDone?: () => void; onStopped?: () => void; onError?: () => void }) => void;
  stop: () => Promise<void> | void;
};

// expo-speech is a native module: absent from builds made before it was added, and on some web targets.
// Resolve it lazily so a missing module disables the button instead of crashing the app.
function speech(): SpeechModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech") as SpeechModule;
  } catch {
    return null;
  }
}

export const voiceAvailable = (): boolean => Platform.OS !== "web" && speech() != null;

export async function loadVoicePrefs(userId: string): Promise<VoicePrefs> {
  try {
    return parseVoicePrefs(await AsyncStorage.getItem(key(userId)));
  } catch {
    return parseVoicePrefs(null);
  }
}

export async function saveVoicePrefs(userId: string, prefs: VoicePrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch {
    /* non-fatal */
  }
}

let current: (() => void) | null = null;

export function stopSpeaking(): void {
  const mod = speech();
  current?.();
  current = null;
  try {
    void mod?.stop();
  } catch {
    /* ignore */
  }
}

/** Speak a reply; any earlier reply stops first. `onEnd` fires when finished or stopped. Returns false if nothing could be spoken. */
export function speakReply(content: string, onEnd: () => void): boolean {
  const mod = speech();
  const chunks = speechChunks(speechText(content));
  if (!mod || chunks.length === 0) return false;
  stopSpeaking();
  let i = 0;
  let live = true;
  const finish = () => {
    if (!live) return;
    live = false;
    if (current === cancel) current = null;
    onEnd();
  };
  const cancel = () => finish();
  current = cancel;
  const next = () => {
    if (!live) return;
    if (i >= chunks.length) return finish();
    mod.speak(chunks[i++]!, { onDone: next, onStopped: finish, onError: finish });
  };
  next();
  return true;
}
