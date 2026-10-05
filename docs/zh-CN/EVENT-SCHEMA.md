# 事件 Schema

> English version: [英文版](../en/EVENT-SCHEMA.md)

团队事实只从这一次调用进门：

```ts
window.TeamEvents.push({
  type: 'task_done',
  actor: '架构师',
  action: '提交 ADR-002',
  ts: Date.now(),
  payload: {},
});
```

`actor` 可以是成员 id（`architect`），也可以是显示名（`架构师`、`Architect`）。`action` 是字符串。模拟事件另外带 `payload.actionL10n = { en, 'zh-CN' }`，动态才能随语言切换。控制台手推的事件没有这个字段，就按原文显示。

省略 `ts` 时，默认为 `Date.now()`。

## 类型

| type | 何时发出 | payload |
| --- | --- | --- |
| `task_started` | 有人领了活 | `progress` 0–1，`station` |
| `task_progress` | 同一件活在推进 | `progress`，`station` |
| `task_done` | 这件活做完 | `progress: 1`，可选 `asset: true` |
| `task_handoff` | 芯片跨产区 | `chipId`，`fromZone`，`toZone`，`title` |
| `review_comment` | 一条评审意见 | `reviewId`，`round`，`closed`，`resolve` |
| `meeting_speech` | 一句发言 | `scene` |
| `dm_message` | 一条私聊 | `to`，`text`，`end` |
| `member_online` | 上线，或复职 | 复职时 `suspended: false` |
| `member_offline` | 离线，或休眠 | 停职预案时 `suspended: true` |
| `member_pose` | 在本产区内迈一步 | `slots: { [memberId]: 0 \| 1 \| 2 }` |
| `phase_changed` | 当前阶段切换 | `phase` |
| `report_standup` | 站会开场 | `attendees` |
| `report_weekly` | 项目经理的周五纪要 | |
| `version_signoff` | 敲定的一拍 | `step: summary \| present \| decision`，`decision`，`session` |
| `alignment_done` | 碰头有了结论 | `level: 'L1'`，`attendees` |
| `review_score` | 一条评分，或主 Agent 的汇总 | actor 即评分人，`to`，`score`，`axis: up \| down \| peer \| summary` |
| `cost_report` | Token 水位 | `used`，`budget`，`ratio` |
| `budget_alert` | 越过一条水位线 | `threshold` 为 70 / 85 / 100 / 120，`ratio` |
| `escalation_urgent` | 全场停下 | `level: 'P0' \| 'P1'` |
| `alert_cleared` | 警报解除 | `level` |
| `scene_cue` | 一场情景开始或结束 | `scene`，`phase: start \| end`，`attendees`，`status` |

`member_pose` 和 `scene_cue` 是演出事件。它们也走总线，这样渲染层仍然不自己排团队数据。`member_pose` 不进公开动态，否则会把动态刷满。事件监视器里仍能看到。

`escalation_urgent.level` 取 `P0` 或 `P1`。

## 动态里不展开的内容

- `dm_message` 显示成「{a} ↔ {b}」，不打印 `payload.text`。
- `payload.quiet: true` 的事件会改状态，但跳过动态（开场那一阵）。

## 事件源

| 事件源 | 位置 | 状态 |
| --- | --- | --- |
| `SimulationEngine` | `packages/simulation` | 当前在用。导演 + 角色循环。 |
| `RealtimeAdapter` | `packages/team-events/src/realtime-adapter.ts` | 空位。标了 `REAL-SOURCE`。 |
| 控制台 | `window.TeamEvents.push` | 始终可用。同一扇门。 |
