import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Game, applyRecordedEvent } from "../apps/server/src/game.js";
import { missionId } from "../packages/domain/src/index.js";
const file = process.argv[2];
if (!file) throw new Error("Usage: npm run replay -- replay.json");
const replay = z
  .object({
    build: z.literal("0.1.0"),
    seed: z.number().int(),
    mission: missionId,
    timings: z.object({
      propose: z.number().int().positive(),
      vote: z.number().int().positive(),
      cooldown: z.number().int().positive(),
    }),
    status: z.enum([
      "idle",
      "running",
      "paused",
      "success",
      "timeout",
      "ended",
      "fault",
    ]),
    tick: z.number().int().min(0).max(5400),
    events: z
      .array(
        z.object({
          tick: z.number().int().nonnegative(),
          type: z.enum(["input", "chat", "stabilize"]),
          data: z.unknown(),
        }),
      )
      .max(20000),
    stateHash: z.string(),
  })
  .parse(JSON.parse(await readFile(file, "utf8")));
const game = new Game(replay.seed);
game.reset(replay.seed, replay.mission, replay.status !== "idle");
game.rules.timings = replay.timings;
if (replay.status !== "idle") game.rules.endTick = replay.timings.propose;
for (let tick = 0; tick <= replay.tick; tick++) {
  for (const event of replay.events.filter((e) => e.tick === tick)) {
    applyRecordedEvent(game, event);
  }
  if (tick < replay.tick) game.step();
}
game.status = replay.status;
if (replay.status === "ended") game.rules.phase = "complete";
const hash = game.snapshot().stateHash;
if (hash !== replay.stateHash)
  throw new Error(`Replay mismatch: ${hash} != ${replay.stateHash}`);
console.log(`Replay verified: ${hash} at tick ${replay.tick}`);
