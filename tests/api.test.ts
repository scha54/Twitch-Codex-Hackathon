import { it, expect } from "vitest";
import { createApp } from "../apps/server/src/app";
it("protects operator actions and redacts public state while serving demo controls", async () => {
  const { app, game } = await createApp({
    secret: "test-secret",
    db: ":memory:",
    demo: true,
  });
  try {
    expect((await app.inject("/healthz")).statusCode).toBe(200);
    expect(
      (await app.inject("/auth/twitch/start?attempt=bypass")).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "POST", url: "/api/admin/session/reset" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin: "http://evil.test" },
          payload: { secret: "test-secret" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin: "http://127.0.0.1:3000" },
          payload: { secret: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: { secret: "test-secret" },
    });
    const cookie = login.cookies[0].name + "=" + login.cookies[0].value;
    const headers = {
      cookie,
      origin: "http://127.0.0.1:3000",
      "x-csrf-token": login.json().csrf,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/session/start",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(403);
    const post = (url: string, payload: unknown = {}) =>
      app.inject({
        method: "POST",
        url: "/api/admin/" + url,
        headers,
        payload: payload as object,
      });
    expect((await post("session/start")).statusCode).toBe(200);
    expect(game.status).toBe("running");
    expect(
      (
        await post("demo/event", { user: "u", text: "!glitch moon gravity" })
      ).json().accepted,
    ).toBe(true);
    expect(
      (
        await post("demo/event", { user: "u", text: "!glitch super bounce" })
      ).json().accepted,
    ).toBe(false);
    expect(
      (await post("input", { left: false, right: true, jump: false }))
        .statusCode,
    ).toBe(200);
    await post("session/pause");
    expect(game.status).toBe("paused");
    await post("session/resume");
    expect(game.status).toBe("running");
    expect(
      (await post("mission/select", { mission: "invalid" })).statusCode,
    ).toBe(400);
    await post("mission/select", { mission: "rescue", seed: 42 });
    expect(game.mission).toBe("rescue");
    await post("moderation", { user: "blocked", blocked: true, muted: true });
    expect(game.ingress.muted).toBe(true);
    expect(game.ingress.blocked.has("blocked")).toBe(true);
    await post("stabilize");
    await post("session/reset");
    expect(game.rules.chaos).toBe(0);
    await post("session/end");
    expect(game.status).toBe("ended");
    await post("demo", { enabled: false });
    expect(
      (await post("demo/event", { user: "u", text: "!vote 1" })).statusCode,
    ).toBe(409);
    const state = (await app.inject("/api/session")).body;
    expect(state).not.toContain("test-secret");
    expect(state).not.toContain("blocked");
    expect(state).not.toContain("votesByUser");
    await post("data/delete");
    expect(game.status).toBe("idle");
  } finally {
    await app.close();
  }
});
