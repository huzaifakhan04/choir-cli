export interface Env {
  /** Durable Object namespace — one instance per session (room). */
  SESSION: DurableObjectNamespace;
  /** HS256 secret used to sign/verify session tokens. */
  TOKEN_SIGNING_KEY: string;
  /** Single pre-shared credential that authorizes a host to open a room. */
  TEAM_KEY: string;
}
