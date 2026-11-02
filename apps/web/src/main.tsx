import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GameView } from "./GameView";
import {
  catalog,
  ids,
  missions,
  snapshotSchema,
  type Snapshot,
  type MissionId,
} from "../../../packages/domain/src/index";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./style.css";
const overlay = location.pathname === "/overlay";
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [csrf, setCsrf] = useState("");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [text, setText] = useState("!glitch moon gravity");
  const [user, setUser] = useState("demo-viewer");
  const [tab, setTab] = useState("studio");
  const [reduced, setReduced] = useState(
    localStorage.getItem("reality-reduced-motion") === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [twitchConfigured, setTwitchConfigured] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blockUser, setBlockUser] = useState("");
  const input = useRef({ left: false, right: false, jump: false });
  const authorized = !!csrf;
  useEffect(() => {
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let dead = false;
    const connect = () => {
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const envelope = JSON.parse(e.data);
          if (envelope.type === "snapshot") {
            const parsed = snapshotSchema.safeParse(envelope.data);
            if (parsed.success) setSnapshot(parsed.data);
          }
        } catch {
          /* Discard malformed transport data. */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!dead) timer = setTimeout(connect, 1200);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    if (!overlay)
      void fetch("/api/admin/me").then(async (r) => {
        if (r.ok) {
          const b = await r.json();
          setCsrf(b.csrf);
          setTwitchConfigured(b.twitchConfigured);
        }
      });
    return () => {
      dead = true;
      clearTimeout(timer);
      ws.close();
    };
  }, []);
  const api = async (path: string, body: unknown = {}) => {
    try {
      const r = await fetch("/api/admin/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Request failed");
      setMessage(
        result.accepted === false
          ? "Command rejected: check phase, cooldown or modifier compatibility."
          : result.accepted
            ? "Proposal / vote accepted."
            : "Control applied.",
      );
      return result;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Connection failed");
      return null;
    }
  };
  useEffect(() => {
    if (!csrf || overlay) return;
    const send = () => {
      void fetch("/api/admin/input", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(input.current),
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,button"))
        return;
      let k: "left" | "right" | "jump" | undefined;
      if (["ArrowLeft", "a", "A"].includes(e.key)) k = "left";
      if (["ArrowRight", "d", "D"].includes(e.key)) k = "right";
      if (["ArrowUp", "w", "W", " "].includes(e.key)) k = "jump";
      if (k) {
        e.preventDefault();
        const pressed = e.type === "keydown";
        if (input.current[k] !== pressed) {
          input.current[k] = pressed;
          send();
        }
      }
    };
    const blur = () => {
      input.current = { left: false, right: false, jump: false };
      send();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", blur);
    const heartbeat = setInterval(send, 150);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", blur);
    };
  }, [csrf]);
  const s = snapshot;
  const seconds = (n: number) =>
    `${Math.floor(n / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(n % 60)
      .toString()
      .padStart(2, "0")}`;
  const gamePanel = (
    <div className={`world ${s?.collapse ? "collapse" : ""}`}>
      <div className="world-bar">
        <span>
          <i className="live-dot" /> LIVE SIMULATION
        </span>
        <span>
          {s?.demo ? "DEMO MODE" : "LOCAL SESSION"} <b> · </b> 30 HZ
        </span>
      </div>
      <GameView snapshot={s} reduced={reduced} />
      <div className="game-bottom">
        <span>
          <span className="keycap">A</span>
          <span className="keycap">D</span> move{" "}
          <span className="keycap wide">SPACE</span> jump
        </span>
        <span className="sector">↗ EXIT PORTAL / EAST</span>
      </div>
      {s &&
        ["success", "timeout", "ended", "paused", "idle", "fault"].includes(
          s.status,
        ) && (
          <div className="game-notice">
            <span>
              {s.status === "success"
                ? "MISSION COMPLETE"
                : s.status === "idle"
                  ? "YOUR REALITY AWAITS"
                  : s.status === "paused"
                    ? "SIMULATION PAUSED"
                    : s.status === "fault"
                      ? "SAFE MODE"
                      : s.status === "ended"
                        ? "SESSION ENDED"
                        : "TIME EXPIRED"}
            </span>
            <p>
              {s.status === "idle"
                ? "Start a session to enter the rift."
                : s.status === "success"
                  ? "You made it. Even reality is impressed."
                  : s.status === "paused"
                    ? "Take your time. The universe can wait."
                    : "Use the dashboard to begin again."}
            </p>
          </div>
        )}
    </div>
  );
  const votePanel = (
    <section className="panel vote-panel">
      <div className="panel-heading">
        <h2>Audience control</h2>
        <span className="pill purple">ROUND {s?.round || 1}</span>
      </div>
      <div className="phase-line">
        <span className="phase-dot" />
        <strong>
          {s?.phase === "vote"
            ? "VOTING OPEN"
            : s?.phase === "propose"
              ? "PROPOSALS OPEN"
              : s?.phase === "cooldown"
                ? "REALITY SETTLING"
                : "WAITING FOR SESSION"}
        </strong>
        <b>{seconds(s?.remaining || 0)}</b>
      </div>
      <div className="phase-track">
        <i
          style={{
            width: `${Math.min(100, ((s?.remaining || 0) / (s?.phase === "propose" ? 15 : s?.phase === "vote" ? 10 : 5)) * 100)}%`,
          }}
        />
      </div>
      <p className="muted">
        {s?.phase === "vote"
          ? "One viewer, one vote. Pick your next reality."
          : "Chat proposes. Chat decides. You survive."}
      </p>
      <div className="vote-options">
        {(s?.candidates.length ? s.candidates : []).map((id, i) => (
          <div className="vote-option" key={id}>
            <span className="option-number">{i + 1}</span>
            <div>
              <strong>{catalog[id].name}</strong>
              <small>!vote {i + 1}</small>
            </div>
            <b>
              {s?.tallies[i] || 0}
              <small> VOTES</small>
            </b>
          </div>
        ))}
        {!s?.candidates.length && (
          <div className="proposal-hint">
            <span>✦</span>
            <strong>What if gravity took a day off?</strong>
            <p>
              Type <code>!glitch moon gravity</code> in chat
            </p>
            <small>{s?.proposals || 0} unique proposals received</small>
          </div>
        )}
      </div>
      <div className="round-steps">
        <span className={s?.phase === "propose" ? "selected" : ""}>
          01 Propose
        </span>
        <span className={s?.phase === "vote" ? "selected" : ""}>02 Vote</span>
        <span className={s?.phase === "cooldown" ? "selected" : ""}>
          03 Glitch
        </span>
      </div>
    </section>
  );
  if (overlay)
    return (
      <main className={`overlay-page ${reduced ? "reduced" : ""}`}>
        <div className="overlay-top">
          <div className="brand">
            R<span>✳</span> / REALITY GLITCH
          </div>
          <b>
            {s?.demo ? "● DEMO" : "● LIVE"} ·{" "}
            {connected ? "CONNECTED" : "RECONNECTING"}
          </b>
        </div>
        <div className="overlay-objective">
          <h1>{s ? missions[s.missionId].name : "Reality Glitch"}</h1>
          <p>{s ? missions[s.missionId].objective : ""}</p>
          <strong>
            {seconds(s?.missionRemaining || 0)} · CHAOS{" "}
            {Math.round(s?.chaos || 0)}%
          </strong>
        </div>
        <div className="overlay-grid">
          {gamePanel}
          {votePanel}
        </div>
        <div className="overlay-footer">
          <strong>{s?.lastEvent}</strong>
          <span>
            {s?.activeRules.map((r) => catalog[r.id].name).join(" / ") ||
              "Reality stable"}
          </span>
        </div>
      </main>
    );
  return (
    <div className={`app ${reduced ? "reduced" : ""}`}>
      <aside className="sidebar">
        <a className="logo" href="/" aria-label="Reality Glitch home">
          R<span>✳</span>
        </a>
        <div className="sidebar-line" />
        <button
          title="Mission control"
          aria-label="Mission control"
          className={tab === "studio" ? "nav active" : "nav"}
          onClick={() => setTab("studio")}
        >
          ▦
        </button>
        <button
          title="Mutation library"
          aria-label="Mutation library"
          className={tab === "library" ? "nav active" : "nav"}
          onClick={() => setTab("library")}
        >
          ✧
        </button>
        <button
          title="Safety and connections"
          aria-label="Safety and connections"
          className={tab === "settings" ? "nav active" : "nav"}
          onClick={() => setTab("settings")}
        >
          ⚙
        </button>
        <div className="sidebar-bottom">
          <span className="avatar">OP</span>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <a href="/" className="brand">
            REALITY<span>GLITCH</span>
            <small>MISSION CONTROL</small>
          </a>
          <div className="header-right">
            <span className={`connection ${connected ? "" : "offline"}`}>
              <i />
              {connected ? "System online" : "Reconnecting"}
            </span>
            <span className="version">LOCAL / V.01</span>
            <a
              className="button subtle"
              href="/overlay"
              target="_blank"
              rel="noreferrer"
            >
              ↗ Open overlay
            </a>
          </div>
        </header>
        <main className="dashboard">
          <div className="page-heading">
            <div className="eyebrow">YOUR UNIVERSE. THEIR RULES.</div>
            <div className="title-row">
              <div>
                <h1>
                  {tab === "studio"
                    ? "Welcome to the rift."
                    : tab === "library"
                      ? "A little controlled chaos."
                      : "Keep reality in check."}
                </h1>
                <p>
                  {tab === "studio"
                    ? "Run the mission. Let chat bend reality. Try to make it out."
                    : tab === "library"
                      ? "Twelve ways to break the rules. No arbitrary code."
                      : "Local controls, Twitch connection, and your safety net."}
                </p>
              </div>
              <div className="session-badge">
                <i />
                {s?.status === "running"
                  ? "SESSION ACTIVE"
                  : s?.status === "paused"
                    ? "SESSION PAUSED"
                    : "SESSION STANDBY"}
              </div>
            </div>
          </div>
          {!authorized && (
            <section className="login-bar">
              <div>
                <strong>Unlock your control room</strong>
                <span>
                  Enter the private operator key printed in your server
                  terminal.
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ secret: key }),
                  })
                    .then(async (r) => {
                      const b = await r.json();
                      if (!r.ok) throw new Error(b.error);
                      setCsrf(b.csrf);
                      setKey("");
                      setMessage("Control room unlocked.");
                      return fetch("/api/admin/me");
                    })
                    .then((r) => r.json())
                    .then((b) => setTwitchConfigured(b.twitchConfigured))
                    .catch((e) => setMessage(e.message));
                }}
              >
                <input
                  type="password"
                  aria-label="Operator key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Operator key"
                  required
                />
                <button className="button primary">Unlock →</button>
              </form>
            </section>
          )}
          {tab === "studio" && (
            <>
              <div className="stats">
                <section>
                  <span className="stat-icon">◎</span>
                  <div>
                    <small>CURRENT MISSION</small>
                    <strong>
                      {s ? missions[s.missionId].name : "Crystal Delivery"}
                    </strong>
                  </div>
                  <span className="stat-right">01 / 03</span>
                </section>
                <section>
                  <span className="stat-icon purple-text">◴</span>
                  <div>
                    <small>TIME REMAINING</small>
                    <strong className="numeric">
                      {seconds(s?.missionRemaining || 180)}
                    </strong>
                  </div>
                  <span className="stat-right">SIM TIME</span>
                </section>
                <section>
                  <span className="stat-icon orange-text">ϟ</span>
                  <div className="chaos-stat">
                    <small>REALITY INSTABILITY</small>
                    <strong className="numeric">
                      {Math.round(s?.chaos || 0)}
                      <em> / 100</em>
                    </strong>
                    <div className="mini-meter">
                      <i style={{ width: `${s?.chaos || 0}%` }} />
                    </div>
                  </div>
                  <span className="pill green">
                    {s?.collapse
                      ? "COLLAPSE"
                      : (s?.chaos || 0) > 60
                        ? "UNSTABLE"
                        : "STABLE"}
                  </span>
                </section>
              </div>
              <div className="main-grid">
                <div className="left-column">
                  {gamePanel}
                  <section className="panel objective">
                    <span className="objective-icon">⚑</span>
                    <div>
                      <small>THE OBJECTIVE</small>
                      <h2>
                        {s
                          ? missions[s.missionId].objective
                          : missions.delivery.objective}
                      </h2>
                      <p>
                        Reach the east portal before time expires. Fall out of
                        bounds? We’ll bring you back.
                      </p>
                    </div>
                    <span className="objective-progress">
                      {s?.progress || 0}
                      <small> / {s?.target || 1}</small>
                    </span>
                  </section>
                  <section className="panel controls">
                    <div className="panel-heading">
                      <h2>Streamer controls</h2>
                      <span className="muted">You’re still in charge.</span>
                    </div>
                    <div className="control-row">
                      <button
                        className="button primary"
                        disabled={!authorized}
                        onClick={() =>
                          void api(
                            s?.status === "running"
                              ? "session/pause"
                              : s?.status === "paused"
                                ? "session/resume"
                                : "session/start",
                          )
                        }
                      >
                        {s?.status === "running"
                          ? "Ⅱ Pause session"
                          : s?.status === "paused"
                            ? "▶ Resume session"
                            : "▶ Start session"}
                      </button>
                      <button
                        className="button"
                        disabled={!authorized}
                        onClick={() => void api("session/reset")}
                      >
                        ↻ Reset
                      </button>
                      <select
                        aria-label="Select mission"
                        disabled={!authorized}
                        value={s?.missionId || "delivery"}
                        onChange={(e) =>
                          void api("mission/select", {
                            mission: e.target.value as MissionId,
                          })
                        }
                      >
                        {Object.entries(missions).map(([id, m]) => (
                          <option value={id} key={id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button danger"
                        disabled={!authorized}
                        onClick={() => void api("stabilize")}
                      >
                        ◇ Stabilize
                      </button>
                    </div>
                  </section>
                </div>
                <div className="right-column">
                  {votePanel}
                  <section className="panel active-panel">
                    <div className="panel-heading">
                      <h2>Active mutations</h2>
                      <span className="count">
                        {s?.activeRules.length || 0}
                      </span>
                    </div>
                    {s?.activeRules.length ? (
                      s.activeRules.map((r) => (
                        <div className="active-rule" key={r.id}>
                          <span>✧</span>
                          <div>
                            <strong>{catalog[r.id].name}</strong>
                            <small>{catalog[r.id].category}</small>
                          </div>
                          <b>{Math.ceil((r.expiresTick - s.tick) / 30)}s</b>
                        </div>
                      ))
                    ) : (
                      <div className="empty-rules">
                        <span>◈</span>
                        <p>Reality is behaving. For now.</p>
                      </div>
                    )}
                    {s?.combos.map((c) => (
                      <div className="combo" key={c}>
                        ✦ {c}
                      </div>
                    ))}
                  </section>
                  <section className="panel event-panel">
                    <div className="panel-heading">
                      <h2>Reality feed</h2>
                      <span className="live-label">● LIVE</span>
                    </div>
                    {(s?.history.length
                      ? s.history
                      : ["Systems ready. Waiting for your first glitch."]
                    )
                      .slice(0, 3)
                      .map((event, i) => (
                        <div className="feed-event" key={`${i}-${event}`}>
                          <span>✦</span>
                          <p>
                            {event}
                            <small>
                              {i === 0 ? "LATEST EVENT" : "RECENT EVENT"}
                            </small>
                          </p>
                        </div>
                      ))}
                  </section>
                </div>
              </div>
              <section className="panel demo-panel">
                <div>
                  <span className="pill purple">DEMO LAB</span>
                  <h2>No chat? No problem.</h2>
                  <p>
                    Simulate your audience through the same command pipeline.
                    Showcase: 5s propose / 3s vote / 2s cooldown.
                  </p>
                </div>
                <div className="demo-actions">
                  <button
                    className="button"
                    disabled={!authorized}
                    onClick={() => void api("demo", { enabled: !s?.demo })}
                  >
                    {s?.demo ? "Disable demo" : "Enable demo"}
                  </button>
                  <button
                    className="button primary"
                    disabled={!authorized}
                    onClick={() =>
                      void api("demo", { enabled: true, showcase: true })
                    }
                  >
                    ▶ 3-minute showcase
                  </button>
                </div>
                <form
                  className="chat-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void api("demo/event", { user, text });
                  }}
                >
                  <input
                    aria-label="Simulated viewer ID"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="Viewer ID"
                    maxLength={64}
                  />
                  <input
                    aria-label="Simulated chat command"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={500}
                  />
                  <button className="button" disabled={!authorized || !s?.demo}>
                    Send command ↗
                  </button>
                </form>
              </section>
            </>
          )}
          {tab === "library" && (
            <div className="library">
              {ids.map((id, i) => (
                <article className="panel mutation-card" key={id}>
                  <div className="mutation-glyph">
                    {
                      [
                        "↥",
                        "↤",
                        "↦",
                        "☾",
                        "◇",
                        "≈",
                        "⊞",
                        "»",
                        "◴",
                        "▱",
                        "♧",
                        "✦",
                      ][i]
                    }
                  </div>
                  <span className="eyebrow">
                    {catalog[id].category.toUpperCase()} /{" "}
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2>{catalog[id].name}</h2>
                  <p>{catalog[id].description}</p>
                  <code>!glitch {id.replaceAll("-", " ")}</code>
                  <div className="card-meta">
                    <span>{catalog[id].duration}s duration</span>
                    <span>+{catalog[id].weight} chaos</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel setting">
                <h2>Twitch connection</h2>
                <p>
                  Read-only chat ingestion. Tokens stay on this backend and are
                  never persisted.
                </p>
                <p>
                  Status: <strong>{s?.twitch || "offline"}</strong>
                </p>
                {twitchConfigured ? (
                  <a className="button primary" href="/auth/twitch/start">
                    Connect broadcaster account ↗
                  </a>
                ) : (
                  <p className="muted">
                    Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and the exact
                    local TWITCH_REDIRECT_URI, then restart the server. See
                    README.
                  </p>
                )}
                <button
                  className="button"
                  disabled={!authorized}
                  onClick={() => void api("twitch/disconnect")}
                >
                  Disconnect
                </button>
              </section>
              <section className="panel setting">
                <h2>Safety & accessibility</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={reduced}
                    onChange={(e) => {
                      setReduced(e.target.checked);
                      localStorage.setItem(
                        "reality-reduced-motion",
                        String(e.target.checked),
                      );
                    }}
                  />{" "}
                  Reduced motion
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={!authorized}
                    checked={muted}
                    onChange={(e) => {
                      setMuted(e.target.checked);
                      void api("moderation", { muted: e.target.checked });
                    }}
                  />{" "}
                  Mute audience commands
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void api("moderation", { user: blockUser, blocked: true });
                  }}
                >
                  <input
                    aria-label="Viewer ID to block"
                    value={blockUser}
                    onChange={(e) => setBlockUser(e.target.value)}
                    placeholder="Viewer ID to block"
                    required
                  />
                  <button className="button" disabled={!authorized}>
                    Block viewer
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={!authorized || !blockUser}
                    onClick={() =>
                      void api("moderation", {
                        user: blockUser,
                        blocked: false,
                      })
                    }
                  >
                    Unblock
                  </button>
                </form>
              </section>
              <section className="panel setting">
                <h2>Session data</h2>
                <p>
                  Export accepted, pseudonymous commands and inputs for
                  deterministic replay. Raw chat and OAuth credentials are never
                  stored.
                </p>
                <a
                  className="button"
                  href="/api/admin/replay"
                  download="reality-replay.json"
                >
                  Export replay ↓
                </a>
                <button
                  className="button danger"
                  disabled={!authorized}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete session logs and moderation data? This cannot be undone.",
                      )
                    )
                      void api("data/delete");
                  }}
                >
                  Delete session data
                </button>
              </section>
              <section className="panel setting">
                <h2>OBS browser source</h2>
                <p>
                  Use this server’s <code>/overlay</code> path at 1920 × 1080.
                  The overlay has no operator controls or credentials.
                </p>
                <p className="muted">
                  Keep this server bound to loopback. Start OBS on the same
                  machine.
                </p>
                <a
                  className="button"
                  href="/overlay"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open overlay ↗
                </a>
              </section>
            </div>
          )}
          <div role="status" className={`feedback ${message ? "visible" : ""}`}>
            {message}
          </div>
          <footer>
            <span>
              <span className="tiny-logo">✳</span> REALITY GLITCH <b> / </b>{" "}
              BUILT FOR THE UNEXPECTED
            </span>
            <span>
              {connected ? "● Connected" : "○ Offline"} <b> / </b>{" "}
              {s?.stateHash.slice(0, 8) || "--------"} <b> / </b> LOCAL-FIRST.
              ALWAYS.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
