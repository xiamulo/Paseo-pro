import { useCallback, useEffect, useRef, useState } from "react";

import { AliyunDictationSession } from "@/dictation/aliyun-dictation-session";
import { DictationStreamSender } from "@/dictation/dictation-stream-sender";
import { useDictationAudioSource } from "@/hooks/use-dictation-audio-source";
import { isAliyunSpeechConfigured, useAliyunSpeechSettings } from "@/speech/aliyun-speech-settings";
import { generateMessageId } from "@/types/stream";
import { AttemptGuard } from "@/utils/attempt-guard";
import {
  DURATION_TICK_MS,
  PCM_DICTATION_FORMAT,
  toError,
  type DictationStatus,
  type UseDictationOptions,
  type UseDictationResult,
} from "./use-dictation.shared";

export function useDictation(options: UseDictationOptions): UseDictationResult {
  const {
    client,
    onTranscript,
    onPartialTranscript,
    onError,
    onPermanentFailure,
    canStart,
    canConfirm,
    enableDuration = false,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DictationStatus>("idle");
  const latestPartialTranscriptRef = useRef("");
  const { settings: aliyunSettings } = useAliyunSpeechSettings();
  const aliyunSettingsRef = useRef(aliyunSettings);
  useEffect(() => {
    aliyunSettingsRef.current = aliyunSettings;
  }, [aliyunSettings]);

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const onPartialTranscriptRef = useRef(onPartialTranscript);
  useEffect(() => {
    onPartialTranscriptRef.current = onPartialTranscript;
  }, [onPartialTranscript]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const onPermanentFailureRef = useRef(onPermanentFailure);
  useEffect(() => {
    onPermanentFailureRef.current = onPermanentFailure;
  }, [onPermanentFailure]);

  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const isProcessingRef = useRef(isProcessing);
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // duration is used for UI only; no need to mirror into a ref.

  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptGuardRef = useRef(new AttemptGuard());
  const actionGateRef = useRef<{ starting: boolean; confirming: boolean; cancelling: boolean }>({
    starting: false,
    confirming: false,
    cancelling: false,
  });

  const senderRef = useRef<DictationStreamSender | null>(null);
  const aliyunSessionRef = useRef<AliyunDictationSession | null>(null);
  const aliyunSegmentsRef = useRef<string[]>([]);
  if (!senderRef.current) {
    senderRef.current = new DictationStreamSender({
      client,
      format: PCM_DICTATION_FORMAT,
      createDictationId: generateMessageId,
    });
  }
  useEffect(() => {
    senderRef.current?.setClient(client);
  }, [client]);

  const stopDurationTracking = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startDurationTracking = useCallback(() => {
    if (!enableDuration) {
      return;
    }
    if (durationIntervalRef.current) {
      return;
    }
    durationIntervalRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, DURATION_TICK_MS);
  }, [enableDuration]);

  useEffect(() => {
    if (!enableDuration) {
      stopDurationTracking();
      setDuration(0);
    }
  }, [enableDuration, stopDurationTracking]);

  const reportError = useCallback(
    (err: unknown, context?: string) => {
      const normalized = toError(err);
      if (normalized.name === "AttemptCancelledError") {
        return;
      }
      if (context) {
        console.error(`[useDictation] ${context}`, normalized);
      } else {
        console.error("[useDictation]", normalized);
      }
      setError(normalized.message);
      onErrorRef.current?.(normalized);
    },
    [setError],
  );

  const clearStreamingState = useCallback(() => {
    senderRef.current?.clearAll();
    aliyunSessionRef.current?.close();
    aliyunSessionRef.current = null;
    aliyunSegmentsRef.current = [];
    latestPartialTranscriptRef.current = "";
    setPartialTranscript("");
  }, []);

  const startNewStream = useCallback(async (reason: string) => {
    await senderRef.current?.restartStream(reason);
  }, []);

  const ensureFinalTranscript = useCallback(async (finalSeq: number): Promise<string> => {
    const result = await senderRef.current!.finish(finalSeq);
    return result.text;
  }, []);

  const emitAliyunPartial = useCallback((text: string) => {
    latestPartialTranscriptRef.current = text;
    setPartialTranscript(text);
    onPartialTranscriptRef.current?.(text, { requestId: generateMessageId() });
  }, []);

  const createAliyunSession = useCallback((): AliyunDictationSession => {
    return new AliyunDictationSession(aliyunSettingsRef.current, {
      onPartial: emitAliyunPartial,
    });
  }, [emitAliyunPartial]);

  useEffect(() => {
    if (!client) {
      return;
    }
    return client.subscribeConnectionStatus((next) => {
      if (next.status !== "connected") {
        return;
      }
      if (!isRecordingRef.current) {
        return;
      }
      if (aliyunSessionRef.current) {
        return;
      }
      void startNewStream("reconnect").catch((err) => {
        reportError(err, "Failed to restart dictation stream after reconnect");
      });
    });
  }, [client, reportError, startNewStream]);

  useEffect(() => {
    if (!client) {
      return;
    }
    return client.on("dictation_stream_partial", (message) => {
      if (message.type !== "dictation_stream_partial") {
        return;
      }
      const activeDictationId = senderRef.current?.getDictationId();
      if (!activeDictationId) {
        return;
      }
      if (message.payload.dictationId !== activeDictationId) {
        return;
      }
      const next = message.payload.text ?? "";
      latestPartialTranscriptRef.current = next;
      setPartialTranscript(next);
      onPartialTranscriptRef.current?.(next, { requestId: generateMessageId() });
    });
  }, [client]);

  const audio = useDictationAudioSource({
    onPcmSegment: (audioData) => {
      if (isAliyunSpeechConfigured(aliyunSettingsRef.current)) {
        aliyunSegmentsRef.current.push(audioData);
        try {
          aliyunSessionRef.current?.appendPcm16Base64(audioData);
        } catch (err) {
          onErrorRef.current?.(toError(err));
        }
        return;
      }
      senderRef.current?.enqueueSegment(audioData);
    },
    onError: (err) => {
      onErrorRef.current?.(err);
    },
  });
  const audioStopRef = useRef(audio.stop);
  useEffect(() => {
    audioStopRef.current = audio.stop;
  }, [audio.stop]);

  const handleStreamingTranscriptionSuccess = useCallback(
    (text: string, requestId: string) => {
      setIsProcessing(false);
      isProcessingRef.current = false;
      setDuration(0);
      setStatus("idle");

      const transcriptText =
        text.trim().length > 0 ? text.trim() : latestPartialTranscriptRef.current.trim();
      clearStreamingState();

      if (!transcriptText) {
        return;
      }
      onTranscriptRef.current?.(transcriptText, { requestId });
    },
    [clearStreamingState],
  );

  const handleDictationFailure = useCallback(
    (failure: unknown) => {
      const normalized = toError(failure);
      const failureId = generateMessageId();
      setIsProcessing(false);
      isProcessingRef.current = false;
      isRecordingRef.current = false;
      setIsRecording(false);

      if (senderRef.current?.hasSegments() || aliyunSegmentsRef.current.length > 0) {
        setStatus("failed");
        onPermanentFailureRef.current?.(normalized, { requestId: failureId });
      } else {
        setStatus("idle");
      }

      reportError(normalized, "Failed to complete dictation");
    },
    [reportError],
  );

  const startDictation = useCallback(async () => {
    if (
      actionGateRef.current.starting ||
      actionGateRef.current.confirming ||
      actionGateRef.current.cancelling
    ) {
      return;
    }
    if (isRecordingRef.current || isProcessingRef.current) {
      return;
    }
    const currentAliyunSettings = aliyunSettingsRef.current;
    const useAliyun = isAliyunSpeechConfigured(currentAliyunSettings);
    if (currentAliyunSettings.enabled && !useAliyun) {
      reportError(
        new Error(
          "Alibaba Cloud NLS is enabled but AppKey, AccessKey ID, or AccessKey Secret is missing.",
        ),
        "Alibaba Cloud NLS settings are incomplete",
      );
      return;
    }
    let startAllowed = true;
    if (!useAliyun && canStart) {
      startAllowed = canStart();
    }
    if (!startAllowed) {
      return;
    }

    actionGateRef.current.starting = true;
    setError(null);
    setPartialTranscript("");
    setDuration(0);
    setIsProcessing(false);
    setStatus("recording");
    clearStreamingState();

    try {
      if (useAliyun) {
        const aliyunSession = createAliyunSession();
        aliyunSessionRef.current = aliyunSession;
        await aliyunSession.connect();
      }
      await audio.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      if (enableDuration) {
        startDurationTracking();
      }
      if (!useAliyun && client?.isConnected) {
        await startNewStream("start");
      }
    } catch (err) {
      await audio.stop().catch(() => undefined);
      aliyunSessionRef.current?.close();
      aliyunSessionRef.current = null;
      stopDurationTracking();
      isRecordingRef.current = false;
      setIsRecording(false);
      setStatus("idle");
      reportError(err, "Failed to start dictation");
    } finally {
      actionGateRef.current.starting = false;
    }
  }, [
    audio,
    canStart,
    clearStreamingState,
    client,
    enableDuration,
    createAliyunSession,
    reportError,
    startDurationTracking,
    startNewStream,
    stopDurationTracking,
  ]);

  const cancelDictation = useCallback(async () => {
    attemptGuardRef.current.cancel();
    if (actionGateRef.current.cancelling) {
      return;
    }
    if (!isRecordingRef.current && !isProcessingRef.current) {
      return;
    }
    actionGateRef.current.cancelling = true;
    stopDurationTracking();
    setDuration(0);
    setError(null);

    try {
      try {
        senderRef.current?.cancel();
        aliyunSessionRef.current?.close();
      } catch {
        // no-op
      }
      await audio.stop();
    } catch (err) {
      reportError(err, "Failed to cancel dictation");
    } finally {
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsProcessing(false);
      isProcessingRef.current = false;
      setStatus("idle");
      clearStreamingState();
      actionGateRef.current.cancelling = false;
    }
  }, [audio, clearStreamingState, reportError, stopDurationTracking]);

  const confirmDictation = useCallback(async () => {
    if (actionGateRef.current.confirming) {
      return;
    }
    if (!isRecordingRef.current || isProcessingRef.current) {
      return;
    }
    const useAliyun = Boolean(aliyunSessionRef.current);
    let confirmAllowed = true;
    if (!useAliyun && canConfirm) {
      confirmAllowed = canConfirm();
    }
    if (!confirmAllowed) {
      return;
    }

    actionGateRef.current.confirming = true;
    setError(null);
    stopDurationTracking();
    setIsProcessing(true);
    isProcessingRef.current = true;

    const attemptId = attemptGuardRef.current.next();

    try {
      await audio.stop();
      attemptGuardRef.current.assertCurrent(attemptId);

      setStatus("uploading");
      isRecordingRef.current = false;
      setIsRecording(false);

      if (useAliyun) {
        const aliyunSession = aliyunSessionRef.current;
        if (!aliyunSession || aliyunSegmentsRef.current.length === 0) {
          handleStreamingTranscriptionSuccess("", generateMessageId());
          return;
        }
        const transcriptText = await aliyunSession.finish();
        aliyunSession.close();
        attemptGuardRef.current.assertCurrent(attemptId);
        handleStreamingTranscriptionSuccess(transcriptText, generateMessageId());
        return;
      }

      const finalSeq = senderRef.current?.getFinalSeq() ?? -1;
      if (finalSeq < 0) {
        handleStreamingTranscriptionSuccess("", generateMessageId());
        return;
      }

      const transcriptText = await ensureFinalTranscript(finalSeq);
      attemptGuardRef.current.assertCurrent(attemptId);
      handleStreamingTranscriptionSuccess(transcriptText, generateMessageId());
    } catch (err) {
      if (err instanceof Error && err.name === "AttemptCancelledError") {
        return;
      }
      handleDictationFailure(err);
    } finally {
      actionGateRef.current.confirming = false;
    }
  }, [
    audio,
    canConfirm,
    handleDictationFailure,
    handleStreamingTranscriptionSuccess,
    stopDurationTracking,
    ensureFinalTranscript,
  ]);

  const retryFailedDictation = useCallback(async () => {
    const hasAliyunSegments = aliyunSegmentsRef.current.length > 0;
    if (!senderRef.current?.hasSegments() && !hasAliyunSegments) {
      return;
    }
    setError(null);
    setStatus("uploading");
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      if (hasAliyunSegments) {
        if (!isAliyunSpeechConfigured(aliyunSettingsRef.current)) {
          throw new Error(
            "Alibaba Cloud NLS settings are incomplete, so the saved recording cannot be retried.",
          );
        }
        const session = createAliyunSession();
        aliyunSessionRef.current = session;
        await session.connect();
        for (const segment of aliyunSegmentsRef.current) {
          session.appendPcm16Base64(segment);
        }
        const text = await session.finish();
        session.close();
        handleStreamingTranscriptionSuccess(text, generateMessageId());
        return;
      }

      if (!client?.isConnected) {
        throw new Error("Daemon client is disconnected");
      }
      const sender = senderRef.current;
      if (!sender) {
        throw new Error("Dictation stream is not available");
      }
      sender.resetStreamForReplay();
      const finalSeq = sender.getFinalSeq();
      const text = await ensureFinalTranscript(finalSeq);
      handleStreamingTranscriptionSuccess(text, generateMessageId());
    } catch (err) {
      if (err instanceof Error && err.name === "AttemptCancelledError") {
        return;
      }
      handleDictationFailure(err);
    }
  }, [
    client,
    createAliyunSession,
    ensureFinalTranscript,
    handleDictationFailure,
    handleStreamingTranscriptionSuccess,
  ]);

  const discardFailedDictation = useCallback(() => {
    setIsProcessing(false);
    isProcessingRef.current = false;
    setDuration(0);
    setStatus("idle");
    setError(null);
    clearStreamingState();
  }, [clearStreamingState]);

  const reset = useCallback(() => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsProcessing(false);
    isProcessingRef.current = false;
    stopDurationTracking();
    setDuration(0);
    setError(null);
    setStatus("idle");
    clearStreamingState();
  }, [clearStreamingState, stopDurationTracking]);

  useEffect(() => {
    const attemptGuard = attemptGuardRef.current;
    const audioStop = audioStopRef;
    return () => {
      attemptGuard.cancel();
      stopDurationTracking();
      void audioStop.current().catch(() => undefined);
    };
  }, [stopDurationTracking]);

  return {
    isRecording,
    isProcessing,
    partialTranscript,
    volume: audio.volume,
    duration,
    error,
    status,
    startDictation,
    cancelDictation,
    confirmDictation,
    retryFailedDictation,
    discardFailedDictation,
    reset,
  };
}

export type {
  DictationStatus,
  UseDictationOptions,
  UseDictationResult,
} from "./use-dictation.shared";
