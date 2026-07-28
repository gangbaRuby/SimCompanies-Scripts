---
name: simcompanies-maintenance
description: Maintain the Auto Max PPHPL SimCompanies Tampermonkey userscript through a consistent analysis, change, validation, and release workflow. Use for every bug report, feature change, new feature, regression investigation, or release affecting this repository.
---

# SimCompanies 维护流程

在此仓库执行任何工作都必须遵循本流程。执行前阅读 `AGENTS.md`、`AGENTS.local.md`（如存在）和 `references/project-map.md`。

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

修复 Bug 或修改功能时，不得进行架构迁移、大范围清理、命名变更或无关格式化。

### 4. 实现与验证

确认后只修改约定文件，并保持范围外行为不变。修改源码后必须运行 `npm run build`。

涉及 UI/SPA 时，检查首次进入、离开再返回、React 替换、重复初始化、桌面和手机布局、深色和浅色主题、功能开关、加载/空数据/网络/缓存路径，以及重复 UI、监听、Observer 或计时器。未实际操作浏览器时，不得声称已完成浏览器验证。

### 5. 正式发布

将 `src/` 视为唯一源码，将 `.user.js` 视为生成产物。正式构建必须要求用户提供一行更新说明；除非用户明确指定其他版本，否则执行：

```powershell
npm run release -- "<changelog>"
```

该命令只递增补丁版本（`1.x.y` 到 `1.x.(y+1)`），同步受追踪的版本值和 `CHANGELOG.md`，生成根目录 `autoMaxPPHPL.user.js`，移除名称中的 `(DEV)`，并向最终产物追加 `// @changelog <更新说明>`。不要将更新说明写入业务代码或 Userscript 头部；运行时更新器读取产物尾注。

使用 `npm run release -- --dry-run "<更新说明>"` 验证发布输入而不写入文件。只有用户明确要求例外时才使用 `--version 1.x.y`。未被单独要求时，不得提交、推送、上传或部署。

确认正式产物包含预期改动、匹配的版本、没有 `(DEV)` 标记、正确的更新/下载地址和提供的更新说明。报告修改文件、构建结果、已执行检查和剩余风险。

## 6. 公开协作质量

- 面向维护者和贡献者的仓库文档使用中文；代码标识、命令、URL 和第三方名称保持原样。
- 每次源码改动都运行 `npm run check`；准备合并时确认 GitHub Actions 的 CI 已通过。
- 用户可见行为发生变化时，同步更新 `CHANGELOG.md` 的 `未发布` 区域；正式构建会自动写入版本记录。
- 提交 Bug 或功能建议时使用 `.github/ISSUE_TEMPLATE/` 模板；Pull Request 必须写明调用链、影响范围、验证结果和剩余风险。
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
