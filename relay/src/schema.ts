/**
 * SQLite schema for a session's Durable Object. Each DO owns exactly one
 * session (room): its append-only event log (the canonical transcript), its
 * steer queue, its roster, and its invites. The log's `seq` is the replay
 * cursor a late-joiner uses to catch up, then tail live.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS session (
  id           TEXT PRIMARY KEY,
  host_actor   TEXT,
  writer_epoch INTEGER NOT NULL DEFAULT 0,
  paused       INTEGER NOT NULL DEFAULT 0,
  created_ts   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  actor   TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS steers (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  actor  TEXT NOT NULL,
  text   TEXT NOT NULL,
  scope  TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'   -- queued | approved | injected | rejected
);

CREATE TABLE IF NOT EXISTS members (
  jti       TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL,
  scope     TEXT NOT NULL,
  joined_ts INTEGER NOT NULL,
  revoked   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invites (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  exp        INTEGER NOT NULL,
  created_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS control_log (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  action TEXT NOT NULL,
  data   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  from_actor TEXT,
  to_actor   TEXT,
  bundle     TEXT
);
`;

export interface SessionRow {
  id: string;
  host_actor: string | null;
  writer_epoch: number;
  paused: number;
  created_ts: number;
}

export interface EventRow {
  seq: number;
  ts: number;
  kind: string;
  actor: string;
  payload: string;
}

export interface SteerRow {
  id: number;
  ts: number;
  actor: string;
  text: string;
  scope: string;
  status: string;
}

export interface MemberRow {
  jti: string;
  name: string;
  role: string;
  scope: string;
  joined_ts: number;
  revoked: number;
}

export interface InviteRow {
  id: string;
  scope: string;
  exp: number;
  created_ts: number;
}
