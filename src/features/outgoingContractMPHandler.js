import { getRealmIdFromLink } from '../core/storage.js';
import { DM } from '../utils/ui.js';
import { registerExportInfo } from '../core/exportInfo.js';

registerExportInfo({
    name: '出库合同 MP 设置',
    scope: 'global',
    backup: true,
    keys: ['SC_OutgoingMP_Presets', 'SC_OutgoingMP_UseInput']
});

registerExportInfo({
    name: '出库合同 VWAP 缓存',
    scope: 'realm',
    match: realmId => realmId === null
        ? /(?!)/ : new RegExp(`^SC_OutgoingVWAP_Cache_${realmId}_\\d+_\\d+$`)
});

    const outgoingContractMPHandler = (function () {
        const STORAGE_KEY = 'SC_OutgoingMP_Presets';
        const USE_INPUT_KEY = 'SC_OutgoingMP_UseInput';
        const DEFAULT_PRESETS = 'MP-4%';
        let initTimer = null;
        let _activeUrl = null;
        let _generation = 0;
        let _buttonsRevision = 0;
        let _buttonsKey = '';
        let _buttonsInput = null;
        let _skipInputTimer = null;
        const _marketRequests = new Set();
        const PAGE_PATTERN = /\/headquarters\/warehouse\/[^/]+\/(?:sell|contract)\/?$/;

        function isEnabled() {
            return window.isPageModuleEnabled?.('outgoingMP') !== false;
        }

        function isActive() {
            return _activeUrl === location.href && PAGE_PATTERN.test(location.href) && isEnabled();
        }

        // VWAP 相关常量与函数
        const VWAP_CACHE_KEY = 'SC_OutgoingVWAP_Cache';
        const VWAP_CACHE_MS = 10 * 60 * 1000;

        async function getVWAPData(realmId, resourceId, quality) {
            const cacheKey = `${VWAP_CACHE_KEY}_${realmId}_${resourceId}_${quality}`;
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) { const p = JSON.parse(cached); if (Date.now() - p.t < VWAP_CACHE_MS) { mpLog('VWAP 缓存命中, 值:', p.v); return p.v; } }
            } catch (e) { /* ignore */ }
            mpLog('VWAP 缓存未命中, 发起网络请求...');
            const tStart = Date.now();
            try {
                const url = `https://api.simcotools.com/v1/realms/${realmId}/market/vwaps/${resourceId}/${quality}`;
                const vwap = await new Promise((resolve) => {
                    const controller = new AbortController();
                    _marketRequests.add(controller);
                    let request;
                    const finish = value => {
                        clearTimeout(timeout);
                        _marketRequests.delete(controller);
                        resolve(value);
                    };
                    const timeout = setTimeout(() => controller.abort(), 10000);
                    controller.signal.addEventListener('abort', () => {
                        request?.abort();
                        finish(null);
                    }, { once: true });
                    if (typeof GM_xmlhttpRequest === 'function') {
                        request = GM_xmlhttpRequest({
                            method: 'GET',
                            url: url,
                            onload: function (resp) {
                                try {
                                    const data = JSON.parse(resp.responseText);
                                    const v = typeof data === 'number' ? data
                                        : (data.vwap || data.price || data.value
                                            || (Array.isArray(data.vwaps) && data.vwaps[0]?.vwap)
                                            || (Array.isArray(data) && data[0]?.vwap));
                                    console.log('[VWAP] API返回:', { status: resp.status, raw: resp.responseText?.substring(0, 100), parsed: v });
                                    finish(typeof v === 'number' && v > 0 ? v : null);
                                } catch (e) { console.warn('[VWAP] 解析失败:', e); finish(null); }
                            },
                            onerror: function (e) { console.warn('[VWAP] GM_xmlhttpRequest 错误:', e); finish(null); },
                            ontimeout: function () { console.warn('[VWAP] 请求超时'); finish(null); },
                            onabort: function () { finish(null); },
                            timeout: 10000
                        });
                    } else {
                        fetch(url, { signal: controller.signal })
                            .then(r => r.json())
                            .then(data => {
                                const v = typeof data === 'number' ? data
                                    : (data.vwap || data.price || data.value
                                        || (Array.isArray(data.vwaps) && data.vwaps[0]?.vwap)
                                        || (Array.isArray(data) && data[0]?.vwap));
                                console.log('[VWAP] fetch返回:', v);
                                finish(typeof v === 'number' && v > 0 ? v : null);
                            })
                            .catch(e => { console.warn('[VWAP] fetch失败:', e); finish(null); });
                    }
                });
                if (vwap !== null) {
                    try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: vwap })); } catch (e) { }
                    mpLog('VWAP 网络请求完成, 耗时:', Date.now() - tStart, 'ms, 值:', vwap);
                    return vwap;
                }
                mpLog('VWAP 网络请求无有效值, 耗时:', Date.now() - tStart, 'ms');
            } catch (e) { mpLog('VWAP 请求异常:', e.message); }
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) { const p = JSON.parse(cached); return p.v; }
            } catch (e) { }
            return null;
        }

        function isUseInputEnabled() {
            return localStorage.getItem(USE_INPUT_KEY) === 'true';
        }

        function toggleUseInput() {
            const enabled = !isUseInputEnabled();
            localStorage.setItem(USE_INPUT_KEY, enabled ? 'true' : 'false');
            initButtons();
            return enabled;
        }

        function loadPresets() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored !== null) {
                return stored.replace(/，/g, ',').split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            return DEFAULT_PRESETS.split(',').map(s => s.trim());
        }

        function savePresets(presets) {
            localStorage.setItem(STORAGE_KEY, presets.join(','));
            initButtons();
        }

        function showConfigModal() {
            const currentPresets = loadPresets();
            const presetsString = currentPresets.join(', ');
            const modalId = 'outgoingmp-config-modal';
            document.getElementById(modalId)?.remove();

            const bgSum = (window.getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [])
                .map(Number).reduce((a, b) => a + b, 0);
            const isDark = bgSum < 380;
            const bg = isDark ? '#333' : '#fff';
            const fg = isDark ? '#EEE' : '#333';
            const border = isDark ? '#555' : '#ccc';
            const inputBg = isDark ? '#2C2C2C' : '#f5f5f5';
            const inputFg = isDark ? '#EEE' : '#333';
            const inputBorder = isDark ? '#666' : '#bbb';
            const codeBg = isDark ? '#444' : '#e8e8e8';
            const codeFg = isDark ? '#ffb74d' : '#c62828';
            const overlayBg = 'rgba(0,0,0,0.7)';
            const shadow = '0 5px 15px rgba(0,0,0,0.5)';
            const btnCancelBg = isDark ? '#555' : '#e0e0e0';
            const btnCancelFg = isDark ? 'white' : '#333';

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${overlayBg};z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:5vh;box-sizing:border-box;`;

            modal.innerHTML = `
                <div style="background:${bg};color:${fg};padding:0;border-radius:6px;box-shadow:${shadow};width:90%;max-width:450px;border:1px solid ${border};">
                    <div style="padding:15px;border-bottom:1px solid ${border};">
                        <h4 style="margin:0;font-size:18px;font-weight:600;">MP-?%出库价设置</h4>
                    </div>
                    <div style="padding:15px;">
                        <p style="margin-top:0;margin-bottom:15px;font-size:14px;line-height:1.6;">
                            使用<strong style="color:#FF8888;">逗号（, 或 ，）</strong>分隔。使用MP±%或者VWAP±%。支持：<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP-4%</code> → MP -4%<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP+5%</code> → MP +5%<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP-10</code> → MP -$10<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP+6</code> → MP +$6<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">VWAP-4%</code> → VWAP -4%<br>
                            VWAP来自simcotools.com。字母不区分大小写，半角全角均可。
                        </p>
                        <textarea id="outgoingmp-config-input"
                            style="width:100%;height:80px;margin-bottom:12px;padding:8px;border:1px solid ${inputBorder};border-radius:4px;box-sizing:border-box;font-size:14px;color:${inputFg};background:${inputBg};resize:vertical;"></textarea>
                        <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:13px;color:${fg};">根据输入框已有价格计算：</span>
                            <button id="outgoingmp-useinput-toggle" type="button" style="padding:4px 12px;border:1px solid ${inputBorder};border-radius:4px;cursor:pointer;font-size:13px;background:${inputBg};color:${inputFg};"></button>
                            <span style="font-size:11px;color:${isDark ? '#aaa' : '#888'};">开启后，若输入框已填价格，则按钮将以输入框内已填价格（而非市场最低价）为基础计算</span>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:10px;">
                            <button id="outgoingmp-config-cancel" style="background-color:${btnCancelBg};color:${btnCancelFg};border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;">取消</button>
                            <button id="outgoingmp-config-save" style="background-color:#5cb85c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;">保存</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const inputEl = document.getElementById('outgoingmp-config-input');
            inputEl.value = presetsString;

            // ✎ 基于输入框已有价格开关
            const useInputToggle = document.getElementById('outgoingmp-useinput-toggle');
            const updateToggleBtn = () => {
                const on = isUseInputEnabled();
                useInputToggle.textContent = on ? '✎ 开' : '✎ 关';
                useInputToggle.style.color = on ? '#4CAF50' : '';
            };
            updateToggleBtn();
            useInputToggle.addEventListener('click', () => {
                toggleUseInput();
                updateToggleBtn();
            });

            document.getElementById('outgoingmp-config-cancel').addEventListener('click', () => modal.remove());
            document.getElementById('outgoingmp-config-save').addEventListener('click', () => {
                const newString = inputEl.value.replace(/，/g, ',');
                const newPresets = newString.split(',').map(s => s.trim()).filter(s => s.length > 0);
                savePresets(newPresets);
                modal.remove();
            });
        }

        // 从当前表单沿 React Fiber 向上读取，不依赖语言、样式哈希或压缩后的组件名。
        // Fiber 的 alternate 可能是上一轮渲染，必须核对所属根的 current。
        function getCurrentFiber(element) {
            const key = Object.keys(element).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            let fiber = key ? element[key] : null;
            if (!fiber) return null;
            let root = fiber;
            while (root.return) root = root.return;
            if (root.stateNode?.current && root.stateNode.current !== root) {
                fiber = fiber.alternate;
                if (!fiber) return null;
                root = fiber;
                while (root.return) root = root.return;
                if (root.stateNode?.current !== root) return null;
            }
            return fiber;
        }

        function validResource(resource) {
            return resource && resource.id != null &&
                Number.isInteger(resource.kind) && resource.kind > 0 &&
                Number.isInteger(resource.quality) && resource.quality >= 0;
        }

        function readFormContext() {
            const priceInput = document.querySelector('input[name="price"]');
            const form = priceInput?.closest('form');
            if (!form) return null; // 挑战领域回购没有价格输入框。
            const qtyInput = form.querySelector('input[name="amount"], input[name="quantity"]');
            if (!qtyInput) return null;
            let props = null;
            let store = null;
            for (let node = getCurrentFiber(priceInput); node; node = node.return) {
                const candidate = node.memoizedProps;
                if (!props && validResource(candidate?.resource) &&
                    Number.isFinite(candidate.transportation)) props = candidate;
                const candidateStore = candidate?.store || candidate?.value?.store;
                if (!store && typeof candidateStore?.getState === 'function') store = candidateStore;
            }
            if (!props) return null;
            let state = null;
            try { state = store?.getState(); } catch (e) { /* 等待下次读取 */ }
            const realmId = state?.user?.authCompany?.realmId ?? getRealmIdFromLink();
            if (realmId !== 0 && realmId !== 1) return null;
            const stock = state?.warehouse?.resources;
            // 有当前仓库状态时只使用同一库存 ID，不能误取同品质的另一批或旧缓存。
            const resource = Array.isArray(stock)
                ? stock.find(entry => String(entry.id) === String(props.resource.id) &&
                    entry.kind === props.resource.kind && entry.quality === props.resource.quality)
                : props.resource;
            if (!validResource(resource)) return null;
            return { priceInput, qtyInput, form, props, resource, stock, realmId };
        }

        function getContextKey(context) {
            return context ? `${context.realmId}_${context.resource.id}_${context.resource.kind}_${context.resource.quality}` : '';
        }

        function sumCost(resource) {
            if (!resource.cost || typeof resource.cost !== 'object' || Array.isArray(resource.cost)) return null;
            const values = Object.values(resource.cost);
            if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) return null;
            const total = values.reduce((sum, value) => sum + value, 0);
            return Number.isFinite(total) ? total : null;
        }

        // 游戏 bi()：按 4 分钟步长计算衰减，最后向下取整库存数量。
        function getRemainingAmount(resource, constants, now) {
            if (!Number.isFinite(resource.amount) || resource.amount <= 0) return null;
            const decay = constants?.[resource.kind]?.decay;
            if (!Number.isFinite(decay) || decay < 0 || decay >= 1) return null;
            if (decay === 0) return resource.amount;
            const time = Date.parse(resource.datetime);
            if (!Number.isFinite(time)) return null;
            const hours = Math.round(Math.abs(now - time) / 60000 / 4) * 4 / 60;
            return Math.floor(resource.amount * Math.pow(1 - decay, hours));
        }

        function getProductUnitCost(context, constants, now) {
            const total = sumCost(context.resource);
            if (total === null || !Number.isFinite(context.resource.amount) || context.resource.amount <= 0) return null;
            const amount = getRemainingAmount(context.resource, constants, now);
            if (amount !== null) return amount > 0 ? total / amount : null;
            // 普通出售表单已提供游戏计算的单位成本（不是界面上保留三位后的文本）。
            const nativeCost = context.props.unitSourceCost;
            return context.resource === context.props.resource && Number.isFinite(nativeCost) && nativeCost >= 0
                ? nativeCost : null;
        }

        function getTransportUnitCost(context) {
            if (Array.isArray(context.stock)) {
                const entries = context.stock.filter(e => e.kind === 13 && !e.blocked && e.amount > 0);
                if (!entries.length) return null;
                let total = 0, amount = 0;
                for (const entry of entries) {
                    const cost = sumCost(entry);
                    if (cost === null || !Number.isFinite(entry.amount)) return null;
                    total += cost;
                    amount += entry.amount;
                }
                return Number.isFinite(total) && Number.isFinite(amount) && amount > 0 ? total / amount : null;
            }
            const nativeCost = context.props.transportationUnitPrice;
            return Number.isFinite(nativeCost) && nativeCost >= 0 ? nativeCost : null;
        }
        // 同步读取缓存（无论新旧，立即返回）。无缓存返回 null
        function getCachedMarketData(realmId, resourceId) {
            const keys = [`market_all_${realmId}_${resourceId}`, `market_${realmId}_${resourceId}`];
            let bestData = null, bestTs = 0;
            for (const key of keys) {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                try {
                    const parsed = JSON.parse(raw);
                    const ts = parsed.timestamp || 0;
                    if (ts > bestTs) {
                        const arr = Array.isArray(parsed) ? parsed : parsed.data;
                        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0].quality === 'number') {
                            bestData = arr;
                            bestTs = ts;
                        }
                    }
                } catch (e) { }
            }
            mpLog('getCachedMarketData 结果:', bestData ? `ts=${bestTs} age=${Date.now() - bestTs}ms rows=${bestData.length}` : 'null');
            return { data: bestData, ts: bestTs }; // 返回数据和时间戳
        }

        // 后台刷新市场数据（网络请求，不阻塞调用方）
        async function refreshMarketData(realmId, resourceId) {
            mpLog('refreshMarketData 开始请求...');
            const tStart = Date.now();
            const controller = new AbortController();
            _marketRequests.add(controller);
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
                const resp = await fetch(url, window.__SC_Network.getRequestOptions(url, { signal: controller.signal }));
                const json = await resp.json();
                mpLog('refreshMarketData 完成, 耗时:', Date.now() - tStart, 'ms, 状态:', resp.status, '条数:', Array.isArray(json) ? json.length : '非数组');
                if (Array.isArray(json)) {
                    localStorage.setItem(`market_all_${realmId}_${resourceId}`, JSON.stringify({ timestamp: Date.now(), data: json }));
                    return json;
                }
            } catch (e) {
                mpLog('refreshMarketData 失败:', e.message);
            } finally {
                clearTimeout(timeout);
                _marketRequests.delete(controller);
            }
            return null;
        }

        // 找最低市场价：150只匹配同品质，其它可匹配 ≥ 品质
        function findLowestMP(marketData, resourceId, targetQuality) {
            const exactOnly = resourceId === 150;
            let bestPrice = Infinity, bestQuality = null;
            for (const entry of marketData) {
                const p = parseFloat(entry.price);
                const q = entry.quality;
                if (p <= 0) continue;
                if (exactOnly && q !== targetQuality) continue;
                if (!exactOnly && q < targetQuality) continue;
                if (p < bestPrice) { bestPrice = p; bestQuality = q; }
            }
            return bestPrice !== Infinity ? { price: bestPrice, quality: bestQuality } : null;
        }

        // 检查目标品质本身是否有挂单（不跨品质），返回最低价或 null
        function findExactQualityPrice(marketData, targetQuality) {
            let bestPrice = Infinity;
            for (const entry of marketData) {
                const p = parseFloat(entry.price);
                if (p > 0 && entry.quality === targetQuality && p < bestPrice) {
                    bestPrice = p;
                }
            }
            return bestPrice !== Infinity ? bestPrice : null;
        }

        // 解析预设值为目标价格（支持MP-和VWAP-前缀，不区分大小写）
        function calcTargetPrice(mpPrice, preset) {
            const s = preset.trim().toLowerCase();
            let m = s.match(/^(?:mp|vwap)\s*([+-])\s*([\d.]+)\s*%$/);
            if (m) {
                const pct = parseFloat(m[2]) / 100;
                return m[1] === '-' ? mpPrice * (1 - pct) : mpPrice * (1 + pct);
            }
            m = s.match(/^(?:mp|vwap)\s*-\s*([\d.]+)$/);
            if (m && !s.includes('%')) return mpPrice - parseFloat(m[1]);
            m = s.match(/^(?:mp|vwap)\s*\+\s*([\d.]+)$/);
            if (m && !s.includes('%')) return mpPrice + parseFloat(m[1]);
            m = s.match(/^([\d.]+)$/);
            if (m) return parseFloat(m[1]);
            return null;
        }

        // 价格步长规则（仅 sell 页面使用）: [threshold, step]
        const SELL_STEPS = [
            [20000, 500], [10000, 100], [5000, 25], [1000, 10],
            [500, 5], [200, 2], [100, 1], [50, 0.5],
            [20, 0.25], [5, 0.1], [2, 0.05], [1, 0.01],
            [0.5, 0.005], [0, 0.001]
        ];

        function roundToStep(price, isContract) {
            if (isContract) return Math.round(price * 1000) / 1000; // 合同始终精确到3位小数
            for (const [threshold, step] of SELL_STEPS) {
                if (price >= threshold) {
                    if (step >= 1) {
                        return Math.round(price / step) * step;
                    } else {
                        // step < 1: 用整数乘除避免浮点精度问题
                        const mult = Math.round(1 / step);
                        return Math.round(price * mult) / mult;
                    }
                }
            }
            return Math.round(price * 1000) / 1000;
        }

        function getSellStep(price) {
            for (const [threshold, step] of SELL_STEPS) {
                if (price >= threshold) return step;
            }
            return 0.001;
        }

        let _skipInputRefresh = false;
        function setInputValue(input, value, count = 3) {
            _skipInputRefresh = true;
            const lastValue = input.value;
            input.value = value;
            const event = new Event('input', { bubbles: true });
            event.simulated = true;
            if (input._valueTracker) input._valueTracker.setValue(lastValue);
            input.dispatchEvent(event);
            clearTimeout(_skipInputTimer);
            _skipInputTimer = setTimeout(() => { _skipInputRefresh = false; }, 100);
            if (count > 0) return setInputValue(input, value, --count);
        }

        // === DEBUG 日志辅助 ===
        const MP_DEBUG = false;
        function mpLog(...args) { if (MP_DEBUG) console.log('[MP-DEBUG]', Date.now(), '|', ...args); }

        async function initButtons() {
            mpLog('initButtons 开始');
            if (!isActive()) return;
            const context = readFormContext();
            if (!context) return;
            const { priceInput, realmId, resource } = context;
            const resourceId = resource.kind;
            const quality = resource.quality;
            const targetKey = getContextKey(context);
            const generation = _generation;
            const revision = ++_buttonsRevision;
            const isCurrent = () => {
                if (!isActive() || generation !== _generation || revision !== _buttonsRevision ||
                    !priceInput.isConnected || !btnRow.isConnected) return false;
                const current = readFormContext();
                return current?.priceInput === priceInput && getContextKey(current) === targetKey;
            };
            _buttonsKey = getButtonsKey(context);
            _buttonsInput = priceInput;
            // === 第一步：同步清理 ===
            document.querySelectorAll('.outgoingmp-btn-row').forEach(r => r.remove());
            document.querySelectorAll('.outgoingmp-info').forEach(e => e.remove());
            const prevParent = document.querySelector('[data-outgoing-mp-added]');
            if (prevParent) delete prevParent.dataset.outgoingMpAdded;

            mpLog('initButtons resourceId:', resourceId, 'realmId:', realmId);

            const parentDiv = priceInput.parentElement;
            if (!parentDiv || parentDiv.dataset.outgoingMpAdded) { mpLog('initButtons 退出: 已注入或无parentDiv'); return; }
            parentDiv.dataset.outgoingMpAdded = 'true';

            const isContract = /\/contract\/?$/.test(location.href);
            mpLog('isContract:', isContract);
            const allBtn = parentDiv.parentElement?.querySelector('button.btn-secondary');
            const btnClass = allBtn ? allBtn.className : 'btn btn-secondary';

            // === 第二步：按钮行容器立即插入 DOM ===
            const btnRow = document.createElement('div');
            btnRow.className = 'outgoingmp-btn-row';
            btnRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:5px;';

            if (isContract) {
                const configBtn = document.createElement('button');
                configBtn.type = 'button';
                configBtn.className = btnClass;
                configBtn.textContent = '+';
                configBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); showConfigModal(); };
                btnRow.appendChild(configBtn);
            }

            // 占位信息（按钮行已可见）
            const infoSpan = document.createElement('span');
            infoSpan.className = 'outgoingmp-info';
            infoSpan.style.cssText = `font-size:11px;color:${DM() ? '#aaa' : '#666'};white-space:nowrap;margin-left:4px;`;
            infoSpan.textContent = '⌛ 加载中...';
            btnRow.appendChild(infoSpan);
            parentDiv.appendChild(btnRow);
            mpLog('按钮行已插入DOM');

            // 品质来自当前表单所选库存，Q0 是有效值，缺失值不进入此路径。

            // Phase 1: 读缓存（同步）
            mpLog('读取缓存...');
            const cacheResult = getCachedMarketData(realmId, resourceId);
            const cachedData = cacheResult.data;
            const cacheAge = cacheResult.ts ? Date.now() - cacheResult.ts : Infinity;
            mpLog('缓存结果:', cachedData ? `有数据(${cachedData.length}条) age=${cacheAge}ms` : '无缓存');
            const cachedMpInfo = cachedData ? findLowestMP(cachedData, resourceId, quality) : null;
            mpLog('缓存最低价:', JSON.stringify(cachedMpInfo));

            if (cachedMpInfo) {
                if (cachedMpInfo.quality !== quality) {
                    // 最便宜的在更高品质，但目标品质本身可能有货也可能无货
                    const exactPrice = findExactQualityPrice(cachedData, quality);
                    if (exactPrice !== null) {
                        infoSpan.textContent = `Q${quality}有 $${exactPrice}·参考Q${cachedMpInfo.quality} $${cachedMpInfo.price}`;
                    } else {
                        infoSpan.textContent = `Q${quality}无货·参考Q${cachedMpInfo.quality} $${cachedMpInfo.price}`;
                    }
                } else {
                    infoSpan.textContent = `Q${cachedMpInfo.quality}最低 $${cachedMpInfo.price}`;
                }
            } else if (cachedData) {
                // 有市场数据但无匹配品质
                let foundHigher = null;
                for (let q = quality + 1; q <= 12; q++) {
                    const hi = findLowestMP(cachedData, resourceId, q);
                    if (hi) { foundHigher = hi; break; }
                }
                if (foundHigher) {
                    infoSpan.textContent = `Q${quality}无货·参考Q${foundHigher.quality} $${foundHigher.price}`;
                } else {
                    infoSpan.textContent = quality === 0 ? '无市场数据' : `无≥Q${quality}`;
                }
            } else {
                infoSpan.textContent = '⌛ 请求市场数据...';
            }

            // 用缓存数据先渲染按钮（如有）
            const renderButtons = (marketData, mpBasePrice, source) => {
                if (!isCurrent()) return;
                mpLog('renderButtons 调用, source:', source, 'mpBasePrice:', mpBasePrice, 'data:', marketData ? `${marketData.length}条` : 'null');
                // 清除之前可能存在的 MP 按钮（保留 config 按钮和 infoSpan）
                btnRow.querySelectorAll('.outgoingmp-mpbtn').forEach(b => b.remove());

                const currentVal2 = parseFloat(priceInput.value);
                const useInput2 = isUseInputEnabled() && currentVal2 > 0;

                if (isUseInputEnabled() && !(currentVal2 > 0) && mpBasePrice > 0) {
                    infoSpan.textContent = (infoSpan.textContent || '') + '（已用市场价）';
                }

                const createPresetBtn = (basePrice, presets, labelMap) => {
                    if (basePrice <= 0) return;
                    presets.slice().reverse().forEach(preset => {
                        const rawTarget = calcTargetPrice(basePrice, preset);
                        if (rawTarget === null) return;
                        const rounded = Math.round(rawTarget * 1000) / 1000;
                        const btn = document.createElement('button');
                        btn.type = 'button'; btn.className = btnClass + ' outgoingmp-mpbtn';
                        btn.textContent = labelMap ? labelMap(preset) : preset;
                        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (isCurrent()) setInputValue(priceInput, rounded); };
                        btnRow.appendChild(btn);
                    });
                };

                if (isContract) {
                    if (!useInput2) {
                        const presets = loadPresets();
                        const mpPresets = presets.filter(p => !/^vwap/i.test(p.trim()));
                        if (mpPresets.length > 0) {
                            createPresetBtn(mpBasePrice, mpPresets, null);
                        }
                    } else {
                        const mpPresets = loadPresets().filter(p => !/^vwap/i.test(p.trim()));
                        createPresetBtn(currentVal2, mpPresets, null);
                    }
                } else {
                    if (mpBasePrice > 0) {
                        const step = getSellStep(mpBasePrice);
                        const mpRounded = roundToStep(mpBasePrice, false);
                        const btnMP = document.createElement('button');
                        btnMP.type = 'button'; btnMP.className = btnClass + ' outgoingmp-mpbtn';
                        btnMP.textContent = `市场价 $${mpRounded}`;
                        btnMP.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (isCurrent()) setInputValue(priceInput, mpRounded); };
                        btnRow.appendChild(btnMP);
                        const oneDown = roundToStep(mpBasePrice - step, false);
                        if (oneDown > 0 && Math.abs(oneDown - mpRounded) > 1e-9) {
                            const btn1s = document.createElement('button');
                            btn1s.type = 'button'; btn1s.className = btnClass + ' outgoingmp-mpbtn';
                            btn1s.textContent = `压价 $${oneDown}`;
                            btn1s.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (isCurrent()) setInputValue(priceInput, oneDown); };
                            btnRow.appendChild(btn1s);
                        }
                    }
                }
            };

            // 用缓存数据先渲染（如果有）
            if (cachedMpInfo || cachedData) {
                renderButtons(cachedData, cachedMpInfo ? cachedMpInfo.price : 0, '缓存');
            }

            // Phase 2: 缓存过期(>1分钟)则后台刷新一次，不阻塞按钮
            const CACHE_MAX_AGE = 60000;
            if (!cachedData) {
                mpLog('无缓存, 请求网络...');
                const tStart = Date.now();
                const freshData = await refreshMarketData(realmId, resourceId);
                if (!isCurrent()) return;
                mpLog('网络请求完成, 耗时:', Date.now() - tStart, 'ms, 结果:', freshData ? `${freshData.length}条` : 'null');
                const freshMpInfo = freshData ? findLowestMP(freshData, resourceId, quality) : null;
                if (freshMpInfo) {
                    if (freshMpInfo.quality !== quality) {
                        const exactPrice = findExactQualityPrice(freshData, quality);
                        if (exactPrice !== null) {
                            infoSpan.textContent = `Q${quality}有 $${exactPrice}·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                        } else {
                            infoSpan.textContent = `Q${quality}无货·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                        }
                    } else {
                        infoSpan.textContent = `Q${freshMpInfo.quality}最低 $${freshMpInfo.price}`;
                    }
                } else {
                    infoSpan.textContent = '无市场数据';
                }
                renderButtons(freshData, freshMpInfo ? freshMpInfo.price : 0, '网络');
            } else {
                mpLog('有缓存(age=' + cacheAge + 'ms)', cacheAge > CACHE_MAX_AGE ? '过期,后台刷新' : '有效,不刷新');
                // 过期则提示并后台刷新一次（不阻塞当前按钮）
                if (cacheAge > CACHE_MAX_AGE) {
                    infoSpan.textContent = (infoSpan.textContent || '') + ' ⌛更新中...';
                    refreshMarketData(realmId, resourceId).then(freshData => {
                        if (!isCurrent()) return;
                        if (freshData) {
                            const freshMpInfo = findLowestMP(freshData, resourceId, quality);
                            if (freshMpInfo) {
                                if (freshMpInfo.quality !== quality) {
                                    const exactPrice = findExactQualityPrice(freshData, quality);
                                    if (exactPrice !== null) {
                                        infoSpan.textContent = `Q${quality}有 $${exactPrice}·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                                    } else {
                                        infoSpan.textContent = `Q${quality}无货·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                                    }
                                } else {
                                    infoSpan.textContent = `Q${freshMpInfo.quality}最低 $${freshMpInfo.price}`;
                                }
                            }
                            renderButtons(freshData, freshMpInfo ? freshMpInfo.price : 0, '后台刷新');
                        }
                    }).catch(() => { });
                }
            }

            // === 第五步：仅当预设中有VWAP时才获取VWAP ===
            if (isContract) {
                const presets = loadPresets();
                const hasVWAPPreset = presets.some(p => /^vwap/i.test(p.trim()));
                if (hasVWAPPreset) {
                    mpLog('启动 VWAP 获取...');
                    getVWAPData(realmId, resourceId, quality).then(vwap => {
                        if (!isCurrent()) return;
                        mpLog('VWAP 结果:', vwap);
                        if (vwap !== null && vwap > 0) {
                            // 追加 VWAP 提示
                            infoSpan.textContent = (infoSpan.textContent || '') + ` | VWAP $${vwap.toFixed(2)}`;
                            // 追加 VWAP 预设按钮
                            if (presets.length > 0) {
                                const seenLabels = new Set();
                                presets.slice().reverse().forEach(preset => {
                                    const rawTarget = calcTargetPrice(vwap, preset);
                                    if (rawTarget === null) return;
                                    const label = preset.replace(/^mp/i, 'VWAP');
                                    if (seenLabels.has(label)) return;
                                    seenLabels.add(label);
                                    const rounded = Math.round(rawTarget * 1000) / 1000;
                                    const btn = document.createElement('button');
                                    btn.type = 'button'; btn.className = btnClass;
                                    btn.textContent = label;
                                    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (isCurrent()) setInputValue(priceInput, rounded); };
                                    btnRow.appendChild(btn);
                                });
                            }
                            mpLog('VWAP 按钮追加完成');
                        }
                    }).catch(e => { mpLog('VWAP 错误:', e); });
                } else {
                    mpLog('预设中无VWAP, 跳过');
                }
            }
            mpLog('initButtons 完成');
        }

        // ===== 运输利润计算 & 展示 =====
        let _profitObserver = null;
        let _profitCalcTimer = null;
        let _profitDetailExpanded = false;
        let _lastProfitKey = '';
        let _assumedTransportPrice = '';
        let _assumedTransportRealm = null;

        function getButtonsKey(context) {
            const inputPrice = isUseInputEnabled() ? context.priceInput.value : '';
            return `${getContextKey(context)}_${inputPrice}_${isUseInputEnabled()}`;
        }

        function removeButtons() {
            ++_buttonsRevision;
            _buttonsKey = '';
            _buttonsInput = null;
            document.querySelectorAll('.outgoingmp-btn-row, .outgoingmp-info').forEach(e => e.remove());
            document.querySelectorAll('[data-outgoing-mp-added]').forEach(e => delete e.dataset.outgoingMpAdded);
        }

        function refreshPage() {
            if (!isActive()) { destroy(); return; }
            const context = readFormContext();
            if (!context) {
                if (_buttonsInput) removeButtons();
            } else if (!_skipInputRefresh && (_buttonsInput !== context.priceInput ||
                _buttonsKey !== getButtonsKey(context) || !context.priceInput.parentElement.querySelector('.outgoingmp-btn-row'))) {
                initButtons();
            }
            calcAndDisplayProfit(context);
        }

        function scheduleRefresh() {
            clearTimeout(_profitCalcTimer);
            _profitCalcTimer = setTimeout(refreshPage, 200);
        }

        function handleInput(event) {
            if (event.target.id === 'sc-profit-transport-price') {
                _assumedTransportPrice = event.target.value;
                scheduleRefresh();
                return;
            }
            if (!event.target.matches?.('input[name="price"], input[name="amount"], input[name="quantity"]')) return;
            // 快捷按钮写入价格只刷新利润，避免按新价格重复生成一轮折扣按钮。
            const context = _skipInputRefresh ? readFormContext() : null;
            if (context) _buttonsKey = getButtonsKey(context);
            scheduleRefresh();
        }

        function setProfitHelpOpen(help, open) {
            help.classList.toggle('sc-profit-help-open', open);
            help.querySelector('button').setAttribute('aria-expanded', String(open));
        }

        function handleProfitHelpDismiss(event) {
            const help = document.querySelector('.sc-profit-help-open');
            if (!help) return;
            if (event.type === 'keydown') {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
            } else if (help.contains(event.target)) return;
            help.classList.remove('sc-profit-help-pinned');
            setProfitHelpOpen(help, false);
        }

        function bindProfitHelp(display) {
            const help = display.querySelector('.sc-profit-help');
            if (!help) return;
            const button = help.querySelector('button');
            button.addEventListener('mouseenter', () => setProfitHelpOpen(help, true));
            button.addEventListener('focus', () => setProfitHelpOpen(help, true));
            const hideUnpinned = () => {
                if (!help.classList.contains('sc-profit-help-pinned')) setProfitHelpOpen(help, false);
            };
            help.addEventListener('mouseleave', hideUnpinned);
            button.addEventListener('blur', hideUnpinned);
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const pinned = help.classList.toggle('sc-profit-help-pinned');
                setProfitHelpOpen(help, pinned);
            });
        }

        function startProfitObserver() {
            _profitObserver = new MutationObserver(mutations => {
                const isOwnNode = node => node.nodeType === 1 &&
                    (node.matches('.sc-profit-display, .outgoingmp-btn-row, .outgoingmp-info') ||
                    node.closest('.sc-profit-display, .outgoingmp-btn-row, .outgoingmp-info'));
                const relevant = mutations.some(m => {
                    const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
                    if (target && isOwnNode(target)) return false;
                    return m.type === 'characterData' ||
                        [...m.addedNodes, ...m.removedNodes].some(node => !isOwnNode(node));
                });
                if (relevant) scheduleRefresh();
            });
            _profitObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
            document.addEventListener('input', handleInput);
            document.addEventListener('pointerdown', handleProfitHelpDismiss);
            document.addEventListener('keydown', handleProfitHelpDismiss);
            // 同页切库存、仓库状态更新及衰减可能不改变输入框；只在数值改变时更新 UI。
            initTimer = setInterval(refreshPage, 1000);
            refreshPage();
        }

        function showProfitUnavailable(priceInput, message) {
            _lastProfitKey = '';
            let display = document.querySelector('.sc-profit-display');
            if (display?.dataset.state === 'unavailable' && display.textContent === message) return;
            if (display && display.dataset.state !== 'unavailable') {
                _profitDetailExpanded = display.dataset.expanded === 'true';
            }
            display?.remove();
            if (!priceInput) return;
            display = document.createElement('div');
            display.className = 'sc-profit-display';
            display.dataset.state = 'unavailable';
            display.setAttribute('role', 'status');
            display.style.cssText = 'margin:8px 0;padding:8px 10px;font-size:13px;line-height:1.6;';
            display.textContent = message;
            priceInput.closest('.row')?.after(display);
        }

        function updateTransportEstimate(display, context, mode, message, dark) {
            let editor = display.querySelector('.sc-profit-transport-estimate');
            if (mode === 'actual') { editor?.remove(); return; }
            if (!editor) {
                editor = document.createElement('div');
                editor.className = 'sc-profit-transport-estimate';
                editor.style.cssText = 'margin-top:6px;font-size:12px;line-height:1.5;';
                const status = document.createElement('div');
                status.className = 'sc-profit-transport-status';
                status.id = 'sc-profit-transport-status';
                status.setAttribute('role', 'status');
                editor.appendChild(status);
                const label = document.createElement('label');
                label.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:5px;font-weight:normal;';
                label.htmlFor = 'sc-profit-transport-price';
                label.appendChild(document.createTextNode('假定运输单价 $/单位'));
                const input = document.createElement('input');
                input.id = 'sc-profit-transport-price';
                // 不参与原生表单的数值约束校验，错误的假定值不能阻止游戏交单。
                input.type = 'text';
                input.inputMode = 'decimal';
                input.placeholder = '留空则不扣运输费';
                input.setAttribute('aria-describedby', status.id);
                input.className = context.priceInput.className;
                input.style.cssText = `width:170px;max-width:100%;height:auto;padding:4px 6px;font-size:12px;box-sizing:border-box;background:${dark ? '#263326' : '#fff'};color:${dark ? '#eee' : '#333'};border:1px solid ${dark ? '#647064' : '#a4b6a4'};border-radius:4px;`;
                input.addEventListener('keydown', event => {
                    // 假定价格仅用于估算，回车不能触发原生出售/发送合同。
                    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
                });
                label.appendChild(input);
                editor.appendChild(label);
                display.querySelector('#sc-profit-summary').after(editor);
            }
            editor.querySelector('.sc-profit-transport-status').textContent = message;
            const input = editor.querySelector('input');
            // 增量更新不重建输入框，也不改写正在输入的内容或抢走焦点。
            if (input.value !== _assumedTransportPrice) input.value = _assumedTransportPrice;
            input.setAttribute('aria-invalid', _assumedTransportPrice.trim() !== '' &&
                (!Number.isFinite(Number(_assumedTransportPrice)) || Number(_assumedTransportPrice) < 0) ? 'true' : 'false');
        }

        function calcAndDisplayProfit(context) {
            if (!isActive()) return;
            const priceInput = context?.priceInput || document.querySelector('input[name="price"]');
            const qtyInput = priceInput?.closest('form')?.querySelector('input[name="amount"], input[name="quantity"]');
            const price = Number(priceInput?.value);
            const quantity = Number(qtyInput?.value);
            if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) {
                const display = document.querySelector('.sc-profit-display');
                if (display && display.dataset.state !== 'unavailable') _profitDetailExpanded = display.dataset.expanded === 'true';
                display?.remove();
                _lastProfitKey = '';
                return;
            }
            if (!context) {
                showProfitUnavailable(priceInput, '无法读取当前库存，暂不能计算利润；数据就绪后自动重试。');
                return;
            }
            const isContract = /\/contract\/?$/.test(location.href);
            let constants = null;
            try { constants = JSON.parse(localStorage.getItem('SimcompaniesConstantsData'))?.constantsResources; } catch (e) { /* 交由成本校验 */ }
            if (_assumedTransportRealm !== context.realmId) {
                _assumedTransportRealm = context.realmId;
                _assumedTransportPrice = '';
            }
            const perUnitTransport = context.props.transportation;
            const productUnitCost = getProductUnitCost(context, constants, Date.now());
            let transportUnitCost = perUnitTransport === 0 ? 0 : getTransportUnitCost(context);
            if (productUnitCost === null || !Number.isFinite(productUnitCost)) {
                showProfitUnavailable(priceInput, '无法读取商品成本，暂不能计算利润；数据就绪后自动重试。');
                return;
            }
            if (!Number.isFinite(perUnitTransport) || perUnitTransport < 0) {
                showProfitUnavailable(priceInput, '无法读取商品的运输需求，暂不能计算利润；数据就绪后自动重试。');
                return;
            }
            let transportMode = 'actual';
            let transportMessage = '';
            if (transportUnitCost === null) {
                const noStock = Array.isArray(context.stock) && !context.stock.some(e => e.kind === 13 && !e.blocked && e.amount > 0);
                const reason = noStock ? '库存无可用运输单位' : '暂时无法读取运输库存成本';
                const assumedPrice = Number(_assumedTransportPrice);
                if (_assumedTransportPrice.trim() !== '' && Number.isFinite(assumedPrice) && assumedPrice >= 0) {
                    transportUnitCost = assumedPrice;
                    transportMode = 'assumed';
                    transportMessage = `${reason}，当前按假定单价估算运输费用。`;
                } else {
                    transportMode = 'excluded';
                    transportMessage = `${reason}，以下利润未扣运输费。` +
                        (_assumedTransportPrice.trim() === '' ? '填写假定运输单价后可计入估算。' : '假定运输单价须为不小于 0 的有效数字。');
                }
            }
            const profitSuffix = transportMode === 'excluded' ? '利润（未扣运输费）' : '利润';
            const profitKey = JSON.stringify([getContextKey(context), isContract, price, quantity,
                productUnitCost, transportUnitCost, perUnitTransport, transportMode, transportMessage,
                _assumedTransportPrice, DM(), window.innerWidth <= 576]);
            const previous = document.querySelector('.sc-profit-display');
            if (previous && (previous.dataset.state === 'unavailable' || previous.closest('form') !== context.form)) previous.remove();
            if (profitKey === _lastProfitKey && previous?.isConnected) return;

            // 运输是实际消耗的整单位，金额计算保持未取整口径。
            const contractExactTransport = perUnitTransport * quantity * 0.5;
            const contractTransportTotal = Math.ceil(contractExactTransport);
            const sellExactTransport = perUnitTransport * quantity;
            const sellTransportTotal = Math.ceil(sellExactTransport);

            const revenue = price * quantity;
            const productCost = productUnitCost * quantity;
            const contractTransportCost = transportUnitCost === null ? null : contractTransportTotal * transportUnitCost;
            const sellTransportCost = transportUnitCost === null ? null : sellTransportTotal * transportUnitCost;
            // 没有成本时展示明确标注的「未扣运输费」小计，运输费用单元格不伪装成 $0。
            const contractNet = revenue - productCost - (contractTransportCost ?? 0);
            const marketNet = revenue * 0.96 - productCost - (sellTransportCost ?? 0);
            if (![revenue, productCost, contractTransportCost ?? 0, sellTransportCost ?? 0, contractNet, marketNet].every(Number.isFinite)) {
                showProfitUnavailable(priceInput, '输入数值过大，暂不能计算利润。');
                return;
            }

            // 运输向上取整提醒
            const sellWasteTransport = sellTransportTotal - sellExactTransport;
            const transportWasteNote = (sellWasteTransport > 0.001 && perUnitTransport > 0)
                ? `运输向上取整：消耗 ${sellTransportTotal} 运输单位，浪费 ${sellWasteTransport.toFixed(2)} 单位` : '';

            const marketFee = revenue * 0.04;

            const d = DM();
            const profitColor = (v) => v >= 0 ? '#4CAF50' : '#f44336';
            const fmt = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const fmtTransport = (v) => v === null ? '未计入' : '-' + fmt(v);
            const roundingNote = '收入和手续费按未取整金额计算，金额显示保留 2 位小数。游戏原生交易所利润预览将收入向下取整、手续费向上取整至整数，因此结果可能略有差异。运输单位仍按实际消耗向上取整。';

            // === 增量更新：检查是否已有展示元素 ===
            let existingDisplay = document.querySelector('.sc-profit-display');
            const viewKey = `${d}_${window.innerWidth <= 576}_${isContract}`;
            if (existingDisplay && existingDisplay.dataset.view !== viewKey) {
                _profitDetailExpanded = existingDisplay.dataset.expanded === 'true';
                existingDisplay.remove();
                existingDisplay = null;
            }

            if (existingDisplay) {
                // 已有元素：仅更新文本值（不重建DOM，避免闪烁）
                _profitDetailExpanded = existingDisplay.getAttribute('data-expanded') === 'true';

                // 更新摘要
                const summary = existingDisplay.querySelector('#sc-profit-summary');
                if (summary) {
                    if (isContract) {
                        summary.innerHTML = `<span>合同${profitSuffix}: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
                    } else {
                        summary.innerHTML = `<span>市场${profitSuffix}: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>` +
                            `<span>合同${profitSuffix}: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
                    }
                }
                updateTransportEstimate(existingDisplay, context, transportMode, transportMessage, d);

                // 更新明细表格中各单元格
                const setVal = (id, text, color) => {
                    const el = existingDisplay.querySelector('#' + id);
                    if (el) { el.textContent = text; if (color) el.style.color = color; }
                };
                if (isContract) {
                    setVal('sc-pd-revenue', fmt(revenue));
                    setVal('sc-pd-cost', '-' + fmt(productCost));
                    setVal('sc-pd-fee', fmt(0));
                    setVal('sc-pd-transport', fmtTransport(contractTransportCost));
                    const pEl = existingDisplay.querySelector('#sc-pd-profit');
                    if (pEl) { pEl.textContent = fmt(contractNet); pEl.style.color = profitColor(contractNet); }
                } else {
                    setVal('sc-pd-m-revenue', fmt(revenue));
                    setVal('sc-pd-c-revenue', fmt(revenue));
                    setVal('sc-pd-m-cost', '-' + fmt(productCost));
                    setVal('sc-pd-c-cost', '-' + fmt(productCost));
                    setVal('sc-pd-m-fee', '-' + fmt(marketFee));
                    setVal('sc-pd-c-fee', fmt(0));
                    setVal('sc-pd-m-transport', fmtTransport(sellTransportCost));
                    setVal('sc-pd-c-transport', fmtTransport(contractTransportCost));
                    const mpEl = existingDisplay.querySelector('#sc-pd-m-profit');
                    if (mpEl) { mpEl.textContent = fmt(marketNet); mpEl.style.color = profitColor(marketNet); }
                    const cpEl = existingDisplay.querySelector('#sc-pd-c-profit');
                    if (cpEl) { cpEl.textContent = fmt(contractNet); cpEl.style.color = profitColor(contractNet); }
                }

                // 更新运输浪费提醒
                const wasteEl = existingDisplay.querySelector('#sc-pd-waste');
                if (wasteEl) {
                    wasteEl.classList.toggle('sc-profit-collapsed', !transportWasteNote);
                    if (transportWasteNote) wasteEl.textContent = '⚠️ ' + transportWasteNote;
                } else if (transportWasteNote) {
                    const w = document.createElement('div');
                    w.id = 'sc-pd-waste';
                    w.style.cssText = 'color:#FF9800;margin-top:4px;';
                    w.textContent = '⚠️ ' + transportWasteNote;
                    const detail = existingDisplay.querySelector('#sc-profit-detail');
                    if (detail) detail.after(w);
                }
                _lastProfitKey = profitKey;
                return;
            }

            // === 首次创建 ===
            const isNarrow = window.innerWidth <= 576;
            const displayDiv = document.createElement('div');
            displayDiv.className = 'sc-profit-display';
            displayDiv.dataset.view = viewKey;
            displayDiv.style.cssText = `
                position: relative;
                margin: ${isNarrow ? '4px 0' : '8px 0'};
                padding: ${isNarrow ? '6px 10px' : '10px 14px'};
                border-radius: 8px;
                background: ${d ? '#1a2e1a' : '#e8f5e9'};
                border: 1px solid ${d ? '#2a5a2a' : '#c8e6c9'};
                line-height: 1.6;
                color: ${d ? '#efefef' : '#333'};
                font-family: sans-serif;
                user-select: none;
            `;

            let html = `<div id="sc-profit-header" style="font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:4px;padding-right:28px;">
                <span id="sc-profit-arrow">${_profitDetailExpanded ? '▼' : '▶'}</span> 📊 利润明细
            </div>`;
            if (!isContract) html += `<div class="sc-profit-help" style="--sc-profit-help-bg:${d ? '#263326' : '#fff'};--sc-profit-help-border:${d ? '#647064' : '#a4b6a4'};">
                <button type="button" class="sc-profit-help-button" aria-label="利润计算说明" aria-expanded="false" aria-controls="sc-profit-rounding-note" aria-describedby="sc-profit-rounding-note">?</button>
                <div id="sc-profit-rounding-note" class="sc-profit-rounding-note" role="tooltip">${roundingNote}</div>
            </div>`;

            html += `<div id="sc-profit-summary" style="display:flex;flex-wrap:wrap;gap:${isNarrow ? '4px' : '16px'};margin-top:4px;">`;
            if (isContract) {
                html += `<span>合同${profitSuffix}: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
            } else {
                html += `<span>市场${profitSuffix}: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>`;
                html += `<span>合同${profitSuffix}: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
            }
            html += `</div>`;

            const thStyle = `padding:2px 6px;text-align:right;font-weight:bold;color:${d ? '#aaa' : '#666'};`;
            const tdStyle = `padding:2px 6px;text-align:right;white-space:nowrap;`;
            const rowStyle = `border-bottom:1px solid ${d ? '#333' : '#e0e0e0'};`;
            const labelTd = (t, bold) => `<td style="${thStyle}text-align:left;${bold ? 'font-weight:bold;' : ''}">${t}</td>`;
            html += `<div id="sc-profit-detail" class="${_profitDetailExpanded ? '' : 'sc-profit-collapsed'}" style="margin-top:6px;">
                <table style="border-collapse:collapse;width:100%;">`;
            if (isContract) {
                html += `<tr>${labelTd('')}<th style="${thStyle}">合同</th></tr>
                    <tr style="${rowStyle}">${labelTd('收入')}<td id="sc-pd-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('成本')}<td id="sc-pd-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('手续费')}<td id="sc-pd-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('运输费用')}<td id="sc-pd-transport" style="${tdStyle};color:#f44336;">${fmtTransport(contractTransportCost)}</td></tr>
                    <tr>${labelTd('利润', true)}<td id="sc-pd-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
            } else {
                html += `<tr>${labelTd('')}<th style="${thStyle}">市场</th><th style="${thStyle}">合同</th></tr>
                    <tr style="${rowStyle}">${labelTd('收入')}<td id="sc-pd-m-revenue" style="${tdStyle}">${fmt(revenue)}</td><td id="sc-pd-c-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('成本')}<td id="sc-pd-m-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td><td id="sc-pd-c-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('手续费')}<td id="sc-pd-m-fee" style="${tdStyle};color:#f44336;">-${fmt(marketFee)}</td><td id="sc-pd-c-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('运输费用')}<td id="sc-pd-m-transport" style="${tdStyle};color:#f44336;">${fmtTransport(sellTransportCost)}</td><td id="sc-pd-c-transport" style="${tdStyle};color:#f44336;">${fmtTransport(contractTransportCost)}</td></tr>
                    <tr>${labelTd('利润', true)}<td id="sc-pd-m-profit" style="${tdStyle};font-weight:bold;color:${profitColor(marketNet)};">${fmt(marketNet)}</td><td id="sc-pd-c-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
            }
            html += `</table>`;
            html += `</div>`;

            if (transportWasteNote) {
                html += `<div id="sc-pd-waste" style="color:#FF9800;margin-top:4px;">⚠️ ${transportWasteNote}</div>`;
            }

            displayDiv.innerHTML = html;
            displayDiv.setAttribute('data-expanded', _profitDetailExpanded ? 'true' : 'false');
            updateTransportEstimate(displayDiv, context, transportMode, transportMessage, d);
            bindProfitHelp(displayDiv);

            displayDiv.querySelector('#sc-profit-header').addEventListener('click', () => {
                const detail = displayDiv.querySelector('#sc-profit-detail');
                const arrow = displayDiv.querySelector('#sc-profit-arrow');
                if (detail.classList.contains('sc-profit-collapsed')) {
                    detail.classList.remove('sc-profit-collapsed');
                    arrow.textContent = '▼';
                    _profitDetailExpanded = true;
                } else {
                    detail.classList.add('sc-profit-collapsed');
                    arrow.textContent = '▶';
                    _profitDetailExpanded = false;
                }
                displayDiv.setAttribute('data-expanded', _profitDetailExpanded ? 'true' : 'false');
            });

            const rowContainer = priceInput.closest('.row');
            if (rowContainer && rowContainer.parentNode) {
                rowContainer.parentNode.insertBefore(displayDiv, rowContainer.nextSibling);
                _lastProfitKey = profitKey;
            }
        }

        function destroy() {
            _activeUrl = null;
            ++_generation;
            if (initTimer) clearInterval(initTimer);
            initTimer = null;
            clearTimeout(_profitCalcTimer);
            _profitCalcTimer = null;
            clearTimeout(_skipInputTimer);
            _skipInputTimer = null;
            _skipInputRefresh = false;
            _profitObserver?.disconnect();
            _profitObserver = null;
            document.removeEventListener('input', handleInput);
            document.removeEventListener('pointerdown', handleProfitHelpDismiss);
            document.removeEventListener('keydown', handleProfitHelpDismiss);
            _marketRequests.forEach(controller => controller.abort());
            _marketRequests.clear();
            removeButtons();
            const display = document.querySelector('.sc-profit-display');
            if (display && display.dataset.state !== 'unavailable') _profitDetailExpanded = display.dataset.expanded === 'true';
            document.querySelectorAll('.sc-profit-display').forEach(e => e.remove());
            document.getElementById('outgoingmp-config-modal')?.remove();
            document.getElementById('sc-outgoing-profit-style')?.remove();
            _lastProfitKey = '';
            _assumedTransportPrice = '';
            _assumedTransportRealm = null;
        }

        function init() {
            destroy();
            if (!PAGE_PATTERN.test(location.href) || !isEnabled()) return;
            const realmId = getRealmIdFromLink();
            if (realmId !== null && realmId !== 0 && realmId !== 1) return;
            _activeUrl = location.href;
            const style = document.createElement('style');
            style.id = 'sc-outgoing-profit-style';
            style.textContent = `
                .sc-profit-display .sc-profit-collapsed { display: none; }
                .sc-profit-help { position:absolute; top:6px; left:8px; right:8px; height:24px; z-index:2; pointer-events:none; }
                .sc-profit-help-button { display:block; margin-left:auto; width:24px; height:24px; padding:0; border:1px solid var(--sc-profit-help-border); border-radius:50%; background:var(--sc-profit-help-bg); color:inherit; font: bold 14px/22px sans-serif; text-align:center; cursor:help; pointer-events:auto; }
                .sc-profit-help-button:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
                .sc-profit-help .sc-profit-rounding-note { display:none; position:absolute; top:100%; right:0; width:340px; max-width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--sc-profit-help-border); border-radius:6px; background:var(--sc-profit-help-bg); box-shadow:0 3px 12px rgba(0,0,0,.2); font-size:12px; line-height:1.6; white-space:normal; overflow-wrap:anywhere; user-select:text; pointer-events:auto; }
                .sc-profit-help-open .sc-profit-rounding-note { display:block; }
            `;
            document.head.appendChild(style);
            startProfitObserver();
        }

        return { init, destroy };
    })();


window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.outgoingContractMPHandler = outgoingContractMPHandler;
