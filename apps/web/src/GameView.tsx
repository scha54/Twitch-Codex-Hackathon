import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { Snapshot } from "../../../packages/domain/src/index";
const colors = {
  player: 0xa6ff78,
  platform: 0x233c45,
  crystal: 0xc59bff,
  npc: 0xffcf7d,
  beacon: 0x74f3e5,
  tree: 0x3c896e,
  portal: 0xb7ff8a,
};
export function GameView({
  snapshot,
  reduced,
}: {
  snapshot: Snapshot | null;
  reduced: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(snapshot);
  const motion = useRef(reduced);
  state.current = snapshot;
  motion.current = reduced;
  useEffect(() => {
    if (!host.current) return;
    class World extends Phaser.Scene {
      pen!: Phaser.GameObjects.Graphics;
      label!: Phaser.GameObjects.Text;
      positions = new Map<string, { x: number; y: number }>();
      create() {
        this.pen = this.add.graphics();
        this.label = this.add.text(28, 26, "", {
          fontFamily: "monospace",
          fontSize: "15px",
          color: "#87a89b",
        });
      }
      update() {
        const s = state.current;
        const g = this.pen;
        if (!g) return;
        g.clear();
        g.fillStyle(0x0d1d25);
        g.fillRect(0, 0, 1280, 720);
        g.lineStyle(1, 0x244038, 0.3);
        for (let x = 0; x < 1280; x += 40) g.lineBetween(x, 0, x, 720);
        for (let y = 0; y < 720; y += 40) g.lineBetween(0, y, 1280, y);
        // Layered distant landscape, stars, and a quiet moon; no flashing effects.
        g.fillStyle(0x142c31);
        g.fillTriangle(0, 656, 240, 370, 490, 656);
        g.fillTriangle(380, 656, 760, 280, 1120, 656);
        g.fillTriangle(900, 656, 1140, 400, 1400, 656);
        g.fillStyle(0x274639, 0.6);
        g.fillCircle(1085, 125, 53);
        g.lineStyle(1, 0x9aff78, 0.15);
        g.strokeCircle(1085, 125, 65);
        for (let i = 0; i < 38; i++) {
          g.fillStyle(0x80b8a7, i % 3 === 0 ? 0.6 : 0.2);
          g.fillCircle(
            (i * 137 + 61) % 1280,
            (i * 79 + 50) % 400,
            i % 3 === 0 ? 2 : 1,
          );
        }
        this.label.setText(
          s
            ? `SECTOR 01  /  VERDANT RIFT                         ${s.status.toUpperCase()}`
            : "ESTABLISHING UPLINK…",
        );
        if (!s) return;
        for (const e of s.entities) {
          const prev = this.positions.get(e.id) || e;
          const lerp = motion.current ? 1 : 0.4;
          const x = Phaser.Math.Linear(prev.x, e.x, lerp),
            y = Phaser.Math.Linear(prev.y, e.y, lerp);
          this.positions.set(e.id, { x, y });
          const c = colors[e.kind];
          g.fillStyle(c);
          g.lineStyle(2, c, 0.6);
          if (e.kind === "player") {
            g.fillStyle(c, 0.08);
            g.fillCircle(x, y, 35);
            g.fillStyle(c);
            g.fillRoundedRect(x - 15, y - 22, 30, 44, 7);
            g.fillStyle(0x0b2425);
            g.fillRoundedRect(x - 10, y - 12, 20, 13, 3);
            g.fillStyle(0xf0ffe5);
            g.fillRect(x + 2, y - 9, 5, 4);
            g.fillStyle(0x0b2425);
            g.fillRect(x - 8, y + 15, 6, 9);
            g.fillRect(x + 3, y + 15, 6, 9);
          } else if (e.kind === "crystal" || e.kind === "beacon") {
            g.fillStyle(c, 0.1);
            g.fillCircle(x, y, 26);
            g.fillStyle(c);
            g.fillTriangle(x, y - 18, x - 12, y, x + 12, y);
            g.fillTriangle(x - 12, y, x + 12, y, x, y + 15);
            g.lineStyle(1, 0xffffff, 0.5);
            g.lineBetween(x, y - 17, x + 3, y);
          } else if (e.kind === "tree") {
            g.fillStyle(0x6b7357);
            g.fillRect(x - 4, y - 10, 8, 40);
            g.fillStyle(0x357f64);
            g.fillTriangle(x, y - 62, x - 27, y - 6, x + 27, y - 6);
            g.fillStyle(0x4f9f75);
            g.fillTriangle(x, y - 75, x - 20, y - 30, x + 20, y - 30);
          } else if (e.kind === "portal") {
            g.fillStyle(c, 0.09);
            g.fillEllipse(x, y, 75, 112);
            g.lineStyle(4, c);
            g.strokeEllipse(x, y, 48, 80);
            g.lineStyle(1, c, 0.5);
            g.strokeEllipse(x, y, 34, 67);
            g.fillStyle(c);
            g.fillRect(x - 38, y + 42, 76, 7);
          } else if (e.kind === "npc") {
            g.fillStyle(c);
            g.fillCircle(x, y - 17, 12);
            g.fillRoundedRect(x - 12, y - 5, 24, 28, 5);
            g.fillStyle(0x242c33);
            g.fillRect(x - 7, y - 20, 14, 6);
          } else {
            g.fillStyle(0x1c3439);
            g.fillRoundedRect(x - e.w / 2, y - e.h / 2, e.w, e.h, 4);
            g.fillStyle(0x507d5b);
            g.fillRect(x - e.w / 2, y - e.h / 2, e.w, 4);
            g.lineStyle(1, 0x83c478, 0.25);
            g.strokeRect(x - e.w / 2, y - e.h / 2, e.w, e.h);
          }
        }
        if (s.collapse) {
          g.lineStyle(6, 0xca9dff, 0.7);
          g.strokeRect(5, 5, 1270, 710);
        }
      }
    }
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 1280,
      height: 720,
      backgroundColor: "#0d1d25",
      scene: World,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true },
      render: { antialias: true },
      banner: false,
    });
    return () => game.destroy(true);
  }, []);
  return (
    <div
      className="game-canvas"
      ref={host}
      role="img"
      aria-label="Live authoritative game world: explorer, forest platforms, crystal and exit portal"
    />
  );
}
