"use client";
import { useEffect, useRef, useCallback } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SSE_URL = `${BASE}/api/sse/events`;

export type SSEHandler = (event: string, data: unknown) => void;

/**
 * Subscribe to the backend SSE stream.
 * Automatically reconnects on error with exponential back-off (1s → 30s cap).
 * Cleaned up on component unmount.
 *
 * @param onMessage  Called for every event received (event name + parsed data).
 * @param enabled    Set to false to disable the stream (e.g. user not logged in).
 */
export function useSSE(onMessage: SSEHandler, enabled = true): void {
  const onMessageRef = useRef<SSEHandler>(onMessage);
  onMessageRef.current = onMessage;

  const retryDelay = useRef(1000);
  const esRef      = useRef<EventSource | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(SSE_URL, { withCredentials: true });
    esRef.current = es;

    es.addEventListener("open", () => {
      retryDelay.current = 1000; // reset back-off on successful connection
    });

    // Generic message handler — capture any named event
    const handleEvent = (type: string) => (e: MessageEvent) => {
      try {
        onMessageRef.current(type, JSON.parse(e.data));
      } catch {
        // ignore parse errors
      }
    };

    const EVENT_TYPES = ["connected", "order:new", "amazon:sync"];
    EVENT_TYPES.forEach(t => es.addEventListener(t, handleEvent(t) as EventListener));

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Exponential back-off: 1s → 2s → 4s → … → 30s max
      const delay = Math.min(retryDelay.current, 30_000);
      retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
      timerRef.current = setTimeout(connect, delay);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connect, enabled]);
}
