import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

interface UseSpeechRecognitionOptions {
  /** Called with the latest transcript each time recognition updates. */
  onTranscript: (text: string) => void;
  lang?: string;
}

interface UseSpeechRecognitionReturn {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Native/web speech-to-text for the chat composer, mirroring the coach web
 * app's useSpeechRecognition hook. On iOS/Android this uses the on-device
 * recognizer via expo-speech-recognition; on web it wraps the same library's
 * Web Speech API bridge. The transcript is pushed into the input as you speak.
 */
export function useSpeechRecognition({
  onTranscript,
  lang = "en-US",
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest callback without re-subscribing the native event listeners.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (typeof transcript === "string" && transcript.length > 0) {
      onTranscriptRef.current(transcript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setError(event.message ?? event.error ?? "voice error");
    setListening(false);
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone permission denied");
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "voice unavailable");
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // already stopped — ignore
    }
    setListening(false);
  }, []);

  // Ensure recognition is torn down if the screen unmounts mid-listen.
  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // no-op
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { supported: true, listening, error, start, stop, toggle };
}
