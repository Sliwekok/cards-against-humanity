"use client";
import { io, Socket } from "socket.io-client";
import type { Ack } from "./types";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) socket = io({ transports: ["websocket", "polling"] });
  return socket;
};

/** Wysyła zdarzenie i czeka na odpowiedź serwera. */
export const emit = <T = object>(event: string, payload?: unknown): Promise<Ack<T>> =>
  new Promise((resolve) => {
    getSocket()
      .timeout(8000)
      .emit(event, payload ?? {}, (err: Error | null, res: Ack<T>) => {
        if (err) resolve({ ok: false, error: "Brak odpowiedzi serwera." });
        else resolve(res);
      });
  });
