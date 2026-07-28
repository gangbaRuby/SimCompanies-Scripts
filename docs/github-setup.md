# GitHub 仓库设置

以下设置需要仓库管理员在 GitHub 网页中完成；它们不能由仓库文件自动开启。

## 首次设置

1. 推送本仓库后，确认 Actions 页面出现“持续集成”工作流，并允许其读取仓库内容。
2. 在 Labels 中创建：`bug`、`enhancement`、`maintenance`、`needs-reproduction`、`security`。
3. 确认 Issue 模板和 Pull Request 模板在新建页面可见。
4. 在 About 区域填写中文简介、正式安装链接、许可证和项目主题。

## 分支保护

对默认分支启用分支保护规则：

- 合并前必须通过“构建与脚本检查”。
- 要求分支保持最新后再合并。
- 禁止直接强制推送到默认分支。
- 至少要求一位审查者；个人维护时可由仓库管理员按实际情况豁免。

## 发布设置

- 仅通过 `npm run release -- "更新说明"` 生成正式安装包。
- 提交正式安装包、`CHANGELOG.md` 和版本元数据后，再创建与版本一致的 Git tag。
- 推送 `v1.32.40` 这类标签会自动创建/更新 GitHub Release、读取 `CHANGELOG.md` 对应版本的说明，并附加正式 `autoMaxPPHPL.user.js`。
- 更新服务器的正式文件必须与 Git tag 对应的 `autoMaxPPHPL.user.js` 完全一致。

## 依赖更新

仓库已配置 Dependabot 每月检查 npm 依赖。每个依赖更新 Pull Request 都应通过 CI；涉及打包器升级时，还应安装开发版脚本进行基础页面验证。
