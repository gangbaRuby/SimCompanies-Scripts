# 贡献指南

## 提交前准备

1. 阅读 `AGENTS.md`、`docs/maintenance-guide.md` 和相关模块地图。
2. 在提交 Bug 修复前，记录页面 URL、功能开关、调用链、根因和最小修改方案。
3. 在新增功能前，明确归属模块、初始化/清理路径、存储或网络需求和验收标准。
4. 不进行与当前目标无关的重构、格式化或命名调整。

## 开发要求

- 源码只放在 `src/`；不得手工修改 `.user.js` 产物。
- 保留 ES Modules、`window.SC_Modules` 和 `pageObserver` 的既有边界。
- 新增 Observer、Worker、计时器和事件监听时，必须有明确的清理路径。
- 新增 DOM 标识或存储键没有既有约定时，使用 `sc-` 前缀。
- 面向用户的仓库文档使用中文；代码标识、命令和第三方名称保持原样。

## 验证要求

每个源码改动必须通过：

```powershell
npm run check
```

UI/SPA 改动还必须人工检查首次进入、离开再返回、React 替换、重复初始化、桌面/手机、深色/浅色、功能开关、加载和网络异常路径。Pull Request 中应说明已实际验证的项目，以及未验证的风险。

## 提交与 Pull Request

- 一个提交只处理一个清晰目标。
- 使用清晰的提交信息，例如 `fix(incoming-contracts): 修复高价警告状态恢复`。
- Pull Request 必须使用模板，说明问题、调用链、改动范围、验证结果和风险。
- 修改用户可见行为时，必须同步更新 `CHANGELOG.md`；正式发布由 `npm run release` 自动补充版本条目。
