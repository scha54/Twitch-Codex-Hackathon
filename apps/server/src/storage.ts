import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { RecordedEvent } from "./game.js";
export class Store {
  db: Database.Database;
  constructor(path = ".data/reality.sqlite") {
    if (path !== ":memory:") mkdirSync(".data", { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,seed INTEGER,mission TEXT); CREATE TABLE IF NOT EXISTS domain_events (session TEXT,tick INTEGER,type TEXT,data TEXT); CREATE TABLE IF NOT EXISTS replay_metadata (session TEXT PRIMARY KEY,build TEXT); CREATE TABLE IF NOT EXISTS blocked_users (id TEXT PRIMARY KEY); PRAGMA user_version=1;",
    );
  }
  session(id: string, seed: number, mission: string) {
    this.db
      .prepare("INSERT OR IGNORE INTO sessions VALUES (?,?,?)")
      .run(id, seed, mission);
    this.db
      .prepare("INSERT OR IGNORE INTO replay_metadata VALUES (?,?)")
      .run(id, "0.1.0");
  }
  event(session: string, event: RecordedEvent) {
    let data = event.data;
    if (event.type === "chat") {
      const e = data as {
        source: string;
        userId: string;
        text: string;
        messageId: string;
        channelId: string;
        receivedAtMs: number;
      };
      data = {
        ...e,
        userId: createHash("sha256")
          .update(session + e.userId)
          .digest("hex"),
        channelId: "redacted",
        messageId: createHash("sha256")
          .update(session + e.messageId)
          .digest("hex"),
      };
    }
    this.db
      .prepare("INSERT INTO domain_events VALUES (?,?,?,?)")
      .run(session, event.tick, event.type, JSON.stringify(data));
  }
  block(id: string, blocked: boolean) {
    if (blocked)
      this.db.prepare("INSERT OR IGNORE INTO blocked_users VALUES (?)").run(id);
    else this.db.prepare("DELETE FROM blocked_users WHERE id=?").run(id);
  }
  delete() {
    this.db.exec(
      "DELETE FROM domain_events; DELETE FROM sessions; DELETE FROM replay_metadata; DELETE FROM blocked_users;",
    );
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    this.db.exec("VACUUM");
  }
}
