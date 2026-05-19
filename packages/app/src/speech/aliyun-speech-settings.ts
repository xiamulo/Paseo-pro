import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/query/query-client";

export const DEFAULT_ALIYUN_NLS_URL = "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1";
export const ALIYUN_SPEECH_SETTINGS_KEY = "@paseo:aliyun-speech-settings";
const ALIYUN_SPEECH_SETTINGS_QUERY_KEY = ["aliyun-speech-settings"];

export interface AliyunSpeechSettings {
  enabled: boolean;
  appKey: string;
  accessKeyId: string;
  accessKeySecret: string;
  url: string;
}

export const DEFAULT_ALIYUN_SPEECH_SETTINGS: AliyunSpeechSettings = {
  enabled: false,
  appKey: "",
  accessKeyId: "",
  accessKeySecret: "",
  url: DEFAULT_ALIYUN_NLS_URL,
};

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalizeAliyunSpeechSettings(value: unknown): AliyunSpeechSettings {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    enabled:
      typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_ALIYUN_SPEECH_SETTINGS.enabled,
    appKey: cleanString(raw.appKey) ?? DEFAULT_ALIYUN_SPEECH_SETTINGS.appKey,
    accessKeyId: cleanString(raw.accessKeyId) ?? DEFAULT_ALIYUN_SPEECH_SETTINGS.accessKeyId,
    accessKeySecret:
      cleanString(raw.accessKeySecret) ?? DEFAULT_ALIYUN_SPEECH_SETTINGS.accessKeySecret,
    url: cleanString(raw.url) || DEFAULT_ALIYUN_SPEECH_SETTINGS.url,
  };
}

export function isAliyunSpeechConfigured(settings: AliyunSpeechSettings): boolean {
  return Boolean(
    settings.enabled && settings.appKey && settings.accessKeyId && settings.accessKeySecret,
  );
}

export async function loadAliyunSpeechSettingsFromStorage(): Promise<AliyunSpeechSettings> {
  const stored = await AsyncStorage.getItem(ALIYUN_SPEECH_SETTINGS_KEY);
  if (!stored) {
    await AsyncStorage.setItem(
      ALIYUN_SPEECH_SETTINGS_KEY,
      JSON.stringify(DEFAULT_ALIYUN_SPEECH_SETTINGS),
    );
    return DEFAULT_ALIYUN_SPEECH_SETTINGS;
  }
  try {
    return normalizeAliyunSpeechSettings(JSON.parse(stored));
  } catch {
    await AsyncStorage.setItem(
      ALIYUN_SPEECH_SETTINGS_KEY,
      JSON.stringify(DEFAULT_ALIYUN_SPEECH_SETTINGS),
    );
    return DEFAULT_ALIYUN_SPEECH_SETTINGS;
  }
}

async function saveAliyunSpeechSettings(input: {
  queryClient: QueryClient;
  updates: Partial<AliyunSpeechSettings>;
}): Promise<void> {
  const current =
    input.queryClient.getQueryData<AliyunSpeechSettings>(ALIYUN_SPEECH_SETTINGS_QUERY_KEY) ??
    (await loadAliyunSpeechSettingsFromStorage());
  const next = normalizeAliyunSpeechSettings({ ...current, ...input.updates });
  await AsyncStorage.setItem(ALIYUN_SPEECH_SETTINGS_KEY, JSON.stringify(next));
  input.queryClient.setQueryData<AliyunSpeechSettings>(ALIYUN_SPEECH_SETTINGS_QUERY_KEY, next);
}

export async function persistAliyunSpeechSettings(
  updates: Partial<AliyunSpeechSettings>,
): Promise<void> {
  await saveAliyunSpeechSettings({ queryClient: appQueryClient, updates });
}

export function useAliyunSpeechSettings(): {
  settings: AliyunSpeechSettings;
  isLoading: boolean;
  updateSettings: (updates: Partial<AliyunSpeechSettings>) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ALIYUN_SPEECH_SETTINGS_QUERY_KEY,
    queryFn: loadAliyunSpeechSettingsFromStorage,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const updateSettings = useCallback(
    async (updates: Partial<AliyunSpeechSettings>) => {
      await saveAliyunSpeechSettings({ queryClient, updates });
    },
    [queryClient],
  );

  return {
    settings: data ?? DEFAULT_ALIYUN_SPEECH_SETTINGS,
    isLoading: isPending,
    updateSettings,
  };
}
