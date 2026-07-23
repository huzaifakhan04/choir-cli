import { DurableObject } from "cloudflare:workers";
import type {
  ChoirEvent,
  EventKind,
  EventPayload,
  Role,
  RosterEntry,
  Scope,
  ServerFrame,
} from "@choir/protocol";
import { decodeFrame, encodeFrame } from "@choir/protocol";
import type { Env } from "./env";
import { SCHEMA, type EventRow, type InviteRow, type SessionRow, type SteerRow } from "./schema";
import { signToken, verifyToken } from "./token";

/** Per-socket state carried across hibernation. */
interface Att {
  jti: string;
  name: string;
  role: Role;
  scope: Scope;
  /** True once the client has said hello, been authed, and replayed history. */
  ready: boolean;
}

const HOST_TOKEN_TTL = 60 * 60 * 12; // 12h
const VIEWER_TOKEN_TTL = 60 * 60 * 12; // 12h

/**
 * One Durable Object per session. It is the authoritative hub: it holds the
 * append-only event log (in SQLite), fans out live events to viewer WebSockets
 * with free outbound bandwidth, and mints/validates the tokens that gate access.
 */
export class SessionDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      for (const stmt of SCHEMA.split(";")) {
        const s = stmt.trim();
        if (s) this.ctx.storage.sql.exec(s);
      }
    });
  }

  // ---- HTTP routing ---------------------------------------------------------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["sessions", id, ...rest]
    const roomId = parts[1] ?? "";
    const sub = parts.slice(2).join("/");

    if (req.headers.get("Upgrade") === "websocket") {
      return this.handleUpgrade();
    }

    try {
      if (req.method === "POST" && sub === "") return await this.register(req, roomId);
      if (req.method === "POST" && sub === "invites") return await this.createInvite(req, roomId);
      if (req.method === "POST" && sub === "redeem") return await this.redeem(req, roomId);
      if (req.method === "POST" && sub === "events") return await this.postEvents(req, roomId);
      if (req.method === "GET" && sub === "steer/next") return await this.steerNext(req, roomId);
      if (req.method === "POST" && sub === "control") return await this.control(req, roomId);
      if (req.method === "GET" && sub === "control") return await this.controlPoll(req, roomId);
      if (req.method === "GET" && sub === "roster") return await this.rosterEndpoint(req, roomId);
      return this.err("not_found", "unknown route", 404);
    } catch (e) {
      if (e instanceof HttpError) return this.err(e.code, e.message, e.status);
      return this.err("internal", (e as Error).message, 500);
    }
  }

  // ---- Endpoints ------------------------------------------------------------

  /** POST /sessions/:id — host opens/attaches a room (gated by TEAM_KEY). */
  private async register(req: Request, roomId: string): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      cwd?: string;
      branch?: string;
      commit?: string;
    };
    this.requireTeamKey(req);
    const name = (body.name || "host").slice(0, 64);
    const existing = this.getSession();
    if (!existing) {
      this.ctx.storage.sql.exec(
        "INSERT INTO session (id, host_actor, writer_epoch, paused, created_ts) VALUES (?, ?, 0, 0, ?)",
        roomId,
        name,
        Date.now(),
      );
      this.appendEvent("session_start", name, {
        cwd: body.cwd || "",
        branch: body.branch || "",
        commit: body.commit || "",
      });
    } else if (existing.host_actor !== name) {
      this.ctx.storage.sql.exec("UPDATE session SET host_actor = ? WHERE id = ?", name, roomId);
    }
    const { token, claims } = await signToken(
      { sid: roomId, role: "host", scope: "write", name, ttlSeconds: HOST_TOKEN_TTL },
      this.env.TOKEN_SIGNING_KEY,
    );
    this.upsertMember(claims.jti, name, "host", "write");
    return this.json({ token, roomId, name });
  }

  /** POST /sessions/:id/invites — host mints a reusable invite code. */
  private async createInvite(req: Request, roomId: string): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as { scope?: Scope; ttlSeconds?: number };
    await this.requireHost(req, roomId);
    const scope: Scope = body.scope === "suggest" || body.scope === "write" ? body.scope : "view";
    const ttl = Math.min(Math.max(body.ttlSeconds ?? 60 * 60 * 24, 60), 60 * 60 * 24 * 7);
    const inviteId = randomCode(4);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    this.ctx.storage.sql.exec(
      "INSERT INTO invites (id, scope, exp, created_ts) VALUES (?, ?, ?, ?)",
      inviteId,
      scope,
      exp,
      Date.now(),
    );
    return this.json({ code: `${roomId}-${inviteId}`, scope, exp });
  }

  /** POST /sessions/:id/redeem — a teammate exchanges an invite for a viewer token. */
  private async redeem(req: Request, roomId: string): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as { inviteId?: string; name?: string };
    const inviteId = (body.inviteId || "").trim();
    const name = (body.name || "guest").slice(0, 64);
    const invite = this.ctx.storage.sql
      .exec("SELECT * FROM invites WHERE id = ?", inviteId)
      .toArray()[0] as unknown as InviteRow | undefined;
    if (!invite) throw new HttpError("invalid_invite", "no such invite", 404);
    if (invite.exp <= Math.floor(Date.now() / 1000)) {
      throw new HttpError("expired_invite", "invite expired", 410);
    }
    const { token } = await signToken(
      {
        sid: roomId,
        role: "viewer",
        scope: invite.scope as Scope,
        name,
        ttlSeconds: VIEWER_TOKEN_TTL,
      },
      this.env.TOKEN_SIGNING_KEY,
    );
    return this.json({ token, scope: invite.scope, name });
  }

  /** POST /sessions/:id/events — host streams one or more (redacted) events. */
  private async postEvents(req: Request, roomId: string): Promise<Response> {
    const body = await req.json().catch(() => null);
    await this.requireHost(req, roomId);
    const incoming = Array.isArray(body) ? body : [body];
    let lastSeq = 0;
    for (const raw of incoming) {
      if (!raw || typeof raw !== "object") continue;
      const { kind, actor, payload } = raw as {
        kind?: EventKind;
        actor?: string;
        payload?: EventPayload;
      };
      if (!kind) continue;
      const event = this.appendEvent(kind, actor || "agent", payload || {});
      lastSeq = event.seq;
    }
    return this.json({ ok: true, seq: lastSeq });
  }

  /** GET /sessions/:id/steer/next — host dequeues the next steer to inject. */
  private async steerNext(req: Request, roomId: string): Promise<Response> {
    await this.requireHost(req, roomId);
    const row = this.ctx.storage.sql
      .exec("SELECT * FROM steers WHERE status IN ('queued','approved') ORDER BY id LIMIT 1")
      .toArray()[0] as unknown as SteerRow | undefined;
    if (!row) return this.json({ steer: null });
    this.ctx.storage.sql.exec("UPDATE steers SET status = 'injected' WHERE id = ?", row.id);
    this.appendEvent("steer_injected", row.actor, { text: row.text, from: row.actor });
    return this.json({ steer: { text: row.text, from: row.actor } });
  }

  /** POST /sessions/:id/control — host pause/resume/kick/scope/approve. */
  private async control(req: Request, roomId: string): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      target?: string;
      scope?: string;
    };
    await this.requireHost(req, roomId);
    switch (body.action) {
      case "pause":
        this.ctx.storage.sql.exec("UPDATE session SET paused = 1 WHERE id = ?", roomId);
        this.appendEvent("notification", "host", { text: "⏸ session paused by host" });
        this.recordControl("pause", {});
        this.broadcast({ type: "control", control: { action: "pause" } });
        break;
      case "resume":
        this.ctx.storage.sql.exec("UPDATE session SET paused = 0 WHERE id = ?", roomId);
        this.appendEvent("notification", "host", { text: "▶ session resumed by host" });
        this.recordControl("resume", {});
        this.broadcast({ type: "control", control: { action: "resume" } });
        break;
      case "kick": {
        const target = (body.target || "").trim();
        if (!target) return this.err("bad_request", "kick needs a target", 400);
        this.ctx.storage.sql.exec(
          "UPDATE members SET revoked = 1 WHERE name = ? AND role = 'viewer'",
          target,
        );
        this.closeSocketsFor(target);
        this.appendEvent("notification", "host", { text: `👋 ${target} was removed` });
        this.recordControl("kick", { target });
        this.broadcastPresence();
        break;
      }
      case "scope": {
        const target = (body.target || "").trim();
        const scope =
          body.scope === "view" || body.scope === "suggest" || body.scope === "write"
            ? (body.scope as Scope)
            : null;
        if (!target || !scope) return this.err("bad_request", "scope needs target + scope", 400);
        this.ctx.storage.sql.exec("UPDATE members SET scope = ? WHERE name = ?", scope, target);
        this.updateSocketScope(target, scope);
        this.appendEvent("notification", "host", { text: `🔑 ${target} scope → ${scope}` });
        this.recordControl("scope", { target, scope });
        this.broadcastPresence();
        break;
      }
      case "approve":
        this.ctx.storage.sql.exec("UPDATE steers SET status = 'approved' WHERE status = 'suggested'");
        this.appendEvent("notification", "host", { text: "✅ host approved pending suggestions" });
        break;
      default:
        return this.err("bad_action", "unknown control action", 400);
    }
    return this.json({ ok: true });
  }

  /** GET /sessions/:id/control?since= — host/monitor polls pause + control feed. */
  private async controlPoll(req: Request, roomId: string): Promise<Response> {
    await this.requireHost(req, roomId);
    const since = Number(new URL(req.url).searchParams.get("since") || "0");
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM control_log WHERE seq > ? ORDER BY seq", since)
      .toArray() as unknown as Array<{ seq: number; action: string; data: string }>;
    const s = this.getSession();
    return this.json({
      paused: !!(s && s.paused),
      writerEpoch: s ? s.writer_epoch : 0,
      controls: rows.map((r) => ({ seq: r.seq, action: r.action, data: JSON.parse(r.data) })),
    });
  }

  /** GET /sessions/:id/roster — host reads who's connected. */
  private async rosterEndpoint(req: Request, roomId: string): Promise<Response> {
    await this.requireHost(req, roomId);
    return this.json({ roster: this.roster() });
  }

  private recordControl(action: string, data: unknown): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO control_log (ts, action, data) VALUES (?, ?, ?)",
      Date.now(),
      action,
      JSON.stringify(data),
    );
  }

  private closeSocketsFor(name: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att && att.name === name && att.role === "viewer") {
        try {
          ws.send(encodeFrame({ type: "error", code: "kicked", message: "removed by host" }));
          ws.close(1008, "kicked");
        } catch {
          // ignore
        }
      }
    }
  }

  private updateSocketScope(name: string, scope: Scope): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att && att.name === name && att.role === "viewer") {
        ws.serializeAttachment({ ...att, scope });
      }
    }
  }

  // ---- WebSocket (viewers) --------------------------------------------------

  private handleUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ jti: "", name: "", role: "viewer", scope: "view", ready: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let frame;
    try {
      frame = decodeFrame(raw);
    } catch {
      return;
    }
    if (frame.type === "hello") {
      await this.onHello(ws, frame.token, frame.since ?? 0);
      return;
    }
    const att = ws.deserializeAttachment() as Att | null;
    if (!att || !att.ready) return;
    if (frame.type === "presence") {
      ws.send(encodeFrame({ type: "presence", roster: this.roster() }));
      return;
    }
    if (frame.type === "steer") {
      this.onSteer(ws, att, frame.text);
    }
  }

  /** A viewer submitted a steer. Enqueue it (write) or record a suggestion. */
  private onSteer(ws: WebSocket, att: Att, text: string): void {
    const clean = String(text || "").slice(0, 2000).trim();
    if (!clean) return;
    if (att.scope === "view") {
      ws.send(encodeFrame({ type: "error", code: "read_only", message: "your scope is view-only" }));
      return;
    }
    const status = att.scope === "write" ? "queued" : "suggested";
    this.ctx.storage.sql.exec(
      "INSERT INTO steers (ts, actor, text, scope, status) VALUES (?, ?, ?, ?, ?)",
      Date.now(),
      att.name,
      clean,
      att.scope,
      status,
    );
    if (att.scope === "suggest") {
      this.appendEvent("notification", att.name, { text: `💡 ${att.name} suggests: ${clean}` });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closing
    }
    this.broadcastPresence();
  }

  private async onHello(ws: WebSocket, token: string, since: number): Promise<void> {
    let claims;
    try {
      claims = await verifyToken(token, this.env.TOKEN_SIGNING_KEY);
    } catch {
      ws.send(encodeFrame({ type: "error", code: "unauthorized", message: "invalid token" }));
      ws.close(1008, "unauthorized");
      return;
    }
    const session = this.getSession();
    if (!session || claims.sid !== session.id) {
      ws.send(encodeFrame({ type: "error", code: "no_session", message: "session not open" }));
      ws.close(1008, "no session");
      return;
    }
    const member = this.ctx.storage.sql
      .exec("SELECT revoked FROM members WHERE jti = ?", claims.jti)
      .toArray()[0] as unknown as { revoked: number } | undefined;
    if (member?.revoked) {
      ws.send(encodeFrame({ type: "error", code: "revoked", message: "removed from session" }));
      ws.close(1008, "revoked");
      return;
    }
    this.upsertMember(claims.jti, claims.name, claims.role, claims.scope);

    // Synchronous from here: replay history, mark ready, then welcome. No await
    // between reading the log and going live, so no event can slip past.
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM events WHERE seq > ? ORDER BY seq", since)
      .toArray() as unknown as EventRow[];
    for (const row of rows) {
      ws.send(encodeFrame({ type: "event", event: rowToEvent(row) }));
    }
    ws.serializeAttachment({
      jti: claims.jti,
      name: claims.name,
      role: claims.role,
      scope: claims.scope,
      ready: true,
    } satisfies Att);
    ws.send(
      encodeFrame({
        type: "welcome",
        role: claims.role,
        scope: claims.scope,
        you: claims.name,
        presence: this.roster(),
      }),
    );
    this.broadcastPresence();
  }

  // ---- Event log ------------------------------------------------------------

  private appendEvent(kind: EventKind, actor: string, payload: EventPayload): ChoirEvent {
    const ts = Date.now();
    const row = this.ctx.storage.sql
      .exec(
        "INSERT INTO events (ts, kind, actor, payload) VALUES (?, ?, ?, ?) RETURNING seq",
        ts,
        kind,
        actor,
        JSON.stringify(payload),
      )
      .one() as unknown as { seq: number };
    const event: ChoirEvent = { seq: Number(row.seq), ts, kind, actor, payload };
    this.broadcast({ type: "event", event });
    return event;
  }

  // ---- Presence & fan-out ---------------------------------------------------

  private broadcast(frame: ServerFrame): void {
    const data = encodeFrame(frame);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att?.ready) {
        try {
          ws.send(data);
        } catch {
          // socket going away; close will clean up
        }
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast({ type: "presence", roster: this.roster() });
  }

  private roster(): RosterEntry[] {
    const session = this.getSession();
    const hostActor = session?.host_actor ?? null;
    const entries: RosterEntry[] = [];
    if (hostActor) {
      entries.push({ name: hostActor, role: "host", scope: "write", isWriter: true });
    }
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (!att?.ready || !att.name) continue;
      entries.push({
        name: att.name,
        role: att.role,
        scope: att.scope,
        isWriter: att.role === "host" && att.name === hostActor,
      });
    }
    return entries;
  }

  // ---- Helpers --------------------------------------------------------------

  private getSession(): SessionRow | undefined {
    return this.ctx.storage.sql
      .exec("SELECT * FROM session LIMIT 1")
      .toArray()[0] as unknown as SessionRow | undefined;
  }

  private upsertMember(jti: string, name: string, role: Role, scope: Scope): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO members (jti, name, role, scope, joined_ts, revoked)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(jti) DO UPDATE SET name = excluded.name, scope = excluded.scope`,
      jti,
      name,
      role,
      scope,
      Date.now(),
    );
  }

  private requireTeamKey(req: Request): void {
    const auth = req.headers.get("Authorization") || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!this.env.TEAM_KEY || provided !== this.env.TEAM_KEY) {
      throw new HttpError("unauthorized", "invalid team key", 401);
    }
  }

  private async requireHost(req: Request, roomId: string) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    let claims;
    try {
      claims = await verifyToken(token, this.env.TOKEN_SIGNING_KEY);
    } catch {
      throw new HttpError("unauthorized", "invalid token", 401);
    }
    if (claims.role !== "host" || claims.sid !== roomId) {
      throw new HttpError("forbidden", "host token required", 403);
    }
    const member = this.ctx.storage.sql
      .exec("SELECT revoked FROM members WHERE jti = ?", claims.jti)
      .toArray()[0] as unknown as { revoked: number } | undefined;
    if (member?.revoked) throw new HttpError("revoked", "host revoked", 403);
    return claims;
  }

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  private err(code: string, message: string, status: number): Response {
    return this.json({ error: code, message }, status);
  }
}

class HttpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function rowToEvent(row: EventRow): ChoirEvent {
  return {
    seq: Number(row.seq),
    ts: Number(row.ts),
    kind: row.kind as EventKind,
    actor: row.actor,
    payload: JSON.parse(row.payload) as EventPayload,
  };
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars
function randomCode(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}
