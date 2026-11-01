import type { ClientMessage, GameEvent, ServerMessage, View } from "@initle/core/client";
import PartySocket from "partysocket";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getIdentity } from "./identity";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "not-found" | "kicked" | "replaced";

export type RoomApi = {
  view: View | null;
  status: ConnStatus;
  offset: number;
  send: (msg: ClientMessage) => void;
  onEvent: (fn: (e: GameEvent) => void) => () => void;
  onError: (fn: (e: { code: string; message: string }) => void) => () => void;
};

/** Connect to a room as a player (role "player") or as the read-only stage screen. */
export function useRoomConnection(code: string, role: "player" | "stage"): RoomApi {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [offset, setOffset] = useState(0);
  const socketRef = useRef<PartySocket | null>(null);
  const eventSubs = useRef(new Set<(e: GameEvent) => void>());
  const errorSubs = useRef(new Set<(e: { code: string; message: string }) => void>());

  useEffect(() => {
    const ws = new PartySocket({
      host: window.location.host,
      party: "room",
      room: code,
      query: role === "stage" ? { role: "stage" } : {},
    });
    socketRef.current = ws;
    let stopped = false;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const sendRaw = (msg: ClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.addEventListener("open", () => {
      setStatus("open");
      if (role === "player") {
        const id = getIdentity();
        sendRaw({ type: "join", token: id.token, name: id.name || "Player", avatar: id.avatar });
      }
      sendRaw({ type: "ping", t: Date.now() });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => sendRaw({ type: "ping", t: Date.now() }), 15_000);
    });

    ws.addEventListener("message", (e: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "view") setView(msg.view);
      else if (msg.type === "pong") {
        const rtt = Date.now() - msg.t;
        setOffset(msg.serverNow + rtt / 2 - Date.now());
      } else if (msg.type === "event") eventSubs.current.forEach((fn) => fn(msg.event));
      else if (msg.type === "error") {
        if (msg.code === "ROOM_NOT_FOUND") {
          stopped = true;
          setStatus("not-found");
          ws.close();
        }
        errorSubs.current.forEach((fn) => fn(msg));
      }
    });

    ws.addEventListener("close", (e: CloseEvent) => {
      if (stopped) return;
      if (e.code === 4004) {
        stopped = true;
        setStatus("not-found");
        ws.close();
      } else if (e.code === 4003) {
        stopped = true;
        setStatus("kicked");
        ws.close();
      } else if (e.code === 4001) {
        stopped = true;
        setStatus("replaced");
        ws.close();
      } else setStatus("reconnecting");
    });

    return () => {
      stopped = true;
      clearInterval(pingTimer);
      ws.close();
      socketRef.current = null;
    };
  }, [code, role]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  const onEvent = useCallback((fn: (e: GameEvent) => void) => {
    eventSubs.current.add(fn);
    return () => void eventSubs.current.delete(fn);
  }, []);
  const onError = useCallback((fn: (e: { code: string; message: string }) => void) => {
    errorSubs.current.add(fn);
    return () => void errorSubs.current.delete(fn);
  }, []);

  return useMemo(() => ({ view, status, offset, send, onEvent, onError }), [view, status, offset, send, onEvent, onError]);
}

export const RoomContext = createContext<RoomApi | null>(null);

export function useRoom(): RoomApi & { view: View } {
  const ctx = useContext(RoomContext);
  if (!ctx || !ctx.view) throw new Error("useRoom outside a connected room");
  return ctx as RoomApi & { view: View };
}

/** Subscribe to game events from inside a room screen. */
export function useGameEvent(fn: (e: GameEvent) => void) {
  const { onEvent } = useRoom();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onEvent((e) => ref.current(e)), [onEvent]);
}

export function usePlayer(id: string | null | undefined) {
  const { view } = useRoom();
  return view.players.find((p) => p.id === id) ?? null;
}
