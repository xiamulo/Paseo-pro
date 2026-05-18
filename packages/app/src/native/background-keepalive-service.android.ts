import notifee from "@notifee/react-native";

let registered = false;

export function registerBackgroundKeepaliveService(): void {
  if (registered) {
    return;
  }

  registered = true;
  notifee.registerForegroundService(
    () =>
      new Promise(() => {
        // Keep Notifee's foreground service alive while the Android OS allows
        // this JS runtime to stay resident. The existing app-level WebSocket
        // remains the single streaming connection.
      }),
  );
}
