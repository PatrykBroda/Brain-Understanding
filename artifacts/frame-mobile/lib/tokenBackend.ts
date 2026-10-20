import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { TokenBackend } from "@/lib/authSession";

// expo-secure-store only accepts keys of letters, digits, ".", "-" and "_" (it throws "Invalid key"
// on anything else, e.g. ":"). A key with a colon made every save fail, so the login was never
// stored and each cold start landed on the sign-in screen. Do not put other characters in it.
export const NATIVE_TOKEN_KEY = "frame.token";
// localStorage has no such restriction; this stays the same key the coach web app uses.
export const WEB_TOKEN_KEY = "frame:token";

// AFTER_FIRST_UNLOCK: the keychain item stays readable once the phone has been unlocked once
// since boot, including when iOS wakes the app in the background. (The default,
// WHEN_UNLOCKED, throws on a locked device and used to look like a lost login.)
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const nativeBackend: TokenBackend = {
  get: () => SecureStore.getItemAsync(NATIVE_TOKEN_KEY, OPTIONS),
  set: (token) => SecureStore.setItemAsync(NATIVE_TOKEN_KEY, token, OPTIONS),
  remove: () => SecureStore.deleteItemAsync(NATIVE_TOKEN_KEY, OPTIONS),
};

// SecureStore does not exist on the web build; localStorage keeps a reload signed in.
const webBackend: TokenBackend = {
  get: async () => window.localStorage.getItem(WEB_TOKEN_KEY),
  set: async (token) => window.localStorage.setItem(WEB_TOKEN_KEY, token),
  remove: async () => window.localStorage.removeItem(WEB_TOKEN_KEY),
};

export const tokenBackend: TokenBackend = Platform.OS === "web" ? webBackend : nativeBackend;
