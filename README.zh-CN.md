# troupe —— 你的 AI 工程剧团

> 实时可视化的 AI 工程团队"战况室"：像 NASA 任务控制中心一样，看见一支全 AI 组成的软件工程团队此刻在干什么。

英文 *company* 双关"公司 / 剧团"：战况室是剧院，每个面板都是一出"情景剧"——评审会直播、每日站会、成员手头任务，点开即看正在发生的剧情。

更大的愿景是**开箱即用的 AI 工程团队**：换一份 `team.config.json`，整支剧团就为另一支团队重新登场。看见 AI 团队在为你干活，本身就是会员制的卖点。

[English](README.md)

## 结构：先公司，后项目

```
troupe/
├── projects/                  # 每个项目独立目录，各有自己的
│   ├── paper/                 #   分工、里程碑、产出物、文档
│   │   ├── PROJECT.md         #   项目总览：目标/状态/当前里程碑
│   │   ├── team/              #   本项目分工（仅 dev）
│   │   ├── milestones/        #   p0→p6：STATUS.md + 各阶段产出（仅 dev）
│   │   ├── deliverables/      #   可交付物（仅 dev）
│   │   └── docs/              #   项目文档，中英双语
│   └── warroom/               #（同样结构）
│       └── app/               #   战况室前端本体（公开）
├── crew/                      # 公司级：演员档案与行为脚本（仅 dev）
├── packages/                  # 公司级：共享技术资产（事件总线、模拟引擎）
├── docs/                      # 公司级：双语团队文档
```

半开源：`main` 是干净公开面（可运行产品 + 项目总览 + 公开文档）；`dev` 放全量内部实现。见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 分支

- `main` —— 公开面，稳定
- `dev` —— 全量内部实现，日常集成
- `release` —— `main` 的发布快照，打 tag
- `feature/*` —— 从 `dev` 切，合回 `dev`

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。一句话：**commit 用英文**，文档中英双语，`crew/`、各项目的 `team/`、`milestones/`、`deliverables/` 永不进 `main`。
