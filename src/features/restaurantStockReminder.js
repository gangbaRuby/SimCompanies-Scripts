import { resourceIdNameMap } from '../constants/resourceMap.js';
import { getRealmIdFromLink } from '../core/storage.js';

// ======================
// 餐馆备货提醒（插入式表格展示 + 全部餐馆合计切换）
// ----------------------
// 识别方式：从 URL 提取 /b/<id>，在捕获的 buildings 数据（requestHooks 存储的
// SimcompaniesRetailCalculation_<realm>.buildings）中查找 kind === "r" 的建筑。
// 定位方式：找到 <label>菜单/Menu/Restaurant menu/菜單</label>，插入到其父元素末尾
// （不依赖任何 CSS 类名）。
// 数据：
//   - 菜品列表：restaurantProperties.saladBar/mains/drinks（自带物品 kind id）
//   - 消耗量（每 12 小时）= ceil( 等级 × 菜品系数 × 分区倍率 × LUXURY 因子 )，每日 ×2
//   - 库存：warehouseResources（requestHooks 已截取的 /api/v3/resources/<id>/ 数据），
//     按物品 kind 合并不同品质，排除 blocked: true
// 视图：
//   - 当前餐馆：当前建筑的菜品明细（菜品/库存/每日消耗/剩余天数），
//     菜品旁提示"还有 N 家餐馆在消耗"（共享库存口径提醒）
//   - 全部餐馆（标题旁按钮切换）：菜品视角合计，共享库存 ÷ 全体餐馆对该菜的日消耗合计
// 已知限制（模块失效时优先检查）：
//   - 容器定位依赖 <label> 文案全等匹配；游戏若改文案，优先检查 MENU_LABELS。
//   - 菜单数据来自 buildings 接口快照：页面内修改菜单后不会实时反映，
//     需重新进入餐馆页（buildings 重新捕获）才更新。
//   - 库存为 warehouseResources 接口快照，游戏切换页面重新请求时会自动刷新，并非实时递减。
// ======================
const RestaurantStockReminder = (function () {
    const MENU_LABELS = ['菜单', 'Menu', 'Restaurant menu', '菜單'];
    const BLOCK_ATTR = 'data-sc-restaurant-menu';
    const STORAGE_REGION_KEY = (realmId) => `SimcompaniesRetailCalculation_${realmId}`;
    const CYCLES_PER_DAY = 2; // 12 小时一轮 → 每天 2 轮
    const WARN_DAYS = 2; // 剩余天数不足 2 天 → ⚠️ 且高亮

    // 分区 → 菜品系数表（每 12 小时单份基础消耗）
    const DISH_COEFF = {
        saladBar: { 117: 288, 121: 24.89, 134: 92.6, 122: 38.196, 119: 96.312, 123: 16.667 },
        mains: { 129: 3.608, 130: 4.073, 131: 3.505, 142: 9.402, 143: 10.093, 149: 9.2 },
        drinks: { 132: 4.04, 124: 144, 125: 128.955, 126: 113.984 }
    };
    // 分区内已选菜品数 → 倍率（分区独立计数）
    const PARTITION_MULTIPLIER = { 1: 2.1, 2: 1.0, 3: 0.9, 4: 0.8, 5: 0.8, 6: 0.8 };
    const DEFAULT_MULTIPLIER = 0.8;

    const PARTITIONS = [
        { key: 'saladBar', title: '沙拉吧' },
        { key: 'mains', title: '主菜' },
        { key: 'drinks', title: '饮料' }
    ];

    const state = {
        watchTimer: null,
        blockNode: null,
        containerNode: null,
        lastMenuJson: '',
        lastBuildingId: '',
        viewAll: false,
        restaurant: null,
        allRestaurants: []
    };

    function isEnabled() {
        return typeof window.isPageModuleEnabled !== 'function' || window.isPageModuleEnabled('restaurantStock');
    }

    // 定时器常驻：开关状态只影响是否渲染，不影响轮询，
    // 保证在同一页面关闭再打开开关后功能自动恢复（无需重新进入建筑页）
    function init() {
        startWatch();
    }

    function startWatch() {
        if (state.watchTimer) return;
        state.watchTimer = setInterval(mainFunc, 1200);
        mainFunc();
    }

    function stopWatch() {
        if (state.watchTimer) {
            clearInterval(state.watchTimer);
            state.watchTimer = null;
        }
    }

    // 从 URL 提取建筑 id（兼容 /b/123、/zh-cn/b/123/ 及带后缀的形态）
    function getBuildingIdFromUrl() {
        const match = location.href.match(/\/b\/(\d+)(?:\/|$)/);
        return match ? match[1] : null;
    }

    function loadRegionData() {
        const realmId = getRealmIdFromLink();
        if (realmId === null) return null;
        try {
            const raw = localStorage.getItem(STORAGE_REGION_KEY(realmId));
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function findRestaurant(buildings, buildingId) {
        if (!Array.isArray(buildings)) return null;
        return buildings.find(b => b && b.kind === 'r' && String(b.id) === String(buildingId)) || null;
    }

    // 找到 <label>菜单</label>，返回其父元素（不依赖 CSS 类名）
    function findMenuContainer() {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            const text = label.textContent ? label.textContent.trim() : '';
            if (MENU_LABELS.includes(text)) {
                const container = label.parentElement;
                if (container && container !== document.body) return container;
            }
        }
        return null;
    }

    function dishName(kind) {
        return resourceIdNameMap[kind] || `#${kind}`;
    }

    // 每 12 小时周期消耗 = ceil( 等级 × 系数 × 分区倍率 × LUXURY 因子 )
    function perCycleConsume(level, kind, partitionCount, isLuxury, coeff) {
        const multiplier = PARTITION_MULTIPLIER[partitionCount] ?? DEFAULT_MULTIPLIER;
        const luxuryFactor = isLuxury ? 0.5 : 1;
        return Math.ceil((level || 1) * coeff * multiplier * luxuryFactor);
    }

    // 从 warehouseResources 中提取条目数组（兼容数组/对象包裹形态）
    function stockList(resources) {
        if (!resources) return null;
        if (Array.isArray(resources)) return resources;
        if (Array.isArray(resources.resources)) return resources.resources;
        if (Array.isArray(resources.items)) return resources.items;
        return null;
    }

    // 一次扫描生成 kind → 合计库存 映射（排除 blocked: true，不同品质合并）
    function buildStockMap(resources) {
        const list = stockList(resources);
        if (!list) return null;
        const map = new Map();
        for (const entry of list) {
            if (entry.blocked === true) continue;
            const entryKind = entry.kind ?? entry.resource ?? entry.resourceId ?? entry.id;
            if (entryKind === null || entryKind === undefined) continue;
            const amount = entry.amount ?? entry.quantity ?? 0;
            if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
            const key = String(entryKind);
            map.set(key, (map.get(key) || 0) + amount);
        }
        return map;
    }

    function stockForKind(stockMap, kind) {
        if (!stockMap) return null;
        const key = String(kind);
        return stockMap.has(key) ? stockMap.get(key) : 0;
    }

    // 其它（非当前）餐馆中也在菜单里提供该菜品的数量（共享库存口径提醒）
    function otherRestaurantCountForDish(allRestaurants, currentId, kind) {
        let count = 0;
        for (const r of allRestaurants) {
            if (String(r.id) === String(currentId)) continue;
            const props = r.restaurantProperties || {};
            let has = false;
            for (const p of PARTITIONS) {
                const items = Array.isArray(props[p.key]) ? props[p.key] : [];
                if (items.some(item => String(item.kind) === String(kind))) {
                    has = true;
                    break;
                }
            }
            if (has) count++;
        }
        return count;
    }

    function getMenuRows(restaurant) {
        const props = restaurant.restaurantProperties || {};
        const isLuxury = props.isLuxury === true;
        const level = restaurant.size ?? 1;

        const counts = {};
        const dishes = [];
        for (const p of PARTITIONS) {
            const items = Array.isArray(props[p.key]) ? props[p.key] : [];
            counts[p.key] = items.length;
            for (const item of items) {
                dishes.push({ partition: p.key, kind: item.kind });
            }
        }

        return dishes.map(d => {
            const coeff = DISH_COEFF[d.partition] && DISH_COEFF[d.partition][d.kind];
            const perCycle = coeff ? perCycleConsume(level, d.kind, counts[d.partition], isLuxury, coeff) : null;
            return { kind: d.kind, name: dishName(d.kind), perCycle };
        });
    }

    // 当前餐馆视图表格（菜品/库存/每日消耗/剩余天数）
    function buildCurrentTable(restaurant, allRestaurants) {
        const rows = getMenuRows(restaurant);
        if (rows.length === 0) {
            return '<div style="opacity:.75;padding:4px 2px;">该餐馆未选择任何菜品</div>';
        }
        const rowHtml = rows.map(r => {
            const otherCount = otherRestaurantCountForDish(allRestaurants, restaurant.id, r.kind);
            const otherHint = otherCount > 0
                ? `<span style="opacity:.6;margin-left:4px;">（还有${otherCount}家餐馆在消耗）</span>`
                : '';
            return `
            <tr data-sc-kind="${r.kind}" style="border-bottom:1px solid rgba(128,128,128,.15);">
                <td style="padding:3px 6px;">${r.name}${otherHint}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">—</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${r.perCycle === null ? '—' : (r.perCycle * CYCLES_PER_DAY).toLocaleString()}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">—</td>
            </tr>`;
        }).join('');
        return `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.35);">
                        <th style="padding:3px 6px;">菜品</th>
                        <th style="padding:3px 6px;text-align:right;">库存</th>
                        <th style="padding:3px 6px;text-align:right;">每日消耗</th>
                        <th style="padding:3px 6px;text-align:right;">剩余天数</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }

    // 全部餐馆视图（菜品视角）：共享库存 ÷ 全体餐馆对该菜的日消耗合计
    function buildAllTable(allRestaurants) {
        const agg = new Map();
        for (const r of allRestaurants) {
            const props = r.restaurantProperties || {};
            if (!props) continue;
            const isLuxury = props.isLuxury === true;
            const level = r.size ?? 1;
            for (const p of PARTITIONS) {
                const items = Array.isArray(props[p.key]) ? props[p.key] : [];
                const count = items.length;
                for (const item of items) {
                    const coeff = DISH_COEFF[p.key] && DISH_COEFF[p.key][item.kind];
                    if (!coeff) continue; // 未知系数菜品不计入合计
                    const perCycle = perCycleConsume(level, item.kind, count, isLuxury, coeff);
                    const key = String(item.kind);
                    const entry = agg.get(key) || { dailyTotal: 0, restCount: 0 };
                    entry.dailyTotal += perCycle * CYCLES_PER_DAY;
                    entry.restCount += 1;
                    agg.set(key, entry);
                }
            }
        }

        const stockMap = buildStockMap(loadRegionData()?.warehouseResources ?? null);
        const rows = [...agg.entries()].map(([kind, e]) => {
            const stock = stockForKind(stockMap, kind);
            const days = (stock !== null && e.dailyTotal > 0) ? stock / e.dailyTotal : null;
            return { kind, name: dishName(kind), dailyTotal: e.dailyTotal, restCount: e.restCount, days };
        });
        // 按剩余天数升序（无库存数据排最后）
        rows.sort((a, b) => {
            if (a.days === null && b.days === null) return 0;
            if (a.days === null) return 1;
            if (b.days === null) return -1;
            return a.days - b.days;
        });

        if (rows.length === 0) {
            return '<div style="opacity:.75;padding:4px 2px;">未检测到可计算菜品（或没有餐馆）</div>';
        }
        const rowHtml = rows.map(r => {
            const warn = r.days !== null && r.days < WARN_DAYS;
            const daysText = r.days === null
                ? '—'
                : (warn ? `⚠️ ${r.days.toFixed(2)}` : r.days.toFixed(2));
            return `
            <tr data-sc-kind="${r.kind}" style="border-bottom:1px solid rgba(128,128,128,.15);${warn ? 'background:rgba(220,38,38,.15);' : ''}">
                <td style="padding:3px 6px;">${r.name}</td>
                <td data-sc-restcount style="padding:3px 6px;text-align:right;">${r.restCount}</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${r.dailyTotal.toLocaleString()}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">—</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">${daysText}</td>
            </tr>`;
        }).join('');
        return `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.35);">
                        <th style="padding:3px 6px;">菜品</th>
                        <th style="padding:3px 6px;text-align:right;">涉及餐馆</th>
                        <th style="padding:3px 6px;text-align:right;">每日消耗</th>
                        <th style="padding:3px 6px;text-align:right;">库存</th>
                        <th style="padding:3px 6px;text-align:right;">剩余天数</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }

    function renderIntoBlock(block, restaurant, allRestaurants) {
        const viewAll = state.viewAll;
        const buttonText = viewAll ? '显示当前餐馆' : '显示全部餐馆';
        const body = viewAll
            ? buildAllTable(allRestaurants)
            : buildCurrentTable(restaurant, allRestaurants);
        block.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <div style="font-weight:bold;">餐馆备货提醒<span style="font-weight:normal;opacity:.75;margin-left:4px;">（${viewAll ? '全部餐馆' : '当前餐馆'}）</span></div>
                <button data-sc-view-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">${buttonText}</button>
            </div>
            ${body}
            <div style="opacity:.55;margin-top:4px;font-size:11px;">* 页面内修改菜单后，本提醒需重新进入餐馆页才会更新</div>`;
    }

    // 就地刷新库存/剩余天数（数据变化时只更新数值，避免整块重建闪烁）
    function refreshStocks() {
        const block = state.blockNode;
        if (!block || !block.isConnected) return;

        const region = loadRegionData();
        const stockMap = buildStockMap(region ? region.warehouseResources : null);
        const rows = block.querySelectorAll('tr[data-sc-kind]');
        rows.forEach(row => {
            const kind = row.getAttribute('data-sc-kind');
            const stock = stockForKind(stockMap, kind);

            const dailyCell = row.querySelector('[data-sc-daily]');
            const daily = dailyCell ? parseInt(String(dailyCell.textContent || '').replace(/[^\d]/g, ''), 10) : 0;

            const stockCell = row.querySelector('[data-sc-stock]');
            if (stockCell) {
                const stockText = stock === null ? '—' : stock.toLocaleString();
                if (stockCell.textContent !== stockText) stockCell.textContent = stockText;
            }

            const daysCell = row.querySelector('[data-sc-days]');
            if (daysCell) {
                const days = (stock !== null && daily > 0) ? stock / daily : null;
                const warn = days !== null && days < WARN_DAYS;
                const daysText = days === null
                    ? '—'
                    : (warn ? `⚠️ ${days.toFixed(2)}` : days.toFixed(2));
                if (daysCell.textContent !== daysText) daysCell.textContent = daysText;
                row.style.background = warn ? 'rgba(220,38,38,.15)' : '';
            }
        });
    }

    function removeBlock() {
        if (state.blockNode && state.blockNode.isConnected) {
            state.blockNode.remove();
        }
        state.blockNode = null;
        state.containerNode = null;
        state.lastMenuJson = '';
        state.lastBuildingId = '';
        state.restaurant = null;
        state.allRestaurants = [];
    }

    function currentMenuJson(restaurant, allRestaurants) {
        return state.viewAll
            ? JSON.stringify((allRestaurants || []).map(r => r.restaurantProperties || {}))
            : JSON.stringify(restaurant.restaurantProperties || {});
    }

    function ensureBlock(container, restaurant, allRestaurants, buildingId) {
        const menuJson = currentMenuJson(restaurant, allRestaurants);
        if (
            state.blockNode && state.blockNode.isConnected &&
            state.containerNode === container &&
            state.lastBuildingId === buildingId &&
            state.lastMenuJson === menuJson
        ) {
            return;
        }

        const block = state.blockNode && state.blockNode.isConnected
            ? state.blockNode
            : document.createElement('div');

        if (!block.isConnected) {
            block.setAttribute(BLOCK_ATTR, String(restaurant.id));
            block.style.cssText = [
                'margin-top:10px',
                'padding:8px 10px',
                'border-top:1px dashed rgba(128,128,128,.5)',
                'border-bottom:1px dashed rgba(128,128,128,.5)',
                'font-size:12px',
                'line-height:1.6'
            ].join(';');
            block.addEventListener('click', (e) => {
                if (!e.target.closest('[data-sc-view-toggle]')) return;
                state.viewAll = !state.viewAll;
                renderIntoBlock(block, state.restaurant, state.allRestaurants);
                state.lastMenuJson = currentMenuJson(state.restaurant, state.allRestaurants);
                refreshStocks();
            });
            container.appendChild(block);
        }

        state.blockNode = block;
        state.containerNode = container;
        state.restaurant = restaurant;
        state.allRestaurants = allRestaurants || [];
        state.lastBuildingId = buildingId;
        state.lastMenuJson = menuJson;
        renderIntoBlock(block, restaurant, state.allRestaurants);
    }

    function mainFunc() {
        if (!isEnabled()) {
            // 开关关闭只隐藏块，保留定时器：同页重新打开开关后下个 tick 自动恢复
            removeBlock();
            return;
        }

        const buildingId = getBuildingIdFromUrl();
        if (!buildingId) {
            removeBlock();
            return;
        }

        // 换楼时重置回"当前餐馆"视图
        if (state.lastBuildingId && state.lastBuildingId !== buildingId) {
            state.viewAll = false;
        }

        const region = loadRegionData();
        const buildings = region ? region.buildings : null;
        const restaurant = findRestaurant(buildings, buildingId);
        if (!restaurant) {
            removeBlock();
            return;
        }

        const allRestaurants = Array.isArray(buildings) ? buildings.filter(b => b && b.kind === 'r') : [];
        const container = findMenuContainer();
        if (!container) {
            removeBlock();
            return;
        }

        ensureBlock(container, restaurant, allRestaurants, buildingId);
        refreshStocks();
    }

    return { init };
})();

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.RestaurantStockReminder = RestaurantStockReminder;
