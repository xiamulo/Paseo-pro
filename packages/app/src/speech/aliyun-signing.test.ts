import { describe, expect, it } from "vitest";

import { buildAliyunCreateTokenUrl, testInternals } from "@/speech/aliyun-signing";

describe("Aliyun CreateToken signing", () => {
  it("computes HMAC-SHA1 base64 signatures", () => {
    expect(testInternals.hmacSha1Base64("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "3nybhbi3iqa8ino29wqQcBydtNk=",
    );
  });

  it("builds a signed CreateToken URL from AccessKey credentials", () => {
    const url = new URL(
      buildAliyunCreateTokenUrl({
        accessKeyId: "access-key-id",
        accessKeySecret: "access-key-secret",
        now: new Date("2026-05-19T08:00:00Z"),
        nonce: "nonce-1",
      }),
    );

    expect(url.origin).toBe("https://nls-meta.cn-shanghai.aliyuncs.com");
    expect(url.searchParams.get("Action")).toBe("CreateToken");
    expect(url.searchParams.get("Version")).toBe("2019-02-28");
    expect(url.searchParams.get("RegionId")).toBe("cn-shanghai");
    expect(url.searchParams.get("AccessKeyId")).toBe("access-key-id");
    expect(url.searchParams.get("Timestamp")).toBe("2026-05-19T08:00:00Z");
    expect(url.searchParams.get("Signature")).toBeTruthy();
  });
});
