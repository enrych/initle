import {
  AVATARS,
  BUILT_IN_PACK_IDS,
  CONFIG,
  PACKS,
  initialRoom,
  isBuiltInPack,
  parseClientMessage,
  pickItems,
  reduce,
  toView,
  type Action,
  type GameEvent,
  type Item,
  type ReduceResult,
  type Room as RoomState,
  type ServerMessage,
} from "@initle/core";
import { Server, type Connection, type ConnectionContext } from "partyserver";
import { loadCustomPacks, recordGame } from "./db";

type ConnState = { role: "player"; playerId: string } | { role: "stage" } | { role: "pending" };

/** Rooms with nobody connected are wiped after this long. */
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const STORAGE_KEY = "room";

/**
 * One Durable Object per room code. Holds the authoritative game state, runs the pure reducer from
 * @initle/core, persists after every change (so hibernation/eviction is safe) and pushes a
 * per-player view to every socket.
 */
export class Room extends Server<Env> {
  static options = { hibernate: true };

  private state: RoomState = initialRoom();
  private gameStartedAt = 0;

  async onStart() {
    const saved = await this.ctx.storage.get<{ room: RoomState; gameStartedAt: number }>(STORAGE_KEY);
    if (saved) {
      this.state = saved.room;
      this.gameStartedAt = saved.gameStartedAt;
    } else {
      this.state = initialRoom(this.name);
    }
  }

  /** RPC from the Worker: mark this code as a real room. Returns false if it already existed. */
  async create(code: string): Promise<boolean> {
    if (this.state.created) return false;
    await this.apply({ type: "create", code });
    return true;
  }

  /** RPC: lightweight status for the join screen. */
  async status() {
    return {
      exists: this.state.created,
      phase: this.state.phase,
      players: this.state.order.length,
      full: this.state.order.length >= CONFIG.MAX_PLAYERS,
    };
  }

  onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const role = new URL(ctx.request.url).searchParams.get("role");
    if (!this.state.created) {
      this.sendTo(conn, { type: "error", code: "ROOM_NOT_FOUND", message: "That room doesn't exist." });
      conn.close(4004, "room not found");
      return;
    }
    if (role === "stage") {
      conn.setState({ role: "stage" });
      this.sendTo(conn, { type: "view", view: toView(this.state, "", Date.now()) });
    } else {
      conn.setState({ role: "pending" });
    }
  }

  async onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer | ArrayBufferView) {
    if (typeof raw !== "string") return;
    const msg = parseClientMessage(raw);
    if (!msg) return this.sendTo(conn, { type: "error", code: "BAD_MESSAGE", message: "Invalid message." });
    const now = Date.now();

    if (msg.type === "ping") return this.sendTo(conn, { type: "pong", t: msg.t, serverNow: now });

    if (msg.type === "join") {
      const existing = this.state.order.find((id) => this.state.players[id]!.token === msg.token);
      const playerId = existing ?? crypto.randomUUID().slice(0, 12);
      const avatar = (AVATARS as readonly string[]).includes(msg.avatar) ? msg.avatar : AVATARS[0];
      const ok = await this.apply({ type: "join", playerId, token: msg.token, name: msg.name, avatar }, conn);
      if (!ok) return;
      // One live socket per player: close any older tab for the same seat.
      for (const other of this.getConnections<ConnState>()) {
        if (other.id !== conn.id && other.state?.role === "player" && other.state.playerId === playerId) {
          other.setState({ role: "pending" });
          other.close(4001, "opened in another tab");
        }
      }
      conn.setState({ role: "player", playerId });
      return this.broadcastViews();
    }

    const st = conn.state;
    if (!st || st.role !== "player") return this.sendTo(conn, { type: "error", code: "UNKNOWN_PLAYER", message: "Join the room first." });
    const playerId = st.playerId;

    switch (msg.type) {
      case "settings": {
        let packNames: Record<string, string> | undefined;
        if (msg.packs) {
          const resolved = await this.resolvePacks(msg.packs);
          if (!resolved) return this.sendTo(conn, { type: "error", code: "UNKNOWN_PACK", message: "One of those packs doesn't exist." });
          packNames = resolved.names;
        }
        return void (await this.apply({ ...msg, playerId, packNames }, conn));
      }
      case "start": {
        if (this.state.hostId !== playerId) return this.sendTo(conn, { type: "error", code: "NOT_HOST", message: "Only the host can start." });
        const resolved = await this.resolvePacks(this.state.settings.packs);
        const pool = resolved?.items ?? [];
        const items = pickItems(pool, CONFIG.ROUND_OPTIONS.at(-1)!);
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
        const ok = await this.apply({ type: "start", playerId, items, seed }, conn);
        if (ok) {
          this.gameStartedAt = now;
          await this.persist();
        }
        return;
      }
      case "prep":
      case "guess":
      case "fake":
      case "vote":
      case "react":
      case "hide":
      case "kick":
        return void (await this.apply({ ...msg, playerId } as Action, conn));
      case "skip":
      case "again":
        return void (await this.apply({ type: msg.type, playerId }, conn));
    }
  }

  async onClose(conn: Connection<ConnState>) {
    const st = conn.state;
    if (!st || st.role !== "player") return;
    const stillHere = [...this.getConnections<ConnState>()].some(
      (c) => c.id !== conn.id && c.state?.role === "player" && c.state.playerId === st.playerId,
    );
    if (!stillHere) await this.apply({ type: "leave", playerId: st.playerId });
  }

  async onAlarm() {
    const now = Date.now();
    const anyone = [...this.getConnections()].length > 0;
    if (this.state.deadline !== null && now >= this.state.deadline) {
      await this.apply({ type: "tick" });
      await this.schedule();
      return;
    }
    if (!anyone && this.state.deadline === null) {
      // Idle room: forget it entirely so the code can be reused.
      await this.ctx.storage.deleteAll();
      this.state = initialRoom(this.name);
      return;
    }
    await this.schedule();
  }

  // ---------- internals ----------

  /** Run an action through the reducer; persist, reschedule and broadcast if anything changed. */
  private async apply(action: Action, from?: Connection<ConnState>): Promise<boolean> {
    const before = this.state;
    const result: ReduceResult = reduce(before, action, Date.now());
    if (result.error) {
      if (from) this.sendTo(from, { type: "error", code: result.error.code, message: result.error.message });
      return false;
    }
    for (const event of result.events) this.dispatchEvent(event);
    if (result.state === before) return true;

    this.state = result.state;
    if (before.phase !== "final" && this.state.phase === "final") this.onGameOver();
    await this.persist();
    await this.schedule();
    this.broadcastViews();
    return true;
  }

  private dispatchEvent(event: GameEvent) {
    const msg = JSON.stringify({ type: "event", event } satisfies ServerMessage);
    if ("to" in event) {
      for (const c of this.getConnections<ConnState>()) if (c.state?.role === "player" && c.state.playerId === event.to) c.send(msg);
    } else if (event.type === "kicked") {
      for (const c of this.getConnections<ConnState>()) {
        if (c.state?.role === "player" && c.state.playerId === event.playerId) {
          c.send(msg);
          c.setState({ role: "pending" });
          c.close(4003, "removed by host");
        }
      }
      this.broadcast(msg);
    } else this.broadcast(msg);
  }

  private broadcastViews() {
    const now = Date.now();
    const cache = new Map<string, string>();
    for (const conn of this.getConnections<ConnState>()) {
      const st = conn.state;
      if (!st || st.role === "pending") continue;
      const me = st.role === "player" ? st.playerId : "";
      let payload = cache.get(me);
      if (!payload) {
        payload = JSON.stringify({ type: "view", view: toView(this.state, me, now) } satisfies ServerMessage);
        cache.set(me, payload);
      }
      conn.send(payload);
    }
  }

  private sendTo(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private async persist() {
    await this.ctx.storage.put(STORAGE_KEY, { room: this.state, gameStartedAt: this.gameStartedAt });
  }

  private async schedule() {
    const at = this.state.deadline ?? Date.now() + IDLE_TTL_MS;
    await this.ctx.storage.setAlarm(at);
  }

  private onGameOver() {
    const s = this.state;
    const row = {
      code: s.code,
      players: s.order.length,
      rounds: s.plan.length,
      plan: s.plan.join(","),
      packs: s.settings.packs.join(","),
      durationMs: this.gameStartedAt ? Date.now() - this.gameStartedAt : 0,
    };
    this.ctx.waitUntil(recordGame(this.env.DB, row).catch((e) => console.error("recordGame failed", e)));
  }

  /** Validate pack ids and collect their items. Built-in packs come from code, custom ones from D1. */
  private async resolvePacks(ids: string[]): Promise<{ names: Record<string, string>; items: Item[] } | null> {
    const names: Record<string, string> = {};
    const items: Item[] = [];
    const custom = ids.filter((id) => !isBuiltInPack(id));
    for (const id of ids.filter(isBuiltInPack)) {
      if (!BUILT_IN_PACK_IDS.includes(id)) return null;
      names[id] = PACKS[id]!.name;
      items.push(...PACKS[id]!.items);
    }
    if (custom.length) {
      const loaded = await loadCustomPacks(this.env.DB, custom);
      if (loaded.length !== custom.length) return null;
      for (const p of loaded) {
        names[p.id] = p.name;
        items.push(...p.items);
      }
    }
    return { names, items };
  }
}
