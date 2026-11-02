import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
const fakes = vi.hoisted(() => ({ fetch: vi.fn(), sockets: [] as unknown[] }));
vi.mock("undici", () => ({ fetch: fakes.fetch, EnvHttpProxyAgent: class {} }));
vi.mock("ws", () => ({
  default: class extends EventEmitter {
    constructor(public url: string) {
      super();
      fakes.sockets.push(this);
    }
    close() {
      this.emit("close");
    }
    terminate() {
      this.emit("close");
    }
  },
}));
import { Twitch } from "../apps/server/src/twitch";
type FakeSocket = EventEmitter & { url: string };
const config = {
  clientId: "client",
  clientSecret: "private-client-secret",
  redirect: "http://127.0.0.1:3000/auth/twitch/callback",
};
const tokens = {
  access_token: "private-access",
  refresh_token: "private-refresh",
  expires_in: 3600,
  scope: ["user:read:chat"],
};
const tick = async () => {
  await new Promise<void>((r) => setImmediate(r));
};
const emit = (ws: FakeSocket, type: string, payload: unknown) =>
  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        metadata: { message_type: type, message_id: "envelope" },
        payload,
      }),
    ),
  );
beforeEach(() => {
  fakes.sockets = [];
  fakes.fetch.mockReset();
  fakes.fetch.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes("/token")
        ? tokens
        : url.includes("/validate")
          ? {
              user_id: "broadcaster",
              client_id: "client",
              scopes: ["user:read:chat"],
            }
          : { data: [{ id: "sub" }] },
  }));
});
afterEach(() => {
  vi.useRealTimers();
});
it("validates OAuth state, uses only chat read scope, subscribes and normalizes notifications", async () => {
  const receive = vi.fn();
  const t = new Twitch(config, receive);
  const url = new URL(t.start());
  expect(url.searchParams.get("scope")).toBe("user:read:chat");
  expect(url.searchParams.has("code_challenge")).toBe(true);
  await t.callback(url.searchParams.get("state")!, "code");
  const ws = fakes.sockets[0] as FakeSocket;
  emit(ws, "session_welcome", {
    session: { id: "session", keepalive_timeout_seconds: 10 },
  });
  await tick();
  expect(t.status).toBe("connected");
  emit(ws, "notification", {
    subscription: {
      id: "sub",
      type: "channel.chat.message",
      condition: { broadcaster_user_id: "broadcaster", user_id: "broadcaster" },
    },
    event: {
      broadcaster_user_id: "broadcaster",
      chatter_user_id: "viewer",
      message_id: "msg",
      message: { text: "!vote 1" },
    },
  });
  await tick();
  expect(receive).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "twitch",
      messageId: "msg",
      userId: "viewer",
      text: "!vote 1",
    }),
  );
  emit(ws, "notification", {
    subscription: {
      id: "sub",
      type: "channel.chat.message",
      condition: { broadcaster_user_id: "other", user_id: "broadcaster" },
    },
    event: {
      broadcaster_user_id: "other",
      chatter_user_id: "viewer",
      message_id: "bad",
      message: { text: "!vote 1" },
    },
  });
  await tick();
  expect(receive).toHaveBeenCalledTimes(1);
  emit(ws, "session_reconnect", {
    session: {
      reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=approved",
    },
  });
  await tick();
  expect(fakes.sockets).toHaveLength(2);
  const next = fakes.sockets[1] as FakeSocket;
  emit(next, "session_welcome", {
    session: { id: "reconnect", keepalive_timeout_seconds: 10 },
  });
  await tick();
  expect(
    fakes.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/subscriptions"),
    ),
  ).toHaveLength(1);
  emit(next, "revocation", {});
  await tick();
  expect(t.status).toBe("reauthorization required");
  t.stop();
});
it("rejects invalid state, mismatched client and untrusted reconnect hosts", async () => {
  const t = new Twitch(config, vi.fn());
  t.start();
  await expect(t.callback("wrong", "code")).rejects.toThrow("state");
  expect(fakes.fetch).not.toHaveBeenCalled();
  const url = new URL(t.start());
  await t.callback(url.searchParams.get("state")!, "code");
  const ws = fakes.sockets[0] as FakeSocket;
  emit(ws, "session_reconnect", {
    session: { reconnect_url: "wss://attacker.invalid/steal" },
  });
  await tick();
  expect(t.status).toBe("reauthorization required");
  expect(fakes.sockets).toHaveLength(1);
  t.stop();
});
