---
name: simcompanies-maintenance
description: Maintain the Auto Max PPHPL SimCompanies Tampermonkey userscript through a consistent analysis, change, validation, and release workflow. Use for every bug report, feature change, new feature, regression investigation, or release affecting this repository.
---

# SimCompanies 维护流程

在此仓库执行任何工作都必须遵循本流程。执行前阅读 `AGENTS.md`、`AGENTS.local.md`（如存在）、`references/project-map.md` 和 `docs/daily-workflow.md`。

## 工作流程

### 1. 分类

- 解释、审计或诊断：只检查并报告证据，不修改文件。
- 修复 Bug：追踪调用链、确认根因、提出最小修复，并在修改前等待确认。
- 功能修改或新增功能：明确页面、模块归属、路由/初始化路径、状态或存储需求、DOM 生命周期和验收标准；先提出方案再等待确认。
- 发布：确认产物来自当前源码，且 Userscript 元数据和版本正确。

### 2. 绘制调用链

追踪 URL/启动触发点、`pageObserver` 和开关状态、模块注册或启动路径、DOM/React 生命周期、网络、缓存、存储、Worker、计时器与 Observer 行为，以及 SPA 离开或重复初始化时的清理。

报告证据、受影响文件、根因、最小修改方案、修改后的预期行为和剩余风险。

### 3. 保持边界

- 保留 ES Modules、功能归属、`window.SC_Modules` 和 `pageObserver`。
- 除非明确批准迁移，否则保持存储键和数据格式不变。
- 在适用处使用既有通信方式和共享工具。
- 没有既有约定时，新的 DOM ID/class/data 属性和持久化键使用 `sc-` 前缀。
- 每个 Observer、计时器、Worker 请求和事件监听都必须有明确所有者与清理/重新初始化路径。
- 新增功能若引入 `localStorage`/`sessionStorage` 持久化键或需要排错的持久化状态，必须通过 `src/core/exportInfo.js` 的 `registerExportInfo` 注册导出信息；导出中心本身不维护固定键清单。
- 注册时必须标注 `scope`（`realm`/`global`）并只登记插件自身写入的键；删除或改名存储键时同步更新注册。

修复 Bug 或修改功能时，不得进行架构迁移、大范围清理、命名变更或无关格式化。

### 4. 实现与验证

确认后只修改约定文件，并保持范围外行为不变。修改源码后必须运行 `npm run build`。

涉及 UI/SPA 时，检查首次进入、离开再返回、React 替换、重复初始化、桌面和手机布局、深色和浅色主题、功能开关、加载/空数据/网络/缓存路径，以及重复 UI、监听、Observer 或计时器。未实际操作浏览器时，不得声称已完成浏览器验证。

**面板显隐**：显示/隐藏一律用 CSS 类切换（如 `show-settings`/`show-backup`），不要给元素设置内联 `display`——内联样式优先级高于样式表，会覆盖 CSS 里的默认隐藏，导致面板内容直接可见。

### 4.1 代码约定（踩坑沉淀）

- **先查既有实现**：新功能/新调用先 grep 现有模块的同类做法（网络请求用 `window.__SC_Network`、公司页跳转用 `getCompanyLink` 同款 URL（`/company/<realm>/<名称>/`）、领域键用 `getScopedKey`、面板按钮沿用 `createActionButton` 模式），不要另起炉灶。
- **内嵌第三方代码**：保留原始版权与许可头（如 `src/utils/lzstring.js` 的 WTFPL 声明），并记入模块地图。
- **领域作用域键**：一律经 `core/storage.js` 的 `getScopedKey` 生成（`R<realmId>-<名称>`，如 `R0-SC-Saved-Bonuses`、`R0-SC-AGENCY_FOUND_EXECUTIVE`），不要用 `SC_<名称>_<realmId>` 后缀；新增领域键前先 grep 现有模式确认。
- **领域隔离**：涉及领域/公司实体的用户配置（品质范围、备注、预设等）必须按领域分开存储，避免跨领域串扰（建筑 id 跨领域可能重复）。
- **范围类输入约束**：任何"从~到"范围输入必须保证前后关系（如品质从 ≤ 到）：修改时钳制，读取时归一（脏数据自动交换）。
- **开关面板子设置**：功能开关设置面板里带详细设置的开关，用 `subContent` 提供子设置内容、CSS 类 `sc-collapsed` 控制显隐；子设置**仅在功能开启时展示**（关闭即收起，省空间），点击开关时同步显隐。
- **游戏分页/列表接口拦截**：对游戏 HTTP 列表或分页接口做"响应过滤"前，先确认客户端判定"是否还有更多"的方式（例：聊天历史用 `fullHistory = r.length < 30`，见 `chatMessageBlocker.js` 模块头失效检查点）。过滤会减少返回条数，可能让客户端误判到底并提前停止加载。
- **React 动态列表的隐藏/删除**：不要直接 `remove()` React 管理的列表节点（会被 React 用作 `insertBefore` 锚点，删除后抛 `NotFoundError`），也不要简单 `display:none`（可能让"滚动加载更多"的触发元素失去可观察性）。优先在数据层过滤；确需 DOM 处理时保留节点（如按稳定属性匹配的 CSS `:has()` 渲染期隐藏 + 零高占位），并补齐清理/重建路径。
- **大组合枚举/寻优（1.33.9 最优摆放 13 人 × 6 席 ≈ 124 万组合）**：不要在页面主线程一次算完；用分片后台执行（每批固定叶子数后让出主线程）+ 令牌取消（切换目标/重算/关闭时自增令牌，过期结果直接丢弃，避免旧结果覆盖新选择）。
- **多目标字典序求解返回值**：返回给调用方的 eff/结果字段按最终选定的摆法重算，不要直接解包目标键数组——键序与字段序不一致会串位（曾导致 restaurant/sales 结果字段错位）。
- **推荐/应用类功能的候补位填充**：应用推荐摆法时先算出本次实际落位的席位（含参与计算的学徒席，如 CTO 学徒 z），这些席位不得再作为候补位被落榜高管覆盖，否则保存结果会与推荐值不一致。
- **剪贴板功能必须提供降级路径**：使用 `navigator.clipboard.writeText()` 时，同时处理 API 不存在和 Promise reject；复用临时 `textarea` + `document.execCommand('copy')` 的 fallback，避免用户脚本或非安全上下文中复制功能直接失效。
- **SPA 页面模块必须有完整销毁路径**：凡自行创建 `MutationObserver`、计时器、事件监听或其他长期资源的模块，都要提供 `destroy()`；`pageObserver` 在离开所属路由时调用它，至少断开 Observer、清除 debounce timer 并移除注入 UI，重新进入时再初始化。

- **往游戏 React 界面注入按钮**：不要自造一套样式塞进去，也不要直接复用原生「一行等分」容器。做法是克隆页面上真实存在的原生行/容器节点（`cloneNode` 不复制事件监听，克隆体天然惰性），只替换文案并自行绑定点击，外观/主题/断点随原生；容器布局与「选项数量可变」冲突时用 inline style 覆盖（例：原生 `flex-direction:row` + 子项 `flex:1` 属于一行等分，要改成 `display:grid; grid-template-columns:repeat(auto-fill,minmax(100px,1fr))` 才会换行）。注入节点必须带可清理标记（class + 宿主卡片属性），且「是否已注入」要同时判断标记与节点是否仍在——React 局部重绘会只清掉注入内容。
- **分辨游戏 bundle 里的样式来源**：DOM 上的 emotion class 形如 `css-xxxxx`；静态样式在 bundle 里带 `name: "xxxxx"`（可直接搜到），函数式样式（`W({...}, "", "")`，取值依赖主题）没有 name，只能从组件代码里的样式变量（如 `foe`、`_ht`、`S7`）反查定义。判断新版 UI 的选择器和布局约束以此为准，不要靠页面盲试。

### 5. 正式发布

将 `src/` 视为唯一源码，将 `.user.js` 视为生成产物。正式构建必须要求用户提供一行更新说明；除非用户明确指定其他版本，否则执行：

```powershell
npm run release -- "<changelog>"
```

该命令只递增补丁版本（`1.x.y` 到 `1.x.(y+1)`），同步受追踪的版本值和 `CHANGELOG.md`，生成根目录 `autoMaxPPHPL.user.js`，移除名称中的 `(DEV)`，并向最终产物追加 `// @changelog <更新说明>`。不要将更新说明写入业务代码或 Userscript 头部；运行时更新器读取产物尾注。

使用 `npm run release -- --dry-run "<更新说明>"` 验证发布输入而不写入文件。只有用户明确要求例外时才使用 `--version 1.x.y`。未被单独要求时，不得提交或推送。

确认正式产物包含预期改动、匹配的版本、没有 `(DEV)` 标记、正确的更新/下载地址和提供的更新说明。报告修改文件、构建结果、已执行检查和剩余风险。

### 5.1 发布与合并实操要点（踩坑沉淀，只记会再遇到的）

- **发布前核对 CHANGELOG**：将工作区改动逐项与 `CHANGELOG.md` 未发布区条目一一对应，防止功能改动漏记。
- **提交前确认分支**：不要直接提交 `main`；功能走 `feat/`、发布走 `release/` 分支 + PR。收到"提交当前分支"类指示时若正处于 `main`，先确认是否应新建分支。
- **未发布区混用**：多个 WIP 功能共用未发布区时，提交/发布前确认本次发布范围，避免条目与代码归属错位。
- **分支保护**：`main` 有必需状态检查时，CI 未绿会拒绝合并；本仓库**未启用 auto-merge**（`gh pr merge --auto` 会报 `enablePullRequestAutoMerge` 错误），正确做法是等 CI 变绿（轮询 `gh pr checks`）后再执行 `gh pr merge`。
- **release 后检查 CHANGELOG 格式**：新版本条目与下一节之间应保留空行（条目通常为"更新说明 + 原未发布明细"）。
- **中文 PR 载荷**：`gh pr create` 没有 `--title-file`（只有 `--body-file`）；标题与正文统一用 UTF-8 JSON 文件 + `gh api ... --input` 提交，创建后到 GitHub 核对中文（配合第 6 节编码规则）。
- **PR 描述必须完整**：不能只写功能摘要；必须明确写出 `pageObserver -> SC_Modules -> 功能模块 -> DOM/异步任务 -> 清理` 调用链、影响范围、验证结果和剩余风险。代码审查修复后同步更新原 PR 描述，不要只追加提交。
- **更新提示先审阅**：正式发布前，把拟推送的游戏内更新提示（发布说明 / `@changelog` 文案）发给项目负责人审阅确认，确认后再执行 `npm run release`、发布 PR 与标签推送。
- **PR 模板必须完整填写**：创建 PR 时必须填写改动说明、调用链与影响范围、验证结果、风险与回滚；涉及 UI 但未做浏览器实测时，要明确写入剩余风险，不得只写 `npm run build`/`npm run check`。
- **合并冲突与提交历史**：PR 之间存在未发布文档冲突时，先更新 PR 分支并保留双方有效记录；避免为解决简单文档冲突制造额外合并提交，必要时在合并前整理提交历史。
- **合并后标签闭环**：发布 PR 合并后，必须在已同步的 `main` 提交上核对标签不存在，再创建并推送 `v<版本>`；随后用 `gh release view v<版本>`确认 Release 已创建且包含正式 `autoMaxPPHPL.user.js`，不能把“PR 已合并”当作发布流程完成。

### 5.2 发布后沉淀

每次正式发布推完版本标签后，回顾本次发布踩过的坑，把"会再遇到的"条目按归属就地沉淀：

- 本机环境/工具类（网络通道、沙箱、CLI 路径、编码等）→ 写 `AGENTS.local.md`（本地、不提交）。
- 发布/合并实操类 → 本节 5.1。
- 代码约定/数据层/DOM 类 → 4.1（及本地模块地图）。
- 只记会再遇到的；**不写入账号、令牌、Cookie、公司名/ID、本机路径等私有或敏感信息**；面向仓库的文档保持中文。

## 6. 公开协作质量

- 面向维护者和贡献者的仓库文档使用中文；代码标识、命令、URL 和第三方名称保持原样。
- **面向用户的文案（面板说明、更新说明/CHANGELOG）简短直白、只讲功能、不讲实现原理**；实现细节（两领域/缓存/压缩/标记/跳转机制等）放维护文档（模块地图、SKILL）。
- 每次源码改动都运行 `npm run check`；准备合并时确认 GitHub Actions 的 CI 已通过。
- 用户可见行为发生变化时，同步更新 `CHANGELOG.md` 的 `未发布` 区域；正式构建会自动写入版本记录。
- 提交 Bug 或功能建议时使用 `.github/ISSUE_TEMPLATE/` 模板；Pull Request 必须写明调用链、影响范围、验证结果和剩余风险。
- 通过 GitHub API/CLI 自动创建或更新 PR 时，标题和正文中的中文不要依赖命令行本地编码直接传参；推荐在 JSON 中使用 `\uXXXX` 转义或确保 UTF-8，创建后到 GitHub 页面核对中文显示。
- 不提交 `dist/`、依赖目录、环境变量、日志、Cookie、令牌或其他敏感信息。

<!--

[TODO: 1-2 sentences explaining what this skill enables]

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" -> "Reading" -> "Creating" -> "Editing"
- Structure: ## Overview -> ## Workflow Decision Tree -> ## Step 1 -> ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" -> "Merge PDFs" -> "Split PDFs" -> "Extract Text"
- Structure: ## Overview -> ## Quick Start -> ## Task Category 1 -> ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" -> "Colors" -> "Typography" -> "Features"
- Structure: ## Overview -> ## Guidelines -> ## Specifications -> ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" -> numbered capability list
- Structure: ## Overview -> ## Core Capabilities -> ### 1. Feature -> ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources (optional)

Create only the resource directories this skill actually needs. Delete this section if no resources are required.

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: `fill_fillable_fields.py`, `extract_form_field_info.py` - utilities for PDF manipulation
- DOCX skill: `document.py`, `utilities.py` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Codex for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Codex's process and thinking.

**Examples from other skills:**
- Product management: `communication.md`, `context_building.md` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Codex should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Codex produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Not every skill requires all three types of resources.**
-->
