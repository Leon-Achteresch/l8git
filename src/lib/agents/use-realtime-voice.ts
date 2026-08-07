import { useCallback, useEffect, useRef, useState } from "react";

import type { CodexAgentClient } from "@/lib/agents/providers/codex/client";
import type { CodexRealtimeAudioChunk } from "@/lib/agents/providers/codex/protocol";
import { codexSessionManager } from "@/lib/agents/session-manager";
import type { AgentRealtimeVoice } from "@/lib/agents/types";

export type AgentRealtimeVoiceStatus =
  | "idle"
  | "starting"
  | "listening"
  | "stopping"
  | "error";

interface RealtimeTranscript {
  role: string;
  text: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    for (let index = 0; index < chunk.length; index += 1) {
      binary += String.fromCharCode(chunk[index]);
    }
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodePcm16(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytesToBase64(new Uint8Array(buffer));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Bridges the App Server's experimental thread realtime API to Web Audio.
 * Audio stays ephemeral: PCM chunks are streamed directly and never placed in
 * Zustand, localStorage, or the persisted Codex transcript.
 */
export function useAgentRealtimeVoice({
  threadId,
  path,
  voice,
}: {
  threadId: string | null;
  path: string;
  voice: AgentRealtimeVoice | null;
}) {
  const [status, setStatus] = useState<AgentRealtimeVoiceStatus>("idle");
  const [transcript, setTranscript] = useState<RealtimeTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<AgentRealtimeVoiceStatus>("idle");
  const clientRef = useRef<CodexAgentClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const outputSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextPlaybackAtRef = useRef(0);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedAudioChunksRef = useRef(0);

  const updateStatus = useCallback((next: AgentRealtimeVoiceStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }, []);

  const cleanupAudio = useCallback(async () => {
    if (processorRef.current) processorRef.current.onaudioprocess = null;
    processorRef.current?.disconnect();
    inputSourceRef.current?.disconnect();
    muteGainRef.current?.disconnect();
    processorRef.current = null;
    inputSourceRef.current = null;
    muteGainRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    for (const source of outputSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may already have ended between iteration and stop().
      }
    }
    outputSourcesRef.current.clear();
    nextPlaybackAtRef.current = 0;
    queuedAudioChunksRef.current = 0;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") await context.close().catch(() => {});
  }, []);

  const playAudio = useCallback((audio: CodexRealtimeAudioChunk) => {
    const context = contextRef.current;
    if (!context || context.state === "closed" || !audio.data) return;
    const bytes = base64ToBytes(audio.data);
    const channels = Math.max(1, audio.numChannels || 1);
    const availableFrames = Math.floor(bytes.byteLength / 2 / channels);
    const frames = Math.min(audio.samplesPerChannel ?? availableFrames, availableFrames);
    if (!frames) return;
    const buffer = context.createBuffer(channels, frames, audio.sampleRate);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let channel = 0; channel < channels; channel += 1) {
      const output = buffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame += 1) {
        output[frame] = view.getInt16((frame * channels + channel) * 2, true) / 0x8000;
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startsAt = Math.max(context.currentTime + 0.02, nextPlaybackAtRef.current);
    nextPlaybackAtRef.current = startsAt + buffer.duration;
    outputSourcesRef.current.add(source);
    source.onended = () => outputSourcesRef.current.delete(source);
    source.start(startsAt);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => codexSessionManager.onEvent((_context, event) => {
    if (!threadId || event.params?.threadId !== threadId) return;
    if (event.method === "thread/realtime/started") {
      updateStatus("listening");
      return;
    }
    if (event.method === "thread/realtime/transcript/delta") {
      const role = typeof event.params.role === "string" ? event.params.role : "assistant";
      const delta = typeof event.params.delta === "string" ? event.params.delta : "";
      setTranscript((current) => ({
        role,
        text: `${current?.role === role ? current.text : ""}${delta}`.slice(-800),
      }));
      return;
    }
    if (event.method === "thread/realtime/transcript/done") {
      const role = typeof event.params.role === "string" ? event.params.role : "assistant";
      const text = typeof event.params.text === "string" ? event.params.text : "";
      setTranscript({ role, text: text.slice(-800) });
      return;
    }
    if (event.method === "thread/realtime/outputAudio/delta") {
      const audio = event.params.audio;
      if (audio && typeof audio === "object") playAudio(audio as CodexRealtimeAudioChunk);
      return;
    }
    if (event.method === "thread/realtime/error") {
      const message = typeof event.params.message === "string"
        ? event.params.message
        : "Realtime voice failed.";
      setError(message);
      updateStatus("error");
      const client = clientRef.current;
      clientRef.current = null;
      if (client) void client.stopRealtime(threadId).catch(() => {});
      void cleanupAudio();
      return;
    }
    if (event.method === "thread/realtime/closed") {
      void cleanupAudio();
      clientRef.current = null;
      updateStatus("idle");
    }
  }), [cleanupAudio, playAudio, threadId, updateStatus]);

  const start = useCallback(async (overrideVoice?: AgentRealtimeVoice) => {
    if (!threadId || statusRef.current !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      setError("Microphone capture is not available in this WebView.");
      updateStatus("error");
      return;
    }
    updateStatus("starting");
    setError(null);
    setTranscript(null);
    let realtimeStarted = false;
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      await context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const { client } = await codexSessionManager.threadClient(threadId, path);
      clientRef.current = client;
      await client.startRealtime(threadId, { voice: overrideVoice ?? voice, outputModality: "audio" });
      realtimeStarted = true;

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const muteGain = context.createGain();
      muteGain.gain.value = 0;
      inputSourceRef.current = source;
      processorRef.current = processor;
      muteGainRef.current = muteGain;
      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(context.destination);
      processor.onaudioprocess = (event) => {
        if (statusRef.current !== "listening" && statusRef.current !== "starting") return;
        // Bound memory when the upstream transport becomes slower than capture.
        // Twelve 4096-sample chunks retain roughly two seconds at 24 kHz.
        if (queuedAudioChunksRef.current >= 12) return;
        const samples = new Float32Array(event.inputBuffer.getChannelData(0));
        const audio: CodexRealtimeAudioChunk = {
          data: encodePcm16(samples),
          sampleRate: context.sampleRate,
          numChannels: 1,
          samplesPerChannel: samples.length,
          itemId: null,
        };
        queuedAudioChunksRef.current += 1;
        sendQueueRef.current = sendQueueRef.current
          .then(() => client.appendRealtimeAudio(threadId, audio))
          .then(() => undefined)
          .catch((streamError: unknown) => {
            if (!mountedRef.current || statusRef.current === "error") return;
            setError(errorMessage(streamError));
            updateStatus("error");
            clientRef.current = null;
            void client.stopRealtime(threadId).catch(() => {});
            void cleanupAudio();
          })
          .finally(() => {
            queuedAudioChunksRef.current = Math.max(0, queuedAudioChunksRef.current - 1);
          });
      };
      updateStatus("listening");
    } catch (startError) {
      if (realtimeStarted) {
        await clientRef.current?.stopRealtime(threadId).catch(() => {});
      }
      clientRef.current = null;
      await cleanupAudio();
      setError(errorMessage(startError));
      updateStatus("error");
    }
  }, [cleanupAudio, path, threadId, updateStatus, voice]);

  const stop = useCallback(async () => {
    if (!threadId || statusRef.current === "idle" || statusRef.current === "stopping") return;
    updateStatus("stopping");
    if (processorRef.current) processorRef.current.onaudioprocess = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    try {
      await sendQueueRef.current.catch(() => {});
      await clientRef.current?.stopRealtime(threadId);
    } catch (stopError) {
      setError(errorMessage(stopError));
    } finally {
      clientRef.current = null;
      await cleanupAudio();
      updateStatus("idle");
    }
  }, [cleanupAudio, threadId, updateStatus]);

  useEffect(() => {
    updateStatus("idle");
    setTranscript(null);
    setError(null);
    return () => {
      const client = clientRef.current;
      clientRef.current = null;
      if (client && threadId) void client.stopRealtime(threadId).catch(() => {});
      void cleanupAudio();
    };
  }, [cleanupAudio, threadId, updateStatus]);

  const dismissError = useCallback(() => {
    setError(null);
    if (statusRef.current === "error") updateStatus("idle");
  }, [updateStatus]);

  return {
    status,
    transcript,
    error,
    start,
    stop,
    dismissError,
    active: status === "starting" || status === "listening" || status === "stopping",
  };
}
