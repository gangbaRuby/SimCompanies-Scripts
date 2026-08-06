import { state } from '../core/state.js';
import { registerExportInfo } from '../core/exportInfo.js';

registerExportInfo({
    name: '市场缓存',
    scope: 'realm',
    match: realmId => realmId === null
        ? /(?!)/ : new RegExp(`^(?:market_|market_all_)${realmId}_\\d+$`)
});

const { SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;

(function () {
        let cachedRetailIds = null;

        function getRetailIds() {
            if (cachedRetailIds) return cachedRetailIds;
            const SCDStr = localStorage.getItem("SimcompaniesConstantsData");
            if (!SCDStr) return new Set();
            try {
                const SCD = JSON.parse(SCDStr);
                if (!SCD.data || !SCD.data.SALES) return new Set();
                const sales = SCD.data.SALES;
                const retailIds = new Set();
                Object.keys(sales).forEach(key => {
                    const arr = sales[key];
                    if (Array.isArray(arr)) arr.forEach(id => retailIds.add(id));
                });
                cachedRetailIds = retailIds;
                return retailIds;
            } catch {
                return new Set();
            }
        }

        function isRetailId(id) {
            const retailIds = getRetailIds();
            return retailIds.has(id);
        }

        // 1. 创建Worker的函数，返回一个对象包含postMessage方法等
        function createProfitWorker() {
            const workerCode = `
            self.onmessage = function(e) {
                const { data, inputPercent, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT} = e.data;
                // bring constants into worker scope
                const lwe = SCD.retailInfo;
                const zn = SCD.data;

                // Utility functions defined inside to use local lwe and zn
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

                // Initial debug log
                const results = data.map(order => {
                    // profit calculation loop
                    let currentPrice = inputPercent < 0 ? order.price + inputPercent : order.price * (1 - inputPercent/100),
                        cost = currentPrice,
                        quantity = order.quantity,
                        maxProfit = -Infinity,
                        size = 1,
                        acceleration = SRC.acceleration,
                        economyState = SRC.economyState,
                        salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus,
                        skillCMO = SRC.saleBonus,
                        skillCOO = SRC.adminBonus;

                    if(order.kind === 153 || order.kind === 154){
                        quantity = Math.floor(order.quantity * Math.pow(1 - 0.05, (Math.round((Math.abs(Date.now() - Date.parse(order.datetimeDecayUpdated))) / (1000 * 60) / 4) * 4 / 60)))
                    }

                    // compute saturation locally
                    const saturation = (() => {
                        const list = SRC.ResourcesRetailInfo;
                        const m = list.find(item =>
                            item.dbLetter === parseInt(order.kind) &&
                            (parseInt(order.kind) !== 150 || item.quality === order.quality)
                        );
                        return m?.saturation;
                    })();

                    const administrationOverhead = SRC.administration;
                    const buildingKind = Object.entries(zn.SALES).find(([k, ids]) =>
                        ids.includes(parseInt(order.kind))
                    )?.[0];
                    const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
                    const averageSalary = zn.AVERAGE_SALARY;
                    const wages = averageSalary * salaryModifier;
                    const forceQuality = (parseInt(order.kind) === 150) ? order.quality : undefined;
                    const resourceDetail = SCD.constantsResources[parseInt(order.kind)]

                    const v = salesModifierWithRecreationBonus + skillCMO;
                    const b = Ul(administrationOverhead, skillCOO);
                    let selltime;

                    while (currentPrice > 0) {
                        const modeledData = wv(economyState, order.kind, forceQuality ?? null);
                        const w = zL(
                            buildingKind,
                            modeledData,
                            quantity,
                            v,
                            currentPrice,
                            forceQuality === void 0 ? order.quality : 0,
                            saturation,
                            acceleration,
                            size,
                            resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0
                        );
                        const revenue = currentPrice * quantity;
                        const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                        const secondsToFinish = w;
                        const profit = (!secondsToFinish || secondsToFinish <= 0)
                            ? NaN
                            : (revenue - cost * quantity - wagesTotal) / secondsToFinish;

                        if (!secondsToFinish || secondsToFinish <= 0) break;
                        if (profit > maxProfit) {
                            maxProfit = profit;
                            selltime = secondsToFinish;
                        }
                        // price increment
                        if (currentPrice < 8) {
                            currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                        } else if (currentPrice < 2001) {
                            currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                        } else {
                            currentPrice = Math.round(currentPrice + 1);
                        }
                    }

                    // 返回每个订单的计算结果
                    return {
                        seller: order.seller?.company || "",
                        marketPrice: order.price,
                        quality: order.quality,
                        saleAmout: quantity,
                        contractPrice: cost,
                        contractMaxProfit: (maxProfit * 3600).toFixed(2)
                    };
                });
                self.postMessage(results);
            };
            `;
            const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
            return worker;
        }

        // 2. 实例化 Worker 并暴露接口，方便 MpPanel 调用
        const profitWorker = createProfitWorker();

        window.MarketInterceptor = {
            profitWorker,
            calculateProfit(inputPercent, data, realmId) {
                const SCD = JSON.parse(localStorage.getItem("SimcompaniesConstantsData"));
                const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));

                return new Promise((resolve) => {
                    profitWorker.onmessage = (e) => {
                        resolve(e.data);
                    };
                    profitWorker.postMessage({ data, inputPercent, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT });
                });
            }
        };

        // 3. processMarketData（isAll: 是否为 /all/ 端点，使用不同缓存键避免被单品质数据覆盖）
        function processMarketData(json, realm, id, isAll) {
            if (!Array.isArray(json)) return;
            const dataToSave = {
                timestamp: Date.now(),
                data: json
            };
            const prefix = isAll ? 'market_all_' : 'market_';
            localStorage.setItem(`${prefix}${realm}_${id}`, JSON.stringify(dataToSave));
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = args[0];
            const match = typeof url === 'string' && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)\/?($|\?)/);
            const matchAll = typeof url === 'string' && url.match(/\/api\/v3\/market\/all\/(\d+)\/(\d+)\/?($|\?)/);
            const m = match || matchAll;
            if (m) {
                const realm = parseInt(m[1], 10);
                const id = parseInt(m[2], 10);

                const response = await originalFetch(...args);
                response.clone().json().then(json => {
                    processMarketData(json, realm, id, !!matchAll);
                }).catch(() => { });
                return response;
            }
            return originalFetch(...args);
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            try {
                const match = typeof url === 'string' && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)(\/|$|\?)/);
                const matchAll = typeof url === 'string' && url.match(/\/api\/v3\/market\/all\/(\d+)\/(\d+)(\/|$|\?)/);
                const m = match || matchAll;
                if (m) {
                    const realm = parseInt(m[1], 10);
                    const id = parseInt(m[2], 10);
                    this._realm = realm;
                    this._id = id;
                    this._isAll = !!matchAll;
                    this.addEventListener('readystatechange', () => {
                        if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                            try {
                                const json = JSON.parse(this.responseText);
                                processMarketData(json, this._realm, this._id, this._isAll);
                            } catch { }
                        }
                    }, false);
                }
            } catch { }
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            return originalSend.call(this, ...args);
        };
})();
