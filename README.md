# Auto Max PPHPL

[![CI](https://github.com/gangbaRuby/simcompanies-scripts/actions/workflows/ci.yml/badge.svg)](https://github.com/gangbaRuby/simcompanies-scripts/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/gangbaRuby/simcompanies-scripts)](https://github.com/gangbaRuby/simcompanies-scripts/releases/latest)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

面向 [SimCompanies](https://www.simcompanies.com/) 的 Tampermonkey 用户脚本。它在资源市场、传入/传出合同、仓库零售和高管页面提供最大时利润、市场价格、合同风险和辅助操作信息。

> 本项目是社区辅助工具，与 SimCompanies 官方没有隶属关系。使用第三方脚本的风险由使用者自行承担，请自行确认其符合游戏的服务条款。

## 目录

- [功能概览](#功能概览)
- [安装与更新](#安装与更新)
- [权限与网络请求](#权限与网络请求)
- [使用与设置](#使用与设置)
- [开发](#开发)
- [正式发布](#正式发布)
- [项目结构](#项目结构)
- [问题反馈与参与维护](#问题反馈与参与维护)
- [许可证](#许可证)

## 功能概览

- 资源市场的最大时利润计算、价格建议和高管自定义数据。
- 传入合同的 MP、利润、市场缓存、高价警告和接受二次确认。
- 传出合同的 MP、VWAP 预设、运输利润和输入价格计算。
- 仓库零售利润、高管数据和其他页面辅助功能。

完整的版本变化见 [变更记录](CHANGELOG.md)。

## 安装与更新

前置条件：浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/)。本脚本按 Tampermonkey 开发和验证，其他用户脚本管理器未经测试。

1. 打开安装地址，Tampermonkey 会弹出安装确认页，点击「安装」：
   - 更新服务器：<https://sc.22-7.top/scripts/autoMaxPPHPL.user.js>（脚本元数据中 `@downloadURL` / `@updateURL` 指向此处）
   - GitHub：在 [Releases](https://github.com/gangbaRuby/simcompanies-scripts/releases/latest) 下载最新正式安装包，或使用仓库根目录的 `autoMaxPPHPL.user.js`
2. 打开 [SimCompanies](https://www.simcompanies.com/) 并刷新页面，脚本即生效。

**更新**：脚本启动后会检测远端正式版本；发现新版本时，仍需在 Tampermonkey 中确认安装更新，不会静默替换。

**DEV 版本**：本地构建生成的 `autoMaxPPHPL_DEV.user.js` 名称带 `(DEV)`，仅用于测试；与正式版同时启用会重复注入功能，请先停用正式版。

## 权限与网络请求

脚本仅匹配 `*://www.simcompanies.com/*`，并申请以下权限：

| 权限 | 用途 |
| --- | --- |
| `GM_xmlhttpRequest` | 向下表中的外部服务发起跨域请求 |
| `GM_registerMenuCommand` | 在 Tampermonkey 菜单中提供「还原按钮默认位置」 |
| `unsafeWindow` | 读取页面自身的数据与请求，用于计算和展示 |

脚本会访问以下外部域名（以源码为准）：

| 域名 | 用途 |
| --- | --- |
| `www.simcompanies.com` | 游戏自身接口，读取页面需要的数据 |
| `api.simcotools.com` | 查询市场 VWAP，用于传出合同的价格预设（`@connect` 已声明） |
| `sc.22-7.top` | 脚本版本检测与安装包下载、`PA-Quests.json` 数据、可选的 `oldBuildingsGraphic.user.js` 下载链接 |

脚本的设置与缓存保存在浏览器本地存储中。如需核对具体请求，可在源码中搜索上述域名。发现与本节不符的行为，请按 [安全政策](SECURITY.md) 私下报告。

## 使用与设置

- 脚本在上述页面自动注入界面；在面板中点击「⚙️ 功能开关设置」可开启或关闭各项功能，带详细设置的功能仅在开启时展示设置内容。
- 面板按钮被拖到看不见的位置时，点击 Tampermonkey 图标，选择「还原按钮默认位置」。

## 开发

前置条件：Node.js 20 或更高版本，以及 Tampermonkey。

```powershell
npm ci
npm run build
```

开发产物为 `dist/autoMaxPPHPL_DEV.user.js`，其名称带 `(DEV)`，只用于本地测试，且已被 `.gitignore` 排除。在 Tampermonkey 中导入该文件即可调试。详细流程见 [维护指南](docs/maintenance-guide.md)。

### 质量检查

```powershell
npm run check
```

该命令检查构建/发布脚本语法，并构建开发安装包。涉及页面 UI 的改动仍必须按维护指南完成 SPA 生命周期、桌面/手机、深浅模式和功能开关的人工验证。

## 正式发布

```powershell
npm run release -- "本次更新说明"
```

默认只递增补丁版本 `1.x.y -> 1.x.(y+1)`，同步版本元数据、更新 `CHANGELOG.md`、生成正式安装包并写入更新说明。使用 `--dry-run` 可预演而不写入文件：

```powershell
npm run release -- --dry-run "本次更新说明"
```

构建不等于部署：提交 Git、推送远程仓库和上传更新服务器仍需单独执行。推送形如 `vX.Y.Z` 的标签后，GitHub Actions 会自动创建/更新 GitHub Release 并附加正式安装包。

## 项目结构

```text
src/                 用户脚本源码
  core/              状态、网络、存储与请求钩子
  features/          按页面归属的功能模块
  utils/             可复用 UI 与工具方法
scripts/             发布和校验脚本
docs/                面向维护者的中文文档
.github/             CI、Issue 与 Pull Request 模板
.codex/              项目维护 Skill
```

模块地图（`docs/module-map.md`、`docs/module-capabilities.md`）为本地生成文件，已被 `.gitignore` 排除，不随仓库提供。

## 问题反馈与参与维护

- 报告 Bug 或提出功能建议：请通过仓库的 [Issues](https://github.com/gangbaRuby/simcompanies-scripts/issues/new/choose) 使用对应模板。涉及账户、会话、请求令牌或脚本供应链的安全问题，请勿公开提交，见 [安全政策](SECURITY.md)。
- 提交问题或改动前，请先阅读：[日常操作流程](docs/daily-workflow.md)、[贡献指南](CONTRIBUTING.md)、[维护指南](docs/maintenance-guide.md)、[变更记录](CHANGELOG.md)、[行为准则](CODE_OF_CONDUCT.md) 和 [GitHub 仓库设置](docs/github-setup.md)。

## 许可证

项目采用 [AGPL-3.0](LICENSE) 许可证。
