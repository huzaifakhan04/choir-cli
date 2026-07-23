/**
 * End-to-end smoke test for the relay against a running `wrangler dev`.
 * Exercises the full watch path: register -> invite -> redeem -> post events
 * -> WS replay of history -> live tail. Uses Node's global fetch + WebSocket.
 *
 *   (in relay/)  npx wrangler dev --port 8787
 *   (elsewhere)  node scripts/smoke.mjs
 */
const BASE = process.env.CHOIR_RELAY_URL || "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");
const TEAM_KEY = process.env.CHOIR_TEAM_KEY || "dev-team-key";

const room = "smoke" + Math.random().toString(36).slice(2, 8);
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "  ✅" : "  ❌"} ${label}`);
  if (!cond) failures++;
}

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log(`\nRelay smoke test (room ${room}) against ${BASE}\n`);

  // 1. register (host)
  const reg = await post(`/sessions/${room}`, { name: "alice" }, TEAM_KEY);
  check("register returns 200 + host token", reg.status === 200 && !!reg.json?.token);
  const hostToken = reg.json?.token;

  // 1b. register rejects a bad team key
  const badReg = await post(`/sessions/${room}x`, { name: "mallory" }, "wrong-key");
  check("register rejects wrong team key (401)", badReg.status === 401);

  // 2. invite
  const inv = await post(`/sessions/${room}/invites`, { scope: "view" }, hostToken);
  check("invite returns a code", inv.status === 200 && typeof inv.json?.code === "string");
  const inviteId = inv.json?.code?.split("-")[1];

  // 3. redeem -> viewer token
  const red = await post(`/sessions/${room}/redeem`, { inviteId, name: "bob" }, null);
  check("redeem returns a viewer token", red.status === 200 && !!red.json?.token);
  const viewerToken = red.json?.token;

  // 4. host posts two events (before anyone is watching)
  await post(
    `/sessions/${room}/events`,
    [
      { kind: "prompt", actor: "alice", payload: { text: "fix the bug" } },
      { kind: "tool_call", actor: "agent", payload: { tool: "Bash", summary: "npm test" } },
    ],
    hostToken,
  );

  // 5. late-joiner opens WS, says hello since 0 -> should replay both events
  const events = [];
  let welcome = null;
  const ws = new WebSocket(`${WS_BASE}/sessions/${room}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () =>
      ws.send(JSON.stringify({ type: "hello", token: viewerToken, since: 0 })),
    );
    ws.addEventListener("message", (ev) => {
      const frame = JSON.parse(ev.data);
      if (frame.type === "welcome") welcome = frame;
      if (frame.type === "event") events.push(frame.event);
    });
    ws.addEventListener("error", reject);
    setTimeout(resolve, 800);
  });
  check("viewer got welcome with presence", !!welcome && Array.isArray(welcome.presence));
  check("welcome roster includes host alice", !!welcome?.presence?.some((m) => m.name === "alice" && m.isWriter));
  // History = session_start (from register) + the two posted events, in order.
  check(
    "replayed full history in order (session_start, prompt, tool_call)",
    events.length === 3 &&
      events[0].kind === "session_start" &&
      events[1].kind === "prompt" &&
      events[2].kind === "tool_call",
  );

  // 6. host posts a live event -> should arrive on the open socket
  const liveBefore = events.length;
  await post(
    `/sessions/${room}/events`,
    { kind: "assistant_text", actor: "agent", payload: { text: "on it" } },
    hostToken,
  );
  await new Promise((r) => setTimeout(r, 500));
  check("live event tailed to the open viewer", events.length === liveBefore + 1);
  check("live event is the assistant_text", events[events.length - 1]?.kind === "assistant_text");

  // 7. bad token is rejected
  const badWs = new WebSocket(`${WS_BASE}/sessions/${room}`);
  const rejected = await new Promise((resolve) => {
    let sawError = false;
    badWs.addEventListener("open", () => badWs.send(JSON.stringify({ type: "hello", token: "garbage", since: 0 })));
    badWs.addEventListener("message", (ev) => {
      if (JSON.parse(ev.data).type === "error") sawError = true;
    });
    badWs.addEventListener("close", () => resolve(sawError));
    setTimeout(() => resolve(sawError), 1200);
  });
  check("WS with a bad token is rejected", rejected === true);

  try { ws.close(); } catch {}
  console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILED"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
