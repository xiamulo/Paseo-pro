import { beforeEach, describe, expect, it, vi } from "vitest";

const asyncStorageMock = vi.hoisted(() => ({
  getItem: vi.fn<(_: string) => Promise<string | null>>(),
  setItem: vi.fn<(_: string, __: string) => Promise<void>>(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorageMock,
}));

describe("Aliyun speech settings storage", () => {
  beforeEach(() => {
    vi.resetModules();
    asyncStorageMock.getItem.mockReset();
    asyncStorageMock.setItem.mockReset();
  });

  it("stores AccessKey credentials in app-local storage", async () => {
    asyncStorageMock.getItem.mockResolvedValue(null);
    asyncStorageMock.setItem.mockResolvedValue();

    const mod = await import("@/speech/aliyun-speech-settings");
    await mod.persistAliyunSpeechSettings({
      enabled: true,
      appKey: " app-key ",
      accessKeyId: " access-key-id ",
      accessKeySecret: " access-key-secret ",
    });

    const [, rawValue] = asyncStorageMock.setItem.mock.calls.at(-1) ?? [];
    expect(rawValue).toBeTruthy();
    expect(JSON.parse(String(rawValue))).toMatchObject({
      enabled: true,
      appKey: "app-key",
      accessKeyId: "access-key-id",
      accessKeySecret: "access-key-secret",
    });
  });

  it("requires AppKey, AccessKey ID, and AccessKey Secret when enabled", async () => {
    const mod = await import("@/speech/aliyun-speech-settings");

    expect(
      mod.isAliyunSpeechConfigured({
        enabled: true,
        appKey: "app-key",
        accessKeyId: "access-key-id",
        accessKeySecret: "access-key-secret",
        url: mod.DEFAULT_ALIYUN_NLS_URL,
      }),
    ).toBe(true);
    expect(
      mod.isAliyunSpeechConfigured({
        enabled: true,
        appKey: "app-key",
        accessKeyId: "access-key-id",
        accessKeySecret: "",
        url: mod.DEFAULT_ALIYUN_NLS_URL,
      }),
    ).toBe(false);
  });
});
