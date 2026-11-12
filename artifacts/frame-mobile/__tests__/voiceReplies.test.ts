import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
let os = "ios";
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return os;
    },
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));

type SpeakOpts = { onDone?: () => void; onStopped?: () => void; onError?: () => void };
const spoken: { text: string; opts: SpeakOpts }[] = [];
const speechMock = {
  speak: vi.fn((text: string, opts: SpeakOpts) => void spoken.push({ text, opts })),
  stop: vi.fn(async () => {}),
};
const recMock = { setCategoryIOS: vi.fn(), setAudioSessionActiveIOS: vi.fn() };
let speechPresent = true;
// voiceReplies resolves the native modules with a lazy CommonJS require(), which vi.mock does not intercept,
// so serve them from Module._load instead.
const Module = require("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const realLoad = Module._load;
Module._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "expo-speech") {
    if (!speechPresent) throw new Error("Cannot find native module 'ExpoSpeech'");
    return speechMock;
  }
  if (request === "expo-speech-recognition") return { ExpoSpeechRecognitionModule: recMock };
  return realLoad.call(this, request, ...rest);
} as typeof Module._load;
afterAll(() => {
  Module._load = realLoad;
});

import { loadVoicePrefs, saveVoicePrefs, speakReply, stopSpeaking, voiceAvailable } from "../lib/voiceReplies";

beforeEach(() => {
  spoken.length = 0;
  store.clear();
  os = "ios";
  speechPresent = true;
  vi.clearAllMocks();
  stopSpeaking();
  vi.clearAllMocks();
});

describe("listen back (voiceReplies)", () => {
  it("is on by default and survives save / load", async () => {
    expect((await loadVoicePrefs("u1")).enabled).toBe(true);
    await saveVoicePrefs("u1", { enabled: false });
    expect((await loadVoicePrefs("u1")).enabled).toBe(false);
  });

  it("is unavailable on web", () => {
    os = "web";
    expect(voiceAvailable()).toBe(false);
  });

  it("speaks a reply, strips markdown, and chains chunks until done", () => {
    const onEnd = vi.fn();
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here and it goes on for a while.`).join(" ");
    expect(speakReply(`**Plan**\n\n${long}`, onEnd)).toBe(true);
    expect(spoken.length).toBe(1);
    expect(spoken[0]!.text).not.toMatch(/\*/);
    let guard = 0;
    while (spoken.length && guard++ < 50) {
      const last = spoken[spoken.length - 1]!;
      const before = spoken.length;
      last.opts.onDone?.();
      if (spoken.length === before) break;
    }
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("claims a playback audio session on iOS so the ringer switch does not mute it", () => {
    speakReply("Keep your hands up.", () => {});
    expect(recMock.setCategoryIOS).toHaveBeenCalledWith(expect.objectContaining({ category: "playback" }));
    expect(recMock.setAudioSessionActiveIOS).toHaveBeenCalledWith(true, expect.anything());
  });

  it("does not touch the audio session on Android", () => {
    os = "android";
    speakReply("Keep your hands up.", () => {});
    expect(recMock.setCategoryIOS).not.toHaveBeenCalled();
    expect(spoken.length).toBe(1);
  });

  it("reports an engine error through onError, then ends", () => {
    const onEnd = vi.fn();
    const onError = vi.fn();
    expect(speakReply("Keep your hands up.", onEnd, onError)).toBe(true);
    spoken[0]!.opts.onError?.();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("reports a speak() that throws instead of swallowing it", () => {
    speechMock.speak.mockImplementationOnce(() => {
      throw new Error("engine down");
    });
    const onEnd = vi.fn();
    const onError = vi.fn();
    speakReply("Keep your hands up.", onEnd, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stop ends the reply without an error", () => {
    const onEnd = vi.fn();
    const onError = vi.fn();
    speakReply("Keep your hands up.", onEnd, onError);
    stopSpeaking();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(speechMock.stop).toHaveBeenCalled();
  });

  it("returns false (so the UI can say so) when there is nothing to speak", () => {
    expect(speakReply("```drill\n{}\n```", () => {})).toBe(false);
  });

  it("returns false when the native speech module is missing from the build", () => {
    speechPresent = false;
    expect(speakReply("Keep your hands up.", () => {})).toBe(false);
  });
});
