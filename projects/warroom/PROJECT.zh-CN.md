# 战况室 —— 实时 AI 工程剧团看板

> 像 NASA 任务控制中心一样：实时观看一支全 AI 工程团队干活。3D 等距风，每个面板可点开看"情景剧"直播。

[English](PROJECT.md)

## 状态

- **当前里程碑：** 骨架 + demo v0.1 完成（模拟数据，真机 Chromium 零报错验证）。Cursor 真实实现待启动（`feature/warroom-v1`）。
- **数据面：** 现阶段是模拟中控——中央 `Director` 调度情景剧，8 个角色跑行为脚本，全部走 `window.TeamEvents`；真实 agent 事件以后走 `REAL-SOURCE` 口子（WebSocket/SSE）。
- **沟通机制：** L0 私聊 → L1 碰头（只叫相关人）→ L2 评审会 → L3 对齐会；站会、版本敲定门、紧急上报红色警报——全部可视化。
- **国际化：** en + zh-CN，界面文字禁硬编码。**Commit 用英文。**

## 目录

`app/` 前端本体（公开）· `team/` 分工（dev）· `milestones/` p0→p6（dev）· `deliverables/`（dev）· `docs/` 双语（公开）。
