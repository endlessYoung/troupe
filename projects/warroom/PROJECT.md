# Warroom — Real-time AI Engineering Troupe Dashboard

> Like NASA mission control for agents: watch an all-AI engineering team work in real time. 3D isometric style, every panel drillable into a live "scene".

[中文](PROJECT.zh-CN.md)

## Status

- **Current milestone:** skeleton + demo v0.1 done (simulated data, verified in real Chromium with zero JS errors). Real implementation pending in Cursor (`feature/warroom-v1`).
- **Data plane:** simulated control room now — a central `Director` schedules scenarios, 8 roles run behavior scripts, all through `window.TeamEvents`. Real agent events later via the `REAL-SOURCE` seam (WebSocket/SSE).
- **Comms protocol:** L0 DM → L1 huddle (relevant people only) → L2 review → L3 alignment; standups, version sign-off gate, urgent escalation with red alert — all visualized.
- **i18n:** en + zh-CN, no hard-coded UI strings. **Commits in English.**

## Layout

`app/` the frontend itself (public) · `team/` staffing (dev) · `milestones/` p0→p6 (dev) · `deliverables/` (dev) · `docs/` bilingual (public).
