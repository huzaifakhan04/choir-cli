import type { Role, Scope, TokenClaims } from "@choir/protocol";

/**
 * HS256 session tokens (a minimal JWT) built on Web Crypto so the exact same
 * code runs in the Cloudflare Workers runtime and in Node (tests). No accounts:
 * a token IS the credential, scoped to one session with a role + permission.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const base64urlFromString = (s: string) => base64urlFromBytes(enc.encode(s));
const base64urlToString = (s: string) => dec.decode(base64urlToBytes(s));

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SignInput {
  sid: string;
  role: Role;
  scope: Scope;
  name: string;
  /** Lifetime in seconds from now. */
  ttlSeconds: number;
  /** Writer epoch (0 for viewers / new hosts). */
  epoch?: number;
  /** Optional fixed token id; a random UUID is used if omitted. */
  jti?: string;
}

/** Sign a session token. Returns the compact token and the embedded claims. */
export async function signToken(
  input: SignInput,
  secret: string,
): Promise<{ token: string; claims: TokenClaims }> {
  const now = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    sid: input.sid,
    role: input.role,
    scope: input.scope,
    name: input.name,
    epoch: input.epoch ?? 0,
    iat: now,
    exp: now + input.ttlSeconds,
    jti: input.jti ?? crypto.randomUUID(),
  };
  const headerB64 = base64urlFromString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadB64 = base64urlFromString(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(signingInput)));
  return { token: `${signingInput}.${base64urlFromBytes(sig)}`, claims };
}

/** Verify a session token's signature and expiry. Throws on any failure. */
export async function verifyToken(token: string, secret: string): Promise<TokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(sigB64),
    enc.encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("invalid signature");
  const claims = JSON.parse(base64urlToString(payloadB64)) as TokenClaims;
  if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("token expired");
  }
  return claims;
}
