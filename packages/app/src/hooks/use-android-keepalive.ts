import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAppSettings } from "@/hooks/use-settings";
import { startKeepalive, stopKeepalive } from "@/native/background-keepalive";

function isBackgroundState(state: string): boolean {
  return state === "background" || state === "inactive";
}

export function useAndroidKeepalive(): void {
  const { settings } = useAppSettings();
  const enabled = settings.androidBackgroundKeepalive;

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    if (!enabled) {
      void stopKeepalive();
      return;
    }

    if (isBackgroundState(AppState.currentState)) {
      void startKeepalive();
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (isBackgroundState(nextState)) {
        void startKeepalive();
        return;
      }
      if (nextState === "active") {
        void stopKeepalive();
      }
    });

    return () => {
      subscription.remove();
      void stopKeepalive();
    };
  }, [enabled]);
}
