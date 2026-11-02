import { it, expect } from "vitest";
import WebSocket from "ws";
import { once } from "node:events";
import { createApp } from "../apps/server/src/app";
it("streams redacted authoritative snapshots, reconnects and rejects client writes", async () => {
  const { app, game } = await createApp({
    db: ":memory:",
    secret: "not-public",
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const url = `ws://127.0.0.1:${address.port}/ws`;
  let ws: WebSocket | undefined;
  try {
    ws = new WebSocket(url);
    const first = once(ws, "message");
    await once(ws, "open");
    const [raw] = await first;
    const initial = JSON.parse(String(raw));
    expect(initial.type).toBe("snapshot");
    expect(String(raw)).not.toContain("not-public");
    expect(initial.data.tick).toBe(0);
    game.reset(2, "beacon", true);
    const before = performance.now();
    const [next] = await once(ws, "message");
    expect(JSON.parse(String(next)).data.missionId).toBe("beacon");
    expect(performance.now() - before).toBeLessThan(250);
    const close = once(ws, "close");
    ws.send("reset");
    const [code] = await close;
    expect(code).toBe(1008);
    ws = new WebSocket(url);
    const fresh = once(ws, "message");
    await once(ws, "open");
    expect(JSON.parse(String((await fresh)[0])).data.seed).toBe(2);
  } finally {
    ws?.terminate();
    await app.close();
  }
});
