# troupe — Your AI Engineering Troupe

> A real-time war room for an all-AI engineering team. One company floor, isometric, day or night.

*Troupe* is a company of performers. English *company* doubles as "business / theater troupe": the war room is the theater, and the floor is the stage. Click a person or a room and the drawer opens. The scene — a review, a standup, one person's work — is in there.

Swap one `team.config.json` and the same floor serves another team. That is the drop-in pitch.

[中文文档](README.zh-CN.md)

## Run it locally

From the repository root:

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/. The page boots on the simulated director, so it does not need a backend, a login, or a network call to three.js (the library is bundled).

```bash
npm run typecheck
npm run lint
npm run build
```

`npm run build` writes `projects/warroom/app/dist`.

The floor follows the browser language (`zh*` → zh-CN, otherwise English) and falls back to English when a key is missing. EN / 中文 sits with the tools at the top right and switches immediately.

## The floor

![The floor by day, during standup](docs/screenshots/day.png)

The building fills the frame. Nine rooms share walls. Along the back: inception, backlog, command, design, build. Along the front: release, review, test, and the lounge. A wood corridor runs between the two rows.

![The same floor after dark](docs/screenshots/night.png)

From 19:00 to 07:00 the page opens at night. Room lights, the command screen, and the desk lamps carry the scene. Night / Day, or `N`, switches it.

![The review room, opened with the 6 key](docs/screenshots/review.png)

Click a room, a person, or press `1` through `7`. The camera flies there and the drawer opens on the right, clear of the room. Drag to orbit, right-drag to pan, scroll to zoom. `Esc` returns to the overview. `T` tours the seven rooms and stops the moment you move the camera.

A name tag carries status and task progress. A new event raises a speech bubble over that person. Standup, a huddle, and a private thread draw an arc only between the people actually in it. A handoff crosses the corridor as a glowing dossier. The release bar lifts only after the chairman signs.

If WebGL is missing, the page stays up: a banner explains it, and the zones render as a flat board. Append `?nowebgl=1` to see that path on a machine that does have WebGL.

## Point it at another team

All organization data lives in one file:

`projects/warroom/app/team.config.json`

It holds the troupe name, members, squads, stations, zones, phases, review script, standup lines, the private thread, sign-off, scores, token thresholds, and the opening numbers. `packages/team-config` checks the shape at boot. A broken file renders the error list inside `#warroom` instead of a blank page.

Keep member `id`s stable. `aliases` is how a console event such as `actor: "架构师"` finds the right person. Put user-facing prose in `{ "en", "zh-CN" }` fields. UI chrome (button labels, panel titles) stays in `projects/warroom/app/src/i18n/en.json` and `zh-CN.json`.

## Event schema

The whole floor reads one bus:

```ts
window.TeamEvents.push({
  type: 'task_done',
  actor: '架构师',
  action: '提交 ADR-002',
  ts: Date.now(),
});
```

The feed, the architect's task, and the asset count update from that call. Nothing in the panels writes team data on its own timer.

Covered types: `task_started`, `task_progress`, `task_done`, `task_handoff`, `review_comment`, `meeting_speech`, `dm_message`, `member_online`, `member_offline`, `member_pose`, `phase_changed`, `report_standup`, `report_weekly`, `version_signoff`, `alignment_done`, `review_score`, `cost_report`, `budget_alert`, `escalation_urgent`, `alert_cleared`, `scene_cue`.

`escalation_urgent` carries `payload.level` of `P0` or `P1`. A private thread (`dm_message`) is stored in `payload.text` and the public feed only says that the two people are talking.

The full table is in [docs/en/EVENT-SCHEMA.md](docs/en/EVENT-SCHEMA.md).

## Where a real agent source plugs in

`packages/team-events/src/realtime-adapter.ts` is the empty producer. The method bodies are marked `REAL-SOURCE`. Fill `start` with a WebSocket or SSE client that calls `push` for each frame, and `stop` with the close.

Turn it on from `projects/warroom/app/src/main.ts`:

```ts
bus.setAdapter(new RealtimeAdapter());
```

Do not start `SimulationEngine` in that mode. The scene and the panels subscribe to the bus either way, so they do not change.

## Layout

```
troupe/
├── projects/paper/          Paper, the troupe's first product
├── projects/warroom/app/    this floor (public, runs out of the box)
├── crew/                    performer scripts (dev branch only)
├── packages/                event bus, config checks, simulation
└── docs/                    bilingual company docs
```

Company first, projects second. Dependencies run `projects → packages` only.

`main` is the public face: the app, `packages/`, project `PROJECT.md` files, public docs, and this README. It does not carry `crew/`, or any project's `team/`, `milestones/`, or `deliverables/`. Those live on `dev`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## What you are watching

The director in `packages/simulation` plays a loop: standup, a private thread that fails to close, a huddle of only the people involved, a slice of the 39 review comments, chips moving design → build → test → review → release, the Friday note, version sign-off, and two-way scoring. Token spend steps through 70 / 85 / 100 / 120. At 120 the stop-work plan turns the company dormant, then reinstates them. Every other cycle raises a red alert and holds the next scene until it clears.

People stay seated in their own rooms. Cross-zone work is a dossier on the corridor, not a commute.
