import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { shouldApplyTranscript } from "@/lib/voiceTranscript";

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
  // Results can arrive after stop() while the native recognizer is winding
  // down. This gate prevents a stale final result from restoring a message
  // that the chat composer has already cleared.
  const acceptingResultsRef = useRef(false);
  const startRequestRef = useRef(0);

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => {
    acceptingResultsRef.current = false;
    setListening(false);
  });
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (shouldApplyTranscript(acceptingResultsRef.current, transcript)) {
      onTranscriptRef.current(transcript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setError(event.message ?? event.error ?? "voice error");
    acceptingResultsRef.current = false;
    setListening(false);
  });

  const start = useCallback(async () => {
    const requestId = ++startRequestRef.current;
    acceptingResultsRef.current = false;
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone permission denied");
        return;
      }
      // Send or another stop may have happened while iOS was asking for
      // permission. Do not resurrect that cancelled voice session.
      if (requestId !== startRequestRef.current) return;
      acceptingResultsRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "voice unavailable");
      acceptingResultsRef.current = false;
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    ++startRequestRef.current;
    acceptingResultsRef.current = false;
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
      ++startRequestRef.current;
      acceptingResultsRef.current = false;
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
