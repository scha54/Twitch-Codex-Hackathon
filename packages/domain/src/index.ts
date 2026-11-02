import { z } from "zod";
export const HZ = 30;
export const ids = [
  "gravity-up",
  "gravity-left",
  "gravity-right",
  "moon-gravity",
  "super-bounce",
  "slippery-floor",
  "sticky-floor",
  "speed-boost",
  "slow-motion",
  "moving-platforms",
  "walking-trees",
  "magnetic-crystal",
] as const;
export const mutationId = z.enum(ids);
export type MutationId = z.infer<typeof mutationId>;
export const missionId = z.enum(["delivery", "rescue", "beacon"]);
export type MissionId = z.infer<typeof missionId>;
export const chatSchema = z
  .object({
    source: z.enum(["demo", "twitch"]),
    messageId: z.string().min(1).max(128),
    channelId: z.string().min(1).max(64),
    userId: z.string().min(1).max(128),
    text: z.string().max(500),
    receivedAtMs: z.number().finite().nonnegative(),
  })
  .strict();
export type ChatEvent = z.infer<typeof chatSchema>;
export const inputSchema = z
  .object({ left: z.boolean(), right: z.boolean(), jump: z.boolean() })
  .strict();
export const catalog: Record<
  MutationId,
  {
    name: string;
    duration: number;
    weight: number;
    category: string;
    description: string;
  }
> = {
  "gravity-up": {
    name: "Gravity Up",
    duration: 12,
    weight: 18,
    category: "gravity",
    description: "The sky becomes the floor.",
  },
  "gravity-left": {
    name: "Gravity Left",
    duration: 12,
    weight: 18,
    category: "gravity",
    description: "Everything falls toward the west.",
  },
  "gravity-right": {
    name: "Gravity Right",
    duration: 12,
    weight: 18,
    category: "gravity",
    description: "Everything falls toward the east.",
  },
  "moon-gravity": {
    name: "Moon Gravity",
    duration: 15,
    weight: 14,
    category: "gravity",
    description: "A small step. A very big jump.",
  },
  "super-bounce": {
    name: "Super Bounce",
    duration: 15,
    weight: 16,
    category: "collision",
    description: "Every landing is a new beginning.",
  },
  "slippery-floor": {
    name: "Slippery Floor",
    duration: 15,
    weight: 12,
    category: "friction",
    description: "Traction has left the universe.",
  },
  "sticky-floor": {
    name: "Sticky Floor",
    duration: 12,
    weight: 10,
    category: "friction",
    description: "Stay grounded. Very grounded.",
  },
  "speed-boost": {
    name: "Speed Boost",
    duration: 10,
    weight: 14,
    category: "motion",
    description: "Go somewhere, fast.",
  },
  "slow-motion": {
    name: "Slow Motion",
    duration: 10,
    weight: 10,
    category: "time",
    description: "Take a breath between the seconds.",
  },
  "moving-platforms": {
    name: "Moving Platforms",
    duration: 15,
    weight: 16,
    category: "environment",
    description: "The ground has places to be.",
  },
  "walking-trees": {
    name: "Walking Trees",
    duration: 15,
    weight: 14,
    category: "entities",
    description: "The forest would like a word.",
  },
  "magnetic-crystal": {
    name: "Magnetic Crystal",
    duration: 12,
    weight: 18,
    category: "force",
    description: "Your cargo is drawn to you.",
  },
};
export const missions: Record<
  MissionId,
  { name: string; objective: string; seconds: number }
> = {
  delivery: {
    name: "Crystal Delivery",
    objective: "Find the crystal, then carry it to the portal on the right.",
    seconds: 180,
  },
  rescue: {
    name: "Forest Rescue",
    objective: "Reach the lost explorer, then escort them to the portal.",
    seconds: 180,
  },
  beacon: {
    name: "Exit Beacon",
    objective: "Collect all three beacons, then reach the portal.",
    seconds: 180,
  },
};
export type Command =
  { type: "propose"; id: MutationId } | { type: "vote"; option: number };
export function parseCommand(text: string): Command | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^!vote [123]$/.test(s))
    return { type: "vote", option: Number(s.at(-1)) };
  if (!s.startsWith("!glitch ")) return null;
  const id = s.slice(8).replaceAll(" ", "-");
  return mutationId.safeParse(id).success
    ? { type: "propose", id: id as MutationId }
    : null;
}
export interface ActiveRule {
  id: MutationId;
  activatedTick: number;
  expiresTick: number;
}
export function compatible(id: MutationId, active: ActiveRule[]): boolean {
  return !active.some(
    (r) =>
      r.id === id ||
      (["gravity", "friction"].includes(catalog[id].category) &&
        catalog[r.id].category === catalog[id].category),
  );
}
export type RuleContribution =
  | { kind: "gravity"; x: number; y: number }
  | { kind: "restitution" | "friction" | "speed" | "time"; value: number }
  | { kind: "platforms" | "trees" | "magnetic"; enabled: boolean };
const contributions: Record<MutationId, RuleContribution> = {
  "gravity-up": { kind: "gravity", x: 0, y: -0.7 },
  "gravity-left": { kind: "gravity", x: -0.7, y: 0 },
  "gravity-right": { kind: "gravity", x: 0.7, y: 0 },
  "moon-gravity": { kind: "gravity", x: 0, y: 0.25 },
  "super-bounce": { kind: "restitution", value: 0.85 },
  "slippery-floor": { kind: "friction", value: 0.002 },
  "sticky-floor": { kind: "friction", value: 0.8 },
  "speed-boost": { kind: "speed", value: 1.8 },
  "slow-motion": { kind: "time", value: 0.55 },
  "moving-platforms": { kind: "platforms", enabled: true },
  "walking-trees": { kind: "trees", enabled: true },
  "magnetic-crystal": { kind: "magnetic", enabled: true },
};
export const definitions = Object.fromEntries(
  ids.map((id) => [
    id,
    {
      ...catalog[id],
      id,
      durationTicks: catalog[id].duration * HZ,
      maxStack: 1,
      conflicts: ids.filter(
        (other) =>
          other !== id &&
          ["gravity", "friction"].includes(catalog[id].category) &&
          catalog[other].category === catalog[id].category,
      ),
      rollback: "recompute-baseline" as const,
      contribution: contributions[id],
    },
  ]),
) as Record<
  MutationId,
  (typeof catalog)[MutationId] & {
    id: MutationId;
    durationTicks: number;
    maxStack: number;
    conflicts: MutationId[];
    rollback: "recompute-baseline";
    contribution: RuleContribution;
  }
>;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function compose(active: ActiveRule[]) {
  const p = {
    gx: 0,
    gy: 1,
    restitution: 0.05,
    friction: 0.12,
    speed: 1,
    time: 1,
    platforms: false,
    trees: false,
    magnetic: false,
  };
  // Stable category + ID order. Recompute from baseline; never restore snapshots on expiry.
  for (const rule of [...active].sort((a, b) =>
    (catalog[a.id].category + a.id).localeCompare(
      catalog[b.id].category + b.id,
    ),
  )) {
    const c = definitions[rule.id].contribution;
    switch (c.kind) {
      case "gravity":
        p.gx = clamp(c.x, -1, 1);
        p.gy = clamp(c.y, -1, 1);
        break;
      case "restitution":
        p.restitution = clamp(c.value, 0, 0.9);
        break;
      case "friction":
        p.friction = clamp(c.value, 0, 0.8);
        break;
      case "speed":
        p.speed = clamp(c.value, 0.25, 2);
        break;
      case "time":
        p.time = clamp(c.value, 0.25, 1);
        break;
      case "platforms":
        p.platforms = c.enabled;
        break;
      case "trees":
        p.trees = c.enabled;
        break;
      case "magnetic":
        p.magnetic = c.enabled;
        break;
    }
  }
  return p;
}
export function combos(active: ActiveRule[]): string[] {
  const s = new Set(active.map((r) => r.id));
  const result: string[] = [];
  if (s.has("moon-gravity") && s.has("super-bounce"))
    result.push("Lunar Pinball");
  if (
    (s.has("gravity-left") || s.has("gravity-right")) &&
    s.has("slippery-floor")
  )
    result.push("Sideways Slip");
  if (s.has("walking-trees") && s.has("moving-platforms"))
    result.push("Forest Migration");
  if (s.has("magnetic-crystal") && s.has("super-bounce"))
    result.push("Crystal Catapult");
  return result;
}
export function tie(seed: number, round: number, id: string): number {
  let h = (seed ^ round) >>> 0;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
export class Coordinator {
  tick = 0;
  round = 1;
  phase: "idle" | "propose" | "vote" | "cooldown" | "complete" = "idle";
  endTick = 0;
  proposals = new Map<string, MutationId>();
  votes = new Map<string, MutationId>();
  candidates: MutationId[] = [];
  active: ActiveRule[] = [];
  chaos = 0;
  collapseEnd = 0;
  collapseCooldown = 0;
  lastEvent = "Welcome to Reality Glitch";
  history: string[] = [];
  fault = false;
  constructor(
    public seed: number,
    public timings = { propose: 450, vote: 300, cooldown: 150 },
  ) {}
  start() {
    this.phase = "propose";
    this.endTick = this.tick + this.timings.propose;
    this.lastEvent = "Reality is accepting proposals";
  }
  announce(s: string) {
    this.lastEvent = s;
    this.history = [s, ...this.history].slice(0, 8);
  }
  command(user: string, c: Command): boolean {
    if (this.fault) return false;
    if (
      c.type === "propose" &&
      this.phase === "propose" &&
      !this.proposals.has(user) &&
      compatible(c.id, this.active)
    ) {
      this.proposals.set(user, c.id);
      return true;
    }
    if (
      c.type === "vote" &&
      this.phase === "vote" &&
      this.candidates[c.option - 1]
    ) {
      this.votes.set(user, this.candidates[c.option - 1]);
      return true;
    }
    return false;
  }
  activate(id: MutationId): boolean {
    if (this.fault || !compatible(id, this.active)) return false;
    this.active.push({
      id,
      activatedTick: this.tick,
      expiresTick: this.tick + catalog[id].duration * HZ,
    });
    this.chaos = Math.min(100, this.chaos + catalog[id].weight);
    this.announce(`${catalog[id].name} activated`);
    const names = combos(this.active);
    if (names.length) this.announce(names.join(" + "));
    return true;
  }
  advance() {
    this.tick++;
    this.active = this.active.filter((r) => r.expiresTick > this.tick);
    if (
      this.chaos >= 100 &&
      !this.collapseEnd &&
      this.tick >= this.collapseCooldown
    ) {
      this.collapseEnd = this.tick + 240;
      this.announce("REALITY COLLAPSE · hold on");
    }
    if (this.collapseEnd && this.tick >= this.collapseEnd) {
      this.collapseEnd = 0;
      this.collapseCooldown = this.tick + 1350;
      this.chaos = 25;
      this.announce("Reality restored");
    }
    this.chaos = Math.max(0, this.chaos - 0.3 / HZ);
    if (this.tick < this.endTick || this.fault) return;
    if (this.phase === "propose") {
      const counts = new Map<MutationId, number>();
      for (const id of this.proposals.values())
        counts.set(id, (counts.get(id) || 0) + 1);
      this.candidates = [...counts.keys()]
        .filter((id) => compatible(id, this.active))
        .sort(
          (a, b) =>
            counts.get(b)! - counts.get(a)! ||
            tie(this.seed, this.round, a) - tie(this.seed, this.round, b),
        )
        .slice(0, 3);
      this.phase = "vote";
      this.endTick = this.tick + this.timings.vote;
      this.announce(
        this.candidates.length
          ? "Vote for the next glitch"
          : "No proposals this round",
      );
    } else if (this.phase === "vote") {
      const counts = new Map<MutationId, number>();
      for (const id of this.votes.values())
        counts.set(id, (counts.get(id) || 0) + 1);
      const ranked = [...this.candidates].sort(
        (a, b) =>
          (counts.get(b) || 0) - (counts.get(a) || 0) ||
          tie(this.seed, this.round, a) - tie(this.seed, this.round, b),
      );
      const winner = ranked.find((id) => compatible(id, this.active));
      if (winner) this.activate(winner);
      this.phase = "cooldown";
      this.endTick = this.tick + this.timings.cooldown;
    } else if (this.phase === "cooldown") {
      this.round++;
      this.proposals.clear();
      this.votes.clear();
      this.candidates = [];
      this.start();
    }
  }
  stabilize() {
    this.active = [];
    this.chaos = 0;
    this.collapseEnd = 0;
    this.collapseCooldown = this.tick + 1350;
    this.announce("Emergency stabilization complete");
  }
}
export class Ingress {
  seen = new Map<string, number>();
  users = new Map<string, { tokens: number; at: number }>();
  blocked = new Set<string>();
  muted = false;
  private tokens = 20;
  private at = 0;
  accept(
    raw: unknown,
    now: number,
  ): { event: ChatEvent; command: Command } | null {
    const parsed = chatSchema.safeParse(raw);
    if (!parsed.success) return null;
    const e = parsed.data;
    if (this.muted || this.blocked.has(e.userId)) return null;
    for (const [id, t] of this.seen) if (t < now - 300000) this.seen.delete(id);
    const key = e.source + ":" + e.messageId;
    if (this.seen.has(key)) return null;
    if (this.seen.size >= 10000)
      this.seen.delete(this.seen.keys().next().value!);
    this.seen.set(key, now);
    const command = parseCommand(e.text);
    if (!command) return null;
    this.tokens = Math.min(20, this.tokens + Math.max(0, now - this.at) * 0.02);
    this.at = now;
    const b = this.users.get(e.userId) || { tokens: 3, at: now };
    b.tokens = Math.min(3, b.tokens + Math.max(0, now - b.at) * 0.0003);
    b.at = now;
    if (this.users.size >= 10000 && !this.users.has(e.userId))
      this.users.delete(this.users.keys().next().value!);
    this.users.set(e.userId, b);
    if (this.tokens < 1 || b.tokens < 1) return null;
    this.tokens--;
    b.tokens--;
    return { event: e, command };
  }
  clear() {
    this.seen.clear();
    this.users.clear();
    this.tokens = 20;
    this.at = 0;
  }
}
export const entitySchema = z.object({
  id: z.string(),
  kind: z.enum([
    "player",
    "platform",
    "crystal",
    "npc",
    "beacon",
    "tree",
    "portal",
  ]),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive(),
  h: z.number().positive(),
  angle: z.number().finite(),
});
export const snapshotSchema = z.object({
  sessionId: z.string(),
  tick: z.number().int(),
  seed: z.number().int(),
  missionId,
  chaos: z.number(),
  phase: z.enum(["idle", "propose", "vote", "cooldown", "complete"]),
  remaining: z.number(),
  missionRemaining: z.number(),
  status: z.enum([
    "idle",
    "running",
    "paused",
    "success",
    "timeout",
    "ended",
    "fault",
  ]),
  entities: z.array(entitySchema).max(100),
  activeRules: z
    .array(
      z.object({
        id: mutationId,
        activatedTick: z.number(),
        expiresTick: z.number(),
      }),
    )
    .max(12),
  candidates: z.array(mutationId).max(3),
  tallies: z.array(z.number()),
  proposals: z.number(),
  round: z.number(),
  lastEvent: z.string(),
  history: z.array(z.string()),
  combos: z.array(z.string()),
  collapse: z.boolean(),
  demo: z.boolean(),
  twitch: z.string(),
  progress: z.number(),
  target: z.number(),
  stateHash: z.string(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
