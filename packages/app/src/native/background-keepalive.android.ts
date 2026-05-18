import notifee, { AndroidImportance, AndroidVisibility } from "@notifee/react-native";

const NOTIFICATION_ID = "paseo-background-keepalive";
const CHANNEL_ID = "paseo-background-connection";

let started = false;
let channelEnsured = false;

async function ensureChannel(): Promise<void> {
  if (channelEnsured) {
    return;
  }

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Paseo background connection",
    importance: AndroidImportance.LOW,
  });
  channelEnsured = true;
}

export async function startKeepalive(): Promise<void> {
  if (started) {
    return;
  }

  await notifee.requestPermission();
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: "Paseo",
    body: "Streaming agents in background",
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      autoCancel: false,
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PRIVATE,
      pressAction: {
        id: "default",
        launchActivity: "default",
      },
    },
  });
  started = true;
}

export async function stopKeepalive(): Promise<void> {
  if (!started) {
    return;
  }

  started = false;
  try {
    await notifee.stopForegroundService();
  } finally {
    await notifee.cancelNotification(NOTIFICATION_ID).catch(() => {});
  }
}

export async function updateKeepalive(body: string): Promise<void> {
  if (!started) {
    return;
  }

  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: "Paseo",
    body,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      autoCancel: false,
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PRIVATE,
      pressAction: {
        id: "default",
        launchActivity: "default",
      },
    },
  });
}
