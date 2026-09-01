import { createGlobalCustomToggle } from '../utils/uiComponents.js';
import { state } from '../core/state.js';
import { getRealmIdFromLink } from '../core/storage.js';
import { executiveCustomButton } from './executiveBoardroom.js';

const { SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;

    const WarehouseRetailProfit = (function () {
        const workerCode = `
        self.onmessage = function(e) {
        const { items, shared, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
        if (!items || !items.length) { self.postMessage([]); return; }

        const lwe = shared.SCD.retailInfo;
        const zn = shared.SCD.data;
        const SRC = shared.SRC;
        const acceleration = SRC.acceleration;
        const size = 1;

        const Ul = (overhead, skillCOO) => {
            const r = overhead || 1;
            return r - (r - 1) * skillCOO / 100;
        };
        const wv = (e, t, r) => {
            return r === null ? lwe[e][t] : lwe[e][t].quality[r];
        };
        const Upt = (e, t, r, n) => t + (e + n) / r;
        const Hpt = (e, t, r, n, a) => {
            const o = (n + e) / ((t - a) * (t - a));
            return e - (r - t) * (r - t) * o;
        };
        const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
        const Bpt = (e, t, r, n, a, o) => {
            const g = RETAIL_ADJUSTMENT[e] ?? 1;
            const s = Math.min(Math.max(2 - n, 0), 2),
                  l = Math.max(0.9, s / 2 + 0.5),
                  c = r / 12;
            const d = PROFIT_PER_BUILDING_LEVEL *
                (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                g *
                (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                (t.modeledStoreWages ?? 0) * SCXXCS;
            const h = t.modeledUnitsSoldAnHour * l;
            const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
            const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
            return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
        };
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, sz, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / sz;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
        };

        const results = [];

        for (const item of items) {
            const { idx, unitCost, quality, quantity, resourceId, itemSaturation, itemForceQuality } = item;

            const economyState = shared.economyState;
            const buildingKind = shared.buildingKind;
            const wagesVal = shared.wages;
            const v = shared.v;
            const b = shared.b;
            const weather = shared.weather;

            // 成本价（兼容 unitCost 可能为 0 的情况）
            const startPrice = Math.max(Math.ceil(unitCost) || 1, 1);
            let currentPrice = startPrice;
            let maxProfit = -Infinity;
            let bestPrice = currentPrice;

            while (currentPrice > 0) {
                const modeledData = wv(economyState, resourceId, itemForceQuality ?? null);
                const w = zL(
                    buildingKind,
                    modeledData,
                    quantity,
                    v,
                    currentPrice,
                    itemForceQuality === void 0 ? quality : 0,
                    itemSaturation,
                    acceleration,
                    size,
                    weather
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wagesVal * acceleration * b / 3600);
                const secondsToFinish = w;

                if (!secondsToFinish || secondsToFinish <= 0) break;

                const profit = (revenue - unitCost * quantity - wagesTotal) / secondsToFinish;
                if (profit > maxProfit) {
                    maxProfit = profit;
                    bestPrice = currentPrice;
                }

                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }

            results.push({
                idx,
                maxProfit: maxProfit > -Infinity ? maxProfit * 3600 : null,
                bestPrice: maxProfit > -Infinity ? bestPrice : null
            });
        }

        self.postMessage(results);
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
        const pendingItems = new Map(); // idx -> DOM element

        profitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { idx, maxProfit, bestPrice } = item;
                const el = pendingItems.get(idx);
                if (!el) continue;
                pendingItems.delete(idx);

                if (maxProfit !== null && isFinite(maxProfit)) {
                    const profitColor = maxProfit >= 0 ? '#4CAF50' : '#f44336';
                    const prefix = maxProfit >= 0 ? '' : '⚠️';
                    el.textContent = `${prefix}时利润:${maxProfit.toFixed(2)}`;
                    el.style.color = profitColor;
                } else {
                    el.textContent = '无法计算';
                    el.style.color = '#888';
                }
                el.style.fontWeight = 'bold';
            }
        };

        // 查找页面上的百科资源链接（排除游戏菜单/抽屉内的链接：
        // 菜单里可能有"最近查看"等资源入口，DOM 顺序靠前会误匹配，导致按钮被插进菜单）
        function findResourceLink() {
            const links = document.querySelectorAll('a[href*="/encyclopedia/"][href*="/resource/"]');
            for (const link of links) {
                if (link.closest('nav, aside, [class*="menu"], [class*="drawer"], [class*="sidebar"]')) continue;
                return link;
            }
            return links[0] || null; // 兜底：全部在菜单里时退回第一个
        }

        // 从百科全书链接解析资源ID（同模块18）
        function parseResourceId() {
            const link = findResourceLink();
            if (!link) return null;
            const match = link.href.match(/\/resource\/(\d+)\//);
            return match ? parseInt(match[1], 10) : null;
        }

        // 在给定容器内解析品质（星标 SVG）
        function parseQualityFromContainer(container) {
            const starSelectors = [
                'svg[data-icon="star"]',
                'svg.fa-star',
                '.fa-star',
                '[class*="fa-star"]',
            ];
            for (const sel of starSelectors) {
                try {
                    const stars = container.querySelectorAll(sel);
                    if (stars.length === 0) continue;
                    const groups = new Map();
                    stars.forEach(svg => {
                        const p = svg.parentElement;
                        if (!groups.has(p)) groups.set(p, []);
                        groups.get(p).push(svg);
                    });
                    let maxQ = 0;
                    for (const [parent, svgs] of groups) {
                        const txt = parent.textContent?.trim() || '';
                        const numMatch = txt.match(/^(\d+)/);
                        if (numMatch) {
                            const q = parseInt(numMatch[1], 10);
                            if (q > maxQ) maxQ = q;
                        } else if (svgs.length > maxQ) {
                            maxQ = svgs.length;
                        }
                    }
                    if (maxQ > 0) return maxQ;
                } catch (e) { /* 选择器无效则跳过 */ }
            }
            return 0;
        }

        // 基于结构查找物品堆叠容器（不依赖特定CSS类名，兼容锁定/未锁定两种状态）
        function findItemStacks() {
            const costRows = document.querySelectorAll('.css-16qjhms');
            const stacks = new Set();
            costRows.forEach(row => {
                // 向上遍历找到包含数量和成本信息的顶层容器
                let el = row.parentElement;
                while (el && el !== document.body) {
                    // 检查是否同时包含数量 <b> 和成本行 .css-16qjhms
                    const hasQuantity = el.querySelector('span.css-nzibbl > b');
                    if (hasQuantity) {
                        stacks.add(el);
                        break;
                    }
                    el = el.parentElement;
                }
            });
            return [...stacks];
        }

        // 在堆叠容器中找到数量/品质所在行的 div（跳过锁定图标）
        function findQuantityRow(stack) {
            const bEl = stack.querySelector('span.css-nzibbl > b');
            if (!bEl) return null;
            // 从 <b> 向上遍历，找到 stack 的直接子 div
            let el = bEl.parentElement; // span.css-nzibbl
            while (el && el.parentElement !== stack) {
                el = el.parentElement;
            }
            return el; // stack 的直接子 div（包含 <b> 和星星）
        }

        // 判断是否为仓库物品页面（非 sell/contract 子页面）
        function isWarehouseItemPage() {
            const url = location.href;
            return /\/headquarters\/warehouse\/(?!.*\/(?:sell|contract)\/?$)[^\/]+\/?$/.test(url);
        }

        // 注入自定义高管数据开关按钮（放到资源ID链接的父元素前面）
        function injectCustomToggle() {
            // 全局查重，防止多次注入
            if (document.querySelector('[data-warehouse-custom-toggle]')) return;

            const link = findResourceLink();
            if (!link) return;
            const parent = link.parentElement;
            if (!parent) return;

            const toggleContainer = document.createElement('span');
            toggleContainer.dataset.warehouseCustomToggle = 'true';
            toggleContainer.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:8px;';

            const toggle = createGlobalCustomToggle(
                'executiveCustomToggle',
                '自定义',
                { buttonClass: 'btn btn-primary' },
                () => {
                    // 刷新仓库时利润计算
                    document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                    pendingItems.clear();
                    calculateAndDisplay();
                }
            );
            toggle.wrapper.style.marginLeft = '0';
            toggleContainer.appendChild(toggle.wrapper);

            // 自定义高管数据按钮
            const customBtn = document.createElement('button');
            customBtn.type = 'button';
            customBtn.textContent = '自定义高管数据';
            customBtn.style.cssText = 'padding:4px 10px;background:#2196f3;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;white-space:nowrap;';
            customBtn.onclick = (e) => {
                e.preventDefault();
                if (typeof executiveCustomButton !== 'undefined') executiveCustomButton.show();
            };
            toggleContainer.appendChild(customBtn);

            // 经济周期覆盖控件
            const economySpan = document.createElement('span');
            economySpan.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:4px;';
            const economyLabel = document.createElement('span');
            economyLabel.textContent = '周期:';
            economyLabel.style.cssText = 'font-size:12px;color:#666;';
            const economySelect = document.createElement('select');
            economySelect.id = 'sc-warehouse-economy-select';
            economySelect.style.cssText = 'font-size:12px;color:#333;background:#fff;border:1px solid #bbb;border-radius:4px;padding:3px 4px;';
            economySelect.innerHTML = `
                <option value="">当前</option>
                <option value="0">萧条</option>
                <option value="1">平缓</option>
                <option value="2">景气</option>
            `;
            economySelect.addEventListener('change', () => {
                document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                pendingItems.clear();
                calculateAndDisplay();
            });
            economySpan.appendChild(economyLabel);
            economySpan.appendChild(economySelect);
            toggleContainer.appendChild(economySpan);

            // 插入到父元素前面
            parent.parentNode.insertBefore(toggleContainer, parent);
        }

        function calculateAndDisplay() {
            if (!isWarehouseItemPage()) return;

            const resourceId = parseResourceId();
            if (!resourceId) return;

            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return;

            // 预检查：是否为零售物品
            const SCD_raw = localStorage.getItem('SimcompaniesConstantsData');
            if (!SCD_raw) return;
            const SCD = JSON.parse(SCD_raw);
            const isRetail = Object.values(SCD.data.SALES || {}).some(arr => arr.includes(resourceId));
            if (!isRetail) return;

            const SRC_raw = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
            if (!SRC_raw) return;
            const SRC = JSON.parse(SRC_raw);
            const warehouseResources = SRC.warehouseResources;
            if (!warehouseResources || !Array.isArray(warehouseResources)) return;

            // 查找页面上所有物品堆叠（基于结构，兼容不同CSS类名和锁定状态）
            const stacks = findItemStacks();
            if (stacks.length === 0) return;

            // 注入自定义高管数据开关（放到资源ID链接的父元素前面）
            injectCustomToggle();

            const zn = SCD.data;

            // 构建共享上下文
            const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;

            let skillCMO, skillCOO;
            if (isCustomEnabled) {
                const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
                try {
                    const SSB = JSON.parse(localStorage.getItem(bonusKey));
                    if (SSB) { skillCMO = SSB.saleBonus; skillCOO = SSB.adminBonus; }
                    else { skillCMO = SRC.saleBonus; skillCOO = SRC.adminBonus; }
                } catch (e) { skillCMO = SRC.saleBonus; skillCOO = SRC.adminBonus; }
            } else {
                skillCMO = SRC.saleBonus;
                skillCOO = SRC.adminBonus;
            }

            const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
            const buildingKind = Object.entries(zn.SALES).find(([, ids]) => ids.includes(resourceId))?.[0];
            const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
            const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);

            const economySelectEl = document.getElementById('sc-warehouse-economy-select');
            const economyState = (economySelectEl && economySelectEl.value !== '')
                ? parseInt(economySelectEl.value) : SRC.economyState;

            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = (() => {
                const r = SRC.administration || 1;
                return r - (r - 1) * skillCOO / 100;
            })();

            const resourceDetail = SCD.constantsResources?.[resourceId];
            const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                ? SRC.sellingSpeedMultiplier : undefined;

            const shared = {
                SCD, SRC,
                economyState, buildingKind, wages,
                v, b, weather
            };

            const list = SRC.ResourcesRetailInfo || [];
            const orders = [];
            let idx = 0;

            stacks.forEach(stack => {
                // 防止重复注入
                if (stack.querySelector('.sc-warehouse-profit')) return;

                // 解析数量：<b> 标签内的数字
                const bEl = stack.querySelector('b');
                const rawQty = bEl ? bEl.textContent?.replace(/,/g, '') : '0';
                const quantity = parseFloat(rawQty) || 0;
                if (quantity <= 0) return;

                // 解析品质
                const quality = parseQualityFromContainer(stack);

                // 在 warehouseResources 中匹配 (kind=resourceId, quality=quality)
                const warehouseEntry = warehouseResources.find(e => e.kind === resourceId && e.quality === quality);
                if (!warehouseEntry) return;

                const costSum = Object.values(warehouseEntry.cost || {}).reduce((s, val) => s + (typeof val === 'number' ? val : 0), 0);
                const unitCost = warehouseEntry.amount > 0 ? costSum / warehouseEntry.amount : 0;

                // 每个物品的饱和度（资源150按品质区分）
                let itemSaturation;
                if (resourceId === 150) {
                    const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                    itemSaturation = m150?.saturation;
                } else {
                    const m = list.find(item => item.dbLetter === resourceId);
                    itemSaturation = m?.saturation;
                }

                const itemForceQuality = (resourceId === 150) ? quality : undefined;

                // 创建展示元素
                const profitEl = document.createElement('span');
                profitEl.className = 'sc-warehouse-profit';
                profitEl.textContent = '计算中...';
                profitEl.style.cssText = 'margin-left:8px;font-size:13px;color:#888;';

                // 插入到数量/品质所在行（跳过可能的锁定图标div）
                const quantityRow = findQuantityRow(stack);
                if (quantityRow) {
                    quantityRow.appendChild(profitEl);
                }

                pendingItems.set(idx, profitEl);
                orders.push({
                    idx,
                    unitCost,
                    quality,
                    quantity,
                    resourceId: String(resourceId),
                    itemSaturation,
                    itemForceQuality
                });
                idx++;
            });

            if (orders.length > 0) {
                profitWorker.postMessage({
                    items: orders,
                    shared,
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            }
        }

        // 页面监听 & DOM 就绪检测
        let initRetries = 0;
        let domObserver = null;

        function tryInit() {
            if (!isWarehouseItemPage()) return;
            const stacks = findItemStacks();
            if (stacks.length > 0) {
                calculateAndDisplay();
                initRetries = 0;
                return;
            }
            if (initRetries < 30) {
                initRetries++;
                setTimeout(tryInit, 400);
            }
        }

        function init() {
            if (typeof window.isPageModuleEnabled === 'function' && !window.isPageModuleEnabled('warehouseProfit')) {
                // 如果关闭，清理可能残留的元素
                document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                document.querySelectorAll('[data-warehouse-custom-toggle]').forEach(e => e.remove());
                if (domObserver) { domObserver.disconnect(); domObserver = null; }
                pendingItems.clear();
                return;
            }
            initRetries = 0;
            // 清理旧展示（SPA 切换物品时）：利润显示 + 注入按钮一并清除
            document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
            document.querySelectorAll('[data-warehouse-custom-toggle]').forEach(e => e.remove());
            pendingItems.clear();

            if (domObserver) domObserver.disconnect();
            tryInit();

            // 监听 DOM 变化，捕获 React 异步渲染
            domObserver = new MutationObserver(() => {
                if (isWarehouseItemPage()) {
                    const allStacks = findItemStacks();
                    const hasNew = allStacks.length > 0;
                    const hasPending = allStacks.some(s => !s.querySelector('.sc-warehouse-profit'));
                    if (hasNew && hasPending) calculateAndDisplay();
                }
            });
            domObserver.observe(document.body, { childList: true, subtree: true });
        }

        // 全局 URL 变化监听（SPA 导航）
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                if (isWarehouseItemPage()) {
                    setTimeout(init, 400);
                } else {
                    // 离开仓库物品页面时清理注入的按钮和观察器
                    if (domObserver) { domObserver.disconnect(); domObserver = null; }
                    document.querySelectorAll('[data-warehouse-custom-toggle]').forEach(e => e.remove());
                    document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                    pendingItems.clear();
                }
            }
        }).observe(document, { subtree: true, childList: true });

        // 首次加载
        setTimeout(init, 600);

        return { init };
    })();