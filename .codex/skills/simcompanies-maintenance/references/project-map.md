# 项目地图

## 入口与路由

- `src/header.js`：Userscript 元数据。
- `src/index.js`：入口导入、遗留启动/UI、全局面板、自动更新器启动和其余兼容逻辑。
- `src/features/pageObserver.js`：SPA URL 检测，并通过 `window.SC_Modules` 分发功能。
- `src/features/pageModuleConfig.js`：页面功能开关状态辅助方法。

## 共享服务

- `src/core/state.js`：共享常量和版本状态。
- `src/core/network.js`：带重试的请求辅助方法。
- `src/core/storage.js`：区服识别与作用域存储键辅助方法。
- `src/core/requestHooks.js`：游戏请求拦截与缓存更新。
- `src/features/dataStorage.js`：常量和区服数据持久化。
- `src/utils/ui.js`、`src/utils/uiComponents.js`：共享 UI 和开关辅助方法。

## 功能归属

- `incomingContractsHandler.js`：传入合同、MP、Worker、市场缓存、高价规则和接受确认。
- `resourceMarketHandler.js`：资源市场计算和控件。
- `outgoingContractMPHandler.js`：出库销售/合同 MP、VWAP 预设、价格建议和运输利润显示。
- `warehouseRetailProfit.js`：仓库零售利润。
- `landscapeIdleBuildingHighlight.js`：地图空闲建筑高亮。
- `restaurantStockReminder.js`：餐馆备货提醒（菜单库存、每日消耗、剩余天数预警）。
- `executiveBoardroom.js`：自定义高管数据面板和已保存加成。

## 高风险检查

### 传入合同

检查路由匹配、卡片解析数据、常量/区服缓存、两个 Worker、市场请求完成顺序、Observer 防抖、React 卡片替换、高价计算、捕获阶段接受拦截和路由离开清理。

### 资源市场

检查资源路由、表格替换、数量监听、行 Worker、全局/表格 Observer、自定义高管状态和重复初始化。

### 出库合同

检查销售/合同路由、资源和品质识别、市场/VWAP 缓存、价格输入刷新、MP/VWAP 计算基础、运输利润 Observer 和 SPA 清理。

## 产物规则

`npm run build` 会将 `src/index.js` 打包为 `dist/autoMaxPPHPL_DEV.user.js`。
`npm run release -- "<更新说明>"` 是生成根目录 `autoMaxPPHPL.user.js` 的唯一支持方式；除非明确批准 `--version 1.x.y`，否则只递增补丁版本，使用不含 `(DEV)` 的正式元数据，并追加更新器读取的变更说明尾注。
