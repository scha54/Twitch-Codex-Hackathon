import Matter from "matter-js";
import { createHash, randomUUID } from "node:crypto";
import {
  Coordinator,
  Ingress,
  compose,
  combos,
  HZ,
  missions,
  chatSchema,
  parseCommand,
  inputSchema,
  type MissionId,
  type Snapshot,
  type ChatEvent,
} from "../../../packages/domain/src/index.js";
const { Engine, Bodies, Body, Composite, Query } = Matter;
export type RecordedEvent = {
  tick: number;
  type: "chat" | "input" | "stabilize";
  data: unknown;
};
export class Game {
  engine = Engine.create({ enableSleeping: false });
  rules: Coordinator;
  ingress = new Ingress();
  sessionId = randomUUID();
  status: Snapshot["status"] = "idle";
  mission: MissionId = "delivery";
  demo = false;
  twitch = "offline";
  progress = 0;
  input = { left: false, right: false, jump: false };
  events: RecordedEvent[] = [];
  player!: Matter.Body;
  cargo!: Matter.Body;
  npc!: Matter.Body;
  platforms: Matter.Body[] = [];
  beacons: Matter.Body[] = [];
  trees: Matter.Body[] = [];
  carrying = false;
  escorting = false;
  lastJump = -30;
  demoScript = false;
  onEvent: ((e: RecordedEvent) => void) | undefined;
  constructor(seed = 2026) {
    this.rules = new Coordinator(seed);
    this.build();
  }
  private rect(
    x: number,
    y: number,
    w: number,
    h: number,
    kind: string,
    isStatic = true,
  ) {
    const b = Bodies.rectangle(x, y, w, h, {
      isStatic,
      label: kind,
      friction: 0.12,
    });
    Composite.add(this.engine.world, b);
    return b;
  }
  build() {
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.engine.timing.timestamp = 0;
    // Explicit IDs avoid Matter's process-global ID counter affecting replay collision order.
    this.platforms = [
      this.rect(640, 688, 1280, 64, "platform"),
      this.rect(325, 565, 180, 24, "platform"),
      this.rect(590, 475, 160, 24, "platform"),
      this.rect(850, 560, 190, 24, "platform"),
    ];
    this.rect(-22, 360, 44, 720, "platform");
    this.rect(1302, 360, 44, 720, "platform");
    this.rect(640, -24, 1280, 48, "platform");
    this.player = this.rect(100, 620, 30, 44, "player", false);
    this.player.inertia = Infinity;
    this.player.inverseInertia = 0;
    this.cargo = this.rect(400, 625, 22, 28, "crystal", false);
    this.cargo.isSensor = true;
    Body.setStatic(this.cargo, true);
    this.npc = this.rect(760, 625, 28, 40, "npc");
    this.beacons = [
      this.rect(300, 625, 20, 30, "beacon"),
      this.rect(620, 625, 20, 30, "beacon"),
      this.rect(940, 625, 20, 30, "beacon"),
    ];
    this.trees = [
      this.rect(485, 630, 35, 58, "tree"),
      this.rect(1035, 630, 35, 58, "tree"),
    ];
    for (const b of [this.npc, ...this.beacons, ...this.trees])
      b.isSensor = true;
    this.rect(1180, 612, 56, 84, "portal").isSensor = true;
    Composite.allBodies(this.engine.world).forEach((b, i) => (b.id = i + 1));
  }
  reset(seed = this.rules.seed, mission = this.mission, start = false) {
    this.rules = new Coordinator(
      seed,
      this.demoScript ? { propose: 150, vote: 90, cooldown: 60 } : undefined,
    );
    this.mission = mission;
    this.sessionId = randomUUID();
    this.status = start ? "running" : "idle";
    this.progress = 0;
    this.carrying = false;
    this.escorting = false;
    this.events = [];
    this.ingress.clear();
    this.input = { left: false, right: false, jump: false };
    this.lastJump = -30;
    this.build();
    if (start) this.rules.start();
  }
  record(e: RecordedEvent) {
    this.events.push(e);
    if (this.events.length > 20000) this.events.shift();
    this.onEvent?.(e);
  }
  chat(raw: unknown, now: number) {
    if (this.status !== "running") return false;
    const c = this.ingress.accept(raw, now);
    if (!c) return false;
    const ok = this.rules.command(c.event.userId, c.command);
    if (ok)
      this.record({
        tick: this.rules.tick,
        type: "chat",
        data: {
          ...c.event,
          text:
            c.command.type === "propose"
              ? `!glitch ${c.command.id}`
              : `!vote ${c.command.option}`,
        },
      });
    return ok;
  }
  setInput(input: typeof this.input) {
    if (this.status !== "running") return;
    this.input = input;
    this.record({ tick: this.rules.tick, type: "input", data: input });
  }
  stabilize() {
    this.rules.stabilize();
    Body.setVelocity(this.player, { x: 0, y: 0 });
    Body.setPosition(this.player, { x: 100, y: 620 });
    this.record({ tick: this.rules.tick, type: "stabilize", data: null });
  }
  step() {
    if (this.status !== "running") return;
    if (this.demo && this.demoScript) this.script();
    this.rules.advance();
    const tick = this.rules.tick;
    const p = compose(this.rules.active);
    if (this.rules.collapseEnd) {
      const cycle = Math.floor(tick / 45) % 4;
      p.gx = [0, 0.5, 0, -0.5][cycle];
      p.gy = [0.3, 0.4, -0.3, 0.4][cycle];
    }
    this.engine.gravity.x = p.gx;
    this.engine.gravity.y = p.gy;
    this.player.restitution = p.restitution;
    this.player.friction = p.friction;
    this.player.frictionAir = p.friction === 0.8 ? 0.12 : 0.012;
    const direction = Number(this.input.right) - Number(this.input.left);

    const grounded =
      Query.collides(this.player, this.platforms).length > 0 ||
      this.player.position.y > 628;
    if (this.input.jump && grounded && tick - this.lastJump > 10) {
      Body.setVelocity(this.player, { x: this.player.velocity.x, y: -11 });
      this.lastJump = tick;
    }
    Body.setVelocity(this.player, {
      x: Math.max(
        -12 * p.speed,
        Math.min(12 * p.speed, this.player.velocity.x),
      ),
      y: Math.max(-18, Math.min(18, this.player.velocity.y)),
    });
    this.platforms.slice(1).forEach((b, i) =>
      Body.setPosition(b, {
        x:
          [325, 590, 850][i] + (p.platforms ? Math.sin(tick / 55 + i) * 65 : 0),
        y: [565, 475, 560][i],
      }),
    );
    this.trees.forEach((b, i) =>
      Body.setPosition(b, {
        x: [485, 1035][i] + (p.trees ? Math.sin(tick / 40 + i) * 80 : 0),
        y: 630,
      }),
    );
    // Two bounded substeps preserve a 30 Hz authoritative tick with stable 60 Hz contacts.
    for (let i = 0; i < 2; i++) {
      if (direction)
        Body.setVelocity(this.player, {
          x: direction * 5 * p.speed * (p.friction > 0.5 ? 0.5 : 1),
          y: this.player.velocity.y,
        });
      Engine.update(this.engine, (500 / HZ) * p.time);
    }
    const pos = this.player.position;
    if (
      Composite.allBodies(this.engine.world).some(
        (b) =>
          ![b.position.x, b.position.y, b.velocity.x, b.velocity.y].every(
            Number.isFinite,
          ),
      )
    ) {
      this.status = "fault";
      this.rules.fault = true;
      this.rules.announce("Simulation invariant failed. Reset required.");
      this.build();
      this.progress = 0;
      this.carrying = false;
      this.escorting = false;
      this.input = { left: false, right: false, jump: false };
      console.error(
        "Simulation invariant failed; mutations suspended. Safe reset required.",
      );
      return;
    }
    if (pos.y > 760 || pos.y < 0 || pos.x < 0 || pos.x > 1280) {
      Body.setPosition(this.player, { x: 100, y: 620 });
      Body.setVelocity(this.player, { x: 0, y: 0 });
    }
    if (this.mission === "delivery") {
      const distance = Math.hypot(
        pos.x - this.cargo.position.x,
        pos.y - this.cargo.position.y,
      );
      if (distance < 55 || (p.magnetic && distance < 180)) this.carrying = true;
      if (this.carrying) {
        Body.setPosition(this.cargo, { x: pos.x, y: pos.y - 38 });
        this.progress = 1;
      }
    }
    if (this.mission === "rescue") {
      if (Math.abs(pos.x - this.npc.position.x) < 60) this.escorting = true;
      if (this.escorting) {
        Body.setPosition(this.npc, { x: pos.x - 40, y: Math.min(630, pos.y) });
        this.progress = 1;
      }
    }
    if (this.mission === "beacon") {
      this.beacons = this.beacons.filter((b) => {
        if (Math.hypot(pos.x - b.position.x, pos.y - b.position.y) < 55) {
          Composite.remove(this.engine.world, b);
          this.progress++;
          return false;
        }
        return true;
      });
    }
    if (
      pos.x > 1140 &&
      pos.y > 540 &&
      this.progress >= (this.mission === "beacon" ? 3 : 1)
    ) {
      this.status = "success";
      this.rules.phase = "complete";
      this.rules.announce("MISSION COMPLETE · reality survived");
    } else if (tick >= missions[this.mission].seconds * HZ) {
      this.status = "timeout";
      this.rules.phase = "complete";
      this.rules.announce("Time expired · reset to try again");
    }
  }
  script() {
    const t = this.rules.tick;
    // Compressed 5/3/2-second rounds demonstrate overlaps; the session remains 180 seconds.
    const round = Math.floor(t / 300),
      at = t % 300;
    const sequence = [
      "moon gravity",
      "super bounce",
      "magnetic crystal",
      "walking trees",
      "moving platforms",
      "gravity left",
      "slippery floor",
      "speed boost",
      "slow motion",
      "sticky floor",
      "gravity up",
      "gravity right",
      "moon gravity",
      "super bounce",
      "magnetic crystal",
      "walking trees",
      "moving platforms",
      "speed boost",
    ];
    const send = (i: number, text: string) =>
      this.chat(
        {
          source: "demo",
          messageId: `script-${t}-${i}`,
          channelId: "local",
          userId: `showcase-${round}-${i}`,
          text,
          receivedAtMs: (t * 1000) / HZ,
        } satisfies ChatEvent,
        (t * 1000) / HZ,
      );
    if (at === 30)
      for (let i = 0; i < 5; i++)
        send(i, `!glitch ${sequence[round % sequence.length]}`);
    if (at === 180) for (let i = 0; i < 10; i++) send(i, "!vote 1");
  }
  snapshot(): Snapshot {
    const bodies = Composite.allBodies(this.engine.world).filter(
      (b) =>
        !(
          (b.label === "crystal" && this.mission !== "delivery") ||
          (b.label === "npc" && this.mission !== "rescue") ||
          (b.label === "beacon" && this.mission !== "beacon")
        ),
    );
    const entities = bodies.map((b) => ({
      id: String(b.id),
      kind: b.label as Snapshot["entities"][number]["kind"],
      x: b.position.x,
      y: b.position.y,
      w: b.bounds.max.x - b.bounds.min.x,
      h: b.bounds.max.y - b.bounds.min.y,
      angle: b.angle,
    }));
    const base = {
      tick: this.rules.tick,
      seed: this.rules.seed,
      missionId: this.mission,
      chaos: this.rules.chaos,
      phase: this.rules.phase,
      remaining: Math.max(0, (this.rules.endTick - this.rules.tick) / HZ),
      missionRemaining: Math.max(
        0,
        missions[this.mission].seconds - this.rules.tick / HZ,
      ),
      status: this.status,
      entities,
      activeRules: this.rules.active,
      candidates: this.rules.candidates,
      tallies: this.rules.candidates.map(
        (id) => [...this.rules.votes.values()].filter((v) => v === id).length,
      ),
      proposals: this.rules.proposals.size,
      round: this.rules.round,
      lastEvent: this.rules.lastEvent,
      history: this.rules.history,
      combos: combos(this.rules.active),
      collapse: !!this.rules.collapseEnd,
      progress: this.progress,
      target: this.mission === "beacon" ? 3 : 1,
    };
    const canonical = {
      ...base,
      carrying: this.carrying,
      escorting: this.escorting,
      lastJump: this.lastJump,
      timings: this.rules.timings,
      velocities: Composite.allBodies(this.engine.world).map((b) => [
        b.id,
        b.velocity.x,
        b.velocity.y,
      ]),
      proposals: [...this.rules.proposals.values()].sort(),
      votes: [...this.rules.votes.values()].sort(),
      collapseEnd: this.rules.collapseEnd,
      collapseCooldown: this.rules.collapseCooldown,
      input: this.input,
    };
    const stateHash = createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex")
      .slice(0, 16);
    return {
      ...base,
      sessionId: this.sessionId,
      stateHash,
      demo: this.demo,
      twitch: this.twitch,
    };
  }
}

/** Replays already accepted events without reapplying wall-clock ingress limits. */
export function applyRecordedEvent(game: Game, event: RecordedEvent) {
  if (event.type === "input") game.setInput(inputSchema.parse(event.data));
  if (event.type === "stabilize") game.stabilize();
  if (event.type === "chat") {
    const chat = chatSchema.parse(event.data);
    const command = parseCommand(chat.text);
    if (!command || !game.rules.command(chat.userId, command))
      throw new Error("Replay command disagrees with authoritative phase");
  }
}
