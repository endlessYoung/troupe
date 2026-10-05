# Event schema

> Chinese version: [中文版](../zh-CN/EVENT-SCHEMA.md)

Every team fact enters through one call:

```ts
window.TeamEvents.push({
  type: 'task_done',
  actor: '架构师',
  action: '提交 ADR-002',
  ts: Date.now(),
  payload: {},
});
```

`actor` may be a member id (`architect`) or a display alias (`架构师`, `Architect`). `action` is a string. Simulated events also carry `payload.actionL10n = { en, 'zh-CN' }` so the feed can switch language. A hand-pushed event without that field is shown as written.

`ts` defaults to `Date.now()` when omitted.

## Types

| type | When it fires | Payload |
| --- | --- | --- |
| `task_started` | Someone picks up work | `progress` 0–1, `station` |
| `task_progress` | The same task moves | `progress`, `station` |
| `task_done` | The task is wrapped | `progress: 1`, optional `asset: true` |
| `task_handoff` | A chip crosses zones | `chipId`, `fromZone`, `toZone`, `title` |
| `review_comment` | One review line | `reviewId`, `round`, `closed`, `resolve` |
| `meeting_speech` | One spoken line | `scene` |
| `dm_message` | A private thread | `to`, `text`, `end` |
| `member_online` | Online, or reinstated | `suspended: false` on return |
| `member_offline` | Offline, or dormant | `suspended: true` for the stop-work plan |
| `member_pose` | A step inside the home zone | `slots: { [memberId]: 0 \| 1 \| 2 }` |
| `phase_changed` | The active phase moves | `phase` |
| `report_standup` | Standup opens | `attendees` |
| `report_weekly` | Friday note from the project manager | |
| `version_signoff` | Sign-off beat | `step: summary \| present \| decision`, `decision`, `session` |
| `alignment_done` | A huddle reaches a decision | `level: 'L1'`, `attendees` |
| `review_score` | One score, or the lead agent's summary | `from` via actor, `to`, `score`, `axis: up \| down \| peer \| summary` |
| `cost_report` | Token level | `used`, `budget`, `ratio` |
| `budget_alert` | A watermark is crossed | `threshold` 70 / 85 / 100 / 120, `ratio` |
| `escalation_urgent` | Stop the floor | `level: 'P0' \| 'P1'` |
| `alert_cleared` | The alert is over | `level` |
| `scene_cue` | A scene starts or ends | `scene`, `phase: start \| end`, `attendees`, `status` |

`member_pose` and `scene_cue` are show events. They are part of the bus so the renderer still does not schedule team data itself. `member_pose` is kept out of the public feed because it would flood it. The event monitor still shows it.

`escalation_urgent.level` is `P0` or `P1`.

## What the feed hides

- `dm_message` renders as "{a} ↔ {b}" and does not print `payload.text`.
- Events with `payload.quiet: true` update state but skip the feed (the boot burst).

## Producers

| Producer | Where | Status |
| --- | --- | --- |
| `SimulationEngine` | `packages/simulation` | Active. Director + role loops. |
| `RealtimeAdapter` | `packages/team-events/src/realtime-adapter.ts` | Empty. Marked `REAL-SOURCE`. |
| The console | `window.TeamEvents.push` | Always available. Same door. |
