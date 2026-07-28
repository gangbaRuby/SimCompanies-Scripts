# Auto Max PPHPL

面向 [SimCompanies](https://www.simcompanies.com/) 的 Tampermonkey 用户脚本。它在资源市场、传入/传出合同、仓库零售和高管页面提供最大时利润、市场价格、合同风险和辅助操作信息。

> 本项目是社区辅助工具，与 SimCompanies 官方没有隶属关系。

## 功能概览

- 资源市场的最大时利润计算、价格建议和高管自定义数据。
- 传入合同的 MP、利润、市场缓存、高价警告和接受二次确认。
- 传出合同的 MP、VWAP 预设、运输利润和输入价格计算。
- 仓库零售利润、高管数据和其他页面辅助功能。

## 安装与更新

正式版安装地址由 Userscript 元数据中的 `@downloadURL` 提供。请在 Tampermonkey 中安装根目录的 `autoMaxPPHPL.user.js`，或通过项目发布页提供的正式链接安装。

脚本启动后会检测远端正式版本；发现新版本时，用户仍需在浏览器用户脚本管理器中确认安装更新。

## 开发

前置条件：Node.js 20 或更高版本，以及 Tampermonkey。

```powershell
npm install
npm run build
```

开发产物为 `dist/autoMaxPPHPL_DEV.user.js`，其名称带 `(DEV)`，只用于本地测试。详细流程见 [维护指南](docs/maintenance-guide.md)。

## 质量检查

```powershell
npm run check
```

该命令检查构建/发布脚本语法，并构建开发安装包。涉及页面 UI 的改动仍必须按维护指南完成 SPA 生命周期、桌面/手机、深浅模式和功能开关的人工验证。

## 正式发布

```powershell
npm run release -- "本次更新说明"
```

默认只递增补丁版本 `1.x.y -> 1.x.(y+1)`，同步版本元数据、更新 `CHANGELOG.md`、生成正式安装包并写入更新说明。使用 `--dry-run` 可预演而不写入文件。

```powershell
npm run release -- --dry-run "本次更新说明"
```

构建不等于部署：提交 Git、推送远程仓库、上传更新服务器和创建 GitHub Release 都需要单独执行与确认。

## 项目结构

```text
src/                 用户脚本源码
  core/              状态、网络、存储与请求钩子
  features/          按页面归属的功能模块
  utils/             可复用 UI 与工具方法
scripts/             发布和校验脚本
docs/                面向维护者的中文文档
.github/             CI、Issue 与 Pull Request 模板
.codex/              项目维护 Skill 与模块地图
```

## 参与维护

提交问题或改动前，请阅读：[贡献指南](CONTRIBUTING.md)、[维护指南](docs/maintenance-guide.md)、[变更记录](CHANGELOG.md)、[安全政策](SECURITY.md) 和 [GitHub 仓库设置](docs/github-setup.md)。

项目采用 [AGPL-3.0](LICENSE) 许可证。
