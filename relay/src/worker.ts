import type { Env } from "./env";
import { SessionDO } from "./session-do";

export { SessionDO };

/**
 * Thin router: every request is scoped to a session at /sessions/:id/*.
 * We map the session id to its Durable Object and forward — the DO owns all
 * state, auth, and the WebSocket hub.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("choir relay ok\n", { status: 200 });
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "sessions" || !parts[1]) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const roomId = parts[1];
    const id = env.SESSION.idFromName(roomId);
    const stub = env.SESSION.get(id);
    return stub.fetch(req);
  },
};
