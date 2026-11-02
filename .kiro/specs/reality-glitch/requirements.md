# Reality Glitch — Requirements

Version 1.0 · 2026-11-02 · Status: Proposed

## Vision and scope
A local-first, Twitch-connected 2D physics game in which a streamer completes short missions while viewers propose and vote on safe reality mutations. The experience must work without paid hosting or AI. Prioritize an impressive, reliable three-minute demonstration.

**Users:** streamer (admin/gameplay), viewer (chat participant), demo operator (offline simulator).

**MVP:** three missions, one world, 12 modifiers, chat proposals/votes, deterministic rule composition, chaos/collapse, OBS overlay, local demo, safety controls. **Out of scope:** user-generated executable code, multiplayer synchronization, Twitch Extension, 3D, payments, channel points, generative assets, cloud hosting.

## Functional requirements (EARS acceptance criteria)

### R01 Session and missions — P0
**Story:** As a streamer, I can run short missions and retain control.
1. WHEN a streamer starts a session, THE SYSTEM SHALL create a seeded simulation with empty active rules and zero chaos.
2. WHEN a streamer selects a mission, THE SYSTEM SHALL load one of crystal delivery, NPC rescue, or exit beacon, with visible success and failure conditions.
3. WHEN the streamer pauses, THE SYSTEM SHALL freeze physics and simulation-time effect durations.
4. WHEN the streamer resets, THE SYSTEM SHALL clear queued commands, votes, effects, and mission progress.
5. WHEN the player exits safe bounds, THE SYSTEM SHALL restore the player to a safe checkpoint within two seconds.
6. WHEN a mission succeeds or times out, THE SYSTEM SHALL show a result and stop accepting mutation rounds until restarted.
7. WHEN an unauthorized client invokes an admin action, THE SYSTEM SHALL reject it.

### R02 Twitch connectivity — P0
**Story:** As a streamer, I can connect a Twitch channel without public hosting.
1. WHEN authorized, THE SYSTEM SHALL subscribe to `channel.chat.message` EventSub over WebSocket using the minimum required user access token scopes.
2. WHEN chat arrives, THE SYSTEM SHALL normalize channel ID, user ID, message ID, content, and receive timestamp into a validated event.
3. WHEN an already-seen message ID arrives, THE SYSTEM SHALL discard it.
4. WHEN EventSub disconnects, THE SYSTEM SHALL display degraded status and reconnect using Twitch session instructions and bounded backoff.
5. WHEN Twitch is unavailable, THE SYSTEM SHALL continue the local game and permit demo mode.
6. THE SYSTEM SHALL not request chat-write permissions for MVP.

### R03 Proposals and voting — P0
**Story:** As a viewer, I can propose and select mutations fairly.
1. WHEN `!glitch <name>` arrives during a 15-second proposal window, THE SYSTEM SHALL validate it against the allowlist and accept at most one active proposal per viewer per round.
2. WHEN the proposal window ends, THE SYSTEM SHALL select up to three distinct eligible modifiers for a 10-second vote, breaking ties deterministically.
3. WHEN `!vote 1`, `!vote 2`, or `!vote 3` arrives during voting, THE SYSTEM SHALL retain one vote per user, allowing a later vote to replace it.
4. WHEN voting ends, THE SYSTEM SHALL select the most-voted compatible candidate using seeded tie-breaking and start a five-second cooldown.
5. WHEN commands are invalid, out of phase, duplicated, or rate-limited, THE SYSTEM SHALL reject them without changing game state.
6. THE SYSTEM SHALL display phase, countdown, candidate options, result, and recent applied rules.

### R04 Mutation engine — P0
**Story:** As a viewer, I can create surprising combinations without destabilizing the game.
1. THE SYSTEM SHALL support 12 allowlisted mutations with typed parameters, bounds, durations, compatibility metadata, and explicit rollback semantics.
2. WHEN a mutation activates, THE SYSTEM SHALL apply it only through predefined simulation operations, never arbitrary chat-derived code.
3. WHEN multiple mutations coexist, THE SYSTEM SHALL compose effects in a documented stable order, and reject incompatible combinations.
4. WHEN an effect expires, THE SYSTEM SHALL recompute effective world properties from baseline plus remaining effects rather than restoring stale snapshots.
5. WHEN an effect exceeds physical safety bounds, THE SYSTEM SHALL clamp or reject it and record a reason.
6. WHEN a recognized combination activates, THE SYSTEM SHALL show its name; MVP SHALL support at least four named combinations.

### R05 Chaos and collapse — P0
**Story:** As an audience member, I can build toward a spectacular climax.
1. WHEN a mutation activates, THE SYSTEM SHALL add its configured chaos weight, capped at 100.
2. WHILE gameplay advances, THE SYSTEM SHALL decay chaos at a configured simulation-time rate.
3. WHEN chaos reaches 100 outside cooldown, THE SYSTEM SHALL trigger a 6–10-second predefined Reality Collapse with bounded effects.
4. WHEN collapse ends, THE SYSTEM SHALL remove collapse effects, restore a safe chaos level, and enforce cooldown.
5. WHEN the streamer selects Emergency Stabilize, THE SYSTEM SHALL clear transient effects and recover a playable world immediately.

### R06 Presentation — P0
**Story:** As a viewer, I can understand events without reading a manual.
1. THE SYSTEM SHALL provide a responsive 16:9 browser-source overlay optimized for 1920×1080 OBS capture.
2. THE SYSTEM SHALL show objective, chaos meter, vote phase/timer, active rules, and most recent event.
3. WHEN an authoritative event occurs, THE SYSTEM SHALL update the local overlay within 250 ms at p95 under nominal load.
4. THE SYSTEM SHALL offer reduced motion, readable contrast, and no rapid strobing.
5. THE SYSTEM SHALL never expose credentials, private dashboard controls, or raw chat logs in the overlay.

### R07 Offline demo and replay — P0
**Story:** As a demo operator, I can reproduce the game without Twitch access.
1. WHEN demo mode is enabled, THE SYSTEM SHALL send simulated chat through the same parser and command-validation path as Twitch.
2. THE SYSTEM SHALL provide a seeded three-minute showcase script and a manual simulated-chat panel.
3. WHEN demo mode is active, THE SYSTEM SHALL visibly label the stream DEMO.
4. WHEN replaying the same seed and ordered domain events on the same build, THE SYSTEM SHALL reproduce equivalent authoritative state hashes.

### R08 Safety, privacy, and resilience — P0
**Story:** As a streamer, I can trust chat not to hijack the experience.
1. THE SYSTEM SHALL validate all external data with schemas, size limits, and rate limits at ingress.
2. THE SYSTEM SHALL never evaluate or dynamically import chat-provided code.
3. THE SYSTEM SHALL enforce viewer and global rate limits, moderator mute, local blocklist, and admin-only reset.
4. THE SYSTEM SHALL keep Twitch tokens on the backend only, out of logs and overlays; persisted tokens SHALL be encrypted.
5. WHEN authorization expires or is revoked, THE SYSTEM SHALL fail closed and request reauthorization.
6. WHEN client connectivity drops, THE SYSTEM SHALL continue simulation and send a fresh state snapshot on reconnect.
7. WHEN a state invariant fails, THE SYSTEM SHALL suspend new mutations, log a diagnostic, and offer safe reset.
8. THE SYSTEM SHALL permit deletion of session logs and pseudonymous viewer data.

### R09 Optional natural-language AI — P1
**Story:** As a viewer, I can phrase mutations creatively.
1. WHEN AI is disabled, THE SYSTEM SHALL remain fully playable using deterministic aliases.
2. WHEN AI is enabled, THE SYSTEM SHALL convert requests only to the existing allowlisted typed mutation schema, validated server-side.
3. WHEN the provider fails, times out, exceeds budget, or returns invalid output, THE SYSTEM SHALL fall back without blocking physics.
4. THE SYSTEM SHALL require explicit opt-in and enforce timeout, token/request budgets, and no transmission of viewer identifiers.

## MVP mutation catalog
| ID | Chat alias | Duration | Category |
|---|---|---:|---|
| gravity-up | gravity up | 12s | gravity |
| gravity-left | gravity left | 12s | gravity |
| gravity-right | gravity right | 12s | gravity |
| moon-gravity | moon gravity | 15s | gravity |
| super-bounce | super bounce | 15s | collision |
| slippery-floor | slippery floor | 15s | friction |
| sticky-floor | sticky floor | 12s | friction |
| speed-boost | speed boost | 10s | motion |
| slow-motion | slow motion | 10s | time |
| moving-platforms | moving platforms | 15s | environment |
| walking-trees | walking trees | 15s | entities |
| magnetic-crystal | magnetic crystal | 12s | force |

Known combos: **Lunar Pinball** (moon-gravity + super-bounce), **Sideways Slip** (horizontal gravity + slippery-floor), **Forest Migration** (walking-trees + moving-platforms), **Crystal Catapult** (magnetic-crystal + super-bounce). Conflicting gravity and friction variants are mutually exclusive.

## Non-functional requirements
| ID | Quality | Acceptance target |
|---|---|---|
| N01 | Performance | 30 Hz fixed authoritative simulation; target 60 FPS rendering, graceful 30 FPS fallback |
| N02 | Latency | Local command-to-ack p95 ≤500 ms, excluding Twitch transport; state-to-overlay p95 ≤250 ms |
| N03 | Throughput | 20 messages/s for 5 minutes; bounded 1,000-event ingress queue |
| N04 | Determinism | Same seed, ordered accepted events, and build yields matching state hashes |
| N05 | Availability | Offline demo and gameplay work without Twitch or AI |
| N06 | Security | No arbitrary execution; least-privilege OAuth; protected admin operations |
| N07 | Accessibility | Keyboard dashboard, visible focus, reduced motion, WCAG 2.2 AA contrast targets |
| N08 | Portability | Current Chrome/Firefox and OBS browser source; documented local startup |
| N09 | Cost | No mandatory paid API, database, hosting, or cloud resources |
| N10 | Quality | Strict TypeScript, CI lint/typecheck/tests, ≥80% coverage for parser and domain engine |

## Acceptance and release gate
All P0 criteria pass; three missions are completable; 12 modifiers and four combos demonstrable; Twitch live chat and offline demo tested; pause/reset/stabilize tested; replay hash stable; OAuth secrets absent from browser bundles; OBS scene tested; fresh setup documented. P1 AI is not a release gate.

## Assumptions and decisions
One channel and one active game session per backend; default round length 30 seconds (15 proposal + 10 vote + 5 cooldown); single trusted local operator; local binding and an unpredictable admin secret are mandatory. No Twitch account is needed in demo mode. Simulation time pauses with the game; Twitch/network time does not. No persistence of raw chat messages by default.
