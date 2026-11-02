# Reality Glitch

A local-first audience-controlled physics game. You pilot the explorer; chat proposes and votes on twelve safe world mutations. No paid service, Twitch account, AI key, or public server is required for the offline demo.

## Run locally

Use Node **24.x** (the lockfile was verified with 24.19.0) and npm 11.

```sh
npm ci
npm run demo
```

Open the **exact** `http://127.0.0.1:3000` address printed by the server. Enter the private operator key printed in that terminal, then choose **Start session** or **3-minute showcase**. The generated key changes after each process restart. Never share the key, terminal output, `.env`, or dashboard in your stream capture.

- **A / D**, left / right: move. **Space / W / Up**: jump. Click the game area first if a form has focus.
- **Crystal Delivery:** collect the purple crystal and reach the eastern portal.
- **Forest Rescue:** reach the stranded explorer and escort them east.
- **Exit Beacon:** collect three cyan beacons and reach the portal.
- Each mission lasts 180 simulation seconds. Pause freezes physics, rounds, effect expiry, and mission time.
- Reset starts a fresh mission and clears input, proposals, votes, effects, deduplication and command rate limits. Emergency Stabilize clears effects/collapse, stops the player, and returns them to the checkpoint.
- Input requires an operator session; a 500 ms input lease stops movement if a dashboard disconnects. Arrow keys work only outside forms/buttons.

`npm run dev` starts ordinary local play. `npm run demo` also enables manual simulated chat. The showcase button starts a **seeded 180-second** simulation using the same chat parser and validators, with **5 s proposal / 3 s vote / 2 s cooldown** rounds. This intentional accelerated setting allows 10–15-second effects to overlap and demonstrates all four combos and Collapse. Standard play uses **15 / 10 / 5** seconds. The showcase simulates the audience; the operator still controls the explorer. It remains running until mission completion or timeout.

## Audience commands

```text
!glitch moon gravity
!glitch super bounce
!vote 1
```

The Mutation Library lists all twelve aliases. Hyphenated IDs also work. One proposal per viewer per round; one replaceable vote per viewer. Up to three distinct candidates are shortlisted by unique proposers, then a seeded stable tie-break. At vote close, the highest-ranked currently compatible candidate activates, even if turnout is zero. No proposals produces a no-op round.

Gravity variants are mutually exclusive, as are floor-friction variants. Duplicate effects do not stack. Effects are data-only, finite, and allowlisted. They recompute from baseline in category/ID order every tick; expired rules never restore stale snapshots. Slow motion scales physics substeps while effect lifetimes remain in simulation ticks. Four combos are cosmetic: Lunar Pinball, Sideways Slip, Forest Migration, Crystal Catapult.

Chaos decays at 0.3 per simulation second; mutations add 10–18 points. At 100, an eight-second bounded gravity cycle begins, then chaos becomes 25 with a 45-second collapse cooldown. There is no rapid flashing. Reduced motion disables positional interpolation; the palette and collapse border stay steady.

## Twitch (optional, live validation required)

1. Register a Twitch developer application. Set the exact OAuth redirect to `http://127.0.0.1:3000/auth/twitch/callback`.
2. Copy `.env.example` to `.env` and supply the client ID and client secret **locally**. Never commit real credentials. Node loads `.env` at startup.
3. Restart the server, unlock the dashboard, and open **Safety and connections → Connect broadcaster account**.
4. Authorize the broadcaster account that owns the channel you want to read. This implementation supports the broadcaster's own channel, not a separate bot reading arbitrary channels.
5. The backend requests only `user:read:chat`, exchanges the authorization code with client credentials, state and a PKCE challenge/verifier, validates the token, and creates EventSub `channel.chat.message` v1 over WebSocket. No chat-write permissions or public webhook.

Access and refresh tokens exist in backend memory only. Refresh occurs before expiry. Revocation or invalid refresh fails closed. Disconnect drops local tokens; use Twitch account **Connections** to revoke application authorization at Twitch. Reauthorize after restarting the backend. Browser bundles and overlay payloads never contain credentials. HTTP and WebSocket connections honor configured environment proxies; do not disable TLS verification.

Live OAuth/provider compatibility, a real Twitch chat session, and revocation must be tested with a registered application before release. Official Twitch documentation could not be fetched from this managed environment (destination policy denied it); fixture tests exercise the implemented protocol, not Twitch's live service. The server continues offline when Twitch fails.

## OBS

Add a **Browser Source** with the local server's `/overlay` path, width **1920**, height **1080**, on the same machine as the server. Overlay HTML and snapshots are public and read-only. They show objective, simulation, vote phase/countdown/options, active effects, chaos and latest event, without operator controls or viewer identities. **DEMO** is visible when enabled. The overlay reconnects and receives a fresh snapshot automatically. The scene has an opaque game background; compositing a transparent game HUD is not implemented.

A cloud machine's loopback address is not your local OBS address. Run the project locally for OBS capture; do not expose the backend publicly to work around this. The implementation binds to `127.0.0.1` only. Remote operation would need a separate TLS and access-control design.

## Validation

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run replay:verify
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --omit=dev
```

For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. Browser tests start their own demo server on port 3000 with a test-only operator key; stop other servers first. Browser screenshots are saved under ignored `test-results/`.

Tests cover parsing, hostile input, mutable voting, deduplication, bounds/composition, four combos, collapse/expiry, pause/reset, checkpoints, real physics completion of all three missions, deterministic replay, storage deletion, admin auth/Origin/CSRF, Twitch fixtures, browser control flow, overlay isolation and mobile overflow. The synthetic load test runs 6,000 events at timestamped 20/s over five simulated minutes; it is not a five-minute wall-clock soak or a measured OBS end-to-end latency certification.

Build then run production:

```sh
npm run build
npm start
```

Vite bundles the renderer, self-hosted fonts and React into `dist/web`. Phaser is a substantial local asset; there is no CDN dependency. The production server serves only known asset filenames and the two application routes. Node/tsx runs the strict TypeScript backend.

## Replay and privacy

Export a replay from **Safety and connections → Session data**. Verify that file on the same build/runtime:

```sh
npm run replay -- reality-replay.json
```

Accepted commands and player inputs are recorded at their authoritative tick. Replay metadata includes seed, mission, timing configuration, terminal status and SHA-256-derived state hash. Commands are normalized, user/message identifiers are pseudonymized, and raw chat is discarded. Hashes exclude transient transport health and session UUIDs. Physics guarantees are for identical runtime/build, not cross-platform lockstep.

SQLite uses WAL and prepared statements. `.data/reality.sqlite` stores versioned schema metadata, session metadata, accepted domain events and the operator's explicit blocklist. Blocklist entries retain the user IDs necessary to enforce moderation across sessions; this local file is private. Tokens are never persisted. **Delete session data** clears sessions, events, replay metadata and blocklist, checkpoints WAL, vacuums the DB, and resets the game. No analytics or external AI calls exist.

## Architecture and security

- `packages/domain/src`: pure parser, Zod contracts, bounded ingress/rate limits, seeded voting, typed catalog, composition and chaos controller.
- `apps/server/src`: headless Matter.js, 30 Hz authoritative clock (two <=16.67 ms physics substeps), authenticated Fastify API, read-only WebSocket publisher, Twitch adapter and SQLite store.
- `apps/web/src`: React dashboard/OBS layout and Phaser 3 snapshot rendering, with no client physics engine.
- `.kiro/specs/reality-glitch`: supplied requirements/design and implementation checklist.
- `tests`: unit/property, integration/replay/protocol and Playwright checks.

An unpredictable operator key establishes an HttpOnly SameSite=Strict cookie session (12 hours) with a CSRF token and exact Origin validation for every admin mutation. Operator routes require authentication. Public sockets reject client messages and unapproved Origins, limit clients/payloads/backpressure, and receive only redacted snapshots. Viewer ingress has max 500-character content, deduplication TTL/capacity, 3 commands per 10 seconds/user and a 20/s global bucket; Twitch's queue is capped at 1,000. Admin input bypasses the viewer queue. Mute and persistent block/unblock controls are available. There is no `eval`, chat-derived import, user script execution, or AI integration.

## Troubleshooting and release gates

- **Login/CSRF fails:** use `127.0.0.1`, not `localhost`; use the current terminal key. Set `PORT` before launch if needed and use that exact port in the Twitch redirect.
- **No command accepted:** start/resume a mission, enable demo for simulated input, check phase and compatibility, and wait for the rate limiter. Reuse the same simulated viewer ID to exercise one-viewer limits; change it to simulate distinct viewers.
- **No Twitch connection:** confirm backend credentials, registered redirect and outbound access to `id.twitch.tv`, `api.twitch.tv`, `eventsub.wss.twitch.tv`. Reauthorize rather than editing tokens.
- **SQLite native installation fails:** use Node 24 and a compiler/Python toolchain if no trusted prebuilt binary exists. Do not bypass integrity/TLS checks.
- **Cloud networking or listen errors:** the managed command sandbox may require approval to use the configured proxy or launch local servers.

Automated checks are implemented; release still requires a live Twitch run, an OBS application capture, human accessibility review, a real-time load/latency run, and cross-machine fresh-install verification. Optional natural-language AI remains deferred as specified. Do not describe the full P0 release gate as passed until those checks are recorded.
