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

// iOS mutes speech while the ringer switch is off unless the audio session is "playback". expo-speech does not set
// one, so claim it through the already-installed speech-recognition module (no new native dependency). Best effort.
export function ensurePlaybackSession(): void {
  if (Platform.OS !== "ios") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rec = require("expo-speech-recognition").ExpoSpeechRecognitionModule as {
      setCategoryIOS?: (o: { category: string; categoryOptions: string[]; mode?: string }) => void;
      setAudioSessionActiveIOS?: (v: boolean, o?: { notifyOthersOnDeactivation: boolean }) => void;
    };
    rec.setCategoryIOS?.({ category: "playback", categoryOptions: ["duckOthers"], mode: "spokenAudio" });
    rec.setAudioSessionActiveIOS?.(true, { notifyOthersOnDeactivation: false });
  } catch {
    /* module absent in this build: speech still works with the ringer on */
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

/**
 * Speak a reply; any earlier reply stops first. `onEnd` fires when finished or stopped. `onError` fires (before onEnd)
 * when the speech engine reports a failure, so the UI can say so. Returns false if nothing could be spoken.
 */
export function speakReply(content: string, onEnd: () => void, onError?: () => void): boolean {
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
  const fail = () => {
    if (live) onError?.();
    finish();
  };
  ensurePlaybackSession();
  const next = () => {
    if (!live) return;
    if (i >= chunks.length) return finish();
    try {
      mod.speak(chunks[i++]!, { onDone: next, onStopped: finish, onError: fail });
    } catch {
      fail();
    }
  };
  next();
  return true;
}
