import { randomBytes, createHash } from "node:crypto";
import WebSocket from "ws";
import { z } from "zod";
import { fetch as proxyFetch, EnvHttpProxyAgent } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";
const dispatcher = new EnvHttpProxyAgent();
const request = (url: string, options: Parameters<typeof proxyFetch>[1] = {}) =>
  proxyFetch(url, { ...options, dispatcher });
import type { ChatEvent } from "../../../packages/domain/src/index.js";
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.array(z.string()),
});
const notification = z.object({
  subscription: z.object({
    id: z.string(),
    type: z.literal("channel.chat.message"),
    condition: z.object({
      broadcaster_user_id: z.string(),
      user_id: z.string(),
    }),
  }),
  event: z.object({
    broadcaster_user_id: z.string(),
    chatter_user_id: z.string(),
    message_id: z.string(),
    message: z.object({ text: z.string().max(500) }),
  }),
});
export class Twitch {
  private pending:
    { state: string; verifier: string; expires: number } | undefined;
  private access = "";
  private refresh = "";
  private user = "";
  private socket: WebSocket | undefined;
  private timer: NodeJS.Timeout | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private attempt = 0;
  private sockets = new Set<WebSocket>();
  private subscriptionId = "";
  private stopped = true;
  status = "offline";
  constructor(
    private config: {
      clientId: string;
      clientSecret: string;
      redirect: string;
    },
    private receive: (e: ChatEvent) => void,
  ) {}
  start() {
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.pending = { state, verifier, expires: Date.now() + 600000 };
    return (
      "https://id.twitch.tv/oauth2/authorize?" +
      new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: this.config.redirect,
        response_type: "code",
        scope: "user:read:chat",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      })
    );
  }
  async callback(state: string, code: string) {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending || pending.state !== state || Date.now() > pending.expires)
      throw new Error("Invalid or expired OAuth state");
    this.stop();
    try {
      await this.exchange({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirect,
        code_verifier: pending.verifier,
      });
      const valid = await request("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${this.access}` },
        signal: AbortSignal.timeout(10000),
      });
      const v = z
        .object({
          user_id: z.string(),
          client_id: z.string(),
          scopes: z.array(z.string()),
        })
        .parse(await valid.json());
      if (
        !valid.ok ||
        v.client_id !== this.config.clientId ||
        !v.scopes.includes("user:read:chat")
      ) {
        this.stop();
        throw new Error("Twitch authorization rejected");
      }
      this.user = v.user_id;
      this.stopped = false;
      this.connect();
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  private async exchange(fields: Record<string, string>) {
    const r = await request("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        ...fields,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      this.stop();
      throw new Error("Twitch authorization requires renewal");
    }
    const token = tokenSchema.parse(await r.json());
    if (!token.scope.includes("user:read:chat")) {
      this.stop();
      throw new Error("Missing chat read scope");
    }
    this.access = token.access_token;
    this.refresh = token.refresh_token;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(
      () => {
        void this.exchange({
          grant_type: "refresh_token",
          refresh_token: this.refresh,
        }).catch(() => this.stop());
      },
      Math.max(1000, (token.expires_in - 120) * 1000),
    );
  }
  private connect(url = "wss://eventsub.wss.twitch.tv/ws", handoff = false) {
    if (this.stopped) return;
    const u = new URL(url);
    if (
      u.protocol !== "wss:" ||
      u.hostname !== "eventsub.wss.twitch.tv" ||
      u.port
    ) {
      this.stop();
      return;
    }
    const previous = this.socket;
    const ws = new WebSocket(url, {
      maxPayload: 64000,
      agent: process.env.HTTPS_PROXY
        ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
        : undefined,
    });
    this.sockets.add(ws);
    if (!handoff) this.socket = ws;
    this.status = "connecting";
    ws.on("message", (raw) => {
      void (async () => {
        const msg = z
          .object({
            metadata: z.object({
              message_type: z.string(),
              message_id: z.string(),
            }),
            payload: z.unknown(),
          })
          .parse(JSON.parse(raw.toString()));
        if (msg.metadata.message_type === "session_welcome") {
          const p = z
            .object({
              session: z.object({
                id: z.string(),
                keepalive_timeout_seconds: z.number().nullable(),
              }),
            })
            .parse(msg.payload);
          this.socket = ws;
          this.attempt = 0;
          this.status = "connected";
          if (handoff) previous?.close();
          const arm = () => {
            clearTimeout(this.watchdog);
            this.watchdog = setTimeout(
              () => ws.terminate(),
              ((p.session.keepalive_timeout_seconds || 10) + 5) * 1000,
            );
          };
          arm();
          ws.on("message", arm);
          if (!handoff) {
            const res = await request(
              "https://api.twitch.tv/helix/eventsub/subscriptions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${this.access}`,
                  "Client-Id": this.config.clientId,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  type: "channel.chat.message",
                  version: "1",
                  condition: {
                    broadcaster_user_id: this.user,
                    user_id: this.user,
                  },
                  transport: { method: "websocket", session_id: p.session.id },
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            if (res.status === 401 || res.status === 403) {
              this.stop();
              return;
            }
            if (!res.ok) throw new Error("Subscription rejected");
            const created = z
              .object({ data: z.array(z.object({ id: z.string() })).min(1) })
              .parse(await res.json());
            this.subscriptionId = created.data[0].id;
          }
        } else if (msg.metadata.message_type === "session_reconnect") {
          const p = z
            .object({ session: z.object({ reconnect_url: z.string() }) })
            .parse(msg.payload);
          this.connect(p.session.reconnect_url, true);
        } else if (msg.metadata.message_type === "revocation") {
          this.stop();
        } else if (msg.metadata.message_type === "notification") {
          const p = notification.parse(msg.payload);
          if (
            p.subscription.id !== this.subscriptionId ||
            p.subscription.condition.user_id !== this.user ||
            p.subscription.condition.broadcaster_user_id !== this.user ||
            p.event.broadcaster_user_id !== this.user
          )
            return;
          this.receive({
            source: "twitch",
            messageId: p.event.message_id,
            channelId: p.event.broadcaster_user_id,
            userId: p.event.chatter_user_id,
            text: p.event.message.text,
            receivedAtMs: Date.now(),
          });
        }
      })().catch(() => {
        this.status = "degraded";
        ws.close();
      });
    });
    ws.on("error", () => {
      this.status = "degraded";
    });
    ws.on("close", () => {
      this.sockets.delete(ws);
      if (this.stopped) return;
      if (this.socket !== ws) {
        if (handoff) {
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.connect(url, true), 1000);
        }
        return;
      }
      clearTimeout(this.watchdog);
      this.status = "degraded";
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)) +
          Math.random() * 500,
      );
    });
  }
  stop() {
    this.stopped = true;
    this.status = "reauthorization required";
    clearTimeout(this.timer);
    clearTimeout(this.refreshTimer);
    clearTimeout(this.watchdog);
    for (const socket of this.sockets) socket.close();
    this.sockets.clear();
    this.subscriptionId = "";
    this.access = "";
    this.refresh = "";
  }
}
