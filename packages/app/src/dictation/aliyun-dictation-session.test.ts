import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/constants/platform", () => ({
  isWeb: false,
}));

class FakeWebSocket {
  static readonly OPEN = 1;
  public readyState = FakeWebSocket.OPEN;
  public sent: unknown[] = [];
  private listeners = new Map<string, Array<(event: { data: string }) => void>>();

  constructor(
    public readonly url: string,
    public readonly protocols?: string | string[],
    public readonly options?: { headers?: Record<string, string> },
  ) {
    fakeSockets.push(this);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  addEventListener(event: string, listener: (message: { data: string }) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  emit(event: string, data = ""): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener({ data });
    }
  }

  close(): void {
    this.readyState = 3;
  }

  emitJson(name: string, payload?: Record<string, unknown>): void {
    this.emit(
      "message",
      JSON.stringify({
        header: { name },
        payload,
      }),
    );
  }
}

const fakeSockets: FakeWebSocket[] = [];

describe("AliyunDictationSession", () => {
  beforeEach(() => {
    fakeSockets.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            Token: {
              Id: "token-1",
              ExpireTime: Math.floor(Date.now() / 1000) + 3600,
            },
          }),
          { status: 200 },
        );
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a token, sends NLS headers, streams PCM, and resolves the final text", async () => {
    const { AliyunDictationSession } = await import("@/dictation/aliyun-dictation-session");
    const partials: string[] = [];
    const session = new AliyunDictationSession(
      {
        enabled: true,
        appKey: "app-key",
        accessKeyId: "access-key-id",
        accessKeySecret: "access-key-secret",
        url: "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1",
      },
      { onPartial: (text) => partials.push(text) },
    );

    const connect = session.connect();
    await vi.waitFor(() => expect(fakeSockets).toHaveLength(1));
    const ws = fakeSockets[0];
    expect(ws?.options?.headers?.["X-NLS-Token"]).toBe("token-1");

    ws?.emit("open");
    ws?.emitJson("TranscriptionStarted");
    await connect;

    expect(JSON.parse(String(ws?.sent[0])).header).toMatchObject({
      namespace: "SpeechTranscriber",
      name: "StartTranscription",
      appkey: "app-key",
    });

    session.appendPcm16Base64("AQI=");
    const pcm = new Uint8Array(ws?.sent[1] as ArrayBuffer);
    expect(Array.from(pcm)).toEqual([1, 2]);

    const final = session.finish();
    ws?.emitJson("TranscriptionResultChanged", { result: "hello" });
    ws?.emitJson("SentenceEnd", { result: "hello world" });
    ws?.emitJson("TranscriptionCompleted");

    await expect(final).resolves.toBe("hello world");
    expect(partials).toEqual(["hello", "hello world"]);
  });
});
