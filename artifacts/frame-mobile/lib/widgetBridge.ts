import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import {
  WIDGET_APP_GROUP,
  WIDGET_STORAGE_KEY,
  buildWidgetPayload,
  payloadChanged,
  type WidgetInput,
} from "@/lib/widgetData";

// Native contract (to be provided by the widget target; see targets/widget/README.md):
//   FrameWidgetBridge.setItem(appGroup, key, json): void  -> writes UserDefaults(suiteName:)
//   FrameWidgetBridge.reload(): void                       -> WidgetCenter.reloadAllTimelines()
// Until that module is in a build, requireOptionalNativeModule returns null and this is a no-op.
interface FrameWidgetBridge {
  setItem(appGroup: string, key: string, json: string): void;
  reload(): void;
}

let last: string | null = null;

export function widgetBridgeAvailable(): boolean {
  return Platform.OS === "ios" && requireOptionalNativeModule<FrameWidgetBridge>("FrameWidgetBridge") != null;
}

/** Publish today's focus + days left to the widget. Never throws. Returns true if written. */
export function publishWidgetData(input: WidgetInput): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    const mod = requireOptionalNativeModule<FrameWidgetBridge>("FrameWidgetBridge");
    if (!mod) return false;
    const payload = buildWidgetPayload(input);
    if (!payloadChanged(last, payload)) return false;
    const json = JSON.stringify(payload);
    mod.setItem(WIDGET_APP_GROUP, WIDGET_STORAGE_KEY, json);
    mod.reload();
    last = json;
    return true;
  } catch {
    return false;
  }
}
