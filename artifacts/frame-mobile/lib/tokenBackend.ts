import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { TokenBackend } from "@/lib/authSession";

const TOKEN_KEY = "frame:token";

// AFTER_FIRST_UNLOCK: the keychain item stays readable once the phone has been unlocked once
// since boot, including when iOS wakes the app in the background. (The default,
// WHEN_UNLOCKED, throws on a locked device and used to look like a lost login.)
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const nativeBackend: TokenBackend = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY, OPTIONS),
  set: (token) => SecureStore.setItemAsync(TOKEN_KEY, token, OPTIONS),
  remove: () => SecureStore.deleteItemAsync(TOKEN_KEY, OPTIONS),
};

// SecureStore does not exist on the web build; localStorage keeps a reload signed in.
const webBackend: TokenBackend = {
  get: async () => window.localStorage.getItem(TOKEN_KEY),
  set: async (token) => window.localStorage.setItem(TOKEN_KEY, token),
  remove: async () => window.localStorage.removeItem(TOKEN_KEY),
};

export const tokenBackend: TokenBackend = Platform.OS === "web" ? webBackend : nativeBackend;
