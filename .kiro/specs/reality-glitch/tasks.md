# Implementation checkpoints

- [x] Strict TypeScript, npm workspaces, pinned dependencies, shared Zod contracts, CI.
- [x] Typed twelve-modifier catalog, deterministic proposals/votes, compatibility, expiry, chaos, four combos and collapse.
- [x] Server-owned Matter.js physics, three completable missions, safe checkpoint, pause/reset/stabilize and input lease.
- [x] React dashboard, Phaser snapshot renderer, responsive OBS route, reduced motion, self-hosted assets.
- [x] Offline manual chat and seeded 180-second accelerated audience showcase.
- [x] Local operator authentication, exact Origin/CSRF, ingress limits, mute/blocklist, read-only redacted snapshots.
- [x] In-memory Twitch OAuth credentials, read-only EventSub adapter, reconnect/refresh/revocation and protocol fixtures.
- [x] SQLite metadata/events/blocklist, pseudonymous replay export, replay CLI and deletion.
- [x] Domain/property, mission, replay, API, Twitch fixture and browser tests.
- [ ] Live Twitch authorization/chat/refresh/revocation with registered app; confirm current provider PKCE compatibility.
- [ ] Capture in real OBS at 1080p and conduct human accessibility/visual review.
- [ ] Five-minute real-time load, measured command-to-ack and snapshot-to-display p95, and fresh-machine install verification.
- [ ] Full P0 acceptance/release signoff. Optional AI deliberately deferred.

Design clarifications: the standard 30-second rounds exceed all effect durations, so the explicitly labelled showcase uses configurable 5/3/2-second rounds to demonstrate overlaps. Renderer uses a full game scene background rather than a transparent HUD. No live service or manual release gate is represented as an automated pass.
