# Contributing to troupe

## Branches (semi-open source)

- `main` — the clean public face: runnable product (`projects/warroom/app/`), shared `packages/`, project overviews (`projects/*/PROJECT.md`), public docs. **Never commit `crew/`, per-project `team/`, `milestones/`, `deliverables/` to `main`.** Never commit directly.
- `dev` — full internals: everything in `main`, plus `crew/` (performer know-how), per-project `team/`, `milestones/`, `deliverables/`.
- `release` — snapshots of `main`, tagged.
- `feature/*` — short-lived branches, cut from `dev`, merged back into `dev` via PR.

Note: the repo is public, so `dev` is technically readable — the split keeps the default view clean. True isolation later means a separate private repo.

## Projects

Each project under `projects/` is self-contained:

```
projects/<name>/
├── PROJECT.md        # overview: goal / status / current milestone (public)
├── team/             # staffing & roles for this project (dev only)
├── milestones/       # p0→p6, STATUS.md + per-phase output (dev only)
├── deliverables/     # shippable artifacts (dev only)
└── docs/             # project docs, en + zh-CN (public)
```

## Commits

**Write all commit messages in English.** Conventional Commits recommended:

```
feat(warroom): add review-meeting scenario drill-down
fix(i18n): fallback to en when zh-CN key is missing
docs: add EVENT-SCHEMA in zh-CN
```

## Docs & i18n

- Docs bilingual: `docs/en/` ↔ `docs/zh-CN/`, plus per-project `docs/`; update both in the same PR.
- UI strings live in `projects/warroom/app/src/i18n/*.json`. Never hard-code user-facing text. Support `en` + `zh-CN`, default to browser language, fall back to `en`.
