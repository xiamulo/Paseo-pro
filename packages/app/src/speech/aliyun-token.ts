import type { AliyunSpeechSettings } from "@/speech/aliyun-speech-settings";
import { buildAliyunCreateTokenUrl } from "@/speech/aliyun-signing";

const TOKEN_REFRESH_SKEW_MS = 60_000;

interface AliyunCreateTokenResponse {
  Token?: {
    Id?: string;
    ExpireTime?: number;
  };
  Code?: string;
  Message?: string;
}

export class AliyunNlsTokenProvider {
  private cached: { token: string; expiresAtMs: number } | null = null;
  private inFlight: Promise<{ token: string; expiresAtMs: number }> | null = null;

  constructor(private readonly settings: AliyunSpeechSettings) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
      return this.cached.token;
    }

    this.inFlight ??= this.fetchToken().finally(() => {
      this.inFlight = null;
    });
    this.cached = await this.inFlight;
    return this.cached.token;
  }

  private async fetchToken(): Promise<{ token: string; expiresAtMs: number }> {
    const response = await fetch(
      buildAliyunCreateTokenUrl({
        accessKeyId: this.settings.accessKeyId,
        accessKeySecret: this.settings.accessKeySecret,
      }),
    );
    const body = (await response.json().catch(() => null)) as AliyunCreateTokenResponse | null;

    if (!response.ok) {
      throw new Error(
        body?.Message
          ? `Aliyun NLS CreateToken failed: ${body.Message}`
          : `Aliyun NLS CreateToken failed with HTTP ${response.status}`,
      );
    }

    const token = body?.Token?.Id;
    const expireTime = body?.Token?.ExpireTime;
    if (!token || typeof expireTime !== "number") {
      throw new Error(body?.Message ?? "Aliyun NLS CreateToken response did not include a token");
    }

    return {
      token,
      expiresAtMs: expireTime * 1000,
    };
  }
}
