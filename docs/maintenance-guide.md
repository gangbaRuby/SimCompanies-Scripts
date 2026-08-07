# Auto Max PPHPL 维护指南

## 源码与产物

- `src/` 是唯一源码。
- 执行 `npm run build` 会生成本地开发安装包：`dist/autoMaxPPHPL_DEV.user.js`。
- 根目录 `autoMaxPPHPL.user.js` 是正式发布产物，禁止手工修改。
- 调查、修改或发布前，先阅读 `AGENTS.md`、`AGENTS.local.md`（如存在）和项目维护 Skill。

## 项目定位

| 关注点 | 对应位置 |
| --- | --- |
| 启动流程、遗留 UI | `src/index.js` |
| Userscript 元数据 | `src/header.js` |
| SPA 路由分发 | `src/features/pageObserver.js` |
| 状态、网络、存储 | `src/core/` |
| 通用 UI 工具 | `src/utils/` |
| 页面功能 | `src/features/` |

模块通过 `window.SC_Modules` 通信，`pageObserver` 经由该桥接层初始化页面功能。新增功能时必须保留此方式。模块地图与高风险模块见 `.codex/skills/simcompanies-maintenance/references/project-map.md`。

## 修改流程

1. 确认页面 URL，并从 `index.js` 启动流程追踪到 `pageObserver`。
2. 找到功能归属模块、开关状态、DOM 初始化、异步任务与 SPA 清理路径。
3. 明确根因，或明确新功能的行为和验收标准。
4. 提出最小修改范围，取得确认后再修改源码。
5. 源码修改后运行 `npm run build`。
6. 检查首次进入、SPA 离开再返回、React 重绘、重复初始化、桌面/手机、深色/浅色和功能开关状态。

新增 Observer、计时器、Worker、事件监听、缓存或存储键时，必须明确其所有者以及清理或过期路径。没有既有约定时，新的 DOM ID、class 与存储键使用 `sc-` 前缀。

## Incoming Contracts

`src/features/incomingContractsHandler.js` 属于高风险模块，负责传入合同解析、MP/利润显示、两个 Worker、市场缓存、自定义高管数据、高价警告、接受确认和 React 重绘恢复。

修改前必须追踪：路由匹配、桥接层注册、卡片选择器、区服和常量数据、Worker 请求与返回顺序、市场缓存与请求顺序、Observer 防抖、React 卡片替换和离开页面清理。修改捕获阶段的接受按钮逻辑时，必须测试警告状态切换、React 重绘、双击和确认倒计时。

## 开发与手机测试

开发时在浏览器用户脚本管理器中安装 `dist/autoMaxPPHPL_DEV.user.js`。每次修改源码后重新执行 `npm run build` 并刷新游戏页面。

手机实机测试可在可信任的局域网中，用本地 HTTP 服务公开 `dist/` 目录，再通过手机安装开发版脚本。每次构建后重新安装最新文件；不要在不可信网络暴露本地服务。

## 正式发布

发布负责人提供一行中文更新说明后，执行：

```powershell
npm run release -- "增加 Snipboard 图片预览放大功能，修复根据输入框已有价格计算 MP 的逻辑。"
```

默认版本规则为 `1.x.y` 到 `1.x.(y+1)`。命令会同步源码和包元数据版本、更新 `CHANGELOG.md`、生成正式 `autoMaxPPHPL.user.js`、移除名称中的 `(DEV)`，并在产物末尾写入 `// @changelog`。它不会自动提交或推送。

不写入文件的预演命令：

```powershell
npm run release -- --dry-run "增加 Snipboard 图片预览放大功能。"
```

只有发布负责人明确要求时才使用指定版本：

```powershell
npm run release -- --version 1.33.0 "大版本更新说明。"
```

分发前确认正式产物包含预期功能、正确版本、没有 `(DEV)`、包含本次更新说明，并保留正确的更新和下载地址。Git 提交属于单独、需明确授权的步骤。
