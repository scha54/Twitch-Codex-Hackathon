import { it, expect } from "vitest";
import Matter from "matter-js";
import { Game, applyRecordedEvent } from "../apps/server/src/game";
import { snapshotSchema } from "../packages/domain/src/index";
import { Store } from "../apps/server/src/storage";
import type { ChatEvent } from "../packages/domain/src/index";
it("replays same seed, normalized events and input to identical state hashes", () => {
  const a = new Game(42);
  a.demo = true;
  a.demoScript = true;
  a.reset(42, "delivery", true);
  for (let t = 0; t < 1800; t++) {
    if (t === 50) a.setInput({ left: false, right: true, jump: false });
    if (t === 140) a.setInput({ left: false, right: false, jump: false });
    if (t === 180) a.stabilize();
    a.step();
  }
  const b = new Game(42);
  b.rules.timings = { propose: 150, vote: 90, cooldown: 60 };
  b.reset(42, "delivery", true);
  b.rules.timings = { propose: 150, vote: 90, cooldown: 60 };
  b.rules.endTick = 150;
  for (let t = 0; t < 1800; t++) {
    for (const e of a.events.filter((e) => e.tick === t)) {
      if (e.type === "chat") b.chat(e.data, (t * 1000) / 30);
      if (e.type === "input") b.setInput(e.data as typeof b.input);
      if (e.type === "stabilize") b.stabilize();
    }
    b.step();
  }
  expect(b.snapshot().stateHash).toBe(a.snapshot().stateHash);
});
it("exports pseudonymous events without changing replay hash", () => {
  const store = new Store(":memory:");
  const a = new Game(1);
  a.reset(1, "delivery", true);
  a.onEvent = (e) => store.event(a.sessionId, e);
  a.chat(
    {
      source: "demo",
      messageId: "original",
      userId: "private-viewer",
      channelId: "private-channel",
      text: "!glitch moon gravity",
      receivedAtMs: 0,
    },
    0,
  );
  for (let t = 0; t < 800; t++) a.step();
  const rows = store.db.prepare("SELECT * FROM domain_events").all() as {
    data: string;
    tick: number;
    type: string;
  }[];
  expect(JSON.stringify(rows)).not.toContain("private-viewer");
  const b = new Game(1);
  b.reset(1, "delivery", true);
  for (let t = 0; t < 800; t++) {
    for (const e of rows.filter((e) => e.tick === t))
      b.chat(JSON.parse(e.data) as ChatEvent, (t * 1000) / 30);
    b.step();
  }
  expect(a.snapshot().stateHash).toBe(b.snapshot().stateHash);
  store.delete();
  expect(
    store.db.prepare("SELECT COUNT(*) AS n FROM domain_events").get(),
  ).toEqual({ n: 0 });
  store.db.close();
});
it("all missions complete through actual movement and physics", () => {
  for (const mission of ["delivery", "rescue", "beacon"] as const) {
    const g = new Game();
    g.reset(5, mission, true);
    g.setInput({ left: false, right: true, jump: false });
    for (let t = 0; t < 600 && g.status === "running"; t++) g.step();
    expect(g.status, mission).toBe("success");
  }
});
it("pause, reset, timeout, checkpoint, collapse and fault behavior", () => {
  const g = new Game();
  g.reset(7, "delivery", true);
  g.rules.activate("gravity-up");
  g.status = "paused";
  const s = g.snapshot();
  for (let i = 0; i < 50; i++) g.step();
  expect(g.snapshot().stateHash).toBe(s.stateHash);
  g.status = "running";
  Matter.Body.setPosition(g.player, { x: 100, y: 900 });
  g.step();
  expect(g.player.position.y).toBeLessThan(720);
  g.stabilize();
  expect(g.rules.active).toEqual([]);
  g.rules.collapseCooldown = 0;
  g.rules.chaos = 100;
  g.step();
  expect(g.snapshot().collapse).toBe(true);
  g.rules.tick = 5399;
  g.step();
  expect(g.status).toBe("timeout");
  g.reset();
  expect(g.status).toBe("idle");
  expect(g.events).toEqual([]);
  g.status = "running";
  Matter.Body.setPosition(g.player, { x: NaN, y: NaN });
  g.step();
  expect(g.status).toBe("fault");
  expect(snapshotSchema.safeParse(g.snapshot()).success).toBe(true);
});
it("handles sustained nominal ingress for five simulated minutes with bounded caches", () => {
  const g = new Game();
  g.reset(99, "delivery", true);
  let accepted = 0;
  const latencies: number[] = [];
  for (let n = 0; n < 6000; n++) {
    const now = n * 50;
    const before = performance.now();
    if (
      g.chat(
        {
          source: "demo",
          messageId: String(n),
          channelId: "local",
          userId: "viewer-" + n,
          text: n % 2 ? "!vote 1" : "!glitch moon gravity",
          receivedAtMs: now,
        },
        now,
      )
    )
      accepted++;
    latencies.push(performance.now() - before);
    if (n % 2 === 0 && g.rules.tick < 5399) {
      g.step();
      g.step();
      g.step();
    }
  }
  expect(accepted).toBeGreaterThan(0);
  expect(g.ingress.seen.size).toBeLessThanOrEqual(10000);
  expect(
    latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)],
  ).toBeLessThan(500);
});
it("three-minute showcase demonstrates all four combos and bounded collapse through chat", () => {
  const g = new Game(2026);
  g.demo = true;
  g.demoScript = true;
  g.reset(2026, "delivery", true);
  const names = new Set<string>();
  let collapse = false;
  for (let i = 0; i < 5400; i++) {
    g.step();
    for (const name of g.snapshot().combos) names.add(name);
    collapse ||= g.snapshot().collapse;
    expect(g.rules.chaos).toBeLessThanOrEqual(100);
  }
  expect([...names].sort()).toEqual(
    [
      "Crystal Catapult",
      "Forest Migration",
      "Lunar Pinball",
      "Sideways Slip",
    ].sort(),
  );
  expect(collapse).toBe(true);
  expect(g.status).toBe("timeout");
});

it("replays accepted commands independent of paused wall-clock rate-limit refill", () => {
  const a = new Game(8);
  a.reset(8, "delivery", true);
  a.chat(
    {
      source: "demo",
      messageId: "p1",
      channelId: "local",
      userId: "a",
      text: "!glitch moon gravity",
      receivedAtMs: 0,
    },
    0,
  );
  a.chat(
    {
      source: "demo",
      messageId: "p2",
      channelId: "local",
      userId: "b",
      text: "!glitch super bounce",
      receivedAtMs: 0,
    },
    0,
  );
  while (a.rules.tick < 450) a.step();
  for (let i = 0; i < 4; i++)
    expect(
      a.chat(
        {
          source: "demo",
          messageId: "v" + i,
          channelId: "local",
          userId: "voter",
          text: i === 3 ? "!vote 2" : "!vote 1",
          receivedAtMs: i === 3 ? 10000 : 0,
        },
        i === 3 ? 10000 : 0,
      ),
    ).toBe(true);
  const b = new Game(8);
  b.reset(8, "delivery", true);
  for (let t = 0; t <= 450; t++) {
    for (const event of a.events.filter((e) => e.tick === t))
      applyRecordedEvent(b, event);
    if (t < 450) b.step();
  }
  expect(b.snapshot().stateHash).toBe(a.snapshot().stateHash);
});
