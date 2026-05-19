import { Buffer } from "buffer";
import { isWeb } from "@/constants/platform";
import type { AliyunSpeechSettings } from "@/speech/aliyun-speech-settings";
import { AliyunNlsTokenProvider } from "@/speech/aliyun-token";
import { generateMessageId } from "@/types/stream";

type AliyunClientEventName = "StartTranscription" | "StopTranscription";

interface AliyunClientEvent {
  header: {
    message_id: string;
    task_id: string;
    namespace: "SpeechTranscriber";
    name: AliyunClientEventName;
    appkey: string;
  };
  payload?: Record<string, unknown>;
  context: {
    sdk: {
      name: string;
      version: string;
      language: string;
    };
  };
}

interface AliyunServerEvent {
  header?: {
    name?: string;
    status?: number;
    status_text?: string;
  };
  payload?: {
    index?: number;
    result?: string;
  };
}

export interface AliyunDictationSessionCallbacks {
  onPartial?: (text: string) => void;
}

function compactId(): string {
  return generateMessageId().replaceAll("-", "");
}

function eventText(event: AliyunServerEvent): string {
  return event.payload?.result?.trim() ?? "";
}

function base64PcmToArrayBuffer(base64Pcm: string): ArrayBuffer {
  const bytes = Buffer.from(base64Pcm, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function websocketWithHeaders(url: string, token: string): WebSocket {
  const WebSocketCtor = WebSocket as unknown as new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
  ) => WebSocket;
  return new WebSocketCtor(url, [], {
    headers: {
      "X-NLS-Token": token,
    },
  });
}

export class AliyunDictationSession {
  private readonly tokenProvider: AliyunNlsTokenProvider;
  private readonly taskId = compactId();
  private ws: WebSocket | null = null;
  private closing = false;
  private stopSent = false;
  private ready: Promise<void> | null = null;
  private finalPromise: Promise<string> | null = null;
  private resolveFinal: ((text: string) => void) | null = null;
  private rejectFinal: ((error: Error) => void) | null = null;
  private latestTranscript = "";
  private finalTranscript = "";
  private terminalError: Error | null = null;

  constructor(
    private readonly settings: AliyunSpeechSettings,
    private readonly callbacks: AliyunDictationSessionCallbacks = {},
  ) {
    this.tokenProvider = new AliyunNlsTokenProvider(settings);
  }

  async connect(): Promise<void> {
    if (this.ready) {
      return this.ready;
    }
    if (isWeb) {
      throw new Error(
        "Alibaba Cloud NLS direct dictation is available in the native app. Browser WebSocket and fetch requests cannot send the required Alibaba Cloud credentials directly.",
      );
    }

    this.closing = false;
    this.ready = new Promise<void>((resolve, reject) => {
      let resolved = false;
      const fail = (error: Error): void => {
        this.terminalError = error;
        if (resolved) {
          this.rejectFinal?.(error);
          return;
        }
        resolved = true;
        reject(error);
      };

      void (async () => {
        try {
          const token = await this.tokenProvider.getToken();
          if (this.closing) {
            resolved = true;
            resolve();
            return;
          }

          const ws = websocketWithHeaders(this.settings.url, token);
          this.ws = ws;

          ws.addEventListener("open", () => {
            this.sendJson("StartTranscription", {
              format: "pcm",
              sample_rate: 16000,
              enable_intermediate_result: true,
              enable_punctuation_prediction: true,
              enable_inverse_text_normalization: true,
            });
          });

          ws.addEventListener("message", (message) => {
            this.handleMessage(
              message.data,
              () => {
                if (!resolved) {
                  resolved = true;
                  resolve();
                }
              },
              fail,
            );
          });

          ws.addEventListener("error", () => {
            fail(new Error("Aliyun NLS websocket error"));
          });

          ws.addEventListener("close", () => {
            if (this.closing) {
              return;
            }
            if (!resolved) {
              fail(new Error("Aliyun NLS websocket closed before ready"));
              return;
            }
            this.rejectFinal?.(new Error("Aliyun NLS websocket closed"));
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });

    return this.ready;
  }

  appendPcm16Base64(base64Pcm: string): void {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Aliyun NLS websocket not connected");
    }
    this.ws.send(base64PcmToArrayBuffer(base64Pcm));
  }

  async finish(timeoutMs = 30_000): Promise<string> {
    if (!this.finalPromise) {
      this.finalPromise = new Promise<string>((resolve, reject) => {
        this.resolveFinal = resolve;
        this.rejectFinal = reject;
      });
    }
    await this.connect();
    if (this.terminalError) {
      throw this.terminalError;
    }
    this.stopTranscription();

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<string>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("Timed out waiting for Aliyun transcription")),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([this.finalPromise, timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  close(): void {
    this.closing = true;
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.stopTranscription();
      }
      this.ws?.close();
    } catch {
      // no-op
    } finally {
      this.ws = null;
      this.ready = null;
    }
  }

  private handleMessage(data: unknown, markReady: () => void, fail: (error: Error) => void): void {
    if (typeof data !== "string") {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    const event = parsed as AliyunServerEvent;
    const name = event.header?.name;
    if (name === "TranscriptionStarted") {
      markReady();
      return;
    }
    if (name === "TranscriptionResultChanged") {
      this.latestTranscript = eventText(event);
      this.callbacks.onPartial?.(this.latestTranscript);
      return;
    }
    if (name === "SentenceEnd") {
      this.finalTranscript = eventText(event);
      this.latestTranscript = this.finalTranscript;
      this.callbacks.onPartial?.(this.finalTranscript);
      return;
    }
    if (name === "TranscriptionCompleted") {
      const text = this.finalTranscript || this.latestTranscript;
      this.resolveFinal?.(text);
      return;
    }
    if (name === "TaskFailed") {
      const status = event.header?.status;
      const statusText = event.header?.status_text ?? "Aliyun NLS task failed";
      fail(new Error(status ? `${statusText} (${status})` : statusText));
    }
  }

  private stopTranscription(): void {
    if (this.stopSent) {
      return;
    }
    this.stopSent = true;
    this.sendJson("StopTranscription", {});
  }

  private sendJson(name: AliyunClientEventName, payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Aliyun NLS websocket not connected");
    }
    const event: AliyunClientEvent = {
      header: {
        message_id: compactId(),
        task_id: this.taskId,
        namespace: "SpeechTranscriber",
        name,
        appkey: this.settings.appKey,
      },
      payload,
      context: {
        sdk: {
          name: "paseo-app",
          version: "0.1",
          language: "javascript",
        },
      },
    };
    this.ws.send(JSON.stringify(event));
  }
}
