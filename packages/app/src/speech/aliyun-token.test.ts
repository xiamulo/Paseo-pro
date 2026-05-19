import { afterEach, describe, expect, it, vi } from "vitest";

import { AliyunNlsTokenProvider } from "@/speech/aliyun-token";

describe("AliyunNlsTokenProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and caches short-lived NLS tokens in the app runtime", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () => {
      return new Response(
        JSON.stringify({
          Token: {
            Id: "token-1",
            ExpireTime: Math.floor(Date.now() / 1000) + 3600,
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AliyunNlsTokenProvider({
      enabled: true,
      appKey: "app-key",
      accessKeyId: "access-key-id",
      accessKeySecret: "access-key-secret",
      url: "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1",
    });

    await expect(provider.getToken()).resolves.toBe("token-1");
    await expect(provider.getToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("Action=CreateToken");
  });

  it("surfaces Alibaba Cloud token errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ Message: "bad credentials" }), { status: 403 });
      }),
    );

    const provider = new AliyunNlsTokenProvider({
      enabled: true,
      appKey: "app-key",
      accessKeyId: "access-key-id",
      accessKeySecret: "access-key-secret",
      url: "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1",
    });

    await expect(provider.getToken()).rejects.toThrow(
      "Aliyun NLS CreateToken failed: bad credentials",
    );
  });
});
