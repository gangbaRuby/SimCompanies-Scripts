import { resourceIdNameMap } from '../constants/resourceMap.js';
import { getRealmIdFromLink, getScopedKey } from '../core/storage.js';
import { registerExportInfo } from '../core/exportInfo.js';

// ======================
// 餐馆备货提醒（插入式表格 + 全部餐馆合计 + 品质明细 + 详细设置）
// ----------------------
// 识别方式：从 URL 提取 /b/<id>，在捕获的 buildings 数据（requestHooks 存储的
// SimcompaniesRetailCalculation_<realm>.buildings）中查找 kind === "r" 的建筑。
// 定位方式：找到 <label>菜单/Menu/Restaurant menu/菜單</label>，插入到其父元素末尾
// （不依赖任何 CSS 类名）。
// 数据：
//   - 菜品列表：restaurantProperties.saladBar/mains/drinks（自带物品 kind id）
//   - 消耗量（每 12 小时）= ceil( 等级 × 菜品系数 × 分区倍率 × LUXURY 因子 )，每日 ×2
//   - 库存：warehouseResources（requestHooks 已截取的 /api/v3/resources/<id>/ 数据），
//     默认按 kind 合并全部品质（排除 blocked: true）；详细设置可为每个餐馆×菜品选择
//     品质范围 Q0-Q12（从~到，自动=不筛选），此时库存只统计范围内品质
// 视图（标题旁按钮切换）：
//   - 当前餐馆：菜品/库存/每日消耗/剩余天数/差量（差量点击复制）
//   - 全部餐馆：按 菜品×品质范围 分桶合计（涉及餐馆数/每日消耗/库存/剩余天数/差量）
//   - 品质明细：按 菜品×品质 逐行统计（覆盖餐馆数/每日消耗/库存/剩余天数/差量），
//     重叠品质的消耗自动合并所有覆盖它的餐馆——重叠范围下不重复计算库存的口径
// 详细设置（"设置"按钮，存储键 R<realmId>-SC-RestaurantStock_Settings，经 getScopedKey 生成，按领域分开，scope: realm；只显示当前餐馆）：
//   - 预警天数：剩余天数低于该值 → ⚠️ + 高亮（默认 2）
//   - 目标天数：差量 = max(0, ceil(日消耗 × 目标天数) − 库存)（默认 2）
//   - 品质范围：每个菜单菜品 → 从 Qx 到 Qy（自动=不筛选）
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
    // 领域键遵循仓库 getScopedKey 规范：R<realmId>-SC-<名称>
    const SETTINGS_KEY_BASE = 'SC-RestaurantStock_Settings';
    const LEGACY_SETTINGS_KEY = 'SC_RestaurantStock_Settings'; // 旧全局键，一次性迁移到当前领域
    const CYCLES_PER_DAY = 2; // 12 小时一轮 → 每天 2 轮
    const DEFAULT_WARN_DAYS = 2;
    const DEFAULT_TARGET_DAYS = 2;
    const QUALITY_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

    registerExportInfo({
        name: '餐馆备货提醒设置',
        scope: 'realm',
        keys: (realmId) => [getScopedKey(SETTINGS_KEY_BASE)]
    });

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
        view: 'current', // 'current' | 'all' | 'quality'
        showSettings: false,
        restaurant: null,
        allRestaurants: []
    };

    // ---------- 设置存取 ----------
    function loadSettings() {
        const realmId = getRealmIdFromLink();
        if (realmId === null) return { warnDays: DEFAULT_WARN_DAYS, targetDays: DEFAULT_TARGET_DAYS, qualities: {} };
        let raw = localStorage.getItem(getScopedKey(SETTINGS_KEY_BASE));
        if (raw === null) {
            // 旧全局设置一次性迁移到当前领域
            const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
            if (legacy !== null) {
                try { localStorage.setItem(getScopedKey(SETTINGS_KEY_BASE), legacy); } catch (e) { /* ignore */ }
                raw = legacy;
            }
        }
        try {
            const parsed = JSON.parse(raw || '{}');
            const warnDays = Number.isFinite(Number(parsed.warnDays)) && Number(parsed.warnDays) >= 1
                ? Number(parsed.warnDays) : DEFAULT_WARN_DAYS;
            const targetDays = Number.isFinite(Number(parsed.targetDays)) && Number(parsed.targetDays) >= 1
                ? Number(parsed.targetDays) : DEFAULT_TARGET_DAYS;
            return {
                warnDays,
                targetDays,
                qualities: normalizeQualities(parsed.qualities)
            };
        } catch (e) {
            return { warnDays: DEFAULT_WARN_DAYS, targetDays: DEFAULT_TARGET_DAYS, qualities: {} };
        }
    }

    // 兼容旧格式（单品质字符串）→ 范围对象
    function normalizeQualities(qs) {
        const out = {};
        if (!qs || typeof qs !== 'object') return out;
        for (const rid of Object.keys(qs)) {
            const per = qs[rid];
            if (!per || typeof per !== 'object') continue;
            out[rid] = {};
            for (const kind of Object.keys(per)) {
                out[rid][kind] = normalizeQualityValue(per[kind]);
            }
        }
        return out;
    }

    function normalizeQualityValue(v) {
        let r;
        if (v && typeof v === 'object' && v.min !== undefined && v.max !== undefined) {
            r = { min: v.min ?? 'auto', max: v.max ?? 'auto' };
        } else if (v === undefined || v === null || v === '' || v === 'auto') {
            r = { min: 'auto', max: 'auto' };
        } else {
            r = { min: String(v), max: String(v) };
        }
        // 兼容脏数据：从 > 到 时交换，保证 从 ≤ 到
        if (r.min !== 'auto' && r.max !== 'auto' && Number(r.min) > Number(r.max)) {
            const t = r.min; r.min = r.max; r.max = t;
        }
        return r;
    }

    function saveSettings(settings) {
        const realmId = getRealmIdFromLink();
        if (realmId === null) return;
        try { localStorage.setItem(getScopedKey(SETTINGS_KEY_BASE), JSON.stringify(settings)); } catch (e) { /* ignore */ }
    }

    // 该餐馆某菜品的品质范围（{min,max}，'auto' = 不筛选该端）
    function qualityRangeFor(settings, restaurantId, kind) {
        const v = settings.qualities && settings.qualities[restaurantId] && settings.qualities[restaurantId][kind];
        return (v && typeof v === 'object') ? { min: v.min ?? 'auto', max: v.max ?? 'auto' } : { min: 'auto', max: 'auto' };
    }

    function isFullRange(range) {
        return (range.min === 'auto' || range.min === undefined) && (range.max === 'auto' || range.max === undefined);
    }

    // 品质 q 是否被该范围覆盖（自动 = 覆盖全部）
    function rangeCovers(range, q) {
        if (isFullRange(range)) return true;
        const qn = Number(q);
        const min = range.min === 'auto' ? 0 : Number(range.min);
        const max = range.max === 'auto' ? 12 : Number(range.max);
        return qn >= min && qn <= max;
    }

    // 分桶键：'auto'（不筛选）或 'min|max'
    function rangeBucket(range) {
        return isFullRange(range) ? 'auto' : `${range.min === 'auto' ? 'auto' : range.min}|${range.max === 'auto' ? 'auto' : range.max}`;
    }

    // 品质标签文本：(Q3) / (Q3-Q5) / (Q3+) / (≤Q5) / ''
    function qualityTagText(range) {
        if (isFullRange(range)) return '';
        const min = range.min === 'auto' ? null : Number(range.min);
        const max = range.max === 'auto' ? null : Number(range.max);
        if (min !== null && max !== null && min === max) return `(Q${min})`;
        if (min !== null && max !== null) return `(Q${min}-Q${max})`;
        if (min !== null) return `(Q${min}+)`;
        return `(≤Q${max})`;
    }

    // ---------- 基础 ----------
    function isEnabled() {
        return typeof window.isPageModuleEnabled !== 'function' || window.isPageModuleEnabled('restaurantStock');
    }

    // 定时器常驻：开关状态只影响渲染，不影响轮询（同页开关可自恢复）
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

    function perCycleConsume(level, kind, partitionCount, isLuxury, coeff) {
        const multiplier = PARTITION_MULTIPLIER[partitionCount] ?? DEFAULT_MULTIPLIER;
        const luxuryFactor = isLuxury ? 0.5 : 1;
        return Math.ceil((level || 1) * coeff * multiplier * luxuryFactor);
    }

    // ---------- 库存 ----------
    function stockList(resources) {
        if (!resources) return null;
        if (Array.isArray(resources)) return resources;
        if (Array.isArray(resources.resources)) return resources.resources;
        if (Array.isArray(resources.items)) return resources.items;
        return null;
    }

    // range = {min,max}（'auto' 表示不筛选该端）；全部自动 = 合并全部品质（排除 blocked）
    function buildStockMap(resources, range) {
        const list = stockList(resources);
        if (!list) return null;
        const full = isFullRange(range);
        const min = full ? null : (range.min === 'auto' ? 0 : Number(range.min));
        const max = full ? null : (range.max === 'auto' ? 12 : Number(range.max));
        const map = new Map();
        for (const entry of list) {
            if (entry.blocked === true) continue;
            if (!full) {
                const q = Number(entry.quality);
                if (!Number.isFinite(q) || q < min || q > max) continue;
            }
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

    function otherRestaurantCountForDish(allRestaurants, currentId, kind) {
        let count = 0;
        for (const r of allRestaurants) {
            if (String(r.id) === String(currentId)) continue;
            const props = r.restaurantProperties || {};
            let has = false;
            for (const p of PARTITIONS) {
                const items = Array.isArray(props[p.key]) ? props[p.key] : [];
                if (items.some(item => String(item.kind) === String(kind))) { has = true; break; }
            }
            if (has) count++;
        }
        return count;
    }

    // ---------- 视图构建 ----------
    function getMenuRows(restaurant, settings) {
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
            const range = qualityRangeFor(settings, restaurant.id, d.kind);
            return { kind: d.kind, name: dishName(d.kind), perCycle, range };
        });
    }

    function buildCurrentTable(restaurant, allRestaurants, settings) {
        const rows = getMenuRows(restaurant, settings);
        if (rows.length === 0) {
            return '<div style="opacity:.75;padding:4px 2px;">该餐馆未选择任何菜品</div>';
        }
        const rowHtml = rows.map(r => {
            const otherCount = otherRestaurantCountForDish(allRestaurants, restaurant.id, r.kind);
            const otherHint = otherCount > 0
                ? `<span style="opacity:.6;margin-left:4px;">（还有${otherCount}家餐馆在消耗）</span>`
                : '';
            const qualityTag = qualityTagText(r.range);
            const dailyText = r.perCycle === null ? '—' : (r.perCycle * CYCLES_PER_DAY).toLocaleString();
            return `
            <tr data-sc-kind="${r.kind}" data-sc-quality="${rangeBucket(r.range)}" style="border-bottom:1px solid rgba(128,128,128,.15);">
                <td style="padding:3px 6px;">${r.name}${qualityTag ? ` <span style="opacity:.7;">${qualityTag}</span>` : ''}${otherHint}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">—</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${dailyText}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">—</td>
                <td data-sc-shortfall data-sc-shortfall-raw="" style="padding:3px 6px;text-align:right;cursor:pointer;" title="点击复制差量">—</td>
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
                        <th style="padding:3px 6px;text-align:right;">差量</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }

    // 全部餐馆视图（菜品 × 品质范围 分桶）：每个桶 = 使用该品质范围的餐馆合计
    function buildAllTable(allRestaurants, settings) {
        const buckets = new Map();
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
                    const range = qualityRangeFor(settings, r.id, item.kind);
                    const bucket = rangeBucket(range);
                    const key = `${item.kind}|${bucket}`;
                    const entry = buckets.get(key) || { kind: String(item.kind), bucket, range, dailyTotal: 0, restCount: 0 };
                    entry.dailyTotal += perCycle * CYCLES_PER_DAY;
                    entry.restCount += 1;
                    buckets.set(key, entry);
                }
            }
        }

        const resources = loadRegionData()?.warehouseResources ?? null;
        const rows = [...buckets.values()].map(b => {
            const stockMap = buildStockMap(resources, b.range);
            const stock = stockForKind(stockMap, b.kind);
            const days = (stock !== null && b.dailyTotal > 0) ? stock / b.dailyTotal : null;
            const shortfall = (stock !== null && b.dailyTotal > 0)
                ? Math.max(0, Math.ceil(b.dailyTotal * settings.targetDays) - stock)
                : null;
            return { ...b, name: dishName(b.kind), stock, days, shortfall };
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
            const warn = r.days !== null && r.days < settings.warnDays;
            const daysText = r.days === null ? '—' : (warn ? `⚠️ ${r.days.toFixed(2)}` : r.days.toFixed(2));
            const shortfallText = r.shortfall === null ? '—' : r.shortfall.toLocaleString();
            const qualityTag = qualityTagText(r.range);
            return `
            <tr data-sc-kind="${r.kind}" data-sc-quality="${r.bucket}" style="border-bottom:1px solid rgba(128,128,128,.15);${warn ? 'background:rgba(220,38,38,.15);' : ''}">
                <td style="padding:3px 6px;">${r.name}${qualityTag ? ` <span style="opacity:.7;">${qualityTag}</span>` : ''}</td>
                <td data-sc-restcount style="padding:3px 6px;text-align:right;">${r.restCount}</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${r.dailyTotal.toLocaleString()}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">${r.stock === null ? '—' : r.stock.toLocaleString()}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">${daysText}</td>
                <td data-sc-shortfall data-sc-shortfall-raw="${r.shortfall === null ? '' : r.shortfall}" style="padding:3px 6px;text-align:right;cursor:pointer;" title="点击复制差量">${shortfallText}</td>
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
                        <th style="padding:3px 6px;text-align:right;">差量</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }

    // 品质明细视图（菜品 × 品质 逐行）：重叠品质的消耗合并所有覆盖它的餐馆，
    // 库存按单品质独立统计——重叠范围下不重复计算的口径
    function buildQualityDetailTable(allRestaurants, settings) {
        const agg = new Map(); // kind -> { dailyByQuality: Map, restByQuality: Map }
        let hasExplicitRange = false;
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
                    if (!coeff) continue;
                    const perCycle = perCycleConsume(level, item.kind, count, isLuxury, coeff);
                    const daily = perCycle * CYCLES_PER_DAY;
                    const range = qualityRangeFor(settings, r.id, item.kind);
                    if (!isFullRange(range)) hasExplicitRange = true;
                    const kindKey = String(item.kind);
                    let entry = agg.get(kindKey);
                    if (!entry) {
                        entry = { dailyByQuality: new Map(), restByQuality: new Map() };
                        agg.set(kindKey, entry);
                    }
                    for (const q of QUALITY_VALUES) {
                        if (!rangeCovers(range, q)) continue;
                        entry.dailyByQuality.set(q, (entry.dailyByQuality.get(q) || 0) + daily);
                        entry.restByQuality.set(q, (entry.restByQuality.get(q) || 0) + 1);
                    }
                }
            }
        }

        const resources = loadRegionData()?.warehouseResources ?? null;
        const stockCache = new Map();
        const stockMapForQ = (q) => {
            if (!stockCache.has(q)) stockCache.set(q, buildStockMap(resources, { min: q, max: q }));
            return stockCache.get(q);
        };

        const rows = [];
        for (const [kind, entry] of agg.entries()) {
            for (const q of QUALITY_VALUES) {
                const daily = entry.dailyByQuality.get(q);
                const restCount = entry.restByQuality.get(q);
                if (!daily || !restCount) continue;
                const stock = stockForKind(stockMapForQ(q), kind);
                // 全部自动时只列有库存的品质，避免每菜 13 行噪音
                if (!hasExplicitRange && (stock === null || stock === 0)) continue;
                const days = (stock !== null && daily > 0) ? stock / daily : null;
                const shortfall = (stock !== null && daily > 0)
                    ? Math.max(0, Math.ceil(daily * settings.targetDays) - stock)
                    : null;
                rows.push({ kind, name: dishName(kind), q, restCount, daily, stock, days, shortfall });
            }
        }
        // 按菜名分组、品质升序
        rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : Number(a.q) - Number(b.q)));

        if (rows.length === 0) {
            return '<div style="opacity:.75;padding:4px 2px;">未检测到可计算菜品（或没有餐馆）</div>';
        }
        const rowHtml = rows.map(r => {
            const warn = r.days !== null && r.days < settings.warnDays;
            const daysText = r.days === null ? '—' : (warn ? `⚠️ ${r.days.toFixed(2)}` : r.days.toFixed(2));
            const shortfallText = r.shortfall === null ? '—' : r.shortfall.toLocaleString();
            return `
            <tr data-sc-kind="${r.kind}" data-sc-quality="${r.q}|${r.q}" style="border-bottom:1px solid rgba(128,128,128,.15);${warn ? 'background:rgba(220,38,38,.15);' : ''}">
                <td style="padding:3px 6px;">${r.name}</td>
                <td style="padding:3px 6px;text-align:right;">Q${r.q}</td>
                <td data-sc-restcount style="padding:3px 6px;text-align:right;">${r.restCount}</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${r.daily.toLocaleString()}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">${r.stock === null ? '—' : r.stock.toLocaleString()}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">${daysText}</td>
                <td data-sc-shortfall data-sc-shortfall-raw="${r.shortfall === null ? '' : r.shortfall}" style="padding:3px 6px;text-align:right;cursor:pointer;" title="点击复制差量">${shortfallText}</td>
            </tr>`;
        }).join('');
        return `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.35);">
                        <th style="padding:3px 6px;">菜品</th>
                        <th style="padding:3px 6px;text-align:right;">品质</th>
                        <th style="padding:3px 6px;text-align:right;">覆盖餐馆</th>
                        <th style="padding:3px 6px;text-align:right;">每日消耗</th>
                        <th style="padding:3px 6px;text-align:right;">库存</th>
                        <th style="padding:3px 6px;text-align:right;">剩余天数</th>
                        <th style="padding:3px 6px;text-align:right;">差量</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }

    function qualityRangeSelectHtml(range, restId, kind) {
        const cur = { min: range.min ?? 'auto', max: range.max ?? 'auto' };
        const options = ['<option value="auto">自动</option>']
            .concat(QUALITY_VALUES.map(q => `<option value="${q}">Q${q}</option>`))
            .join('');
        const mark = (selVal) => {
            if (selVal === 'auto') return options;
            return options.replace(`<option value="${selVal}">Q${selVal}</option>`, `<option value="${selVal}" selected>Q${selVal}</option>`);
        };
        const minSelect = `<select data-sc-quality-min data-rest="${restId}" data-kind="${kind}" style="font-size:11px;padding:0 2px;">${mark(cur.min)}</select>`;
        const maxSelect = `<select data-sc-quality-max data-rest="${restId}" data-kind="${kind}" style="font-size:11px;padding:0 2px;">${mark(cur.max)}</select>`;
        return `<span style="white-space:nowrap;">从 ${minSelect} 到 ${maxSelect}</span>`;
    }

    // 设置面板：只显示当前餐馆
    function buildSettingsHtml(settings, currentRestaurant) {
        const restHtml = (currentRestaurant ? [currentRestaurant] : []).map(r => {
            const props = r.restaurantProperties || {};
            const dishSpans = [];
            for (const p of PARTITIONS) {
                const items = Array.isArray(props[p.key]) ? props[p.key] : [];
                for (const item of items) {
                    const range = qualityRangeFor(settings, r.id, item.kind);
                    dishSpans.push(`<span style="margin-right:8px;">${dishName(item.kind)} ${qualityRangeSelectHtml(range, r.id, item.kind)}</span>`);
                }
            }
            return `
            <div style="margin-top:6px;border-top:1px dashed rgba(128,128,128,.25);padding-top:4px;">
                <div style="display:flex;flex-wrap:wrap;gap:2px 10px;">${dishSpans.join('') || '<span style="opacity:.6;">（无已选菜品）</span>'}</div>
            </div>`;
        }).join('');

        return `
            <div style="margin-top:8px;border-top:1px dashed rgba(128,128,128,.35);padding-top:6px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">
                    <span style="display:inline-flex;align-items:center;gap:4px;">预警天数
                        <input data-sc-warn-days type="number" min="1" value="${settings.warnDays}" style="width:52px;font-size:11px;padding:1px 4px;"></span>
                    <span style="display:inline-flex;align-items:center;gap:4px;">目标天数
                        <input data-sc-target-days type="number" min="1" value="${settings.targetDays}" style="width:52px;font-size:11px;padding:1px 4px;"></span>
                    <span style="opacity:.65;">差量 = ⌈每日消耗 × 目标天数⌉ − 库存；剩余天数低于预警天数 → ⚠️ 高亮</span>
                </div>
                ${restHtml || '<div style="opacity:.65;">当前页面不是餐馆</div>'}
            </div>`;
    }

    function renderIntoBlock(block, restaurant, allRestaurants) {
        const settings = loadSettings();
        const view = state.view;
        const body = view === 'all'
            ? buildAllTable(allRestaurants, settings)
            : view === 'quality'
                ? buildQualityDetailTable(allRestaurants, settings)
                : buildCurrentTable(restaurant, allRestaurants, settings);
        const settingsArea = state.showSettings
            ? buildSettingsHtml(settings, restaurant)
            : '';
        const modeText = view === 'all' ? '全部餐馆' : view === 'quality' ? '品质明细' : '当前餐馆';
        const viewBtnText = view === 'all' ? '显示当前餐馆' : '显示全部餐馆';
        const detailBtnText = view === 'quality' ? '关闭明细' : '品质明细';
        block.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <div style="font-weight:bold;">餐馆备货提醒<span style="font-weight:normal;opacity:.75;margin-left:4px;">（${modeText}）</span></div>
                <div style="display:flex;gap:4px;">
                    <button data-sc-view-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">${viewBtnText}</button>
                    <button data-sc-detail-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">${detailBtnText}</button>
                    <button data-sc-settings-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">当前餐馆设置</button>
                </div>
            </div>
            ${body}
            ${settingsArea}
            <div style="opacity:.55;margin-top:4px;font-size:11px;">* 页面内修改菜单后，本提醒需重新进入餐馆页才会更新</div>`;
    }

    // ---------- 刷新 ----------
    function refreshStocks() {
        const block = state.blockNode;
        if (!block || !block.isConnected) return;

        const region = loadRegionData();
        const resources = region ? region.warehouseResources : null;
        const settings = loadSettings();
        const fullRange = { min: 'auto', max: 'auto' };
        const mapCache = new Map();
        const mapFor = (bucket) => {
            if (!mapCache.has(bucket)) {
                const range = bucket === 'auto'
                    ? fullRange
                    : (() => { const [min, max] = bucket.split('|'); return { min, max }; })();
                mapCache.set(bucket, buildStockMap(resources, range));
            }
            return mapCache.get(bucket);
        };

        const rows = block.querySelectorAll('tr[data-sc-kind]');
        rows.forEach(row => {
            const kind = row.getAttribute('data-sc-kind');
            const bucket = row.getAttribute('data-sc-quality') || 'auto';
            const stock = stockForKind(mapFor(bucket), kind);

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
                const warn = days !== null && days < settings.warnDays;
                const daysText = days === null
                    ? '—'
                    : (warn ? `⚠️ ${days.toFixed(2)}` : days.toFixed(2));
                if (daysCell.textContent !== daysText) daysCell.textContent = daysText;
                row.style.background = warn ? 'rgba(220,38,38,.15)' : '';
            }

            const shortfallCell = row.querySelector('[data-sc-shortfall]');
            if (shortfallCell) {
                const shortfall = (stock !== null && daily > 0)
                    ? Math.max(0, Math.ceil(daily * settings.targetDays) - stock)
                    : null;
                const raw = shortfall === null ? '' : String(shortfall);
                const shortfallText = shortfall === null ? '—' : shortfall.toLocaleString();
                if (shortfallCell.getAttribute('data-sc-shortfall-raw') !== raw) {
                    shortfallCell.setAttribute('data-sc-shortfall-raw', raw);
                }
                if (shortfallCell.textContent !== shortfallText && !shortfallCell.dataset.scCopied) {
                    shortfallCell.textContent = shortfallText;
                }
            }
        });
    }

    // ---------- 复制 ----------
    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        ta.remove();
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    // ---------- 生命周期 ----------
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
        return (state.view === 'all' || state.view === 'quality')
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
                const toggle = e.target.closest('[data-sc-view-toggle]');
                if (toggle) {
                    state.view = state.view === 'all' ? 'current' : 'all';
                    renderIntoBlock(block, state.restaurant, state.allRestaurants);
                    state.lastMenuJson = currentMenuJson(state.restaurant, state.allRestaurants);
                    refreshStocks();
                    return;
                }
                const detailBtn = e.target.closest('[data-sc-detail-toggle]');
                if (detailBtn) {
                    state.view = state.view === 'quality' ? 'current' : 'quality';
                    renderIntoBlock(block, state.restaurant, state.allRestaurants);
                    state.lastMenuJson = currentMenuJson(state.restaurant, state.allRestaurants);
                    refreshStocks();
                    return;
                }
                const settingsBtn = e.target.closest('[data-sc-settings-toggle]');
                if (settingsBtn) {
                    state.showSettings = !state.showSettings;
                    renderIntoBlock(block, state.restaurant, state.allRestaurants);
                    refreshStocks();
                    return;
                }
                const shortfall = e.target.closest('[data-sc-shortfall]');
                if (shortfall) {
                    const raw = shortfall.getAttribute('data-sc-shortfall-raw');
                    if (raw !== null && raw !== '') {
                        copyText(raw);
                        shortfall.dataset.scCopied = '1';
                        shortfall.textContent = `✓ ${Number(raw).toLocaleString()}`;
                        setTimeout(() => { delete shortfall.dataset.scCopied; }, 1200);
                    }
                    return;
                }
            });
            block.addEventListener('change', (e) => {
                const settings = loadSettings();
                const warnInput = e.target.closest('[data-sc-warn-days]');
                if (warnInput) {
                    const v = Number(warnInput.value);
                    settings.warnDays = Number.isFinite(v) && v >= 1 ? v : DEFAULT_WARN_DAYS;
                    saveSettings(settings);
                    refreshStocks();
                    return;
                }
                const targetInput = e.target.closest('[data-sc-target-days]');
                if (targetInput) {
                    const v = Number(targetInput.value);
                    settings.targetDays = Number.isFinite(v) && v >= 1 ? v : DEFAULT_TARGET_DAYS;
                    saveSettings(settings);
                    refreshStocks();
                    return;
                }
                const qualityMin = e.target.closest('[data-sc-quality-min]');
                const qualityMax = e.target.closest('[data-sc-quality-max]');
                if (qualityMin || qualityMax) {
                    const restId = (qualityMin || qualityMax).getAttribute('data-rest');
                    const kind = (qualityMin || qualityMax).getAttribute('data-kind');
                    const range = qualityRangeFor(settings, restId, kind);
                    if (qualityMin) range.min = qualityMin.value;
                    if (qualityMax) range.max = qualityMax.value;
                    // 前后关系约束：从 ≤ 到（auto 视作边界 0/12）
                    const minN = range.min === 'auto' ? 0 : Number(range.min);
                    const maxN = range.max === 'auto' ? 12 : Number(range.max);
                    if (minN > maxN) {
                        if (qualityMin) range.max = range.min;
                        else range.min = range.max;
                    }
                    if (!settings.qualities[restId]) settings.qualities[restId] = {};
                    settings.qualities[restId][kind] = range;
                    saveSettings(settings);
                    renderIntoBlock(block, state.restaurant, state.allRestaurants);
                    state.lastMenuJson = currentMenuJson(state.restaurant, state.allRestaurants);
                    refreshStocks();
                    return;
                }
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
            removeBlock();
            return;
        }

        const buildingId = getBuildingIdFromUrl();
        if (!buildingId) {
            removeBlock();
            return;
        }

        // 换楼时重置回"当前餐馆"视图与设置收起
        if (state.lastBuildingId && state.lastBuildingId !== buildingId) {
            state.view = 'current';
            state.showSettings = false;
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
