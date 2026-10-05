# 架构说明

> English version: [英文版](../en/ARCHITECTURE.md)

troupe 先是一家公司，然后才是若干项目。

```
projects/*   自包含的产品（总览、分工、里程碑、交付物、文档）
crew/*       演员库与行为脚本（只在 dev 分支）
packages/*   共享运行时：事件总线、配置校验、模拟导演
docs/*       公司级双语文档
```

依赖只有一个方向：`projects → packages`。packages 不引用任何项目，也不引用 `crew/`。

## 战况室

`projects/warroom/app` 是 Vite + TypeScript 单页。three.js 走 npm 依赖，由 Vite 打进包里，运行时不请求 CDN。

| 路径 | 职责 |
| --- | --- |
| `src/scene/` | 等距基地。人只在自己的产区里动。任务芯片跨产区传递。 |
| `src/panels/` | 顶栏、KPI、详情、时间线、泊位、动态、小队看板 |
| `src/scenarios/` | 下钻情景：评审会、站会、名单、个人、事件监视器、敲定、考评、私聊、碰头、警报 |
| `src/i18n/` | `en.json` 与 `zh-CN.json`。界面文字不硬编码。 |
| `team.config.json` | 这支剧团。换这份文件，场上就换成另一支团队。 |

全部 CSS 选择器以 `#warroom` 开头，将来可以作为宿主产品里的一个标签页嵌入。

## 一条总线

全站唯一的数据门是 `window.TeamEvents.push({ type, actor, action, ts, payload })`。

- `packages/team-events` 持有总线、事件名和 `RealtimeAdapter`。
- `packages/simulation` 持有 `SimulationEngine`（导演）。只有这里在排时间。
- 前端只订阅。它不用自己的定时器编造团队数据。两次事件之间的位移（迈一步、芯片滑过去、呼吸灯）是渲染，不是第二份事实。

换事件源时，场景和面板不用改：

```ts
bus.setAdapter(new RealtimeAdapter());
```

`RealtimeAdapter.start` 标了 `REAL-SOURCE`。以后用 WebSocket 或 SSE 把真实 agent 帧推进同一个 `push`。

## 为什么页面不直接引用 crew 脚本

`main` 必须在没有 `crew/` 的情况下能启动。`packages/simulation` 里的导演是公开演出：领任务、干活、发事件、交接，然后下一场。`crew/<角色>/behavior.json` 是同一套循环的演员版（dev 分支）。角色循环改了，两处一起改。

## 场上就是流水线

六个产区按 SDLC 排开：立项 → 规划 → 设计 → 实现 → 测试 → 发布。发布前有质检区，庭院中央是指挥高台。七座建筑落在这些产区上：需求池、设计、评审、实现、测试、发布、指挥台。

人不跨产区通勤。`task_handoff` 移动芯片。实现区没有常驻员工，活是流进来的。

## 小队、成本、闸门

- 产品小队和工程小队给产区着色。小队卡片显示在线人数和进行中任务。
- Token 消耗是一张 KPI，刻度在 70 / 85 / 100 / 120。越过刻度时发 `budget_alert`。到 120，停职预案让除主 Agent 以外的人休眠；水位回到 70 以下则复职。
- `version_signoff` 演三步：汇总 → 呈交 → 董事长决定。只有 `approved` 会打开发布闸门。
- `escalation_urgent` 把场地染红，动态置顶，并拦住下一场，直到 `alert_cleared`。
- `dm_message` 的正文不进公开动态。只有选中对话双方之一时，才渲染正文。
