# troupe — Your AI Engineering Troupe

> A real-time "war room" that visualizes an AI engineering team at work — like NASA mission control for agents.

*Troupe* means a company of performers. English *company* doubles as "business / theater troupe": the war room is the theater, every panel is a live scene — review meetings, daily standups, a member's work in progress. Click any panel to watch the story unfold.

The bigger vision is a **drop-in AI engineering team**: swap one `team.config.json` and the whole troupe re-forms for any team. Seeing your AI team work for you *is* the membership pitch.

[中文文档](README.zh-CN.md)

## Layout: company first, projects second

```
troupe/
├── projects/                  # One directory per project — each with its own
│   ├── paper/                 #   team, milestones, deliverables, docs
│   │   ├── PROJECT.md         #   overview: goal / status / current milestone
│   │   ├── team/              #   staffing for this project (dev only)
│   │   ├── milestones/        #   p0→p6: STATUS.md + per-phase output (dev only)
│   │   ├── deliverables/      #   shippable artifacts (dev only)
│   │   └── docs/              #   project docs, en + zh-CN
│   └── warroom/               # (same layout)
│       └── app/               #   the war-room frontend itself (public)
├── crew/                      # company-level: performer roster & behavior (dev only)
├── packages/                  # company-level: shared tech (event bus, sim engine)
├── docs/                      # company-level: bilingual team docs
```

Semi-open source: `main` is the clean public face (runnable product + overviews + public docs); `dev` holds the full internals (`crew/`, per-project `team/`, `milestones/`, `deliverables/`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Branches

- `main` — public face, stable
- `dev` — full internals, daily integration
- `release` — snapshots of `main`, tagged
- `feature/*` — cut from `dev`, merged back into `dev`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: **commits in English**, docs bilingual (en + zh-CN), never commit `crew/`, per-project `team/`, `milestones/`, `deliverables/` to `main`.
