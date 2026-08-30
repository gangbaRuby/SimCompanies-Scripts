import { DM } from '../utils/ui.js';
import { state } from '../core/state.js';
import { executiveCustomButton } from './executiveBoardroom.js';
import { registerExportInfo } from '../core/exportInfo.js';

registerExportInfo({
    name: '交易所计算参数',
    scope: 'global',
    backup: true,
    keys: ['sc_building_level', 'sc_building_hours']
});

const { SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;

const MESSAGE_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 512 512" style="display:block;width:14px;height:14px;" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="envelope" class="css-0" role="img" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"></path></svg>`;

    const ResourceMarketHandler = (function () {
        let currentResourceId = null;
        let currentRealmId = null;
        let rowIdCounter = 0;
        const pendingRows = new Map(); // rowId -> <tr> element
        let summaryDisplay = null; // 用于展示2400h模拟结果的绿色面板
        let calcTimer = null; // 用于限流
        let _autoSelectTimer = null; // 自动选中最佳订单行的定时器
        let _pendingAutoSelect = null; // { targetQuality, startTime } 品质切换后等待API数据刷新再选中
        let _pendingAutoSelectPollTimer = null; // 等待API返回的轮询定时器
        let _globalObserver = null; // 全局 MutationObserver（跨 init 调用复用防泄漏）
        let _tableObserver = null; // 表格行变化 MutationObserver
        let _messageIconObserver = null; // 私信图标注入 MutationObserver
        let _quantityCheckInterval = null; // 数量输入框脏检查定时器ID
        let _formClickHandler = null; // 表单按钮点击处理函数引用
        let _initDone = false; // 标记是否已成功初始化，避免 observer 反复执行 tryInit

        // Worker 代码 —— 批量处理版本：一次接收所有行，共享数据只传一次
        const workerCode = `
        self.onmessage = function(e) {
        const { orders, shared, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
        if (!orders || !orders.length) { self.postMessage([]); return; }

        const lwe = SCD.retailInfo;
        const zn = SCD.data;

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

        // 预计算共享值（主线程已算好传入）
        const acceleration = SRC.acceleration;
        const economyState = shared.economyState;
        const v = shared.v;
        const b = shared.b;
        const wages = shared.wages;
        const buildingKind = shared.buildingKind;
        const weather = shared.weather;
        const size = 1;

        const results = [];

        for (const order of orders) {
            const { rowId, price, quantity, quality, resourceId } = order;

            // 根据 MP-?% 调整进货成本价
            let costPrice = price;
            if (shared.mpPercent != null && shared.mpPercent !== 0 && isFinite(shared.mpPercent)) {
                if (shared.mpPercent >= 0) {
                    costPrice = price * (1 - shared.mpPercent / 100);
                } else {
                    costPrice = price + shared.mpPercent;
                }
            }

            // 饱和度：资源150（树）按品质区分，其余统一
            let saturation;
            if (parseInt(resourceId) === 150 && quality !== undefined) {
                saturation = shared.saturationByQuality ? shared.saturationByQuality[quality] : shared.saturation;
            } else {
                saturation = shared.saturation;
            }

            const forceQuality = (parseInt(resourceId) === 150) ? quality : undefined;

            let currentPrice = price,
                maxProfit = -Infinity,
                selltime;

            while (currentPrice > 0) {
                const modeledData = wv(economyState, resourceId, forceQuality ?? null);
                const w = zL(
                    buildingKind,
                    modeledData,
                    quantity,
                    v,
                    currentPrice,
                    forceQuality === void 0 ? quality : 0,
                    saturation,
                    acceleration,
                    size,
                    weather
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                const secondsToFinish = w;
                const profit = (!secondsToFinish || secondsToFinish <= 0)
                    ? NaN
                    : (revenue - costPrice * quantity - wagesTotal) / secondsToFinish;

                if (!secondsToFinish || secondsToFinish <= 0) break;
                if (profit > maxProfit) {
                    maxProfit = profit;
                    selltime = secondsToFinish;
                }
                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }

            results.push({ rowId, maxProfit, selltime });
        }

        self.postMessage(results);
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        const allProfitSpans = new Set();
        let isShowingProfit = true;

        // 清理定时器和监听器（切换物品时调用）
        function cleanupInputListeners() {
            if (_quantityCheckInterval) {
                clearInterval(_quantityCheckInterval);
                _quantityCheckInterval = null;
            }
            const oldInput = document.querySelector('input[name="quantity"]');
            if (oldInput) {
                oldInput.removeAttribute('data-calc-listener');
            }
            // 表单点击监听器由 init 统一管理，每次 init 会重新绑定
        }

        // 专门用于监听顶部输入框
        function attachInputListener() {
            const input = document.querySelector('input[name="quantity"]');

            if (input && !input.hasAttribute('data-calc-listener')) {
                input.setAttribute('data-calc-listener', 'true');

                // 1. 保留原有的手动输入监听
                input.addEventListener('input', () => {
                    requestAnimationFrame(updateGlobalSimulation);
                });

                // 2. 针对“自动填入”：使用定时器进行“脏检查”
                // 每 500ms 检查一次输入框的值是否变化
                let lastValue = input.value;
                _quantityCheckInterval = setInterval(() => {
                    if (input.value !== lastValue) {
                        lastValue = input.value;
                        updateGlobalSimulation();
                    }
                }, 500);

                // 3. 针对游戏内的“快速按钮” (例如 Max/Half 按钮)
                // 游戏中的按钮通常在 input 的父级或兄弟级
                const parentForm = input.closest('form');
                if (parentForm) {
                    // 先移除旧的监听器（通过标记清理）
                    if (_formClickHandler) {
                        parentForm.removeEventListener('click', _formClickHandler);
                    }
                    _formClickHandler = (e) => {
                        // 如果点击了按钮，延迟一会等待值更新后执行计算
                        if (e.target.tagName === 'BUTTON') {
                            setTimeout(updateGlobalSimulation, 50);
                        }
                    };
                    parentForm.addEventListener('click', _formClickHandler);
                }
            }
        }

        // 辅助函数：将小时数转换为 "1h 20m" 或 "45m" 格式
        function formatDuration(totalHours) {
            if (!totalHours || totalHours <= 0) return "0m";
            const h = Math.floor(totalHours);
            const m = Math.round((totalHours - h) * 60);

            if (h === 0) return `${m}m`;
            if (m === 0) return `${h}h`;
            return `${h}h ${m}m`;
        }

        function debouncedUpdate() {
            if (calcTimer) cancelAnimationFrame(calcTimer);
            calcTimer = requestAnimationFrame(() => {
                updateGlobalSimulation();
            });
        }

        // 自动选中最佳利润行：先匹配品质，再点击行
        // 品质不同时切换品质，然后持续监听市场API返回，数据就绪后由 updateGlobalSimulation 完成选中
        function autoSelectBestRow(bestRow) {
            const labelData = extractNumbersFromAriaLabel(bestRow.getAttribute('aria-label'));
            if (!labelData) return;
            const targetQuality = labelData.quality;

            const qBtn = document.getElementById('quality-selection');
            if (!qBtn) return;

            const currentSpan = qBtn.querySelector('span');
            const currentQuality = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
            if (isNaN(currentQuality)) return;

            if (currentQuality !== targetQuality) {
                qBtn.click();
                setTimeout(() => {
                    const dropdownMenu = qBtn.parentElement?.querySelector('.dropdown-menu');
                    if (!dropdownMenu) return;
                    const items = dropdownMenu.querySelectorAll('li a');
                    for (const item of items) {
                        const txt = item.textContent?.trim();
                        if (txt === '全部') continue;
                        const q = parseInt(txt);
                        if (q === targetQuality) {
                            item.click();
                            // 记录切换前两个market缓存键的最新时间戳（all和非all）
                            const keys = [`market_all_${currentRealmId}_${currentResourceId}`, `market_${currentRealmId}_${currentResourceId}`];
                            let prevTs = 0;
                            for (const k of keys) {
                                try {
                                    const raw = localStorage.getItem(k);
                                    if (raw) { const p = JSON.parse(raw); if ((p.timestamp || 0) > prevTs) prevTs = p.timestamp || 0; }
                                } catch (e) { }
                            }
                            _pendingAutoSelect = { targetQuality, startTime: Date.now(), prevTs };
                            _startPendingAutoSelectPoll();
                            return;
                        }
                    }
                }, 100);
                return;
            }

            bestRow.focus();
            bestRow.click();
        }

        // 持续监听当前产品市场API是否返回（检测localStorage中两个缓存键的时间戳变化）
        // 数据就绪后直接查找最佳行并点击
        function _startPendingAutoSelectPoll() {
            if (_pendingAutoSelectPollTimer) clearTimeout(_pendingAutoSelectPollTimer);
            if (!_pendingAutoSelect) return;

            const MAX_WAIT = 20000;
            if (Date.now() - _pendingAutoSelect.startTime > MAX_WAIT) {
                _pendingAutoSelect = null;
                return;
            }

            // 检查quality-selection当前值是否已匹配目标品质
            const qBtn = document.getElementById('quality-selection');
            const currentSpan = qBtn?.querySelector('span');
            const curQ = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
            if (curQ !== _pendingAutoSelect.targetQuality) {
                _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 300);
                return;
            }

            // 检查两个缓存键是否有新数据
            const keys = [`market_all_${currentRealmId}_${currentResourceId}`, `market_${currentRealmId}_${currentResourceId}`];
            let newTs = 0;
            for (const k of keys) {
                try {
                    const raw = localStorage.getItem(k);
                    if (raw) { const p = JSON.parse(raw); if ((p.timestamp || 0) > newTs) newTs = p.timestamp || 0; }
                } catch (e) { }
            }

            if (newTs > _pendingAutoSelect.prevTs) {
                _pendingAutoSelectPollTimer = setTimeout(() => {
                    _pendingAutoSelectPollTimer = null;
                    _tryClickBestRow();
                }, 800);
                return;
            }

            _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 500);
        }

        // 在 pending 状态下，查找当前页面中利润最高的行并点击
        function _tryClickBestRow() {
            if (!_pendingAutoSelect) return;
            const tbody = findValidTbody();
            if (!tbody) return;

            let bestRow = null, bestProfit = -Infinity;
            tbody.querySelectorAll('tr[data-profit-calculated]').forEach(row => {
                if (row.offsetParent !== null && row.__profitData && row.__profitData.profit > bestProfit) {
                    bestProfit = row.__profitData.profit;
                    bestRow = row;
                }
            });

            if (bestRow) {
                const qBtn = document.getElementById('quality-selection');
                const curSpan = qBtn?.querySelector('span');
                const curQ = curSpan ? parseInt(curSpan.textContent?.trim()) : NaN;
                if (curQ === _pendingAutoSelect.targetQuality) {
                    _pendingAutoSelect = null;
                    bestRow.focus();
                    bestRow.click();
                    return;
                }
            }

            if (_pendingAutoSelect && Date.now() - _pendingAutoSelect.startTime < 20000) {
                _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 500);
            }
        }

        function updateGlobalSimulation() {
            const tbody = findValidTbody();
            if (!tbody || !summaryDisplay) return;

            // 1. 获取输入框的值
            const inputElement = document.querySelector('input[name="quantity"]');
            const userWantedQty = inputElement ? (parseFloat(inputElement.value) || 0) : 0;
            const isSimulationMode = userWantedQty > 0;

            // 2. 获取原始数据（先不筛选 >0，也不排序）
            // 我们只获取已经计算完成的行
            let rawRows = [];
            tbody.querySelectorAll('tr[data-profit-calculated]').forEach(row => {
                if (row.offsetParent !== null && row.__profitData) {
                    rawRows.push({
                        row: row,
                        profit: row.__profitData.profit, // 单位: $/s (可能是负数)
                        time: row.__profitData.time      // 单位: s
                    });
                }
            });

            // 如果连一行数据都没有，显示空状态
            if (rawRows.length === 0) {
                const simContent = document.getElementById('sc-sim-content');
                if (simContent) simContent.innerHTML = `<div style="color:${DM() ? '#888' : '#777'};font-size:12px;text-align:center;padding:8px;">暂无订单数据</div>`;
                return;
            }

            // ============================================
            // 核心计算分流
            // ============================================

            let avgProfitPerHour = 0;
            let totalProfitVal = 0;
            let totalTimeSeconds = 0;
            let isFull = false;     // 状态：是否满足/是否充满
            let displayTitle = "";
            let borderColor = "";
            let coveredCount = 0;   // 买了多少单

            // 用于展示的状态文本
            let statusText = "";
            let bldLevel = 1;

            if (isSimulationMode) {
                // === 模式 A：真实扫货模拟 (修正：强制 价格升序 + 品质降序) ===
                const storedLevel = localStorage.getItem('sc_building_level');
                bldLevel = storedLevel !== null ? Math.max(1, parseInt(storedLevel) || 1) : 100;

                // 1. 预提取所有行的数据，并转换为数值对象
                const processedRows = rawRows.map(item => {
                    const data = extractNumbersFromAriaLabel(item.row.getAttribute('aria-label'));
                    return {
                        row: item.row,
                        profit: item.profit, // $/s
                        time: item.time,     // s
                        price: data?.price || 0,
                        quantity: data?.quantity || 0,
                        quality: data?.quality || 0
                    };
                });

                // 2. 核心：模拟游戏市场真实排序逻辑
                // 价格越低越靠前；价格相同时，品质(Q)越高越靠前
                processedRows.sort((a, b) => {
                    if (a.price !== b.price) return a.price - b.price;
                    return b.quality - a.quality;
                });

                let remainingQty = userWantedQty;
                totalProfitVal = 0;   // 重置外部定义的累加变量
                totalTimeSeconds = 0;
                coveredCount = 0;

                // 3. 按正确逻辑顺序开始扫货
                for (const item of processedRows) {
                    if (remainingQty <= 0) break;
                    if (item.quantity <= 0) continue;

                    const takeQty = Math.min(remainingQty, item.quantity);
                    const ratio = takeQty / item.quantity;

                    // 累加利润：单秒利润 * 该单据实际卖出所需的总秒数 * 购买比例
                    totalProfitVal += (item.profit * item.time) * ratio;
                    // 累加时间
                    totalTimeSeconds += item.time * ratio;

                    remainingQty -= takeQty;
                    coveredCount++;
                }

                const totalHours = totalTimeSeconds / 3600;
                avgProfitPerHour = totalHours > 0 ? (totalProfitVal / totalHours) : 0;

                // 状态判定
                isFull = remainingQty <= 0.01;

                displayTitle = `购买${userWantedQty.toLocaleString()}个 - 扫货模拟`;
                borderColor = DM() ? "#FFC107" : "#B8860B";

                if (isFull) {
                    // statusText = "✅ 数量满足";
                } else {
                    const bought = userWantedQty - remainingQty;
                    statusText = `⚠️缺货(仅买到${Math.floor(bought).toLocaleString()})`;
                }

                // 清除所有行的高亮（因为这是模拟模式，不需要像 B 模式那样高亮单行）
                rawRows.forEach(item => {
                    item.row.style.outline = "none";
                    item.row.style.boxShadow = "none";
                    item.row.style.backgroundColor = "";
                });
            } else {
                // === 模式 B：2400h 最优解 (原来的逻辑) ===

                // 1. 过滤掉负利润 (只找赚钱的)
                const profitableRows = rawRows.filter(r => r.profit > 0);

                if (profitableRows.length === 0) {
                    const simContent = document.getElementById('sc-sim-content');
                    if (simContent) simContent.innerHTML = '<div style="color: #ff9800; font-size: 13px; text-align: center;">⚠️ 无正利润订单</div>';
                    return;
                }

                // 2. 排序：利润高的在前
                profitableRows.sort((a, b) => b.profit - a.profit);

                // 3. 高亮第一名
                rawRows.forEach(item => {
                    // 先清除所有
                    item.row.style.outline = "none";
                    item.row.style.boxShadow = "none";
                    item.row.style.backgroundColor = "";
                });
                // 再高亮最佳
                const best = profitableRows[0];
                if (best) {
                    const dG = DM();
                    best.row.style.outline = `2px dashed ${dG ? '#FFC107' : '#B8860B'}`;
                    best.row.style.outlineOffset = "-2px";
                    best.row.style.boxShadow = `inset 0 0 8px ${dG ? 'rgba(255, 193, 7, 0.35)' : 'rgba(184, 134, 11, 0.25)'}`;
                    best.row.style.backgroundColor = dG ? 'rgba(255, 193, 7, 0.07)' : 'rgba(184, 134, 11, 0.05)';

                    // 自动选中最佳订单行（先匹配品质，再点击行）—— 受功能开关控制（默认关闭）
                    const autoSelectEnabled = (() => {
                        try {
                            const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                            return cfg['autoSelectBestMarketRow'] === true;
                        } catch (e) { return false; }
                    })();
                    if (autoSelectEnabled) {
                        // 品质切换后有 pending 状态时：跳过正常自动选中，由轮询在数据就绪后完成
                        if (_pendingAutoSelect) {
                            // 不操作，等待 _startPendingAutoSelectPoll 检测到新数据后调用 _tryClickBestRow
                        } else {
                            clearTimeout(_autoSelectTimer);
                            _autoSelectTimer = setTimeout(() => autoSelectBestRow(best.row), 600);
                        }
                    }
                }

                // 4. 读取建筑等级和运行时长设置（等级整数≥1，时长可小数）
                const storedLevel = localStorage.getItem('sc_building_level');
                bldLevel = storedLevel !== null ? Math.max(1, parseInt(storedLevel) || 1) : 100;
                const storedHours = localStorage.getItem('sc_building_hours');
                const bldHours = storedHours !== null ? Math.max(0, parseFloat(storedHours) || 0) : 24;
                const targetSeconds = bldLevel * bldHours * 3600;
                let remainingTime = targetSeconds; // 秒
                let usedTime = 0;

                for (const order of profitableRows) {
                    if (remainingTime <= 0) break;

                    const takeTime = Math.min(order.time, remainingTime);

                    totalProfitVal += (order.profit * takeTime);
                    usedTime += takeTime;
                    remainingTime -= takeTime;
                }

                totalTimeSeconds = usedTime;
                const totalHours = totalTimeSeconds / 3600;

                avgProfitPerHour = totalHours > 0 ? (totalProfitVal / totalHours) : 0;
                isFull = totalHours >= (bldLevel * bldHours - 0.1);

                displayTitle = `${bldLevel}级建筑运行${bldHours}H正时利`;
                borderColor = isFull ? "#4CAF50" : "#ff9800"; // 绿或橙

                // // 格式化时间字符串
                // const timeStr = formatDuration(totalHours);
                // statusText = isFull ? "货源充足" : `仅覆盖 ${timeStr}`;
            }

            // 5. 渲染 UI
            const avgStr = avgProfitPerHour.toFixed(2);
            const totalProfitK = (totalProfitVal / 1000).toFixed(1);
            const durationStr = formatDuration(totalTimeSeconds / 3600);
            const bldRunHours = totalTimeSeconds / 3600 / bldLevel;
            const bldRunStr = formatDuration(bldRunHours);


            // 读取当前 MP 设置用于展示
            const mpInputEl = document.getElementById('sc-mp-input');
            const curMp = mpInputEl ? (parseFloat(mpInputEl.value) || 0) : 0;

            const renderUI = () => {
                const simContent = document.getElementById('sc-sim-content');
                if (!simContent) return;
                // summaryDisplay.style.borderLeft = `4px solid ${borderColor}`;
                const d7r = DM();
                const isNarrowR = window.innerWidth <= 576;

                // MP 标记文本
                let mpBadgeHtml = '';
                if (curMp !== 0) {
                    const mpLabel = curMp > 0 ? `MP-${curMp}%` : `MP-${Math.abs(curMp)}`;
                    mpBadgeHtml = `<div style="background: ${d7r ? '#3a2a5e' : '#ede7f6'}; color: ${d7r ? '#b39ddb' : '#5e35b1'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">${mpLabel} </div>`;
                }

                // 经济周期标记文本
                let periodBadgeHtml = '';
                const economySelectEl2 = document.getElementById('sc-economy-select');
                const economyVal = economySelectEl2 ? economySelectEl2.value : '';
                if (economyVal !== '') {
                    const periodNames = { '0': '萧条', '1': '平缓', '2': '景气' };
                    const periodName = periodNames[economyVal] || economyVal;
                    periodBadgeHtml = `<div style="background: ${d7r ? '#3a2a1e' : '#fff3cd'}; color: ${d7r ? '#f0c040' : '#856404'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">周期:${periodName}</div>`;
                }

                simContent.innerHTML = `
                    <div style="font-family: sans-serif; display: flex; flex-direction: column; gap: ${isNarrowR ? '2px' : '8px'}; font-size: ${isNarrowR ? '11px' : ''};">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${d7r ? '#444' : '#ddd'}; padding-bottom: ${isNarrowR ? '0px' : '6px'}; font-size: 14px;">
                            <span style="color: ${d7r ? '#aaa' : '#777'};">${displayTitle}<span id="sc-info-tip" title="自动更新数据有延迟，左下可手动更新&#10;显示均为1级建筑" onclick="event.stopPropagation();var ex=document.getElementById('sc-info-popup');if(ex){ex.remove();return;}var t=this;var isD=window.getComputedStyle(document.body).backgroundColor.match(/\d+/g);isD=isD&&isD.map(Number).reduce(function(a,b){return a+b},0)<380;var d=document.createElement('div');d.id='sc-info-popup';d.textContent='自动更新数据有延迟，左下可手动更新 | 显示均为1级建筑';d.style.cssText='position:absolute;top:100%;left:0;margin-top:4px;padding:5px 10px;background:'+(isD?'#333':'#fff')+';color:'+(isD?'#eee':'#333')+';border:1px solid '+(isD?'#555':'#bbb')+';border-radius:4px;font-size:11px;font-weight:normal;white-space:nowrap;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.35);';t.parentElement.style.position='relative';t.parentElement.appendChild(d);" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:5px;width:16px;height:16px;min-width:16px;font-size:10px;font-weight:bold;line-height:1;color:${d7r ? '#bbb' : '#555'};background:${d7r ? '#444' : '#e8e8e8'};border:1px solid ${d7r ? '#555' : '#bbb'};border-radius:50%;vertical-align:middle;user-select:none;flex-shrink:0;">?</span></span>
                            <span style="font-weight: bold; color: ${borderColor};">$${avgStr}<span style="font-weight:normal;">/h</span></span>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; gap: ${isNarrowR ? '2px' : '6px'};">
                            ${statusText ? `<div style="background: ${d7r ? '#333' : '#e8e8e8'}; color: ${d7r ? '#ccc' : '#555'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">${statusText}</div>` : ''}

                            <div style="background: ${d7r ? '#333' : '#e8e8e8'}; color: ${d7r ? '#ccc' : '#555'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">
                                总利: $${totalProfitK}k
                            </div>

                            <div style="background: ${d7r ? '#333' : '#e8e8e8'}; color: ${d7r ? '#ccc' : '#555'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">
                                ${bldLevel}级建筑可运行: ${bldRunStr}
                            </div>
                            ${mpBadgeHtml}${periodBadgeHtml}
                        </div>
                    </div>`;
            };
            renderUI();
        }

        // 主回调处理 —— 批量结果 + debounce 模拟更新
        let _simDebounceTimer = null;
        const scheduleSimUpdate = () => {
            if (_simDebounceTimer) clearTimeout(_simDebounceTimer);
            _simDebounceTimer = setTimeout(() => {
                _simDebounceTimer = null;
                updateGlobalSimulation();
            }, 80);
        };

        profitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { rowId, maxProfit, selltime } = item;
                const row = pendingRows.get(rowId);
                if (!row) continue;
                pendingRows.delete(rowId);

                // --- 核心改动：把数值作为对象属性直接挂载到 DOM 元素上 ---
                row.__profitData = { profit: maxProfit, time: selltime };

                const hours = Math.floor(selltime / 3600);
                const minutes = Math.ceil((selltime % 3600) / 60);
                const timeStr = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
                const profitStr = (maxProfit * 3600).toFixed(2);

                if (!row.querySelector('td.auto-profit-info')) {
                    const td = document.createElement('td');
                    td.classList.add('auto-profit-info');
                    const span = document.createElement('span');
                    const d7s = DM();
                    span.style.cssText = `display: inline-block; min-width: 30px; color: ${d7s ? 'white' : '#333'}; background: ${d7s ? '#555' : '#e0e0e0'}; border-radius: 2px; white-space: nowrap;`;

                    // 构建显示文案：窄屏用紧凑图标，-Infinity 显示"卖不了"
                    const isNarrow = window.innerWidth <= 576;
                    const isInfinity = !isFinite(maxProfit * 3600);
                    const profitLabel = isInfinity ? '卖不了'
                        : isNarrow ? (maxProfit >= 0 ? `💰${profitStr}` : `⚠️${profitStr}`)
                            : (maxProfit >= 0 ? `时利润:${profitStr}` : `⚠️时利润:${profitStr}`);
                    span.dataset.p = profitLabel;
                    span.dataset.t = `用时:${timeStr}`;
                    span.textContent = isShowingProfit ? span.dataset.p : span.dataset.t;

                    td.appendChild(span);
                    row.appendChild(td);

                    // 窄屏时收缩价格列宽度
                    if (window.innerWidth <= 576) {
                        const priceTd = td.previousElementSibling;
                        if (priceTd) {
                            const priceDiv = priceTd.querySelector('div');
                            if (priceDiv) priceDiv.style.minWidth = '10px';
                        }
                    }

                    allProfitSpans.add(span);
                    // 定期清理 Set 中已脱离 DOM 的 span，防止内存泄漏
                    if (allProfitSpans.size > 200) {
                        for (const s of allProfitSpans) {
                            if (!s.isConnected) allProfitSpans.delete(s);
                        }
                    }
                }
            }

            attachInputListener();
            // 批量结果回来后，debounce 一次模拟更新
            scheduleSimUpdate();
        };

        function findValidTbody() {
            return [...document.querySelectorAll('tbody')].find(tbody => {
                const firstRow = tbody.querySelector('tr');
                return firstRow &&
                    firstRow.children.length >= 4 &&
                    firstRow.querySelector('td > div > div > a[href*="/company/"]');
            });
        }

        function extractNumbersFromAriaLabel(label) {
            if (!label || typeof label !== 'string') return null;
            let match;
            const regexEN = /^market order, price \$?([\d,.]+), quantity ([\d,.]+), quality (\d+), offered by company/i;
            const regexSC = /^由.*公司提供的市场订单：价格\$?([\d,.]+)，数量([\d,.]+)，质量(\d+)/;
            const regexTC = /^由.*公司提供的市場訂單：價格\$?([\d,.]+)，數量([\d,.]+)，品質(\d+)/;

            if (match = label.match(regexEN)) {
                return { price: parseFloat(match[1].replace(/,/g, '')), quantity: parseFloat(match[2].replace(/,/g, '')), quality: parseInt(match[3]) };
            } else if (match = label.match(regexSC)) {
                return { price: parseFloat(match[1].replace(/,/g, '')), quantity: parseFloat(match[2].replace(/,/g, '')), quality: parseInt(match[3]) };
            } else if (match = label.match(regexTC)) {
                return { price: parseFloat(match[1].replace(/,/g, '')), quantity: parseFloat(match[2].replace(/,/g, '')), quality: parseInt(match[3]) };
            }
            return null;
        }

        function extractRealmIdOnce(tbody) {
            if (currentRealmId) return;
            const row = tbody.querySelector('tr');
            const link = row?.querySelector('a[href*="/company/"]');
            const match = link?.getAttribute('href')?.match(/\/company\/(\d+)\//);
            if (match) {
                currentRealmId = match[1];
            }
        }

        function injectMessageIcon(row) {
            if (row.hasAttribute('data-sc-message-added')) return;
            const link = row.querySelector('td > div > div > a[href*="/company/"]');
            if (!link || !link.parentElement) return;

            const nameEl = link.nextElementSibling?.querySelector('span')
                || link.parentElement.querySelector('div span, span');
            const companyName = nameEl?.textContent?.trim();
            if (!companyName) return;

            const messageLink = document.createElement('a');
            messageLink.href = `https://www.simcompanies.com/zh-cn/messages/${encodeURIComponent(companyName)}`;
            messageLink.target = '_blank';
            messageLink.rel = 'noopener';
            messageLink.title = '给公司发私信';
            messageLink.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; margin-right:3px; color:inherit; vertical-align:middle; flex-shrink:0; line-height:1; text-decoration:none;`;
            messageLink.innerHTML = MESSAGE_ICON_SVG;
            messageLink.setAttribute('data-sc-market-message-icon', 'true');
            messageLink.addEventListener('click', (e) => e.stopPropagation());

            link.parentElement.insertBefore(messageLink, link);
            row.setAttribute('data-sc-message-added', 'true');
        }

        const isMarketMessageIconEnabled = () => {
            try {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMessageIcon'] === true;
            } catch (e) {
                return false;
            }
        };

        const stopMessageIconWatch = () => {
            if (_messageIconObserver) {
                _messageIconObserver.disconnect();
                _messageIconObserver = null;
            }
            document.querySelectorAll('tr[data-sc-message-added]').forEach(row => {
                row.querySelectorAll('a[data-sc-market-message-icon]').forEach(a => a.remove());
                row.removeAttribute('data-sc-message-added');
            });
        };

        const startMessageIconWatch = () => {
            stopMessageIconWatch();
            if (!isMarketMessageIconEnabled()) return;

            const injectMessageIconStyles = () => {
                if (document.getElementById('sc-market-message-icon-style')) return;
                const style = document.createElement('style');
                style.id = 'sc-market-message-icon-style';
                style.textContent = `
                    a[data-sc-market-message-icon] {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: 18px !important;
                        height: 18px !important;
                        margin: 0 3px 0 0 !important;
                        color: inherit !important;
                        vertical-align: middle !important;
                        line-height: 1 !important;
                        text-decoration: none !important;
                        align-self: center !important;
                        flex: 0 0 auto !important;
                    }
                    a[data-sc-market-message-icon] svg {
                        display: block !important;
                        width: 14px !important;
                        height: 14px !important;
                        margin: 0 !important;
                    }
                `;
                document.head.appendChild(style);
            };
            injectMessageIconStyles();

            const injectRows = () => {
                if (!/\/market\/resource\/\d+/.test(location.pathname) || !isMarketMessageIconEnabled()) {
                    stopMessageIconWatch();
                    return;
                }
                const tbody = findValidTbody();
                if (tbody) tbody.querySelectorAll('tr').forEach(injectMessageIcon);
            };

            injectRows();
            _messageIconObserver = new MutationObserver(() => {
                requestAnimationFrame(injectRows);
            });
            _messageIconObserver.observe(document.body, { childList: true, subtree: true });
        };

        // 预计算共享值（同一资源页所有行共用），避免 Worker 内重复计算
        function buildSharedContext(SCD, SRC, currentResourceId) {
            const resource = parseInt(currentResourceId);
            const zn = SCD.data;
            const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;

            // 经济周期覆盖
            const economySelectEl = document.getElementById('sc-economy-select');
            const economyState = (economySelectEl && economySelectEl.value !== '')
                ? parseInt(economySelectEl.value)
                : SRC.economyState;

            // 高管加成（支持自定义覆盖）
            let skillCMO, skillCOO;
            if (isCustomEnabled) {
                const bonusKey = `R${currentRealmId}-SC-Saved-Bonuses`;
                try {
                    const SSB = JSON.parse(localStorage.getItem(bonusKey));
                    if (SSB) {
                        skillCMO = SSB.saleBonus;
                        skillCOO = SSB.adminBonus;
                    } else {
                        skillCMO = SRC.saleBonus;
                        skillCOO = SRC.adminBonus;
                    }
                } catch { skillCMO = SRC.saleBonus; skillCOO = SRC.adminBonus; }
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

            // 饱和度和按品质区分的饱和度（仅资源150=树需要）
            const list = SRC.ResourcesRetailInfo || [];
            let saturation, saturationByQuality;
            if (resource === 150) {
                saturationByQuality = {};
                for (const item of list) {
                    if (item.dbLetter === 150 && item.quality != null) {
                        saturationByQuality[item.quality] = item.saturation;
                    }
                }
                // 默认取 Q0
                saturation = saturationByQuality[0];
            } else {
                const m = list.find(item => item.dbLetter === resource);
                saturation = m?.saturation;
            }

            // 天气（仅夏季物品）
            const resourceDetail = SCD.constantsResources?.[resource];
            const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                ? SRC.sellingSpeedMultiplier : undefined;

            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = (() => {
                const r = SRC.administration || 1;
                return r - (r - 1) * skillCOO / 100;
            })();

            // MP-?% 输入框的值
            const mpInputEl = document.getElementById('sc-mp-input');
            const mpPercent = mpInputEl ? (parseFloat(mpInputEl.value) || 0) : 0;

            return {
                economyState, buildingKind, wages,
                saturation, saturationByQuality, weather,
                v, b, mpPercent
            };
        }

        async function processNewRows(tbody, forceReset = false) {
            if (forceReset) {
                tbody.querySelectorAll('tr[data-profit-calculated]').forEach(row => {
                    row.removeAttribute('data-profit-calculated');
                    row.__profitData = null;
                    const oldTd = row.querySelector('td.auto-profit-info');
                    if (oldTd) oldTd.remove();
                });
                allProfitSpans.clear();
                // 清理 pendingRows 中残留的条目（Worker 再回来时 rowId 已失效）
                pendingRows.clear();
            }

            const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
            if (!SCD_raw) return;
            const SCD = JSON.parse(SCD_raw);
            const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${currentRealmId}`));
            if (!SRC) return;

            // 扫描还未处理过的行，收集为订单数组
            const rows = Array.from(tbody.querySelectorAll('tr'))
                .filter(r => !r.hasAttribute('data-profit-calculated'));

            const orders = [];
            for (const row of rows) {
                const data = extractNumbersFromAriaLabel(row.getAttribute('aria-label'));
                if (!data) continue;

                const rowId = rowIdCounter++;
                pendingRows.set(rowId, row);
                row.setAttribute('data-profit-calculated', '1');
                orders.push({ rowId, price: data.price, quantity: data.quantity, quality: data.quality, resourceId: currentResourceId });
            }

            // 有订单才发送，避免空消息开销
            if (orders.length > 0) {
                const shared = buildSharedContext(SCD, SRC, currentResourceId);
                profitWorker.postMessage({
                    orders,
                    shared,
                    SCD,
                    SRC,
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            } else if (pendingRows.size > 0) {
                // 清理 pendingRows 中已从 DOM 脱离的行（DOM 刷新后残留）
                for (const [rid, row] of pendingRows) {
                    if (!row.isConnected) pendingRows.delete(rid);
                }
            }

            // 重算模拟结果
            updateGlobalSimulation();
        }

        // ===== 监听购买成功（market-order/take POST），自动切回"全部" =====
        (function () {
            const TAKE_URL = '/api/v2/market-order/take/';

            function onTakeSuccess() {
                if (!currentResourceId || !currentRealmId) return;
                const autoSelectEnabled = (() => {
                    try {
                        const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                        return cfg['autoSelectBestMarketRow'] === true;
                    } catch (e) { return false; }
                })();
                if (!autoSelectEnabled) return;

                // 清除当前pending状态，避免干扰
                if (_pendingAutoSelectPollTimer) { clearTimeout(_pendingAutoSelectPollTimer); _pendingAutoSelectPollTimer = null; }
                _pendingAutoSelect = null;

                // 点击quality-selection下拉菜单中的"全部"，让游戏自然刷新数据
                const qBtn = document.getElementById('quality-selection');
                if (!qBtn) return;
                const currentSpan = qBtn.querySelector('span');
                const curQ = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
                if (isNaN(curQ)) return;

                // 当前已是"全部"则不需要切换，游戏购买后会自动请求新数据
                if (curQ === '全部' || isNaN(curQ)) return;

                qBtn.click();
                setTimeout(() => {
                    const dropdownMenu = qBtn.parentElement?.querySelector('.dropdown-menu');
                    if (!dropdownMenu) return;
                    const items = dropdownMenu.querySelectorAll('li a');
                    for (const item of items) {
                        if (item.textContent?.trim() === '全部' || item.textContent?.trim() === 'All') {
                            item.click();
                            // 品质切换后游戏会自动请求新市场数据，正常流程会触发 updateGlobalSimulation
                            return;
                        }
                    }
                }, 100);
            }

            // 拦截 fetch
            const origFetch = window.fetch;
            window.fetch = async function (...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                const isTake = url.includes(TAKE_URL);
                const response = await origFetch.apply(this, args);
                if (isTake && response.ok) {
                    try {
                        const cloned = response.clone();
                        cloned.json().then(() => onTakeSuccess()).catch(() => { });
                    } catch (e) { }
                }
                return response;
            };

            // 拦截 XHR
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                if (typeof url === 'string' && url.includes(TAKE_URL) && method.toUpperCase() === 'POST') {
                    this.addEventListener('load', function () {
                        if (this.status >= 200 && this.status < 300) {
                            onTakeSuccess();
                        }
                    });
                }
                return origOpen.apply(this, arguments);
            };
        })();

        return {
            init(resourceId) {
                // ---- 清理上一次初始化的残留 ----
                // 1. 清理定时器
                clearTimeout(_autoSelectTimer);
                _autoSelectTimer = null;
                if (_pendingAutoSelectPollTimer) {
                    clearTimeout(_pendingAutoSelectPollTimer);
                    _pendingAutoSelectPollTimer = null;
                }
                _pendingAutoSelect = null;
                cleanupInputListeners();

                // 2. 断开旧的 MutationObserver（防止累积！）
                if (_globalObserver) {
                    _globalObserver.disconnect();
                    _globalObserver = null;
                }
                if (_tableObserver) {
                    _tableObserver.disconnect();
                    _tableObserver = null;
                }
                stopMessageIconWatch();

                // 3. 重置初始化标记，允许重新初始化
                _initDone = false;
                // 【修复】rowIdCounter 不清零，而是使用递增计数器避免新旧 Worker 响应冲突
                // 旧 Worker 响应到达时 pendingRows 已空会被跳过，但 ID 空间始终保持递增

                // 4. 清理 pendingRows 中残留的行引用（防止 DOM 元素无法 GC）
                pendingRows.clear();
                allProfitSpans.clear();

                // 5. 清除所有旧 form 上的 data-market-calc-initialized 标记
                // 【关键修复】防止 SPA 切换时残留属性导致新页面跳过初始化
                document.querySelectorAll('form[data-market-calc-initialized]').forEach(f => {
                    f.removeAttribute('data-market-calc-initialized');
                });

                // 6. 清除旧 summaryDisplay 避免 DOM 碎片
                if (summaryDisplay && summaryDisplay.parentNode) {
                    summaryDisplay.remove();
                }
                summaryDisplay = null;

                // ---- 新页面初始化 ----
                currentResourceId = resourceId;
                currentRealmId = null;
                const marketProfitEnabled = typeof window.isPageModuleEnabled === 'function'
                    ? window.isPageModuleEnabled('marketProfit')
                    : true;
                if (!marketProfitEnabled && !isMarketMessageIconEnabled()) return;
                startMessageIconWatch();
                if (!marketProfitEnabled) return;

                // --- 核心优化 1: 启动即判断零售属性 ---
                let currentIsRetail = false;
                const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
                if (SCD_raw) {
                    const SCD = JSON.parse(SCD_raw);
                    currentIsRetail = Object.values(SCD.data.SALES).some(l => l.includes(parseInt(currentResourceId)));
                }

                // 如果不是零售商品，直接退出，不设置任何监听，不注入任何 UI
                if (!currentIsRetail) {
                    return;
                }

                const tryInit = () => {
                    // 如果已经初始化完成，不再重复执行（优化：避免 observer 反复调用）
                    if (_initDone) return;

                    const tbody = findValidTbody();
                    const form = document.querySelector('form');

                    // 1. 基础检查
                    if (!tbody || !form) return;

                    // 2. 检测是否已初始化（其他卡片已先完成），是则跳过
                    // 【安全】不设置 _initDone，不清除 observer——因为上一个 init 已清理了残留属性
                    // 如果真的是已初始化的页面，form 不应该有该属性（已被 cleanup 移除）
                    // 如果是其他竞争条件，observer 会在后续 DOM 变化时再尝试
                    if (form.hasAttribute('data-market-calc-initialized')) {
                        return;
                    }

                    // 3. 提取 Realm ID
                    extractRealmIdOnce(tbody);

                    // 4. 插入 UI 元素 — 通过 DOM 层级向上查找容器，避免依赖固定 CSS 类名
                    const formParent = form.parentElement;
                    const container = formParent?.parentElement?.parentElement;

                    if (container && !container.querySelector('[data-custom-notice]')) {
                        // 扫货模拟面板：固定头部（提示+按钮）+ 动态结果区
                        const d7 = DM();
                        const isNarrow7 = window.innerWidth <= 576;
                        summaryDisplay = document.createElement('div');
                        // padding-left: 面板内容与左边框的间距；margin-bottom: 与下方表格的间距；border-left: 绿色标识线
                        summaryDisplay.style.cssText = `background: ${d7 ? '#222' : '#f9f9f9'}; padding: 0 0 0 ${isNarrow7 ? '6px' : '12px'}; border-radius: 4px; margin-bottom: ${isNarrow7 ? '0px' : '10px'}; border-left: ${isNarrow7 ? '3px' : '4px'} solid #4CAF50; min-height: ${isNarrow7 ? '0' : '40px'}; color: ${d7 ? '#efefef' : '#333'};`;
                        summaryDisplay.dataset.customNotice = 'true';

                        // 固定头部行
                        const infoHeader = document.createElement('div');
                        infoHeader.style.cssText = `display: flex; flex-wrap: wrap; align-items: center; gap: ${isNarrow7 ? '2px' : '8px'}; margin-bottom: ${isNarrow7 ? '0px' : '8px'}; border-bottom: 1px solid ${d7 ? '#444' : '#ddd'};`;

                        const toggleBtn = document.createElement('button');
                        toggleBtn.type = 'button';
                        toggleBtn.id = 'sc-custom-toggle-wrapper';
                        const btnBorderColor = d7 ? '#555' : '#bbb';
                        const btnFgColor = d7 ? '#aaa' : '#666';
                        toggleBtn.style.cssText = `font-size: 11px; color: ${btnFgColor}; background: none; border: 1px solid ${btnBorderColor}; border-radius: 3px; padding: 1px 6px; cursor: pointer; white-space: nowrap;`;
                        const refreshToggleUI = () => {
                            const config = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                            const isEnabled = config['executiveCustomToggle'] !== undefined ? config['executiveCustomToggle'] : false;
                            toggleBtn.textContent = `自定义：${isEnabled ? '开' : '关'}`;
                            toggleBtn.style.color = isEnabled ? '#4CAF50' : btnFgColor;
                            toggleBtn.style.borderColor = isEnabled ? '#4CAF50' : btnBorderColor;
                        };
                        refreshToggleUI();
                        toggleBtn.onclick = (e) => {
                            e.preventDefault();
                            const config = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                            config['executiveCustomToggle'] = !(config['executiveCustomToggle'] === true);
                            localStorage.setItem('SC_PageActions_Settings', JSON.stringify(config));
                            refreshToggleUI();
                            const tbody = findValidTbody();
                            if (tbody) requestAnimationFrame(() => processNewRows(tbody, true));
                        };

                        const btnSettings = document.createElement('button');
                        btnSettings.type = 'button';
                        btnSettings.textContent = "自定义数据";
                        btnSettings.style.cssText = `font-size: 11px; color: ${btnFgColor}; background: none; border: 1px solid #673ab7; border-radius: 3px; padding: 1px 6px; cursor: pointer; white-space: nowrap;`;
                        btnSettings.onclick = (e) => {
                            e.preventDefault();
                            if (typeof executiveCustomButton !== 'undefined') executiveCustomButton.show();
                        };

                        // MP-?% 输入区域：整体不可换行（标签+输入框+%号+快捷按钮）
                        // 切换商品时确保旧值不残留
                        const oldMpInput = document.getElementById('sc-mp-input');
                        if (oldMpInput) oldMpInput.value = '0';

                        const mpGroup = document.createElement('span');
                        mpGroup.style.cssText = `display: inline-flex; align-items: center; gap: 1px; white-space: nowrap;`;

                        const mpLabel = document.createElement('span');
                        mpLabel.textContent = 'MP-';
                        mpLabel.style.cssText = `font-size: 12px; font-weight: bold; color: ${d7 ? '#ffb74d' : '#e65100'};`;

                        const mpInput = document.createElement('input');
                        mpInput.id = 'sc-mp-input';
                        mpInput.type = 'number';
                        mpInput.step = '0.01';
                        mpInput.value = '0';
                        mpInput.placeholder = '?';
                        mpInput.title = '模拟扫货成本：≥0为MP-?%，负数=直接减价。改后实时重算。';
                        mpInput.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
                        mpInput.addEventListener('input', () => {
                            const currentTbody = findValidTbody();
                            if (currentTbody) {
                                clearTimeout(window._scMpInputTimer);
                                window._scMpInputTimer = setTimeout(() => {
                                    requestAnimationFrame(() => processNewRows(currentTbody, true));
                                }, 250);
                            }
                        });

                        const mpPct = document.createElement('span');
                        mpPct.textContent = '%';
                        mpPct.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'};`;

                        const mpQuickBtn = document.createElement('button');
                        mpQuickBtn.type = 'button';
                        mpQuickBtn.textContent = '4%';
                        mpQuickBtn.title = '快捷填入 MP-4%';
                        mpQuickBtn.style.cssText = `font-size: 12px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#444' : '#e0e0e0'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 5px; cursor: pointer;`;
                        mpQuickBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            mpInput.value = '4';
                            mpInput.dispatchEvent(new Event('input', { bubbles: true }));
                        });
                        const mpClearBtn = document.createElement('button');
                        mpClearBtn.type = 'button';
                        mpClearBtn.textContent = '清空';
                        mpClearBtn.title = '清空 MP 值';
                        mpClearBtn.style.cssText = `font-size: 12px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#444' : '#e0e0e0'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 5px; cursor: pointer;`;
                        mpClearBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            mpInput.value = '0';
                            mpInput.dispatchEvent(new Event('input', { bubbles: true }));
                        });

                        mpGroup.appendChild(mpLabel);
                        mpGroup.appendChild(mpInput);
                        mpGroup.appendChild(mpPct);
                        mpGroup.appendChild(mpQuickBtn);
                        mpGroup.appendChild(mpClearBtn);

                        // --- 新增：高级设置容器（经济周期 + 建筑等级/时长）---
                        const extraControls = document.createElement('span');
                        extraControls.id = 'sc-extra-controls';
                        extraControls.style.cssText = `display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;`;

                        // 周期下拉框
                        const economyLabel = document.createElement('span');
                        economyLabel.textContent = '周期:';
                        economyLabel.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'};`;
                        extraControls.appendChild(economyLabel);

                        const economySelect = document.createElement('select');
                        economySelect.id = 'sc-economy-select';
                        economySelect.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px;`;
                        economySelect.innerHTML = `
                            <option value="">当前</option>
                            <option value="0">萧条</option>
                            <option value="1">平缓</option>
                            <option value="2">景气</option>
                        `;
                        economySelect.addEventListener('change', () => {
                            const currentTbody2 = findValidTbody();
                            if (currentTbody2) {
                                requestAnimationFrame(() => processNewRows(currentTbody2, true));
                            }
                        });
                        extraControls.appendChild(economySelect);

                        // 建筑等级输入框
                        const buildingLevelInput = document.createElement('input');
                        buildingLevelInput.id = 'sc-building-level';
                        buildingLevelInput.type = 'number';
                        buildingLevelInput.min = '1';
                        buildingLevelInput.step = '1';
                        buildingLevelInput.value = localStorage.getItem('sc_building_level') || '100';
                        buildingLevelInput.title = '建筑等级';
                        buildingLevelInput.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
                        buildingLevelInput.addEventListener('input', () => {
                            const raw = parseInt(buildingLevelInput.value);
                            const v = (raw >= 1 && Number.isFinite(raw)) ? raw : 1;
                            localStorage.setItem('sc_building_level', v);
                            updateGlobalSimulation();
                        });
                        buildingLevelInput.addEventListener('change', () => {
                            const raw = parseInt(buildingLevelInput.value);
                            const v = (raw >= 1 && Number.isFinite(raw)) ? raw : 1;
                            localStorage.setItem('sc_building_level', v);
                            updateGlobalSimulation();
                        });
                        extraControls.appendChild(buildingLevelInput);

                        const bldLabel1 = document.createElement('span');
                        bldLabel1.textContent = '级建筑运行';
                        bldLabel1.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'}; white-space: nowrap;`;
                        extraControls.appendChild(bldLabel1);

                        // 建筑运行时长输入框
                        const buildingHoursInput = document.createElement('input');
                        buildingHoursInput.id = 'sc-building-hours';
                        buildingHoursInput.type = 'number';
                        buildingHoursInput.min = '0';
                        buildingHoursInput.step = '0.01';
                        buildingHoursInput.value = localStorage.getItem('sc_building_hours') || '24';
                        buildingHoursInput.title = '运行时长（小时）';
                        buildingHoursInput.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
                        buildingHoursInput.addEventListener('input', () => {
                            const raw = parseFloat(buildingHoursInput.value);
                            const v = (raw > 0 && Number.isFinite(raw)) ? Math.round(raw * 100) / 100 : 0;
                            localStorage.setItem('sc_building_hours', v);
                            updateGlobalSimulation();
                        });
                        buildingHoursInput.addEventListener('change', () => {
                            const raw = parseFloat(buildingHoursInput.value);
                            const v = (raw > 0 && Number.isFinite(raw)) ? Math.round(raw * 100) / 100 : 0;
                            localStorage.setItem('sc_building_hours', v);
                            updateGlobalSimulation();
                        });
                        extraControls.appendChild(buildingHoursInput);

                        const bldLabel2 = document.createElement('span');
                        bldLabel2.textContent = 'H';
                        bldLabel2.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'};`;
                        extraControls.appendChild(bldLabel2);

                        // --- 小屏视图切换：把基本控件包一层，与 extraControls 互斥显示 ---
                        const basicGroup = document.createElement('span');
                        basicGroup.id = 'sc-basic-group';
                        basicGroup.style.cssText = `display: inline-flex; align-items: center; gap: ${isNarrow7 ? '2px' : '8px'}; flex-wrap: wrap;`;
                        basicGroup.appendChild(toggleBtn);
                        basicGroup.appendChild(btnSettings);
                        basicGroup.appendChild(mpGroup);

                        // --- 切换按钮（仅小屏可见）---
                        const toggleExtraBtn = document.createElement('button');
                        toggleExtraBtn.type = 'button';
                        toggleExtraBtn.textContent = '⇆';
                        toggleExtraBtn.title = '切换高级设置（经济周期/建筑等级）';
                        toggleExtraBtn.style.cssText = `font-size: 12px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#444' : '#e0e0e0'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 5px; cursor: pointer; display: ${isNarrow7 ? 'inline-block' : 'none'}; flex-shrink: 0;`;

                        // 小屏默认：基本可见，高级隐藏
                        if (isNarrow7) {
                            extraControls.style.display = 'none';
                        }

                        toggleExtraBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const bg = document.getElementById('sc-basic-group');
                            const ec = document.getElementById('sc-extra-controls');
                            if (!bg || !ec) return;
                            const showingBasic = bg.style.display !== 'none';
                            if (showingBasic) {
                                bg.style.display = 'none';
                                ec.style.display = 'inline-flex';
                                toggleExtraBtn.textContent = '↩';
                                toggleExtraBtn.title = '返回基本设置';
                            } else {
                                bg.style.display = 'inline-flex';
                                ec.style.display = 'none';
                                toggleExtraBtn.textContent = '⇆';
                                toggleExtraBtn.title = '切换高级设置（经济周期/建筑等级）';
                            }
                        });

                        infoHeader.appendChild(basicGroup);
                        infoHeader.appendChild(extraControls);
                        infoHeader.appendChild(toggleExtraBtn);
                        summaryDisplay.appendChild(infoHeader);

                        // 动态结果区（由 renderUI 填充）
                        const simContent = document.createElement('div');
                        simContent.id = 'sc-sim-content';
                        simContent.innerHTML = `<div style="color:${d7 ? '#888' : '#777'};font-size:12px;text-align:center;padding:8px;">等待数据加载…</div>`;
                        summaryDisplay.appendChild(simContent);

                        container.appendChild(summaryDisplay);

                        // 小屏幕：通过窗口宽度判断，≤991px 为小屏，需要滚动到表格底部
                        if (window.innerWidth <= 991) {
                            setTimeout(() => {
                                const rows = tbody.querySelectorAll('tr');
                                const lastRow = rows[rows.length - 1];
                                if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }, 200);
                        }

                        // 标记已完成注入
                        form.setAttribute('data-market-calc-initialized', 'true');
                    }

                    // 5. 标记初始化完成（必须在 processNewRows 之前设置，避免重复调用）
                    _initDone = true;

                    // 6. 初始执行：此时确认为零售，直接处理
                    processNewRows(tbody);

                    // 7. 开启表格行监听（使用模块级变量，确保断开旧的）
                    if (_tableObserver) _tableObserver.disconnect();
                    _tableObserver = new MutationObserver(() => {
                        requestAnimationFrame(() => processNewRows(tbody));
                    });
                    _tableObserver.observe(tbody, { childList: true });

                    // 8. 初始化成功，停止全局 document 监听
                    if (_globalObserver) {
                        _globalObserver.disconnect();
                        _globalObserver = null;
                    }
                };

                // --- 核心优化 2: 仅在零售模式下启动监听 ---
                tryInit();

                // 如果 tryInit 已标记完成（初始化已存在），不再创建全局 observer
                if (!_initDone) {
                    // 使用模块级 _globalObserver，确保之前已断开
                    _globalObserver = new MutationObserver((mutations) => {
                        // 如果已经初始化完成，不再执行昂贵的 tryInit
                        if (_initDone) return;
                        for (const mutation of mutations) {
                            if (mutation.addedNodes.length) {
                                tryInit();
                                break;
                            }
                        }
                    });
                    _globalObserver.observe(document.body, { childList: true, subtree: true });
                }
            }
        };

    })();

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.ResourceMarketHandler = ResourceMarketHandler;
