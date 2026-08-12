# Notion 自动同步设置

Dashboard 已经包含 Notion 同步代码。因为 GitHub Pages 是静态页面、仓库目前又是 Public，**Notion token 和 Comment 原文都不能直接明文放进前端/公开 JSON**。

现在的设计是：

- `NOTION_TOKEN` 只存在 GitHub Actions Secret。
- 全量 Stock、summary、Comment 写入 `data/knowledge.enc.json` 前先用 AES-256-GCM 加密。
- `data/knowledge.json` 只保留聚合数字/分类，不保存 Comment 原文。
- Knowledge / Insights 页面在浏览器输入你自己的 Dashboard 密码后才解密；密码仅保存在当前 browser session。

## 1. 创建 Notion API connection

在 Notion Developer Portal 创建 internal integration/connection，并给它：

- Read content
- Insert content（Weekly → 进 Notion）
- Read comments（Knowledge → Comment）

把 `情報収集と整理` 对应数据库/数据源共享给这个 connection。

## 2. GitHub 添加两个 Secret

仓库：`syukaisan-lang/weekly-intelligence`

进入：

`Settings → Secrets and variables → Actions → Secrets → New repository secret`

创建：

### `NOTION_TOKEN`

值：你的 Notion integration token。

### `DASHBOARD_PASSPHRASE`

值：你自己设定的 Knowledge 解密密码，至少 10 个字符。建议使用只用于这个 Dashboard 的长密码。

**不要把这两个值写进 `.js`、`.json`、HTML、Issue 或聊天截图。**

以后打开 Knowledge / Insights 时输入的是 `DASHBOARD_PASSPHRASE`，不是 Notion token。

## 3. 数据源变量（可选但建议设置）

`Settings → Secrets and variables → Actions → Variables → New repository variable`

- Name: `NOTION_DATA_SOURCE_ID`
- Value: `b2fde79c-a98e-454a-8217-612a6eaec56d`

脚本已有该 ID 作为 fallback。

## 4. 第一次同步

进入：

`Actions → Sync Notion knowledge → Run workflow`

成功后会生成：

- `data/knowledge.json`：公开安全的聚合信息。
- `data/knowledge.enc.json`：加密后的全量 Stock + summary + 可读取 Comment。

之后：

- 每天 18:40 JST 自动同步 Notion Knowledge。
- 每周五 19:05 JST 更新 Weekly 前再同步一次。

## 5. Weekly → 进 Notion

点击“进 Notion”后会打开一个预填 GitHub Issue。Issue 里**只包含文章 ID**，不会复制你的 Knowledge Comment 或 Notion token。

你点击 `Submit new issue` 后，`Save article to Notion` workflow 会：

1. 验证 Issue 创建者必须是 `syukaisan-lang`。
2. 根据文章 ID 从 `data/articles.json` 读取标题/URL/摘要/筛选理由。
3. 写入 Notion，并设置 `保存 = ストック`、`既読 = true`。
4. 根据文章内容推测 `種類`。
5. 成功后自动关闭 Issue。

## Comment 范围

自动同步使用 Notion Public REST API 的 comments endpoint。当前版本读取**页面本身 open / unresolved 的 Comment**，并把 Comment 文本纳入：

- Knowledge 全文搜索
- 细分主题识别
- Insights
- Weekly ↔ 旧知识关联
- Comment 数量与复习优先级

Notion Public API 对 resolved Comment 的读取有限制；当前自动同步也不会递归扫描每个子 block 的 inline Comment。因此 Dashboard 会明确以“可读取的页面 Comment”为准，不会假装全量读取不可访问内容。
