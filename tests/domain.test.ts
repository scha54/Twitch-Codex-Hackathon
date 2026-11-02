import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  Coordinator,
  Ingress,
  parseCommand,
  ids,
  catalog,
  compose,
  compatible,
  combos,
  chatSchema,
  snapshotSchema,
} from "../packages/domain/src/index";
const event = (id: string, text = "!glitch moon gravity", user = id) => ({
  source: "demo",
  messageId: id,
  channelId: "local",
  userId: user,
  text,
  receivedAtMs: 0,
});
describe("safe command parser", () => {
  it("recognizes every alias and votes", () => {
    for (const id of ids) {
      expect(parseCommand(" !GLITCH " + id.replaceAll("-", " ") + " ")).toEqual(
        { type: "propose", id },
      );
      expect(parseCommand("!glitch " + id)).toEqual({ type: "propose", id });
    }
    for (let i = 1; i <= 3; i++)
      expect(parseCommand("!vote " + i)).toEqual({ type: "vote", option: i });
  });
  it("rejects malformed and arbitrary executable text", () => {
    for (const s of [
      "!vote 0",
      "!vote 4",
      "!vote 1 x",
      "!glitch eval(1)",
      "!glitch",
      "hello",
      "!glitch __proto__",
    ])
      expect(parseCommand(s)).toBeNull();
    fc.assert(
      fc.property(fc.string(), (s) => {
        const c = parseCommand(s);
        if (c?.type === "propose") expect(ids).toContain(c.id);
      }),
    );
  });
});
describe("rules, votes and chaos", () => {
  it("has bounded definitions and stable recomposition", () => {
    for (const id of ids) {
      expect(catalog[id].weight).toBeLessThanOrEqual(20);
      const a = { id, activatedTick: 0, expiresTick: 100 };
      expect(compatible(id, [a])).toBe(false);
      expect(compose([a]).time).toBeGreaterThan(0);
      expect(compatible("moon-gravity", [{ ...a, id: "gravity-left" }])).toBe(
        false,
      );
    }
    expect(compose([])).toEqual({
      gx: 0,
      gy: 1,
      restitution: 0.05,
      friction: 0.12,
      speed: 1,
      time: 1,
      platforms: false,
      trees: false,
      magnetic: false,
    });
  });
  it("composes independent of input order and recognizes four combos", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom(...ids)), (list) => {
        const rules = list.map((id) => ({
          id,
          activatedTick: 0,
          expiresTick: 900,
        }));
        expect(compose(rules)).toEqual(compose([...rules].reverse()));
        const p = compose(rules);
        expect(Math.abs(p.gx)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.gy)).toBeLessThanOrEqual(1);
        expect(p.restitution).toBeLessThanOrEqual(1);
      }),
    );
    const rule = (id: (typeof ids)[number]) => ({
      id,
      activatedTick: 0,
      expiresTick: 100,
    });
    expect(
      combos(
        [
          "moon-gravity",
          "super-bounce",
          "magnetic-crystal",
          "walking-trees",
          "moving-platforms",
        ].map((id) => rule(id as (typeof ids)[number])),
      ),
    ).toEqual(["Lunar Pinball", "Forest Migration", "Crystal Catapult"]);
    expect(combos([rule("gravity-left"), rule("slippery-floor")])).toEqual([
      "Sideways Slip",
    ]);
  });
  it("runs phase boundaries, one proposal, mutable vote, expiration and new round", () => {
    const c = new Coordinator(7);
    expect(c.command("u", { type: "vote", option: 1 })).toBe(false);
    c.start();
    expect(c.command("a", { type: "propose", id: "moon-gravity" })).toBe(true);
    expect(c.command("a", { type: "propose", id: "super-bounce" })).toBe(false);
    c.command("b", { type: "propose", id: "super-bounce" });
    for (let i = 0; i < 450; i++) c.advance();
    expect(c.phase).toBe("vote");
    expect(c.candidates).toHaveLength(2);
    expect(c.command("u", { type: "vote", option: 1 })).toBe(true);
    expect(c.command("u", { type: "vote", option: 2 })).toBe(true);
    expect(c.votes.size).toBe(1);
    expect(c.command("u", { type: "vote", option: 3 })).toBe(false);
    const winner = c.candidates[1];
    for (let i = 0; i < 300; i++) c.advance();
    expect(c.active[0].id).toBe(winner);
    expect(c.activate(winner)).toBe(false);
    for (let i = 0; i < 150; i++) c.advance();
    expect(c.phase).toBe("propose");
    expect(c.proposals.size).toBe(0);
    while (c.tick < 1300) c.advance();
    expect(c.active).toHaveLength(0);
  });
  it("uses seeded ties deterministically and skips incompatible winners", () => {
    const run = () => {
      const c = new Coordinator(9);
      c.start();
      c.command("a", { type: "propose", id: "gravity-up" });
      c.command("b", { type: "propose", id: "moon-gravity" });
      while (c.tick < 450) c.advance();
      c.activate("gravity-left");
      while (c.tick < 750) c.advance();
      return c;
    };
    expect(run().active).toEqual(run().active);
    expect(run().active).toHaveLength(1);
  });
  it("collapses safely, cools down and stabilizes", () => {
    const c = new Coordinator(1);
    c.chaos = 100;
    c.advance();
    expect(c.collapseEnd).toBe(241);
    for (let i = 0; i < 240; i++) c.advance();
    expect(c.collapseEnd).toBe(0);
    expect(c.chaos).toBeLessThanOrEqual(25);
    expect(c.collapseCooldown).toBeGreaterThan(c.tick);
    c.activate("super-bounce");
    c.activate("magnetic-crystal");
    expect(c.lastEvent).toBe("Crystal Catapult");
    c.stabilize();
    expect(c.active).toEqual([]);
    expect(c.chaos).toBe(0);
    c.fault = true;
    expect(c.activate("moon-gravity")).toBe(false);
    expect(c.command("u", { type: "propose", id: "moon-gravity" })).toBe(false);
  });
});
describe("bounded ingress", () => {
  it("validates, deduplicates, rate limits, blocks and mutes", () => {
    const i = new Ingress();
    expect(i.accept(event("1"), 0)).not.toBeNull();
    expect(i.accept(event("1"), 0)).toBeNull();
    expect(i.accept({ ...event("bad"), text: "x".repeat(501) }, 0)).toBeNull();
    expect(i.accept(event("bad2", "unknown"), 0)).toBeNull();
    expect(i.accept(event("2", undefined, "1"), 0)).not.toBeNull();
    expect(i.accept(event("3", undefined, "1"), 0)).not.toBeNull();
    expect(i.accept(event("4", undefined, "1"), 0)).toBeNull();
    expect(i.accept(event("5", undefined, "1"), 10000)).not.toBeNull();
    i.blocked.add("u");
    expect(i.accept(event("6", undefined, "u"), 10001)).toBeNull();
    i.muted = true;
    expect(i.accept(event("7"), 10001)).toBeNull();
    i.clear();
    expect(i.seen.size).toBe(0);
    expect(i.users.size).toBe(0);
    expect(chatSchema.safeParse({}).success).toBe(false);
    expect(snapshotSchema.safeParse({}).success).toBe(false);
  });
  it("bounds high-volume memory and refills global bucket", () => {
    const i = new Ingress();
    let accepted = 0;
    for (let n = 0; n < 10100; n++)
      if (i.accept(event(String(n)), 0)) accepted++;
    expect(accepted).toBe(20);
    expect(i.seen.size).toBe(10000);
    expect(i.users.size).toBe(10000);
    expect(i.accept(event("next"), 300001)).not.toBeNull();
    expect(i.seen.size).toBe(1);
  });
});
