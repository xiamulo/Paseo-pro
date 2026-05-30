import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAppSettings } from "@/hooks/use-settings";
import { startKeepalive, stopKeepalive } from "@/native/background-keepalive";
import { registerBackgroundKeepaliveService } from "@/native/background-keepalive-service";

function isBackgroundState(state: string): boolean {
  return state === "background" || state === "inactive";
}

function startRegisteredKeepalive(): void {
  registerBackgroundKeepaliveService();
  void startKeepalive();
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
      startRegisteredKeepalive();
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (isBackgroundState(nextState)) {
        startRegisteredKeepalive();
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
