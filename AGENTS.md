# Auto Max PPHPL 仓库维护规则

本文件随仓库提交，供后续维护者与自动化维护 Agent 使用。

1. 先阅读 `docs/daily-workflow.md`、`docs/maintenance-guide.md` 和 `.codex/skills/simcompanies-maintenance/SKILL.md`。
2. 修改任何源码前，必须追踪调用链，确认根因或需求边界，说明最小修改方案，并取得项目负责人确认。
3. 保持 ES Modules、`window.SC_Modules` 与 `pageObserver` 的既有通信方式；不得直接进行架构迁移或大范围重构。
4. 修改源码后必须运行 `npm run build`；涉及页面 UI 时，按维护指南检查 SPA 生命周期、桌面/手机、深浅模式和功能开关。
5. `src/` 是唯一源码；`dist/` 是本地开发产物，不提交。正式安装包只能通过 `npm run release -- "更新说明"` 生成。

## 公开协作标准

1. 每次源码改动必须通过 `npm run check`；准备合并时，GitHub Actions 的 CI 必须通过。
2. 修改用户可见行为时，必须同步更新 `CHANGELOG.md` 的未发布内容；正式构建会自动写入版本条目。
3. 面向项目维护者和贡献者的仓库文档必须使用中文；代码标识、命令、URL 和第三方产品名称保持原样。
4. Bug 与功能请求使用 GitHub 模板；Pull Request 必须说明调用链、影响范围、验证结果和剩余风险。
5. 不提交 `dist/`、依赖目录、环境变量文件、日志、账号数据、Cookie、令牌或其他敏感信息。

本机私有规则写在 `AGENTS.local.md`，该文件不提交。
