import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { WebSocketServer, WebSocket } from "ws";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { inputSchema, missionId } from "../../../packages/domain/src/index.js";
import { Game } from "./game.js";
import { Store } from "./storage.js";
import { Twitch } from "./twitch.js";
export async function createApp(
  options: {
    secret?: string;
    db?: string;
    origin?: string;
    demo?: boolean;
    production?: boolean;
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 4096 });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: 1000 });
  const secret = options.secret || randomBytes(32).toString("base64url");
  const origin = options.origin || "http://127.0.0.1:3000";
  const game = new Game();
  game.demo = !!options.demo;
  const store = new Store(options.db);
  const sessions = new Map<string, { csrf: string; expires: number }>();
  const queue: unknown[] = [];
  let sequence = 0;
  let lastInput = 0;
  const twitch = new Twitch(
    {
      clientId: process.env.TWITCH_CLIENT_ID || "",
      clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
      redirect:
        process.env.TWITCH_REDIRECT_URI || `${origin}/auth/twitch/callback`,
    },
    (e) => {
      if (queue.length < 1000) queue.push(e);
    },
  );
  game.onEvent = (e) => store.event(game.sessionId, e);
  for (const row of store.db.prepare("SELECT id FROM blocked_users").all() as {
    id: string;
  }[])
    game.ingress.blocked.add(row.id);
  const safeEqual = (a: string, b: string) =>
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const authenticate = (req: {
    cookies: Record<string, string | undefined>;
  }) => {
    const s = sessions.get(req.cookies.operator || "");
    return s && s.expires > Date.now() ? s : undefined;
  };
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (path.startsWith("/api/admin/") || path === "/auth/twitch/start") {
      const s = authenticate(req);
      if (!s) return reply.code(401).send({ error: "Operator login required" });
      if (
        req.method !== "GET" &&
        (req.headers.origin !== origin ||
          !safeEqual(String(req.headers["x-csrf-token"] || ""), s.csrf))
      )
        return reply.code(403).send({ error: "Invalid origin or CSRF token" });
    }
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    reply.header(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' ${options.production ? "" : "'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${origin.replace(/^http/, "ws")}; object-src 'none'; frame-ancestors 'self'`,
    );
    return payload;
  });
  app.setErrorHandler((error, _req, reply) => {
    const httpStatus = (error as { statusCode?: number }).statusCode;
    const status =
      error instanceof z.ZodError
        ? 400
        : typeof httpStatus === "number" &&
            httpStatus >= 400 &&
            httpStatus < 500
          ? httpStatus
          : 500;
    reply.code(status).send({
      error: error instanceof z.ZodError ? "Invalid request" : "Request failed",
    });
  });
  app.get("/healthz", async () => ({ ok: true, simulation: game.status }));
  app.get("/api/session", async () => game.snapshot());
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 5, timeWindow: 60000 } } },
    async (req, reply) => {
      if (req.headers.origin !== origin)
        return reply.code(403).send({ error: "Invalid origin" });
      const body = z
        .object({ secret: z.string().min(1).max(200) })
        .strict()
        .parse(req.body);
      if (!safeEqual(body.secret, secret))
        return reply.code(401).send({ error: "Invalid operator key" });
      if (sessions.size >= 10) sessions.clear();
      const id = randomBytes(32).toString("hex");
      const csrf = randomBytes(32).toString("hex");
      sessions.set(id, { csrf, expires: Date.now() + 12 * 3600000 });
      reply.setCookie("operator", id, {
        httpOnly: true,
        sameSite: "strict",
        secure: origin.startsWith("https:"),
        path: "/",
        maxAge: 43200,
      });
      return { csrf };
    },
  );
  app.get("/api/admin/me", async (req) => ({
    csrf: authenticate(req)!.csrf,
    twitchConfigured: !!(
      process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET
    ),
  }));
  const begin = (seed = game.rules.seed, mission = game.mission) => {
    queue.length = 0;
    game.reset(seed, mission, true);
    store.session(game.sessionId, seed, mission);
  };
  for (const action of ["start", "pause", "resume", "reset", "end"] as const)
    app.post(`/api/admin/session/${action}`, async () => {
      if (action === "start" || action === "reset") begin();
      if (action === "pause" && game.status === "running") {
        game.setInput({ left: false, right: false, jump: false });
        game.status = "paused";
      }
      if (action === "resume" && game.status === "paused")
        game.status = "running";
      if (action === "end") {
        game.status = "ended";
        game.rules.phase = "complete";
        queue.length = 0;
      }
      return { ok: true };
    });
  app.post("/api/admin/mission/select", async (req) => {
    const b = z
      .object({
        mission: missionId,
        seed: z.number().int().min(0).max(4294967295).optional(),
      })
      .strict()
      .parse(req.body);
    begin(b.seed ?? game.rules.seed, b.mission);
    return { ok: true };
  });
  app.post("/api/admin/stabilize", async () => {
    game.stabilize();
    return { ok: true };
  });
  app.post("/api/admin/input", async (req) => {
    lastInput = performance.now();
    game.setInput(inputSchema.parse(req.body));
    return { ok: true };
  });
  app.post("/api/admin/demo/event", async (req, reply) => {
    if (!game.demo)
      return reply.code(409).send({ error: "Enable demo mode first" });
    const b = z
      .object({ user: z.string().min(1).max(64), text: z.string().max(500) })
      .strict()
      .parse(req.body);
    const accepted = game.chat(
      {
        source: "demo",
        messageId: `manual-${sequence++}`,
        channelId: "local",
        userId: b.user,
        text: b.text,
        receivedAtMs: Date.now(),
      },
      Date.now(),
    );
    return { accepted };
  });
  app.post("/api/admin/demo", async (req) => {
    const b = z
      .object({ enabled: z.boolean(), showcase: z.boolean().optional() })
      .strict()
      .parse(req.body);
    game.demo = b.enabled;
    game.demoScript = b.enabled && !!b.showcase;
    if (game.demoScript) begin();
    return { ok: true };
  });
  app.post("/api/admin/moderation", async (req) => {
    const b = z
      .object({
        muted: z.boolean().optional(),
        user: z.string().min(1).max(128).optional(),
        blocked: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    if (b.muted !== undefined) game.ingress.muted = b.muted;
    if (b.user && b.blocked !== undefined) {
      if (b.blocked) game.ingress.blocked.add(b.user);
      else game.ingress.blocked.delete(b.user);
      store.block(b.user, b.blocked);
    }
    return { ok: true };
  });
  app.get("/api/admin/replay", async () => ({
    build: "0.1.0",
    status: game.status,
    timings: game.rules.timings,
    seed: game.rules.seed,
    mission: game.mission,
    tick: game.rules.tick,
    events: store.db
      .prepare(
        "SELECT tick,type,data FROM domain_events WHERE session=? ORDER BY rowid",
      )
      .all(game.sessionId)
      .map((row) => {
        const r = row as { tick: number; type: string; data: string };
        return { ...r, data: JSON.parse(r.data) as unknown };
      }),
    stateHash: game.snapshot().stateHash,
  }));
  app.post("/api/admin/data/delete", async () => {
    store.delete();
    game.ingress.blocked.clear();
    game.reset();
    queue.length = 0;
    return { ok: true };
  });
  app.get("/auth/twitch/start", async (_req, reply) => {
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET)
      return reply.code(409).send({
        error: "Configure Twitch application credentials on the backend",
      });
    const redirect = new URL(
      process.env.TWITCH_REDIRECT_URI || `${origin}/auth/twitch/callback`,
    );
    if (
      redirect.origin !== origin ||
      redirect.pathname !== "/auth/twitch/callback"
    )
      return reply.code(409).send({
        error: "Redirect must match the local origin and callback path",
      });
    return reply.redirect(twitch.start());
  });
  app.get("/auth/twitch/callback", async (req, reply) => {
    if (!authenticate(req))
      return reply.code(401).send({ error: "Operator session required" });
    const b = z
      .object({ state: z.string().max(128), code: z.string().max(1024) })
      .parse(req.query);
    await twitch.callback(b.state, b.code);
    return reply.redirect("/");
  });
  app.post("/api/admin/twitch/disconnect", async () => {
    twitch.stop();
    return { ok: true };
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  app.server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/ws" ||
      (req.headers.origin && req.headers.origin !== origin) ||
      wss.clients.size >= 50
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: "snapshot", data: game.snapshot() }));
      ws.on("message", () => ws.close(1008, "Read only"));
    });
  });
  let last = performance.now(),
    accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min(200, now - last);
    last = now;
    let catchup = 0;
    if (
      now - lastInput > 500 &&
      (game.input.left || game.input.right || game.input.jump)
    )
      game.setInput({ left: false, right: false, jump: false });
    while (accumulator >= 1000 / 30 && catchup++ < 5) {
      for (let i = 0; i < 100 && queue.length; i++)
        game.chat(queue.shift(), Date.now());
      game.step();
      accumulator -= 1000 / 30;
    }
    if (catchup >= 5) accumulator = 0;
    game.twitch = twitch.status;
    if (wss.clients.size) {
      const data = JSON.stringify({ type: "snapshot", data: game.snapshot() });
      for (const ws of wss.clients)
        if (ws.readyState === WebSocket.OPEN) {
          if (ws.bufferedAmount > 1024 * 1024) ws.terminate();
          else ws.send(data);
        }
    }
  }, 1000 / 30);
  app.addHook("onClose", async () => {
    clearInterval(timer);
    twitch.stop();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    store.db.close();
  });
  return { app, game, secret, store };
}
