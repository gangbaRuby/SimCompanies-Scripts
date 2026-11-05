# 出库销售与合同 MP 维护说明

本页记录 `src/features/outgoingContractMPHandler.js` 的数据依赖、计算口径及游戏更新后的失效排查入口。最后核对日期：2026-11-05；核对依据为游戏前端 `index-ZU2gek09.js`、`GamePages-CT4PIk_7.js`（React 19.3）。这些文件名仅用于记录核对版本，功能不依赖固定文件名。

## 调用链与数据来源

`src/index.js` 导入模块 → `pageObserver` 匹配 `/headquarters/warehouse/<资源>/sell/` 或 `contract/` → 检查 `outgoingMP` 开关 → `SC_Modules.outgoingContractMPHandler.init()` → 读取表单、库存与市场数据 → 显示价格按钮和利润。

- 当前资源与品质：从 `input[name="price"]` 所属 React Fiber 的当前分支向上读取表单 props 中的 `resource`、`transportation`；不依赖标题翻译、星星数量或压缩后的组件名。
- 当前库存：沿祖先查找 Redux store，读取 `state.user.authCompany.realmId` 与 `state.warehouse.resources`，按库存 `id`、`kind`、`quality` 匹配所选批次。当前数组中已不存在的库存不能回退到旧表单对象。
- 商品成本：整批 `cost` 数值之和除以衰减后的剩余数量。常量或时间暂不可用时，仅在表单仍持有同一库存对象时使用未格式化的 `unitSourceCost`。
- 运输成本：未锁定且数量有效的 kind 13 批次成本之和除以数量之和；缺少仓库数组时可读取表单 `transportationUnitPrice`。不再取第一批运输库存作为全部运输的成本。
- MP/VWAP：沿用市场缓存与市场接口、simcotools VWAP；回调和按钮点击校验当前页面、库存身份、输入节点，避免旧结果写入新表单。

输入事件、DOM 观察与仅在活动页面运行的 1 秒复核共同更新数据。`destroy()` 在离页、关闭及重新初始化时清理计时器、Observer、事件监听、在途请求、注入 UI 和样式。假定运输单价只存在当前页面内存中，换领域或销毁后清空。

## 计算口径与有意保留的差异

| 项目 | 当前实现 | 游戏更新后需要重新核对的内容 |
| --- | --- | --- |
| 库存衰减 | `hours = round(abs(now - datetime) / 60000 / 4) × 4 / 60`，剩余数量 `floor(amount × (1-decay)^hours)`；无衰减资源直接使用 `amount` | 时间字段含义、衰减率来源、4 分钟步长、数量取整 |
| 交易所运输 | `ceil(数量 × transportation)` | 运输系数、消耗取整规则 |
| 合同运输 | `ceil(数量 × transportation × 0.5)` | 合同减半规则及取整顺序 |
| 交易所手续费 | 收入的 4% | 普通领域费率及是否增加公司相关优惠 |
| 金额与利润 | 内部不提前取整，金额显示 2 位小数 | 成本字段及费用定义是否变化 |
| 快捷定价 | 合同保留 3 位小数，交易所使用 `SELL_STEPS` 价格档位 | 原生合法价格步长是否调整 |

游戏原生交易所预览将收入向下取整、手续费向上取整至整数。本功能根据维护者要求保留未取整计算，并在利润框右上角的「？」提示中说明差异。这属于明确选择的展示口径，不能仅因与原生差少量金额就改成原生取整。

没有可用运输库存或运输成本暂不可读时，继续显示标注「未扣运输费」的利润，运输费显示「未计入」。填写有效的假定单价后扣除估算运输费用，状态行说明估算来源；恢复实际运输成本后优先使用实际值。真实零成本与数据缺失必须区分。商品成本未知时仍停止利润计算，不能假定为零。

挑战领域不在当前支持范围内。

## 可能失效的原因与排查入口

| 变化或症状 | 优先排查 | 可能影响 |
| --- | --- | --- |
| React 升级、内部属性被隐藏或更换渲染框架 | `getCurrentFiber()`：输入节点上的 `__reactFiber$`、`__reactInternalInstance$`、`alternate`、根 `current`；`readFormContext()` 的祖先链 | 无法识别当前库存；原生界面正常也不代表插件还能读取 |
| 出售或合同表单改版 | `readFormContext()` 的 `input[name="price"]`、同表单 `amount/quantity`，以及注入点 `.row`、价格输入父元素；同步检查 `PAGE_PATTERN` 和 `pageObserver` 路由 | 按钮/利润框不出现、位置异常，或读取不到数量和单价 |
| React props、Redux store 或仓库字段调整 | `resource`、`transportation`、`unitSourceCost`、`transportationUnitPrice`；store 获取路径及 `warehouse.resources`；库存 `id/kind/quality/amount/cost/blocked/datetime` 的类型和含义 | 库存识别或成本计算失败；运输可能进入假定单价模式 |
| 常量缓存不完整、解析来源变化或过期 | `SimcompaniesConstantsData.constantsResources[kind].decay`，并检查 `constantsData.js`、常量自动更新和分包解析 | 衰减成本无法计算，或旧常量使结果偏离新规则 |
| 市场接口、simcotools 接口、返回结构或缓存格式变化 | `getCachedMarketData()`、`refreshMarketData()`、`getVWAPData()`；请求状态、品质与价格字段、缓存时间 | MP/VWAP 快捷价格缺失或陈旧；库存利润计算通常独立可用 |
| 游戏调整手续费、运输、衰减或价格档位 | 上述计算口径及 `getRemainingAmount()`、`calcAndDisplayProfit()`、`SELL_STEPS`；对照新版原生计算和提交校验 | 可能仍正常显示但计算口径已不一致，不能仅靠无报错判断正确 |
| 同 URL 切库存、React 重用或替换节点、SPA 路由事件变化 | `refreshPage()`、输入事件、Observer、利润去重键、异步代次与库存身份校验、`init()/destroy()` | 旧品质成本残留、按钮不恢复、旧请求覆盖新选择或重复 UI |

单纯切换语言、修改标题文字、重新压缩组件名称或更换前端包哈希，通常不会影响当前库存和品质识别。没有运输库存、运输全部锁定属于正常数据场景，不应当作功能故障。

## 建议排查顺序

1. 先确认页面路由、普通领域和 `outgoingMP` 开关；检查 `SC_Modules` 注册与表单输入是否存在。
2. 对照实际所选库存，检查 React 当前分支与 store 读取结果，确认库存 ID、种类、品质一致。不要恢复「识别失败默认 Q0」或基于标题的猜测。
3. 分别核对商品成本、衰减分母、可用运输库存和运输成本来源；区分缺失数据、锁定库存、真实零成本及假定价格。
4. MP/VWAP 异常时单独检查网络与缓存；同页切换后异常则检查库存身份和过期回调。
5. 页面能正常显示但数值异常时，对照游戏最新前端重新核对费率、运输、衰减与价格档位，并保留已约定的金额取整差异。

## 验证范围

本次修复完成了 67 项离线成本、快捷按钮、假定运输单价、提示交互和生命周期检查，以及使用上述游戏包中 React 19.3 的 16 项渲染检查。浏览器离线预览核对了桌面、手机宽度、深浅色与右上角提示展开。维护者反馈基本正常；未记录真实账号与手机实机的完整覆盖，不应把离线检查当作实机验证。

后续调整时运行 `npm run check`，并重点复核：英文非零品质且无对应卖单、同 URL 换品质、库存更新、缺少/锁定运输、假定值清空及恢复真实成本、首次进入/离开再返回、开关、React 重绘和提示交互。
