# Notion 自动同步设置

Dashboard 已经包含 Notion 同步代码，但 GitHub Pages 不能安全地把 Notion 密钥放在浏览器里。因此密钥只放在 GitHub Actions 的 repository secret 中。

## 1. 创建 Notion API connection

在 Notion Developer Portal 创建一个 internal integration/connection，并给它以下能力：

- Read content
- Insert content（用于 Weekly 的“进 Notion”）
- Read comments（用于 Knowledge 读取 Comment）

把 `情報収集と整理` 对应的数据库/数据源共享给这个 connection。

## 2. GitHub 添加密钥

仓库：`syukaisan-lang/weekly-intelligence`

进入：

`Settings → Secrets and variables → Actions → Secrets → New repository secret`

创建：

- Name: `NOTION_TOKEN`
- Secret: 你的 Notion integration token

不要把 token 写进任何 `.js`、`.json`、HTML 或公开 Issue。

## 3. GitHub 添加数据源变量

同一个页面切换到 `Variables`，创建 repository variable：

- Name: `NOTION_DATA_SOURCE_ID`
- Value: `b2fde79c-a98e-454a-8217-612a6eaec56d`

脚本本身已有这个 ID 作为 fallback，但设置 variable 更容易以后迁移数据库。

## 4. 第一次同步

进入：

`Actions → Sync Notion knowledge → Run workflow`

成功后，`data/knowledge.json` 会更新为全量 Stock，并包含通过 Notion Public API 可读取的页面 Comment。

之后：

- 每天 18:40 JST 自动同步 Notion Knowledge。
- 每周五 19:05 JST 更新 Weekly 前，会再次先同步 Notion。

## 5. Weekly → 进 Notion

Dashboard 点击“进 Notion”时，会打开一个预填好的 GitHub Issue。

你确认后点击 `Submit new issue`，`Save article to Notion` workflow 会：

1. 验证 Issue 创建者必须是 `syukaisan-lang`。
2. 写入 Notion 数据源。
3. 设置 `保存 = ストック`、`既読 = true`，并按内容推测 `種類`。
4. 成功后自动关闭该 Issue。

这是为了避免在公开 GitHub Pages 前端暴露 Notion token。

## Comment 范围

自动同步使用 Notion Public REST API 的 comments endpoint。它会读取页面本身仍处于 open/unresolved 状态的 Comment，并纳入：

- Knowledge 搜索
- 细分主题识别
- Insights
- Weekly ↔ 旧知识关联

已 resolved 的 Comment 以及任意子 block 上的 Comment 不保证能通过这个自动同步流程取到。Dashboard 不会假装已经读取不可访问的 Comment。
