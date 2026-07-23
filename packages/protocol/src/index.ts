/**
 * @choir/protocol — the shared contract between the plugin (host), the relay
 * (Cloudflare Durable Object), and the CLI (viewer).
 *
 * Everything that crosses the wire is defined here so the three surfaces stay
 * in lockstep. The plugin's zero-dependency Node hook scripts don't import this
 * package (no build step on the host), but they emit the same string literals
 * defined below — treat this file as the source of truth.
 */

/** A participant's role in a session. The host runs the actual `claude`. */
export type Role = "host" | "viewer";

/**
 * What a participant is allowed to do.
 * - `view`    — read-only: watch the stream, no steering.
 * - `suggest` — may propose steers, but the host must approve before injection.
 * - `write`   — steers are injected directly at the next turn boundary.
 */
export type Scope = "view" | "suggest" | "write";

export const SCOPES: readonly Scope[] = ["view", "suggest", "write"] as const;

/** The kind of a session event in the append-only log. */
export type EventKind =
  | "session_start" // a `claude` session registered/attached to this room
  | "prompt" // a user prompt was submitted on the host
  | "tool_call" // the agent invoked a tool (PreToolUse)
  | "tool_result" // a tool returned successfully (PostToolUse)
  | "tool_error" // a tool failed (PostToolUseFailure)
  | "assistant_text" // coalesced assistant message text (MessageDisplay deltas)
  | "notification" // a Claude Code notification (e.g. permission prompt)
  | "turn_end" // the agent finished a turn (Stop)
  | "steer_injected" // a teammate's steer was injected into the host session
  | "handoff" // the writer role moved to a new host
  | "session_end"; // the host session ended

/** One entry in a session's append-only, replayable log. */
export interface ChoirEvent {
  /** Monotonic per-session sequence number assigned by the relay. */
  seq: number;
  /** Epoch milliseconds when the relay recorded the event. */
  ts: number;
  kind: EventKind;
  /** Display name of who/what produced it (host name, teammate name, or "agent"). */
  actor: string;
  /** Kind-specific, already-redacted body. See payload shapes below. */
  payload: EventPayload;
}

/** Loosely-typed payload; concrete shapes are documented per kind. */
export type EventPayload = Record<string, unknown>;

// ---- Concrete payload shapes (for reference / typed consumers) --------------

export interface SessionStartPayload {
  cwd: string;
  branch?: string;
  commit?: string;
}
export interface PromptPayload {
  text: string;
}
export interface ToolCallPayload {
  tool: string;
  summary: string; // one-line, redacted summary of the tool input
  toolUseId?: string;
}
export interface ToolResultPayload {
  tool: string;
  ok: boolean;
  output: string; // redacted, truncated
  toolUseId?: string;
}
export interface AssistantTextPayload {
  text: string;
  messageId?: string;
}
export interface SteerInjectedPayload {
  text: string;
  from: string;
}
export interface HandoffPayload {
  from: string;
  to: string;
  epoch: number;
}

// ---- Auth -------------------------------------------------------------------

/** Claims embedded in an HS256 session token. */
export interface TokenClaims {
  /** Session (room) id. */
  sid: string;
  role: Role;
  scope: Scope;
  /** Display name of the holder. */
  name: string;
  /**
   * Writer epoch this token was minted at. The relay only accepts writes
   * (events/steer-drain/control) from a host token whose epoch matches the
   * session's current writer_epoch, so a handoff cleanly demotes the old host.
   * Viewer tokens don't write, so this is 0 for them.
   */
  epoch: number;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
  /** Unique token id — used for presence and revocation (kick). */
  jti: string;
}

// ---- Control channel --------------------------------------------------------

export type ControlAction = "pause" | "resume" | "handoff" | "kick" | "scope";

export interface ControlMessage {
  action: ControlAction;
  /** Target participant name, for `handoff` / `kick` / `scope`. */
  target?: string;
  /** New scope, for `scope`. */
  scope?: Scope;
  /** Writer epoch, stamped by the relay on `handoff`. */
  epoch?: number;
}

/** A member as seen in the presence roster. */
export interface RosterEntry {
  name: string;
  role: Role;
  scope: Scope;
  isWriter: boolean;
}

// ---- WebSocket frames -------------------------------------------------------
// Viewers speak these over the WS connection to the Durable Object.

/** viewer → relay */
export type ClientFrame =
  | { type: "hello"; token: string; since?: number }
  | { type: "steer"; text: string }
  | { type: "presence" };

/** relay → viewer */
export type ServerFrame =
  | { type: "welcome"; role: Role; scope: Scope; you: string; presence: RosterEntry[] }
  | { type: "event"; event: ChoirEvent }
  | { type: "presence"; roster: RosterEntry[] }
  | { type: "control"; control: ControlMessage }
  | { type: "error"; code: string; message: string };

/** Wire helpers so producers/consumers agree on encoding. */
export function encodeFrame(frame: ClientFrame | ServerFrame): string {
  return JSON.stringify(frame);
}

export function decodeFrame<T extends ClientFrame | ServerFrame>(raw: string): T {
  return JSON.parse(raw) as T;
}
