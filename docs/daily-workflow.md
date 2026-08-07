# 日常操作流程

本页是日常维护的最短操作清单。遇到 Bug、新功能、发布或 GitHub 操作时，先按本页执行；需要技术细节时再阅读 [维护指南](maintenance-guide.md)。

## 先判断要做什么

| 你的目标 | 应该做什么 |
| --- | --- |
| 发现 Bug | 先记录页面 URL、复现步骤、脚本版本和预期结果，再让维护 Agent 追踪调用链。 |
| 新增或修改功能 | 先说明页面、想要的行为和验收标准，等待最小方案确认后再改代码。 |
| 只想了解代码 | 只阅读和分析，不创建分支、不修改文件。 |
| 准备让用户收到更新 | 先完成测试和 PR 合并，再进行正式构建。 |

## 每次修改功能

### 1. 从最新 main 创建分支

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/简短功能名称
```

Bug 修复分支使用 `fix/简短问题名称`；文档分支使用 `docs/简短主题`。不要直接在 `main` 修改。

### 2. 说明需求

在开始修改前，给维护 Agent 或 Pull Request 写清：

- 页面 URL 和功能开关状态。
- 当前行为、预期行为、复现步骤。
- 对 UI 改动：桌面/手机、深色/浅色和功能开关的预期。

维护 Agent 必须先追踪 `pageObserver -> SC_Modules -> 功能模块 -> DOM/异步任务 -> 清理` 调用链，提出最小方案后再修改。

### 3. 本地验证

每次源码改动后执行：

```powershell
npm run check
```

涉及页面 UI 或 SPA 时，额外在浏览器实际检查：首次进入、离开再返回、React 重绘、重复初始化、桌面、手机、深色、浅色和功能开关。

### 4. 提交并创建 PR

```powershell
git status
git add <实际修改的文件>
git commit -m "feat(模块): 简短说明"
git push -u origin feat/简短功能名称
```

在 GitHub 创建目标为 `main` 的 Pull Request，按模板填写调用链、影响范围、验证结果和剩余风险。等待“构建与脚本检查”变绿后再合并。

## 合并后清理

在 GitHub 合并 PR 后，删除远端分支。随后在本地执行：

```powershell
git switch main
git pull --ff-only origin main
git branch -d feat/简短功能名称
```

如果本地分支尚未被识别为已合并，不要强制删除；先确认 GitHub 的 PR 已合并，再更新本地 `main`。

## 正式发布

只有准备让实际用户更新时，先从已合并且验证完成的 `main` 创建发布分支：

```powershell
git switch main
git pull --ff-only origin main
git switch -c release/版本说明
```

先预演：

```powershell
npm run release -- --dry-run "本次中文更新说明"
```

确认预演内容后执行：

```powershell
npm run release -- "本次中文更新说明"
```

正式构建会递增补丁版本、更新版本元数据和 `CHANGELOG.md`、生成正式 `autoMaxPPHPL.user.js`，并写入更新说明。它不会自动提交或推送。

正式构建后，按“每次修改功能”流程把版本文件、`CHANGELOG.md` 和正式安装包通过新 PR 合并。合并后创建并推送版本标签：

```powershell
git switch main
git pull --ff-only origin main
git tag -a v1.32.40 -m "Release v1.32.40"
git push origin v1.32.40
```

推送标签会自动创建/更新 GitHub Release 并附加正式 `autoMaxPPHPL.user.js`。

## 永远不要做的事

- 不直接修改 `main` 或手工修改 `.user.js` 产物。
- 不跳过调用链分析和最小方案确认。
- 不提交 `dist/`、`node_modules/`、`AGENTS.local.md`、`.env`、日志、Cookie、令牌或账号信息。
- 不在 CI 红色、未完成页面验证或不清楚风险时合并。
