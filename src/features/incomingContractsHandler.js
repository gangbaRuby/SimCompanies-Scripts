import { createGlobalCustomToggle } from '../utils/uiComponents.js';
import { DM, showToast, theme } from '../utils/ui.js';
import { getRealmIdFromLink } from '../core/storage.js';
import { state } from '../core/state.js';
import { Storage } from './dataStorage.js';
import { RegionData } from './regionData.js';
import { Network } from '../core/network.js';
import { constantsData } from './constantsData.js';
import { executiveCustomButton } from './executiveBoardroom.js';
import { resourceIdNameMap } from '../constants/resourceMap.js';

const { SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;

    const incomingContractsHandler = (function () {
        let cardIdCounter = 0;
        const pendingCards = new Map(); // cardId -> DOM element
        let processDebounceTimer = null; // 防抖计时器
        let activeObserver = null;       // 当前活跃的 MutationObserver
        let checkPageTimer = null;       // 页面轮询计时器（SAP 离开检测）

        // Worker 代码 —— 批量处理版本：一次接收所有卡片，共享数据只传一次
        const workerCode = `
        self.onmessage = function(e) {
            const { orders, shared, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
            if (!orders || !orders.length) { self.postMessage([]); return; }

            const lwe = shared.SCD.retailInfo;
            const zn = shared.SCD.data;
            const SRC = shared.SRC;

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
            const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                if (u <= 0) return NaN;
                const d = u / acc / size;
                let p = d - d * salesModifier / 100;
                return weather && (p /= weather.sellingSpeedMultiplier), p
            };

            const results = [];
            const size = 1;

            for (const order of orders) {
                const { cardId, price, quantity, quality, resourceId, ctx } = order;

                let currentPrice = price,
                    maxProfit = -Infinity;

                while (currentPrice > 0) {
                    const modeledData = wv(ctx.economyState, resourceId, ctx.forceQuality ?? null);
                    const w = zL(
                        ctx.buildingKind,
                        modeledData,
                        quantity,
                        ctx.v,
                        currentPrice,
                        ctx.forceQuality === void 0 ? quality : 0,
                        ctx.saturation,
                        SRC.acceleration,
                        size,
                        ctx.weather
                    );
                    const revenue = currentPrice * quantity;
                    const wagesTotal = Math.ceil(w * ctx.wages * SRC.acceleration * ctx.b / 3600);
                    const secondsToFinish = w;
                    const profit = (!secondsToFinish || secondsToFinish <= 0)
                        ? NaN
                        : (revenue - price * quantity - wagesTotal) / secondsToFinish;

                    if (!secondsToFinish || secondsToFinish <= 0) break;
                    if (profit > maxProfit) {
                        maxProfit = profit;
                    }

                    if (currentPrice < 8) {
                        currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                    } else if (currentPrice < 2001) {
                        currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                    } else {
                        currentPrice = Math.round(currentPrice + 1);
                    }
                }

                results.push({ cardId, maxProfit });
            }

            self.postMessage(results);
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        // Worker 批量结果回调：立即注入时利润（不等待 MP 数据）
        profitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { cardId, maxProfit } = item;
                const card = pendingCards.get(cardId);
                if (!card) continue;
                pendingCards.delete(cardId);
                // 立即显示时利润，MP 部分后续由 MP 数据回调填充
                injectOrUpdateProfit(card, maxProfit * 3600);
            }
        };

        // =====================
        // 市场最大时利专用 Worker
        // =====================
        const marketWorkerCode = `
        self.onmessage = function(e) {
            const { orders, shared, customBonuses, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
            if (!orders || !orders.length) { self.postMessage([]); return; }

            const lwe = shared.SCD.retailInfo;
            const zn = shared.SCD.data;
            const SRC = shared.SRC;

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
            const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                if (u <= 0) return NaN;
                const d = u / acc / size;
                let p = d - d * salesModifier / 100;
                return weather && (p /= weather.sellingSpeedMultiplier), p
            };

            function buildCtx(resourceId, quality, isCustomEnabled, adminBonus, saleBonus) {
                const resource = parseInt(resourceId);
                let skillCMO, skillCOO;
                if (isCustomEnabled && adminBonus != null && saleBonus != null) {
                    skillCMO = saleBonus;
                    skillCOO = adminBonus;
                } else {
                    skillCMO = SRC.saleBonus;
                    skillCOO = SRC.adminBonus;
                }
                const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
                const buildingKind = Object.entries(zn.SALES).find(([, ids]) =>
                    ids.includes(resource)
                )?.[0];
                const salaryModifier = shared.SCD.buildingsSalaryModifier?.[buildingKind];
                const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);
                let saturation;
                if (resource === 150) {
                    const list = SRC.ResourcesRetailInfo || [];
                    const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                    saturation = m150?.saturation;
                } else {
                    const list = SRC.ResourcesRetailInfo || [];
                    const m = list.find(item => item.dbLetter === resource);
                    saturation = m?.saturation;
                }
                const resourceDetail = shared.SCD.constantsResources?.[resource];
                const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                    ? SRC.sellingSpeedMultiplier : undefined;
                const forceQuality = (resource === 150) ? quality : undefined;
                const v = salesModifierWithRecreationBonus + skillCMO;
                const b = Ul(SRC.administration, skillCOO);
                return {
                    economyState: SRC.economyState, buildingKind, wages,
                    saturation, weather, forceQuality, v, b
                };
            }

            // 对单个价格跑完整售价寻优，返回每小时利润（null 表示无法计算）
            function calcSingle(price, quantity, quality, resourceId, ctx) {
                const resource = parseInt(resourceId);
                const forceQ = (resource === 150) ? quality : undefined;
                const size = 1;
                let currentPrice = price;
                let maxProfit = -Infinity;
                while (currentPrice > 0) {
                    const modeledData = wv(ctx.economyState, resourceId, forceQ ?? null);
                    const w = zL(
                        ctx.buildingKind, modeledData, quantity, ctx.v,
                        currentPrice,
                        forceQ === void 0 ? quality : 0,
                        ctx.saturation, SRC.acceleration, size, ctx.weather
                    );
                    const revenue = currentPrice * quantity;
                    const wagesTotal = Math.ceil(w * ctx.wages * SRC.acceleration * ctx.b / 3600);
                    const secondsToFinish = w;
                    const profit = (!secondsToFinish || secondsToFinish <= 0)
                        ? NaN
                        : (revenue - price * quantity - wagesTotal) / secondsToFinish;
                    if (!secondsToFinish || secondsToFinish <= 0) break;
                    if (profit > maxProfit) {
                        maxProfit = profit;
                    }
                    if (currentPrice < 8) {
                        currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                    } else if (currentPrice < 2001) {
                        currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                    } else {
                        currentPrice = Math.round(currentPrice + 1);
                    }
                }
                return maxProfit > -Infinity ? maxProfit * 3600 : null;
            }

            const results = [];
            for (const order of orders) {
                const { cardId, marketData, targetQuality, quantity, resourceId } = order;
                if (!marketData || !marketData.length) {
                    results.push({ cardId, maxProfit: null, bestPrice: null, bestQuality: null });
                    continue;
                }

                const cb = customBonuses || {};
                const ctx = buildCtx(resourceId, targetQuality,
                    cb.isCustomEnabled === true, cb.adminBonus, cb.saleBonus);

                const resource = parseInt(resourceId);
                const exactOnly = (resource === 150);

                // 按品质分组，每组 {price, qty} 升序（用市场挂单自身数量计算）
                const qualityGroups = new Map();
                for (const entry of marketData) {
                    const p = parseFloat(entry.price);
                    const q = entry.quality;
                    const qty = parseFloat(entry.quantity) || 1;
                    if (p <= 0) continue;
                    if (exactOnly && q !== targetQuality) continue;
                    if (!qualityGroups.has(q)) qualityGroups.set(q, []);
                    qualityGroups.get(q).push({ price: p, qty });
                }
                for (const entries of qualityGroups.values()) {
                    entries.sort((a, b) => a.price - b.price);
                }

                let bestProfit = -Infinity;
                let bestPrice = null;
                let bestQuality = null;

                for (const [quality, entries] of qualityGroups) {
                    // 最低价先算 — 负利润则跳过整个品质
                    const cheapestProfit = calcSingle(entries[0].price, entries[0].qty, quality, resourceId, ctx);
                    if (cheapestProfit === null || cheapestProfit < 0) continue;
                    if (cheapestProfit > bestProfit) {
                        bestProfit = cheapestProfit;
                        bestPrice = entries[0].price;
                        bestQuality = quality;
                    }
                    // 其余价格逐个严格计算
                    for (let i = 1; i < entries.length; i++) {
                        const { price: p, qty } = entries[i];
                        const entryProfit = calcSingle(p, qty, quality, resourceId, ctx);
                        if (entryProfit === null || entryProfit < 0) break;
                        if (entryProfit > bestProfit) {
                            bestProfit = entryProfit;
                            bestPrice = p;
                            bestQuality = quality;
                        }
                    }
                }

                results.push({
                    cardId,
                    maxProfit: bestProfit > -Infinity ? bestProfit : null,
                    bestPrice: bestPrice,
                    bestQuality: bestQuality
                });
            }

            self.postMessage(results);
        };
        `;
        const marketProfitWorker = new Worker(URL.createObjectURL(new Blob([marketWorkerCode], { type: 'application/javascript' })));
        let marketCardIdCounter = 1000000; // 独立计数器，避免与合同 cardId 冲突
        const pendingMarketCards = new Map(); // cardId -> { card, mpPercent, mpValue, mpNotes }

        marketProfitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { cardId, maxProfit, bestPrice, bestQuality } = item;
                const entry = pendingMarketCards.get(cardId);
                if (!entry) continue;
                pendingMarketCards.delete(cardId);

                const { card, mpPercent, mpValue, mpNotes } = entry;
                card.__marketMaxProfit = maxProfit;
                card.__marketMaxPrice = bestPrice;
                card.__marketMaxQuality = bestQuality;
                // 刷新卡片显示
                updateCardMpDisplay(card, mpPercent, mpValue, mpNotes);
            }
        };

        // --- 预计算每个合同的共享上下文（从 Worker 移到主线程） ---
        function buildOrderContext(resourceId, quality, SCD, SRC, isCustomEnabled, SSB) {
            const resource = parseInt(resourceId);
            const zn = SCD.data;

            // 经济周期
            const economyState = SRC.economyState;

            // 高管加成（支持自定义覆盖）
            let skillCMO, skillCOO;
            if (isCustomEnabled && SSB) {
                skillCMO = SSB.saleBonus;
                skillCOO = SSB.adminBonus;
            } else {
                skillCMO = SRC.saleBonus;
                skillCOO = SRC.adminBonus;
            }

            const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;

            // 建筑类型 & 工资
            const buildingKind = Object.entries(zn.SALES).find(([, ids]) =>
                ids.includes(resource)
            )?.[0];
            const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
            const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);

            // 饱和度（仅资源150=树按品质区分）
            const list = SRC.ResourcesRetailInfo || [];
            let saturation;
            if (resource === 150) {
                const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                saturation = m150?.saturation;
            } else {
                const m = list.find(item => item.dbLetter === resource);
                saturation = m?.saturation;
            }

            // 天气（仅夏季物品）
            const resourceDetail = SCD.constantsResources?.[resource];
            const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                ? SRC.sellingSpeedMultiplier : undefined;

            // forceQuality（仅资源150需要）
            const forceQuality = (resource === 150) ? quality : undefined;

            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = (() => {
                const r = SRC.administration || 1;
                return r - (r - 1) * skillCOO / 100;
            })();

            return {
                economyState, buildingKind, wages,
                saturation, weather, forceQuality,
                v, b
            };
        }

        // --- 计算单张卡片的 MP 信息（游戏机制：高Q可替代低Q，但低Q不可替代高Q） ---
        function calcMpInfo(cardData, marketData, status) {
            const resourceId = parseInt(cardData.dbLetter);
            const targetQuality = (cardData.quality !== null && cardData.quality !== undefined) ? cardData.quality : 0;

            if (status === 'error') {
                return { mpPercent: null, mpValue: null, mpNotes: 'MP请求失败', mpBestQuality: null };
            }

            const expiredNote = (status === 'fallback_expired') ? ' (缓存已过期)' : '';

            if (!marketData || !Array.isArray(marketData) || marketData.length === 0) {
                return { mpPercent: null, mpValue: null, mpNotes: '市场无对应品质' + expiredNote, mpBestQuality: null };
            }

            // ID=150（树）只能精确匹配品质
            const exactOnly = (resourceId === 150);

            let bestPrice = Infinity;
            let bestQuality = null;

            if (exactOnly) {
                // 仅匹配同品质
                const sameQ = marketData.filter(o => o.quality === targetQuality && o.price > 0);
                if (sameQ.length > 0) {
                    bestPrice = Math.min(...sameQ.map(o => parseFloat(o.price)));
                    bestQuality = targetQuality;
                }
            } else {
                // 遍历 ≥ 合同品质的所有订单（高Q可替代低Q使用）
                for (const order of marketData) {
                    const p = parseFloat(order.price);
                    if (p > 0 && order.quality >= targetQuality && p < bestPrice) {
                        bestPrice = p;
                        bestQuality = order.quality;
                    }
                }
            }

            if (bestPrice !== Infinity && bestPrice > 0 && cardData.unitPrice > 0) {
                const mpPercent = ((bestPrice - cardData.unitPrice) / bestPrice) * 100;
                let mpNotes = (bestQuality !== targetQuality) ? `参考Q${bestQuality}价` : null;
                if (expiredNote) {
                    mpNotes = mpNotes ? `${mpNotes}${expiredNote}` : '缓存数据';
                }
                return { mpPercent, mpValue: bestPrice, mpNotes, mpBestQuality: bestQuality };
            }

            return { mpPercent: null, mpValue: null, mpNotes: '市场无对应品质' + expiredNote, mpBestQuality: null };
        }

        // --- 批量处理所有卡片（时利润与 MP 分离：时利润立即发送 Worker，MP 后台拉取） ---
        async function processAllCards(cards, forceReset = false) {
            if (!cards || cards.length === 0) return;

            const realmId = getRealmIdFromLink();
            const constantsKey = 'SimcompaniesConstantsData';
            const regionKey = `SimcompaniesRetailCalculation_${realmId}`;

            // 1. 检查数据是否就绪，否则触发初始化后重试
            if (!localStorage.getItem(constantsKey) || !localStorage.getItem(regionKey)) {
                try {
                    const constData = await constantsData.initialize();
                    Storage.save('constants', constData);
                    const regionData = await RegionData.fetchFullRegionData();
                    Storage.save('region', regionData);
                } catch (err) {
                    console.error('[合同批量] 数据初始化失败:', err);
                    return;
                }
            }

            const SCD = JSON.parse(localStorage.getItem(constantsKey));
            const SRC = JSON.parse(localStorage.getItem(regionKey));
            if (!SCD || !SRC) return;

            // 2. 读取自定义开关
            const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;
            let SSB = null;
            if (isCustomEnabled) {
                const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
                try { SSB = JSON.parse(localStorage.getItem(bonusKey)); } catch (e) { SSB = null; }
            }

            const EXCLUDED_IDS = [91, 94, 95, 96, 97, 99];

            // 3. 解析所有卡片，收集有效数据
            const cardInfos = [];
            const uniqueResourceIds = new Set();

            for (const card of cards) {
                const data = parseContractCard(card);
                if (!data || !data.dbLetter) continue;

                const currentSignature = `${data.dbLetter}_${data.quantity}_${data.quality}_${data.unitPrice}`;

                if (!forceReset && card.hasAttribute('data-found') && !card.hasAttribute('data-retry')) {
                    if (card.__contractSignature === currentSignature) {
                        // 检查 UI 是否丢失 (React 可能会重绘卡片内部并抹除我们注入的 DOM)
                        const hasProfitUI = card.__profitDisplayEl && document.body.contains(card.__profitDisplayEl);
                        const acceptBtn = card.querySelector('a[aria-label="接受合同"], a.css-14hcbmv');
                        const lostInterceptor = card.__wasHighPrice && acceptBtn && !acceptBtn.__hasHighPriceInterceptor;

                        if (hasProfitUI && !lostInterceptor) {
                            continue;
                        }
                    } else {
                        // DOM 被 React 复用（数据已变），需要清理旧 UI 残留
                        const oldEl = card.__profitDisplayEl;
                        if (oldEl && oldEl.parentNode) oldEl.remove();
                        card.style.border = "";
                        card.style.borderRadius = "";
                        const acceptBtn = card.querySelector('a[aria-label="接受合同"], a.css-14hcbmv');
                        if (acceptBtn) delete acceptBtn.__hasHighPriceInterceptor;
                    }
                    
                    // UI 丢失或 DOM 被复用，允许重新注入
                    card.removeAttribute('data-found');
                    delete card.__profitDisplayEl;
                    delete card.__wasHighPrice;
                    delete card.__mpValue;
                }

                card.__contractSignature = currentSignature;

                const resourceId = parseInt(data.dbLetter);

                card.setAttribute('data-found', 'true');
                card.removeAttribute('data-retry');

                if (EXCLUDED_IDS.includes(resourceId)) {
                    // 如果在排除列表中，直接在此判定是否为高价合同（因为它们只支持单独设置绝对值，且无MP，无需后续处理）
                    checkAndApplyDoubleConfirm(card);
                    continue;
                }

                const isRetail = Object.values(SCD.data.SALES).some(arr => arr.includes(resourceId));

                // 标记 MP 待处理（时利润先展示）
                if (isRetail) card.__mpPending = true;

                cardInfos.push({ card, data, isRetail });
                uniqueResourceIds.add(data.dbLetter);
            }

            if (cardInfos.length === 0) return;

            // === 流程 A：时利润 — 立即发送给 Worker（不等待 MP 数据！） ===
            const retailOrders = [];
            for (const { card, data, isRetail } of cardInfos) {
                if (isRetail) {
                    const ctx = buildOrderContext(data.dbLetter, data.quality, SCD, SRC, isCustomEnabled, SSB);
                    const cardId = cardIdCounter++;
                    pendingCards.set(cardId, card);
                    retailOrders.push({
                        cardId,
                        price: data.unitPrice,
                        quantity: data.quantity,
                        quality: data.quality,
                        resourceId: data.dbLetter,
                        ctx
                    });
                }
            }
            if (retailOrders.length > 0) {
                profitWorker.postMessage({
                    orders: retailOrders,
                    shared: { SCD, SRC },
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            }

            // 为非零售物品提前注入 MP 占位符（与时利润计算并行展示）
            for (const { card, isRetail } of cardInfos) {
                if (!isRetail) {
                    card.__mpPending = true;
                    injectMpPlaceholder(card);
                }
            }

            // === 流程 B：MP 数据 — 后台拉取，完成后更新显示 ===
            fetchMpDataAndUpdate(cardInfos, realmId, SCD, SRC);
        }

        // --- 后台拉取 MP 数据并更新卡片显示（与利润计算并行） ---
        async function fetchMpDataAndUpdate(cardInfos, realmId, SCD, SRC) {
            // 1. 收集唯一资源ID
            const uniqueIds = new Set();
            for (const { data } of cardInfos) {
                if (data.dbLetter) uniqueIds.add(data.dbLetter);
            }
            if (uniqueIds.size === 0) return;

            // 2. 并行获取所有市场数据
            const marketDataMap = {};
            const marketPromises = [...uniqueIds].map(async (rid) => {
                marketDataMap[rid] = await getMarketDataForResource(realmId, rid);
            });
            await Promise.all(marketPromises);

            // 3. 计算并更新每张卡片的 MP 信息
            const marketMaxProfitEnabled = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();

            // 收集需要发送给市场最大时利 Worker 的订单
            pendingMarketCards.clear(); // 清理上一次计算的残留
            const marketOrders = [];
            let customBonuses = null;
            if (marketMaxProfitEnabled) {
                const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;
                if (isCustomEnabled) {
                    const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
                    try {
                        const SSB = JSON.parse(localStorage.getItem(bonusKey));
                        if (SSB) {
                            customBonuses = { isCustomEnabled: true, adminBonus: SSB.adminBonus, saleBonus: SSB.saleBonus };
                        }
                    } catch (e) { }
                }
                if (!customBonuses) {
                    customBonuses = { isCustomEnabled: false, adminBonus: null, saleBonus: null };
                }
            }

            for (const { card, data, isRetail } of cardInfos) {
                const marketResult = marketDataMap[data.dbLetter] || { data: null, status: 'error' };
                const mpInfo = calcMpInfo(data, marketResult.data, marketResult.status);
                card.__resourceId = data.dbLetter;  // 供跳转链接使用
                card.__mpPercent = mpInfo.mpPercent;
                card.__mpValue = mpInfo.mpValue;
                card.__mpBestQuality = mpInfo.mpBestQuality;
                if (mpInfo.mpNotes) card.__mpNotes = mpInfo.mpNotes;
                card.__mpPending = false;

                // 如果开启了"显示市场最大时利"，收集订单稍后发送给 Worker
                if (marketMaxProfitEnabled && isRetail && marketResult.data && marketResult.data.length > 0) {
                    const cid = marketCardIdCounter++;
                    pendingMarketCards.set(cid, {
                        card,
                        mpPercent: mpInfo.mpPercent,
                        mpValue: mpInfo.mpValue,
                        mpNotes: mpInfo.mpNotes
                    });
                    marketOrders.push({
                        cardId: cid,
                        marketData: marketResult.data,
                        targetQuality: (data.quality !== null && data.quality !== undefined) ? data.quality : 0,
                        quantity: data.quantity,
                        resourceId: data.dbLetter
                    });
                    // 暂时置空，等 Worker 回调填充
                    card.__marketMaxProfit = null;
                } else {
                    card.__marketMaxProfit = null;
                }

                // 更新卡片上的 MP 显示区域（市场最大时利暂未算出，先显示 MP-%）
                updateCardMpDisplay(card, mpInfo.mpPercent, mpInfo.mpValue, mpInfo.mpNotes);
            }

            // 发送市场最大时利订单给 Worker（异步计算）
            if (marketOrders.length > 0) {
                marketProfitWorker.postMessage({
                    orders: marketOrders,
                    shared: { SCD, SRC },
                    customBonuses: customBonuses,
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            }
        }

        function init() {
            // 先清理上一次遗留的 observer / timer
            cleanupAll();

            const isOnIncomingPage = () => /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);

            checkPageTimer = setInterval(() => {
                if (!isOnIncomingPage()) {
                    clearInterval(checkPageTimer);
                    checkPageTimer = null;
                    removeWarningNotice();
                    cleanupAll();
                    return;
                }

                const contractCards = document.querySelectorAll('div[tabindex="0"]');
                if (contractCards.length > 0) {
                    clearInterval(checkPageTimer);
                    checkPageTimer = null;
                    insertWarningNotice();
                    processAllCards([...contractCards]);
                    startMutationObserver();
                }
            }, 500);
        }

        function cleanupAll() {
            if (activeObserver) {
                activeObserver.disconnect();
                activeObserver = null;
            }
            if (checkPageTimer) {
                clearInterval(checkPageTimer);
                checkPageTimer = null;
            }
            if (processDebounceTimer) {
                clearTimeout(processDebounceTimer);
                processDebounceTimer = null;
            }
            // 清理 pendingCards 中残留的 DOM 引用
            pendingCards.clear();
            removeWarningNotice();
        }

        function startMutationObserver() {
            // 监听更稳定的父节点 document.body，避免因 React 替换局部 DOM 导致 observer 失效
            const targetNode = document.body;
            if (!targetNode) return;

            const isOnIncomingPage = () => /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);

            activeObserver = new MutationObserver((mutationsList) => {
                // 页面已离开 → 自毁
                if (!isOnIncomingPage()) {
                    cleanupAll();
                    return;
                }

                // 判断是否目标卡片发生变化
                const hasRelevantChanges = mutationsList.some(mutation => {
                    return mutation.type === 'childList' && (
                        // 添加了新节点，且包含合同卡片
                        (mutation.addedNodes.length > 0 && Array.from(mutation.addedNodes).some(node => node.nodeType === 1 && (node.matches('div[tabindex="0"]') || node.querySelector('div[tabindex="0"]')))) ||
                        // 或者是已有卡片内部发生了变化（React 抹除 UI 时通常触发其内部节点的 childList 变化）
                        (mutation.target && mutation.target.nodeType === 1 && mutation.target.closest('div[tabindex="0"]'))
                    );
                });

                if (hasRelevantChanges) {
                    clearTimeout(processDebounceTimer);
                    processDebounceTimer = setTimeout(() => {
                        // 再次检查以防延迟期间页面跳转
                        if (!isOnIncomingPage()) {
                            cleanupAll();
                            return;
                        }
                        const contractCards = document.querySelectorAll('div[tabindex="0"]');
                        processAllCards([...contractCards]);
                    }, 150);
                }
            });

            activeObserver.observe(targetNode, { childList: true, subtree: true });
        }

        function getRealmIdFromLink() {
            const link = document.querySelector('a[href*="/company/"]');
            if (link) {
                const match = link.href.match(/\/company\/(\d+)\//);
                return match ? parseInt(match[1], 10) : null;
            }
            return null;
        }

        // 获取市场数据（含1分钟缓存过期检查）
        async function getMarketDataForResource(realmId, resourceId) {
            const key = `market_all_${realmId}_${resourceId}`;
            const raw = localStorage.getItem(key);

            let cachedData = null;
            let cachedValid = false;

            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    const dataArray = Array.isArray(parsed) ? parsed : parsed.data;
                    cachedData = dataArray;
                    if (parsed.timestamp && (Date.now() - parsed.timestamp < 60000)) {
                        cachedValid = true;
                    }
                } catch (e) { /* 缓存损坏 */ }
            }

            // 如果缓存有效，直接使用它并标记状态为 ok
            if (cachedValid && cachedData) {
                return { data: cachedData, status: 'ok' };
            }

            // 否则尝试拉取最新数据
            try {
                const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                const json = await response.json();
                if (Array.isArray(json)) {
                    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data: json }));
                    return { data: json, status: 'ok' };
                }
            } catch (e) {
                // 请求失败时，如果存在过期缓存则回退，并标记为过期
                if (cachedData) {
                    return { data: cachedData, status: 'fallback_expired' };
                }
            }
            // 完全获取不到且无缓存
            return { data: null, status: 'error' };
        }

        function refreshAllContractProfits() {
            const contractCards = document.querySelectorAll('div[tabindex="0"]');
            contractCards.forEach(card => {
                // 清理旧的显示元素（通过 data-sc-contract 标记识别）
                const oldEl = card.__profitDisplayEl;
                if (oldEl && oldEl.parentNode) oldEl.remove();
                // 兜底：按文本查找旧的 <b> 元素
                card.querySelectorAll('b').forEach(b => {
                    if (b.dataset?.scContract === 'true' ||
                        b.textContent.includes('时利润') ||
                        b.textContent.includes('MP-') ||
                        b.textContent.includes('MP+') ||
                        b.textContent.includes('市场最大时利')) b.remove();
                });
                card.removeAttribute('data-found');
                delete card.__mpNotes;
                delete card.__mpValue;
                delete card.__mpBestQuality;
                delete card.__mpPending;
                delete card.__marketMaxProfit;
                delete card.__marketMaxPrice;
                delete card.__marketMaxQuality;
                delete card.__profitDisplayEl;
            });
            processAllCards([...contractCards], true);
        }

        function parseContractCard(card) {
            const result = {
                quantity: null,
                quality: null,
                unitPrice: null,
                totalPrice: null,
                imageSrc: null,
                resourcePath: null,
                dbLetter: null,
            };

            const label = card.getAttribute('aria-label') || '';

            const regexEN = /^incoming contract,\s*([\d,]+).*?quality\s+(\d+),\s*at\s*\$([\d,.]+)\s+per unit,\s*total price\s*\$([\d,.]+)/i;
            const regexSC = /^来自.*?的入库合同，([\d,]+)单位的Q(\d+).*?，价格为\$([\d,.]+)每单位，总价\$([\d,.]+)/;
            const regexTC = /^來自.*?的入庫合同，([\d,]+)單位的Q(\d+).*?，價格為\$([\d,.]+)每單位，總價\$([\d,.]+)/;

            let match;
            if (match = label.match(regexEN)) {
                result.quantity = parseInt(match[1].replace(/,/g, ''));
                result.quality = parseInt(match[2]);
                result.unitPrice = parseFloat(match[3].replace(/,/g, ''));
                result.totalPrice = parseFloat(match[4].replace(/,/g, ''));
            } else if (match = label.match(regexSC)) {
                result.quantity = parseInt(match[1].replace(/,/g, ''));
                result.quality = parseInt(match[2]);
                result.unitPrice = parseFloat(match[3].replace(/,/g, ''));
                result.totalPrice = parseFloat(match[4].replace(/,/g, ''));
            } else if (match = label.match(regexTC)) {
                result.quantity = parseInt(match[1].replace(/,/g, ''));
                result.quality = parseInt(match[2]);
                result.unitPrice = parseFloat(match[3].replace(/,/g, ''));
                result.totalPrice = parseFloat(match[4].replace(/,/g, ''));
            } else {
                console.warn('[合同卡片] aria-label 格式不匹配:', label);
            }

            const img = card.querySelector('img[src^="/static/images/resources/"]');
            if (img) {
                result.imageSrc = img.getAttribute('src');
                result.resourcePath = result.imageSrc
                    .replace(/^\/static\//, '')
                    .replace(/\.[0-9a-f]{6,}\.(png|jpg|jpeg|gif|svg)$/, '.$1');

                const constants = JSON.parse(localStorage.getItem('SimcompaniesConstantsData') || '{}');
                const resources = Object.values(constants?.constantsResources || {});
                const matched = resources.find(r => r.image === result.resourcePath);
                if (matched) result.dbLetter = matched.dbLetter;
            }
            return result;
        }

        // --- 为非零售物品提前注入 MP 占位符（无时利润） ---
        function injectMpPlaceholder(card) {
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));
            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            // 防止重复注入
            if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                priceBox.nextSibling.dataset?.scContract === 'true') return;

            const dPh = DM();
            const el = document.createElement('b');
            el.dataset.scContract = 'true';
            el.style.marginLeft = '8px';
            el.innerHTML = `<span class="sc-mp-part" style="color:${dPh ? '#aaa' : '#888'};white-space:nowrap;">MP计算中...</span>`;
            priceBox.parentNode.insertBefore(el, priceBox.nextSibling);
            card.__profitDisplayEl = el;
        }

        function ensureHighPriceWarning(card, displayEl) {
            if (card.__wasHighPrice === true && displayEl && !displayEl.querySelector('.sc-high-price-warning')) {
                const warningSpan = document.createElement('span');
                warningSpan.className = 'sc-high-price-warning';
                warningSpan.style.cssText = 'color:#ff4444; font-weight:bold; margin-left:8px; animation: sc-highprice-blink 1s infinite alternate;';
                warningSpan.textContent = '[⚠️高价合同]';
                displayEl.appendChild(warningSpan);

                if (!document.getElementById('sc-highprice-blink-style')) {
                    const style = document.createElement('style');
                    style.id = 'sc-highprice-blink-style';
                    style.textContent = `
                        @keyframes sc-highprice-blink {
                            0% { opacity: 0.3; }
                            100% { opacity: 1; }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
        }

        // --- 注入/更新时利润（仅时利润，不含 MP，用于 Worker 回调立即展示） ---
        function injectOrUpdateProfit(card, profitValue) {
            card.__contractProfit = profitValue;  // 供市场最大时利比较用
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));

            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            // 查找是否已有注入元素
            const existingEl = card.__profitDisplayEl ||
                (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                    priceBox.nextSibling.dataset?.scContract === 'true' ? priceBox.nextSibling : null);

            if (existingEl) {
                // 已存在：更新时利润部分
                const profitSpan = existingEl.querySelector('.sc-profit-part');
                if (profitSpan && profitValue !== null && profitValue !== undefined && isFinite(profitValue)) {
                    if (profitValue < 0) {
                        profitSpan.innerHTML = `<span style="color:#ff1744;font-weight:bold;">⚠️时利润:${profitValue.toFixed(2)}</span>`;
                    } else {
                        profitSpan.innerHTML = `时利润:${profitValue.toFixed(2)}`;
                    }
                    return;
                }
                // 结构不完整（MP 先到达了），移除重建
                existingEl.remove();
                if (card.__profitDisplayEl === existingEl) card.__profitDisplayEl = null;
            }

            // 首次注入：仅显示时利润 + MP 占位符
            const profitDisplay = document.createElement('b');
            profitDisplay.dataset.scContract = 'true';
            profitDisplay.style.marginLeft = '8px';

            let profitHtml = '';
            if (profitValue !== null && profitValue !== undefined && isFinite(profitValue)) {
                if (profitValue < 0) {
                    profitHtml = `<span class="sc-profit-part" style="color:#ff1744;font-weight:bold;">⚠️时利润:${profitValue.toFixed(2)}</span>`;
                } else {
                    profitHtml = `<span class="sc-profit-part">时利润:${profitValue.toFixed(2)}</span>`;
                }
            }
            // MP 占位（后续由 updateCardMpDisplay 填充）或直接显示已有 MP 数据
            const dPh = DM();
            let mpHtml = '';
            const mmpEnabled = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();
            if (card.__mpPending) {
                mpHtml = `<span class="sc-mp-part" style="color:${dPh ? '#aaa' : '#888'};white-space:nowrap;"> | MP计算中...</span>`;
            } else {
                // 先构建 MP-% 部分（始终显示）
                let mpPartHtml = '';
                if (card.__mpPercent !== undefined && card.__mpPercent !== null && isFinite(card.__mpPercent)) {
                    const prefix = card.__mpPercent < 0 ? 'MP+' : 'MP-';
                    const mpColor = card.__mpPercent < 0 ? 'color:#ef5350;' : '';
                    mpPartHtml = ` | <span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(card.__mpPercent).toFixed(2)}%`;
                    // 开关开启时追加参考价格
                    if (mmpEnabled && card.__mpValue != null && isFinite(card.__mpValue)) {
                        mpPartHtml += ` ($${card.__mpValue.toFixed(2)})`;
                    }
                    if (card.__mpNotes) {
                        mpPartHtml += `<span style="color:${dPh ? '#aaa' : '#777'};font-size:0.85em;"> ${card.__mpNotes}</span>`;
                    }
                    mpPartHtml += `</span>`;
                }
                // 开关开启时追加市场最大时利
                let mmpPartHtml = '';
                if (mmpEnabled && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
                    const mmp = card.__marketMaxProfit;
                    const mmpColor = mmp < 0 ? 'color:#ff1744;' : 'color:#4caf50;';
                    let mmpNote = '';
                    if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
                        mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
                    }
                    mmpPartHtml = ` | <span style="${mmpColor}white-space:nowrap;">市场最大时利:${mmp.toFixed(2)}`;
                    if (mmpNote) {
                        mmpPartHtml += `<span style="color:${dPh ? '#aaa' : '#777'};font-size:0.85em;">${mmpNote}</span>`;
                    }
                    mmpPartHtml += `</span>`;
                    if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
                        const lnkColor = '#ff9800';
                        mmpPartHtml += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:${lnkColor};text-decoration:none;">📈交易所</a>`;
                    }
                }
                mpHtml = `<span class="sc-mp-part">${mpPartHtml}${mmpPartHtml}</span>`;
            }

            profitDisplay.innerHTML = profitHtml + mpHtml;
            priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
            card.__profitDisplayEl = profitDisplay;

            ensureHighPriceWarning(card, profitDisplay);
        }

        // --- 更新卡片上的 MP 信息显示 ---
        function updateCardMpDisplay(card, mpPercent, mpValue, mpNotes) {
            const displayEl = card.__profitDisplayEl;
            if (!displayEl) {
                // 如果没有时利润显示元素，创建仅 MP 的显示
                injectHourlyProfitLegacy(card, null, mpPercent, mpValue, mpNotes);
                checkAndApplyDoubleConfirm(card);
                return;
            }

            // 检查是否开启了"显示更多"
            const marketMaxProfitEnabled = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();

            // 已有时利润元素：更新 MP 部分
            const mpSpan = displayEl.querySelector('.sc-mp-part');
            const hasProfit = !!displayEl.querySelector('.sc-profit-part');
            const sep = hasProfit ? ' | ' : '';
            const dMp = DM();

            // 1. 构建 MP-% 部分（始终显示）
            let mpPartHtml = '';
            if (mpPercent !== null && mpPercent !== undefined && isFinite(mpPercent)) {
                const prefix = mpPercent < 0 ? 'MP+' : 'MP-';
                const mpColor = mpPercent < 0 ? 'color:#ef5350;' : '';
                mpPartHtml = `${sep}<span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(mpPercent).toFixed(2)}%`;
                if (marketMaxProfitEnabled && mpValue != null && isFinite(mpValue)) {
                    mpPartHtml += ` ($${mpValue.toFixed(2)})`;
                }
                if (mpNotes) {
                    mpPartHtml += `<span style="color:${dMp ? '#aaa' : '#777'};font-size:0.85em;"> ${mpNotes}</span>`;
                }
                mpPartHtml += `</span>`;
            } else {
                // 无有效 MP 数据
                if (mpNotes) {
                    mpPartHtml = `${sep}<span style="color:${dMp ? '#aaa' : '#777'};">${mpNotes}</span>`;
                }
            }

            // 2. 开关开启时追加市场最大时利
            let mmpPartHtml = '';
            if (marketMaxProfitEnabled && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
                const mmp = card.__marketMaxProfit;
                const mmpColor = mmp < 0 ? 'color:#ff1744;' : 'color:#4caf50;';
                let mmpNote = '';
                if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
                    mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
                }
                mmpPartHtml = ` | <span style="${mmpColor}white-space:nowrap;">市场最大时利:${mmp.toFixed(2)}`;
                if (mmpNote) {
                    mmpPartHtml += `<span style="color:${dMp ? '#aaa' : '#777'};font-size:0.85em;">${mmpNote}</span>`;
                }
                mmpPartHtml += `</span>`;
                if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
                    mmpPartHtml += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:#ff9800;text-decoration:none;">📈交易所</a>`;
                }
            }

            const mpHtml = mpPartHtml + mmpPartHtml;

            if (mpSpan) {
                mpSpan.innerHTML = mpHtml;
                // 清除占位符遗留的灰色，恢复正常文字颜色
                mpSpan.style.color = '';
            } else {
                // 没有占位 span，追加
                const currentHtml = displayEl.innerHTML;
                displayEl.innerHTML = currentHtml + mpHtml;
            }
            checkAndApplyDoubleConfirm(card);
        }

        // --- 非零售物品的完整注入（仅 MP，无时利润） ---
        function injectHourlyProfitLegacy(card, profitValue, mpPercent, mpValue, mpNotes) {
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));

            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                priceBox.nextSibling.dataset?.scContract === 'true') {
                return;
            }

            const profitDisplay = document.createElement('b');
            profitDisplay.dataset.scContract = 'true';
            profitDisplay.style.marginLeft = '8px';

            let displayText = '';
            if (profitValue !== null && profitValue !== undefined && isFinite(profitValue)) {
                if (profitValue < 0) {
                    displayText = `<span style="color:#ff1744;font-weight:bold;">⚠️时利润:${profitValue.toFixed(2)}</span>`;
                } else {
                    displayText = `时利润:${profitValue.toFixed(2)}`;
                }
            }

            const dMpNote = DM();
            // 检查是否开启了"显示更多"
            const mmpEnabledLegacy = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();

            // 1. 构建 MP-% 部分（始终显示，参考价格仅在开关开启时显示）
            if (mpPercent !== null && mpPercent !== undefined && isFinite(mpPercent)) {
                if (displayText) displayText += ' |';
                const prefix = mpPercent < 0 ? 'MP+' : 'MP-';
                const mpColor = mpPercent < 0 ? 'color:#ef5350;' : '';
                let mpBaseText = `<span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(mpPercent).toFixed(2)}%`;
                if (mmpEnabledLegacy && mpValue != null && isFinite(mpValue)) {
                    mpBaseText += ` ($${mpValue.toFixed(2)})`;
                }
                if (mpNotes) {
                    mpBaseText += `<span style="color:${dMpNote ? '#aaa' : '#777'};font-size:0.85em;"> ${mpNotes}</span>`;
                }
                mpBaseText += `</span>`;
                displayText += mpBaseText;
            } else if (mpNotes) {
                if (displayText) displayText += ' |';
                displayText += `<span style="color:${dMpNote ? '#aaa' : '#777'};">${mpNotes}</span>`;
            }

            // 2. 开关开启时追加市场最大时利
            if (mmpEnabledLegacy && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
                if (displayText) displayText += ' |';
                const mmp = card.__marketMaxProfit;
                const mmpColor = mmp < 0 ? 'color:#ff1744;' : 'color:#4caf50;';
                let mmpNote = '';
                if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
                    mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
                }
                let mmpText = `<span style="${mmpColor}white-space:nowrap;">市场最大时利:${mmp.toFixed(2)}`;
                if (mmpNote) {
                    mmpText += `<span style="color:${dMpNote ? '#aaa' : '#777'};font-size:0.85em;">${mmpNote}</span>`;
                }
                mmpText += `</span>`;
                if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
                    mmpText += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:#ff9800;text-decoration:none;">📈交易所</a>`;
                }
                displayText += mmpText;
            }

            if (!displayText) return;
            profitDisplay.innerHTML = displayText;
            priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
            card.__profitDisplayEl = profitDisplay;

            ensureHighPriceWarning(card, profitDisplay);
        }

        // --- 保留旧签名兼容（非零售物品从 MP 回调调用） ---
        function injectHourlyProfit(card, profitValue, mpPercent) {
            const mpValue = card.__mpValue || null;
            const mpNotes = card.__mpNotes || null;
            injectHourlyProfitLegacy(card, profitValue, mpPercent, mpValue, mpNotes);
        }

        function insertWarningNotice() {
            if (document.querySelector('[data-warning-text]')) return;

            const cards = document.querySelectorAll('div[tabindex="0"]');

            cards.forEach(card => {
                let parent = card.parentElement;
                if (!parent) return;

                let grandParent = parent.parentElement;
                if (!grandParent || grandParent.querySelector('[data-warning-text]')) return;

                const insertTarget = grandParent.firstElementChild;
                if (!insertTarget || insertTarget === parent) return;

                const isNarrow8 = window.innerWidth <= 576;
                const d8 = DM();
                const tip = document.createElement('div');
                tip.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: ${isNarrow8 ? '6px 8px' : '8px'};
                    color: ${d8 ? '#aaa' : '#777'};
                    font-size: ${isNarrow8 ? '11px' : '13px'};
                    width: 100%;
                `;
                tip.dataset.warningText = 'true';

                // 1. 插入文本提示
                const textSpan = document.createElement('span');
                textSpan.textContent = '自动更新数据有延迟，左下可手动更新';
                textSpan.style.cssText = `
                    white-space: ${isNarrow8 ? 'normal' : 'nowrap'};
                    flex: ${isNarrow8 ? '1 1 100%' : '0 0 auto'};
                `;
                tip.appendChild(textSpan);

                // 2. 按钮组容器
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: ${isNarrow8 ? '4px 6px' : '6px'};
                    flex: 1 1 auto;
                `;

                // 2a. 开关按钮
                const toggle = createGlobalCustomToggle(
                    'executiveCustomToggle',
                    '自定义',
                    { buttonClass: 'btn btn-primary' },
                    (isEnabled) => {
                        refreshAllContractProfits();
                    }
                );
                toggle.wrapper.style.marginLeft = "0";
                btnGroup.appendChild(toggle.wrapper);

                // 2b. 自定义数据功能按钮
                const customBtn = document.createElement('button');
                customBtn.type = 'button';
                customBtn.textContent = '自定义高管数据';
                customBtn.style.cssText = `
                    padding: 4px 10px; background: #2196f3;
                    color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                    font-weight: bold; white-space: nowrap; flex-shrink: 0;
                `;
                customBtn.onclick = () => executiveCustomButton.show();
                btnGroup.appendChild(customBtn);

                // 2c. 显示更多信息开关按钮
                const marketToggle = createGlobalCustomToggle(
                    'marketMaxProfitToggle',
                    '显示更多',
                    {},
                    () => {
                        refreshAllContractProfits();
                    }
                );
                marketToggle.wrapper.style.marginLeft = "0";
                btnGroup.appendChild(marketToggle.wrapper);

                // 2d. 预期价格设置按钮
                const priceSetBtn = document.createElement('button');
                priceSetBtn.type = 'button';
                priceSetBtn.textContent = '预期价格';
                priceSetBtn.style.cssText = `
                    padding: 4px 10px; background: #9c27b0;
                    color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                    font-weight: bold; white-space: nowrap; flex-shrink: 0;
                `;
                priceSetBtn.onclick = () => showContractPriceModal();
                btnGroup.appendChild(priceSetBtn);

                tip.appendChild(btnGroup);

                insertTarget.appendChild(tip);
            });
        }

        function removeWarningNotice() {
            const oldNotice = document.querySelector('[data-warning-text]');
            if (oldNotice) oldNotice.remove();
        }

        // ======================
        // 新增：高价合同二级确认相关辅助函数
        // ======================
        const EXCLUDED_IDS = [91, 94, 95, 96, 97, 99];

        function getParsedRules() {
            const settings = JSON.parse(localStorage.getItem('SC_Contract_HighPrice_Settings') || '{"global":"","individual":""}');
            const parsed = {
                global: null,
                individual: new Map()
            };

            if (settings.global) {
                const gVal = settings.global.trim();
                if (gVal) {
                    if (gVal.endsWith('%')) {
                        parsed.global = { type: 'percent', value: parseFloat(gVal.slice(0, -1)) };
                    } else {
                        parsed.global = { type: 'delta', value: parseFloat(gVal) };
                    }
                }
            }

            if (settings.individual) {
                const lines = settings.individual.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const parts = trimmed.split(/[，,]/);
                    if (parts.length !== 3) continue;

                    let itemId = null;
                    const itemKey = parts[0].trim();
                    if (/^\d+$/.test(itemKey)) {
                        itemId = parseInt(itemKey);
                    } else {
                        // 使用全局 resourceIdNameMap 映射中文名字
                        for (const [id, name] of Object.entries(resourceIdNameMap)) {
                            if (name === itemKey) {
                                itemId = parseInt(id);
                                break;
                            }
                        }
                    }

                    if (itemId === null) continue;
                    const quality = parseInt(parts[1].trim());
                    if (isNaN(quality)) continue;

                    const ruleVal = parts[2].trim();
                    let type = 'absolute';
                    let val = parseFloat(ruleVal);

                    if (ruleVal.endsWith('%')) {
                        type = 'percent';
                        val = parseFloat(ruleVal.slice(0, -1));
                    } else if (ruleVal.startsWith('-')) {
                        type = 'delta';
                        val = parseFloat(ruleVal);
                    }

                    parsed.individual.set(`${itemId}_${quality}`, { type, value: val });
                }
            }

            return parsed;
        }

        function isContractHighPrice(card) {
            const data = parseContractCard(card);
            if (!data || !data.dbLetter) return false;

            const itemId = parseInt(data.dbLetter);
            const quality = data.quality !== null ? data.quality : 0;
            const price = data.unitPrice;
            const mpValue = card.__mpValue;

            const rules = getParsedRules();

            // 1. 优先匹配单独规则
            const indivKey = `${itemId}_${quality}`;
            if (rules.individual.has(indivKey)) {
                const rule = rules.individual.get(indivKey);
                if (rule.type === 'absolute') {
                    return price > rule.value;
                } else if (rule.type === 'percent') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue * (1 + rule.value / 100);
                        return price > threshold;
                    }
                    return false;
                } else if (rule.type === 'delta') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue + rule.value;
                        return price > threshold;
                    }
                    return false;
                }
            }

            // 2. 其次匹配全局规则 (排除列表除外)
            if (EXCLUDED_IDS.includes(itemId)) return false;

            if (rules.global) {
                const rule = rules.global;
                if (rule.type === 'percent') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue * (1 + rule.value / 100);
                        return price > threshold;
                    }
                } else if (rule.type === 'delta') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue + rule.value;
                        return price > threshold;
                    }
                }
            }

            return false;
        }

        function resetAcceptBtn(btn) {
            btn.dataset.confirmed = 'false';
            const span = btn.querySelector('span');
            if (span && btn.__originalText) {
                span.textContent = btn.__originalText;
            }
            if (btn.__originalBg !== undefined) {
                btn.style.backgroundColor = btn.__originalBg;
            } else {
                btn.style.backgroundColor = '';
            }
            btn.style.borderColor = '';
            clearTimeout(btn.__resetTimer);
        }

        function checkAndApplyDoubleConfirm(card) {
            const isHigh = isContractHighPrice(card);
            card.__wasHighPrice = isHigh;
            const acceptBtn = card.querySelector('a[aria-label="接受合同"], a.css-14hcbmv');

            if (isHigh) {
                // 卡片边框变红以示警告
                card.style.border = "2px dashed #ff4444";
                card.style.borderRadius = "8px";

                ensureHighPriceWarning(card, card.__profitDisplayEl);

                // 尝试获取按钮并绑定拦截器。如果 React 还没渲染出按钮，则提早退出。
                // 此时 __wasHighPrice 已成功记录，当按钮渲染后 observer 会因 lostInterceptor 重新触发本流程。
                if (!acceptBtn) return;

                if (!acceptBtn.__hasHighPriceInterceptor) {
                    acceptBtn.__hasHighPriceInterceptor = true;
                    acceptBtn.dataset.confirmed = 'false';

                    acceptBtn.addEventListener('click', function (e) {
                        if (!isContractHighPrice(card)) {
                            return; // 若非高价则放行
                        }

                        if (acceptBtn.dataset.confirmed !== 'true') {
                            e.stopPropagation();
                            e.preventDefault();

                            acceptBtn.dataset.confirmed = 'true';

                            const span = acceptBtn.querySelector('span');
                            acceptBtn.__originalText = span ? span.textContent : "接受";
                            if (span) span.textContent = acceptBtn.__originalText + "?";

                            acceptBtn.__originalBg = acceptBtn.style.backgroundColor;
                            acceptBtn.style.backgroundColor = '#ff4444';
                            acceptBtn.style.borderColor = '#ff4444';

                            clearTimeout(acceptBtn.__resetTimer);
                            acceptBtn.__resetTimer = setTimeout(() => {
                                resetAcceptBtn(acceptBtn);
                            }, 5000);
                        } else {
                            // 已确认状态，放行原生 click 动作，500ms 后自动复位防止卡死
                            setTimeout(() => {
                                resetAcceptBtn(acceptBtn);
                            }, 500);
                        }
                    }, true); // 捕获阶段拦截
                }
            } else {
                card.style.border = "";
                card.style.borderRadius = "";
                const displayEl = card.__profitDisplayEl;
                if (displayEl) {
                    const warningSpan = displayEl.querySelector('.sc-high-price-warning');
                    if (warningSpan) warningSpan.remove();
                }
                if (acceptBtn && acceptBtn.__hasHighPriceInterceptor) {
                    resetAcceptBtn(acceptBtn);
                }
            }
        }

        function showContractPriceModal() {
            if (document.getElementById('sc-contract-price-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'sc-contract-price-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.6); z-index: 22000;
                display: flex; justify-content: center; align-items: center;
            `;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                background: var(--sc-bg); border: 1px solid var(--sc-border);
                border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                width: min(550px, 95vw); max-height: min(650px, 90vh);
                color: var(--sc-fg); font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;
            `;

            wrapper.innerHTML = `
                <div style="padding: 12px 20px; background: #9c27b0; color: white; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: bold; font-size: 15px;">
                    <span>合同预期价格设置</span>
                    <span id="sc-contract-price-close" style="cursor: pointer; font-size: 20px; font-weight: normal; line-height: 1;">&times;</span>
                </div>
                <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; font-weight: bold; font-size: 13px; margin-bottom: 6px; color: var(--sc-fg2);">全局高价判定规则</label>
                        <input id="sc-contract-global-val" type="text" placeholder="例如：-1.8% 或 -0.5 (不填则禁用全局)" style="width: 100%; padding: 8px 12px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" />
                        <span style="font-size: 11px; color: var(--sc-fg3); display: block; margin-top: 4px; line-height: 1.4;">
                            * <b>-?%</b>：合同价格高于 <b>MP * (1 - ?%)</b> 时需要二级确认。<br>
                            * <b>-?</b>：合同价格高于 <b>MP - ?</b> 时需要二级确认。
                        </span>
                    </div>
                    <hr style="border: 0; border-top: 1px solid var(--sc-border2); margin: 5px 0;">
                    <div style="display: flex; flex-direction: column; flex-grow: 1;">
                        <label style="display: block; font-weight: bold; font-size: 13px; margin-bottom: 6px; color: var(--sc-fg2);">单独物品判定规则</label>
                        <div style="display: flex; gap: 8px; font-size: 11px; font-weight: bold; color: var(--sc-fg3); margin-bottom: 5px; padding-right: 32px; box-sizing: border-box;">
                            <span style="flex: 2; padding-left: 2px;">物品名称或ID</span>
                            <span style="flex: 1; text-align: center;">品质</span>
                            <span style="flex: 2; padding-left: 2px;">价格规则 (-1.5% / -0.5 / 1.7)</span>
                        </div>
                        <div id="sc-contract-rules-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 5px; margin-bottom: 10px;">
                            <!-- 动态规则行 -->
                        </div>
                        <button id="sc-contract-add-rule-row" type="button" style="align-self: flex-start; padding: 5px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background-color 0.2s;">+ 添加物品规则</button>
                        <span style="font-size: 11px; color: var(--sc-fg3); display: block; margin-top: 8px; line-height: 1.4;">
                            * 支持直接写绝对价格（如 1.7），或偏离值（-1.5% / -0.5）。<br>
                            * 航空航天终端产品无MP，仅能使用绝对价格
                        </span>
                        <details id="sc-contract-ref-details" style="margin-top: 8px; border: 1px solid var(--sc-border2); border-radius: 6px; padding: 6px 10px; background: var(--sc-bg2); cursor: pointer; user-select: none;">
                            <summary style="font-size: 11px; font-weight: bold; color: var(--sc-fg2); outline: none;">查看物品名称/ID对照参考表 (点击物品可直接填入空行)</summary>
                            <div id="sc-contract-ref-tags" style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; max-height: 100px; overflow-y: auto; cursor: default;">
                                <!-- 标签由 JS 动态生成 -->
                            </div>
                        </details>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; border-top: 1px solid var(--sc-border2); padding-top: 15px;">
                        <button id="sc-contract-price-cancel" style="padding: 8px 16px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background-color 0.2s;">取消</button>
                        <button id="sc-contract-price-save" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background-color 0.2s;">保存</button>
                    </div>
                </div>
            `;

            modal.appendChild(wrapper);

            // 动态创建并注入 datalist 自动完成候选列表
            let datalist = document.getElementById('sc-contract-resource-options');
            if (!datalist) {
                datalist = document.createElement('datalist');
                datalist.id = 'sc-contract-resource-options';
                datalist.innerHTML = Object.values(resourceIdNameMap)
                    .filter(name => name && name !== 'undefined')
                    .map(name => `<option value="${name}"></option>`)
                    .join('');
                modal.appendChild(datalist);
            }

            document.body.appendChild(modal);

            const updateThemeVars = () => {
                const isDark = DM();
                modal.style.setProperty('--sc-bg', theme.bg);
                modal.style.setProperty('--sc-bg2', theme.bg2);
                modal.style.setProperty('--sc-fg', theme.fg);
                modal.style.setProperty('--sc-fg2', theme.fg2);
                modal.style.setProperty('--sc-fg3', theme.fg3);
                modal.style.setProperty('--sc-border', theme.border);
                modal.style.setProperty('--sc-border2', theme.border2);
                modal.style.setProperty('--sc-input-bg', theme.inputBg);
                modal.style.setProperty('--sc-input-fg', theme.inputFg);
            };

            updateThemeVars();

            const themeObserver = new MutationObserver(() => {
                updateThemeVars();
            });
            themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

            const rulesListContainer = document.getElementById('sc-contract-rules-list');

            function addRuleRow(itemVal = '', qualVal = '', ruleVal = '') {
                const row = document.createElement('div');
                row.className = 'sc-contract-rule-row';
                row.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;';

                row.innerHTML = `
                    <input type="text" class="sc-rule-item" list="sc-contract-resource-options" value="${itemVal}" placeholder="如：苹果 或 3" style="flex: 2; min-width: 0; padding: 6px 10px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none;" />
                    <input type="number" class="sc-rule-quality" value="${qualVal}" min="0" max="12" placeholder="0" style="flex: 1; min-width: 0; padding: 6px 5px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none; text-align: center;" />
                    <input type="text" class="sc-rule-value" value="${ruleVal}" placeholder="如：-1.5% 或 1.7" style="flex: 2; min-width: 0; padding: 6px 10px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none;" />
                    <button type="button" class="sc-rule-delete" style="flex: 0 0 24px; height: 24px; padding: 0; background: #e53935; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
                `;

                row.querySelector('.sc-rule-delete').onclick = () => {
                    row.remove();
                };

                rulesListContainer.appendChild(row);
            }

            // 初始化规则列表
            const settings = JSON.parse(localStorage.getItem('SC_Contract_HighPrice_Settings') || '{"global":"","individual":""}');
            document.getElementById('sc-contract-global-val').value = settings.global || '';

            const lines = (settings.individual || '').split('\n');
            let hasRows = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const parts = trimmed.split(/[，,]/);
                if (parts.length === 3) {
                    addRuleRow(parts[0].trim(), parts[1].trim(), parts[2].trim());
                    hasRows = true;
                }
            }

            if (!hasRows) {
                addRuleRow('', '', '');
            }

            document.getElementById('sc-contract-add-rule-row').onclick = (e) => {
                e.preventDefault();
                addRuleRow('', '', '');
            };

            // 动态生成常见物品名称/ID对照表小标签
            const tagsContainer = document.getElementById('sc-contract-ref-tags');
            if (tagsContainer) {
                tagsContainer.innerHTML = '';
                const sortedItems = Object.entries(resourceIdNameMap)
                    .filter(([id, name]) => name && name !== 'undefined')
                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

                for (const [id, name] of sortedItems) {
                    const tag = document.createElement('span');
                    tag.textContent = `${name}(${id})`;
                    tag.title = `点击可直接填入该物品`;
                    tag.style.cssText = `
                        display: inline-block; padding: 2px 6px; background: var(--sc-border2);
                        color: var(--sc-fg); font-size: 11px; border-radius: 4px; cursor: pointer;
                        transition: all 0.2s; border: 1px solid var(--sc-border);
                    `;

                    // 绑定悬停变色效果
                    tag.onmouseenter = () => {
                        tag.style.background = '#9c27b0';
                        tag.style.color = '#fff';
                        tag.style.borderColor = '#9c27b0';
                    };
                    tag.onmouseleave = () => {
                        tag.style.background = 'var(--sc-border2)';
                        tag.style.color = 'var(--sc-fg)';
                        tag.style.borderColor = 'var(--sc-border)';
                    };

                    // 绑定点击填充事件
                    tag.onclick = (event) => {
                        event.preventDefault();
                        const rows = rulesListContainer.querySelectorAll('.sc-contract-rule-row');
                        let targetInput = null;

                        // 优先寻找最后一行空的物品输入框
                        for (let i = rows.length - 1; i >= 0; i--) {
                            const input = rows[i].querySelector('.sc-rule-item');
                            if (input && !input.value.trim()) {
                                targetInput = input;
                                break;
                            }
                        }

                        // 如果全满了，自动开辟新行并填充
                        if (!targetInput) {
                            addRuleRow(name, '', '');
                            const newRows = rulesListContainer.querySelectorAll('.sc-contract-rule-row');
                            targetInput = newRows[newRows.length - 1].querySelector('.sc-rule-item');
                        } else {
                            targetInput.value = name;
                        }

                        if (targetInput) {
                            targetInput.focus();
                            const origBorder = targetInput.style.borderColor;
                            targetInput.style.borderColor = '#4CAF50';
                            setTimeout(() => {
                                targetInput.style.borderColor = origBorder;
                            }, 500);
                        }
                    };

                    tagsContainer.appendChild(tag);
                }
            }

            const closeBtn = document.getElementById('sc-contract-price-close');
            const cancelBtn = document.getElementById('sc-contract-price-cancel');
            const saveBtn = document.getElementById('sc-contract-price-save');

            const closeModal = () => {
                themeObserver.disconnect();
                modal.remove();
            };

            closeBtn.onclick = closeModal;
            cancelBtn.onclick = closeModal;

            saveBtn.onclick = (e) => {
                e.preventDefault();
                const globalInput = document.getElementById('sc-contract-global-val').value.trim();

                // 1. 校验全局
                if (globalInput) {
                    if (!/^-\d+(?:\.\d+)?%?$/.test(globalInput)) {
                        showToast("全局设置格式不正确。请输入类似 -1.8% 或 -0.5 的偏离格式", "error");
                        return;
                    }
                }

                // 2. 校验及组装单独规则行
                const rows = rulesListContainer.querySelectorAll('.sc-contract-rule-row');
                const indivRules = [];

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const itemInput = row.querySelector('.sc-rule-item').value.trim();
                    const qualInput = row.querySelector('.sc-rule-quality').value.trim();
                    const valInput = row.querySelector('.sc-rule-value').value.trim();

                    // 只要物品输入和规则输入均为空，则忽略该行
                    if (!itemInput && !valInput) continue;

                    // 若不完整则报错
                    if (!itemInput || qualInput === "" || !valInput) {
                        showToast(`第 ${i + 1} 行规则信息不完整，请填写所有列或将其删除`, "error");
                        return;
                    }

                    let itemId = null;
                    if (/^\d+$/.test(itemInput)) {
                        itemId = parseInt(itemInput);
                    } else {
                        // 查找物品 ID
                        for (const [id, name] of Object.entries(resourceIdNameMap)) {
                            if (name === itemInput) {
                                itemId = parseInt(id);
                                break;
                            }
                        }
                    }

                    if (itemId === null) {
                        showToast(`第 ${i + 1} 行的物品名称或ID '${itemInput}' 无法识别，请使用物品ID或正确的物品名称`, "error");
                        return;
                    }

                    const quality = parseInt(qualInput);
                    if (isNaN(quality) || quality < 0) {
                        showToast(`第 ${i + 1} 行的品质 '${qualInput}' 必须是正整数`, "error");
                        return;
                    }

                    const isAbsolute = /^\d+(?:\.\d+)?$/.test(valInput);
                    const isOffset = /^-\d+(?:\.\d+)?%?$/.test(valInput);

                    if (!isAbsolute && !isOffset) {
                        showToast(`第 ${i + 1} 行的规则 '${valInput}' 格式不正确。请输入绝对价格（如 1.7）或偏离值（如 -1.5% 或 -0.5）`, "error");
                        return;
                    }

                    if (EXCLUDED_IDS.includes(itemId) && !isAbsolute) {
                        showToast(`物品 ID ${itemId} 没有 MP 数据，只能使用绝对价格作为判定条件（第 ${i + 1} 行）`, "error");
                        return;
                    }

                    indivRules.push(`${itemInput},${quality},${valInput}`);
                }

                // 保存
                localStorage.setItem('SC_Contract_HighPrice_Settings', JSON.stringify({
                    global: globalInput,
                    individual: indivRules.join('\n')
                }));

                showToast("保存成功", "success");
                closeModal();
                refreshAllContractProfits();
            };
        }

        return { init };
    })();

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.incomingContractsHandler = incomingContractsHandler;