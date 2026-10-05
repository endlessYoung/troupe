# Architecture

> Chinese version: [中文版](../zh-CN/ARCHITECTURE.md)

troupe is a company first, and a set of projects second.

```
projects/*   self-contained products (overview, team, milestones, deliverables, docs)
crew/*       performer roster and behavior scripts (dev branch only)
packages/*   shared runtime: event bus, config checks, simulation
docs/*       company-level bilingual docs
```

Dependencies run one way: `projects → packages`. Packages never import a project, and they never import `crew/`.

## The war room

`projects/warroom/app` is a Vite + TypeScript single page. three.js is an npm dependency, bundled by Vite, so the floor does not fetch a CDN at runtime.

| Path | Role |
| --- | --- |
| `src/scene/` | Isometric base. Avatars stay inside their own zone. Task chips move between zones. |
| `src/panels/` | Top bar, KPIs, detail, timeline, docks, feed, squad boards |
| `src/scenarios/` | Drill-down scenes: review, standup, roster, member, event monitor, sign-off, scoring, DM, huddle, alert |
| `src/i18n/` | `en.json` and `zh-CN.json`. UI chrome is not hard-coded. |
| `team.config.json` | The troupe. Swap this file to retarget the floor. |

All CSS selectors start with `#warroom`, so the page can sit inside a host product as one tab.

## One bus

The only data door is `window.TeamEvents.push({ type, actor, action, ts, payload })`.

- `packages/team-events` owns the bus, the event names, and `RealtimeAdapter`.
- `packages/simulation` owns `SimulationEngine` (the director). It is the only place that schedules time.
- The app subscribes. It does not invent team data on its own timers. Motion between two event targets (a step, a chip slide, a breath) is rendering, not a second source of truth.

Switching producers does not touch the scene or the panels:

```ts
bus.setAdapter(new RealtimeAdapter());
```

`RealtimeAdapter.start` is marked `REAL-SOURCE`. That is where a WebSocket or SSE client will forward live agent frames into the same `push`.

## Why crew scripts are not imported by the app

`main` must boot without `crew/`. The director in `packages/simulation` is the public show: claim, work, emit, hand off, then the next scene. `crew/<role>/behavior.json` is the same loop written for the performer (dev branch). Keep them aligned when a role's loop changes.

## Floor equals the pipeline

Six production zones follow the SDLC: inception → planning → design → build → test → release, plus a quality gate before release and a command dais in the courtyard. Seven buildings sit on those zones: backlog, design, review, build, test, release, command.

People do not commute across zones. A `task_handoff` moves a chip. The build bay has no resident; work arrives as chips.

## Squads, cost, and the gate

- Product and engineering squads tint their zones. Squad cards show online count and active tasks.
- Token spend is a KPI with marks at 70 / 85 / 100 / 120. `budget_alert` posts the crossing. At 120 the stop-work plan sends everyone but the lead agent dormant; dropping back under 70 reinstates them.
- `version_signoff` plays summary → present → chairman decision. Only `approved` opens the release gate.
- `escalation_urgent` paints the floor red, pins the feed line, and holds the next scene until `alert_cleared`.
- `dm_message` keeps the body off the public feed. The transcript renders only when one of the two people is selected.
