import { getRealmIdFromLink } from '../core/storage.js';
import { DM } from '../utils/ui.js';
import { registerExportInfo } from '../core/exportInfo.js';

registerExportInfo({
    name: '出库合同 MP 设置',
    scope: 'global',
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
        let _qualityCache = {}; // 品质缓存 { resourceId: quality }，按资源ID隔离

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
                    if (typeof GM_xmlhttpRequest === 'function') {
                        GM_xmlhttpRequest({
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
                                    resolve(typeof v === 'number' && v > 0 ? v : null);
                                } catch (e) { console.warn('[VWAP] 解析失败:', e); resolve(null); }
                            },
                            onerror: function (e) { console.warn('[VWAP] GM_xmlhttpRequest 错误:', e); resolve(null); },
                            ontimeout: function () { console.warn('[VWAP] 请求超时'); resolve(null); },
                            timeout: 10000
                        });
                    } else {
                        fetch(url)
                            .then(r => r.json())
                            .then(data => {
                                const v = typeof data === 'number' ? data
                                    : (data.vwap || data.price || data.value
                                        || (Array.isArray(data.vwaps) && data.vwaps[0]?.vwap)
                                        || (Array.isArray(data) && data[0]?.vwap));
                                console.log('[VWAP] fetch返回:', v);
                                resolve(typeof v === 'number' && v > 0 ? v : null);
                            })
                            .catch(e => { console.warn('[VWAP] fetch失败:', e); resolve(null); });
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

        // 从百科链接提取 resourceId
        function parseResourceId() {
            const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
            if (!link) return null;
            const match = link.href.match(/\/resource\/(\d+)\//);
            return match ? parseInt(match[1], 10) : null;
        }

        // 解析品质：使用品质缓存避免重复轮询
        async function parseQuality() {
            const resourceId = parseResourceId();
            if (resourceId === null) return 0;
            // 品质缓存命中（按资源ID）直接返回
            if (_qualityCache[resourceId] !== undefined && _qualityCache[resourceId] >= 0) {
                mpLog('parseQuality 缓存命中:', _qualityCache[resourceId]);
                return _qualityCache[resourceId];
            }

            const startUrl = location.href;
            const MAX_WAIT = 3000; // 轮询超时减到3秒，快速失败不阻塞
            const RETRY_INTERVAL = 200;
            const startTime = Date.now();
            let loopCount = 0;

            // 多语言匹配文本
            const SELL_ORDER_TEXTS = ['当前交易所卖单', 'Current exchange orders', '當前交易所賣單'];
            const FILTER_BTN_TEXTS = ['按品质过滤', 'Filter by quality', '按品質過濾'];
            const SHOW_ALL_TEXTS = ['Show all', '显示所有', '顯示所有'];
            const AVG_PRICE_TITLES = ['平均零售价格', 'Average retail price', '平均零售價格'];

            while (Date.now() - startTime < MAX_WAIT) {
                if (location.href !== startUrl) return 0;

                // === 策略1：从交易所卖单文字提取品质 ===
                let s1Quality = null;
                let s1FilterBtn = false;
                let s1ShowAllBtn = false;
                let s1Found = false; // 是否找到了卖单文本
                let s1RawText = '';   // 调试用
                let s1BtnRaw = '';    // 调试用
                const allSpans = document.querySelectorAll('span');
                for (const span of allSpans) {
                    const b = span.querySelector('b');
                    if (!b) continue;
                    const text = b.textContent?.trim() || '';
                    if (SELL_ORDER_TEXTS.some(t => text.includes(t))) {
                        s1Found = true;
                        s1RawText = text;
                        const qMatch = text.match(/Q(\d+)\+/);
                        if (qMatch) { s1Quality = parseInt(qMatch[1], 10); }
                        const btnText = span.querySelector('button')?.textContent || '';
                        s1BtnRaw = btnText;
                        s1ShowAllBtn = SHOW_ALL_TEXTS.some(t => btnText.includes(t));
                        s1FilterBtn = FILTER_BTN_TEXTS.some(t => btnText.includes(t));
                        break;
                    }
                }

                // 辅助：从DOM元素提取品质（先试文本数字，否则数SVG星星）
                const extractQualityFromEl = (el) => {
                    const txt = el.textContent?.trim() || '';
                    const numMatch = txt.match(/^(\d+)/);
                    if (numMatch) return parseInt(numMatch[1], 10);
                    // 没有数字：数SVG星星个数（.fa-star）
                    const svgCount = el.querySelectorAll('.svg-inline--fa.fa-star').length;
                    return svgCount > 0 ? svgCount : null;
                };

                // === 策略2：有平均零售价格从平均零售价格找；没有则从合并成本附近找 ===
                let s2Quality = null;
                let s2RawTxt = '';    // 调试用
                const titleSelector = AVG_PRICE_TITLES.map(t => `[title="${t}"]`).join(', ');
                const avgPriceEl = document.querySelector(titleSelector);
                if (avgPriceEl) {
                    // 有平均零售价格：从其下个兄弟元素提取品质
                    const sibling = avgPriceEl.nextElementSibling;
                    if (sibling) {
                        s2RawTxt = sibling.textContent?.trim() || '';
                        s2Quality = extractQualityFromEl(sibling);
                    }
                } else {
                    // 无平均零售价格：从"合并成本"文本节点自身往后找品质元素
                    let qualityEl = null;
                    const allEls = document.querySelectorAll('*');
                    for (const el of allEls) {
                        for (const node of el.childNodes) {
                            if (node.nodeType === 3 && node.textContent?.includes('合并成本')) {
                                // 从这个文本节点往后遍历兄弟节点，找第一个元素
                                let next = node.nextSibling;
                                while (next) {
                                    if (next.nodeType === 1) {
                                        qualityEl = next;
                                        break;
                                    }
                                    next = next.nextSibling;
                                }
                                // 如果紧跟着的是<br>等无效元素，继续往后找
                                if (qualityEl) {
                                    let q = extractQualityFromEl(qualityEl);
                                    let fallback = qualityEl.nextElementSibling;
                                    while (q === null && fallback) {
                                        qualityEl = fallback;
                                        q = extractQualityFromEl(fallback);
                                        if (q !== null) break;
                                        fallback = fallback.nextElementSibling;
                                    }
                                }
                                break;
                            }
                        }
                        if (qualityEl) break;
                    }
                    if (qualityEl) {
                        s2RawTxt = qualityEl.textContent?.trim() || '';
                        s2Quality = extractQualityFromEl(qualityEl);
                        if (s2Quality !== null) {
                            mpLog('策略2 从合并成本后兄弟元素:', s2Quality, 'txt:', s2RawTxt.substring(0, 30));
                        }
                    }
                }

                // === 调试日志：本次轮询各策略原始数据 ===
                mpLog('parseQuality 轮询#' + loopCount +
                    ' s1Found=' + s1Found +
                    ' rawText="' + (s1RawText || '').substring(0, 80) + '"' +
                    ' qMatch=' + s1Quality +
                    ' btn="' + (s1BtnRaw || '').substring(0, 30) + '"' +
                    ' showAll=' + s1ShowAllBtn +
                    ' filter=' + s1FilterBtn +
                    ' s2El=' + (avgPriceEl ? 'avgprice' : 'cost') +
                    ' s2Txt="' + (s2RawTxt || '').substring(0, 30) + '"' +
                    ' s2Q=' + s2Quality);

                // === 比对（按用户规范三类情况） ===
                if (s1Found || s2Quality !== null) {
                    // 情况1：有Q前缀且有"Show all"按钮 → 可信，直接返回Q
                    if (s1Quality !== null && s1ShowAllBtn) {
                        _qualityCache[resourceId] = s1Quality;
                        mpLog('parseQuality 情况1(可信Q):', s1Quality);
                        return s1Quality;
                    }
                    // 情况3：有文本但无Q前缀且无按钮 → 可信Q0
                    if (s1Found && s1Quality === null && !s1FilterBtn && !s1ShowAllBtn) {
                        _qualityCache[resourceId] = 0;
                        mpLog('parseQuality 情况3(可信Q0)');
                        return 0;
                    }
                    // 情况2：有"Filter by quality"按钮 → 不可信，用平均零售价格
                    if (s1FilterBtn && s2Quality !== null) {
                        _qualityCache[resourceId] = s2Quality;
                        mpLog('parseQuality 情况2(平均零售价格):', s2Quality);
                        return s2Quality;
                    }
                    // 情况4：策略1未找到卖单文本（如仓库出售/合同页面），直接用策略2
                    if (!s1Found && s2Quality !== null) {
                        _qualityCache[resourceId] = s2Quality;
                        mpLog('parseQuality 情况4(纯平均零售价格):', s2Quality);
                        return s2Quality;
                    }
                    // 调试：有数据但无一匹配 → 打印原因
                    if (s1Found) {
                        mpLog('parseQuality 轮询#' + loopCount + ' 未匹配: s1Q=' + s1Quality + ' showAll=' + s1ShowAllBtn + ' filter=' + s1FilterBtn + ' s2Q=' + s2Quality);
                    }
                }

                await new Promise(r => setTimeout(r, RETRY_INTERVAL));
                loopCount++;
            }
            mpLog('parseQuality 超时退出, loopCount:', loopCount);
            _qualityCache[resourceId] = 0;
            return 0;
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
            try {
                const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
                const resp = await fetch(url);
                const json = await resp.json();
                mpLog('refreshMarketData 完成, 耗时:', Date.now() - tStart, 'ms, 状态:', resp.status, '条数:', Array.isArray(json) ? json.length : '非数组');
                if (Array.isArray(json)) {
                    localStorage.setItem(`market_all_${realmId}_${resourceId}`, JSON.stringify({ timestamp: Date.now(), data: json }));
                    return json;
                }
            } catch (e) {
                mpLog('refreshMarketData 失败:', e.message);
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
            setTimeout(() => { _skipInputRefresh = false; }, 100);
            if (count > 0) return setInputValue(input, value, --count);
        }

        // === DEBUG 日志辅助 ===
        const MP_DEBUG = false;
        function mpLog(...args) { if (MP_DEBUG) console.log('[MP-DEBUG]', Date.now(), '|', ...args); }

        async function initButtons() {
            mpLog('initButtons 开始');
            // === 第一步：同步清理 ===
            document.querySelectorAll('.outgoingmp-btn-row').forEach(r => r.remove());
            document.querySelectorAll('.outgoingmp-info').forEach(e => e.remove());
            const prevParent = document.querySelector('[data-outgoing-mp-added]');
            if (prevParent) delete prevParent.dataset.outgoingMpAdded;

            const resourceId = parseResourceId();
            const realmId = getRealmIdFromLink();
            if (!resourceId || realmId === null) { mpLog('initButtons 退出: 无resourceId或realmId'); return; }
            mpLog('initButtons resourceId:', resourceId, 'realmId:', realmId);

            const priceInput = document.querySelector('input[name="price"]');
            if (!priceInput) { mpLog('initButtons 退出: 无priceInput'); return; }

            const parentDiv = priceInput.parentElement;
            if (!parentDiv || parentDiv.dataset.outgoingMpAdded) { mpLog('initButtons 退出: 已注入或无parentDiv'); return; }
            parentDiv.dataset.outgoingMpAdded = 'true';

            // 监听输入框手动修改：开关开启时自动刷新按钮
            if (!priceInput.hasAttribute('data-outgoingmp-listener')) {
                priceInput.setAttribute('data-outgoingmp-listener', 'true');
                let _refreshTimer;
                priceInput.addEventListener('input', () => {
                    if (_skipInputRefresh) return;
                    if (!isUseInputEnabled()) return;
                    clearTimeout(_refreshTimer);
                    _refreshTimer = setTimeout(() => initButtons(), 300);
                });
            }

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

            // === 第三步：品质 + 市场数据 ===
            mpLog('开始 parseQuality...');
            const quality = await parseQuality();
            _qualityCache[resourceId] = quality; // 缓存品质供 calcAndDisplayProfit 使用
            mpLog('parseQuality 完成, quality:', quality);

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
                        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, rounded); };
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
                        btnMP.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, mpRounded); };
                        btnRow.appendChild(btnMP);
                        const oneDown = roundToStep(mpBasePrice - step, false);
                        if (oneDown > 0 && Math.abs(oneDown - mpRounded) > 1e-9) {
                            const btn1s = document.createElement('button');
                            btn1s.type = 'button'; btn1s.className = btnClass + ' outgoingmp-mpbtn';
                            btn1s.textContent = `压价 $${oneDown}`;
                            btn1s.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, oneDown); };
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
                                    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, rounded); };
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
        let _inputListenerBound = false;
        let _profitDetailExpanded = false;
        let _lastProfitKey = ''; // 去重：上次计算的 (资源+价格+数量) 键

        function startProfitObserver() {
            if (_profitObserver) _profitObserver.disconnect();

            const schedule = () => {
                clearTimeout(_profitCalcTimer);
                _profitCalcTimer = setTimeout(calcAndDisplayProfit, 200);
            };

            // 监听 DOM 变化（仅关心运输元素出现/消失的节点变更）
            _profitObserver = new MutationObserver((mutations) => {
                const isOwnMutation = mutations.some(m => {
                    let el = m.target;
                    while (el) {
                        if (el.classList && el.classList.contains('sc-profit-display')) return true;
                        el = el.parentElement;
                    }
                    return false;
                });
                // 只在添加了有意义的新节点时才触发，忽略纯文本变更
                const hasRelevantNode = mutations.some(m =>
                    m.type === 'childList' && m.addedNodes.length > 0
                );
                if (!isOwnMutation && hasRelevantNode) schedule();
            });
            _profitObserver.observe(document.body, { childList: true, subtree: true });

            // 监听输入框变化（React 受控组件不触发 characterData）
            if (!_inputListenerBound) {
                _inputListenerBound = true;
                document.addEventListener('input', (e) => {
                    if (e.target.matches('input[name="price"], input[name="amount"], input[name="quantity"]')) {
                        schedule();
                    }
                });
            }

            // 初始触发一次
            setTimeout(calcAndDisplayProfit, 300);
        }

        async function calcAndDisplayProfit() {
            mpLog('calcAndDisplayProfit 触发');
            const onPage = /\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/.test(location.href);
            if (!onPage) { mpLog('calcAndDisplayProfit: 不在目标页面'); return; }

            const isContract = /\/contract\/?$/.test(location.href);

            // 先获取价格和数量，未填则不出利润
            const priceInput = document.querySelector('input[name="price"]');
            const qtyInput = document.querySelector('input[name="amount"], input[name="quantity"]');
            if (!priceInput || !qtyInput) { return; }
            const price = parseFloat(priceInput.value) || 0;
            const quantity = parseFloat(qtyInput.value) || 0;
            if (price <= 0 || quantity <= 0) { return; }

            // 去重：价格和数量没变则跳过（避免频繁触发 parseQuality）
            const profitKey = `${parseResourceId()}_${price}_${quantity}`;
            if (profitKey === _lastProfitKey) { mpLog('calcAndDisplayProfit 跳过: 值未变'); return; }
            _lastProfitKey = profitKey;

            // 获取资源ID、品质
            const resourceId = parseResourceId();
            const quality = await parseQuality();
            if (!resourceId) { return; }

            // 从 constantsResources 获取每单位运输用量（transportation 字段）
            const SCD = (() => { try { return JSON.parse(localStorage.getItem('SimcompaniesConstantsData')); } catch (e) { return null; } })();
            if (!SCD) { return; }
            const resourceInfo = SCD?.constantsResources?.[resourceId];
            const perUnitTransport = resourceInfo?.transportation ?? 0;

            // 计算运输总量（游戏向上取整；合同运输量始终减半，市场出售始终全量）
            const contractExactTransport = perUnitTransport * quantity * 0.5;
            const contractTransportTotal = Math.ceil(contractExactTransport);
            const sellExactTransport = perUnitTransport * quantity * 1;
            const sellTransportTotal = Math.ceil(sellExactTransport);

            // 从缓存读取仓库数据
            const realmId = getRealmIdFromLink();
            if (realmId === null) { return; }
            const SRC = (() => { try { return JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`)); } catch (e) { return null; } })();
            const warehouse = SRC?.warehouseResources;
            if (!warehouse || !Array.isArray(warehouse)) { return; }

            // 找产品单位成本（cost 总和 / amount）
            let productUnitCost = 0;
            const productEntries = warehouse.filter(e => e.kind === resourceId && e.quality === quality);
            if (productEntries.length > 0) {
                const e = productEntries[0];
                const costSum = Object.values(e.cost || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
                productUnitCost = e.amount > 0 ? costSum / e.amount : 0;
            }

            // 找运输单位成本（资源ID=13，无品质区分）
            let transportUnitCost = 0;
            const transportEntries = warehouse.filter(e => e.kind === 13);
            if (transportEntries.length > 0) {
                const e = transportEntries[0];
                const costSum = Object.values(e.cost || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
                transportUnitCost = e.amount > 0 ? costSum / e.amount : 0;
            }

            const revenue = price * quantity;
            const productCost = productUnitCost * quantity;
            const contractTransportCost = contractTransportTotal * transportUnitCost;
            const sellTransportCost = sellTransportTotal * transportUnitCost;
            const contractNet = revenue - productCost - contractTransportCost;
            const marketNet = revenue * 0.96 - productCost - sellTransportCost;

            // 运输向上取整提醒
            const sellWasteTransport = sellTransportTotal - sellExactTransport;
            const transportWasteNote = (sellWasteTransport > 0.001 && perUnitTransport > 0)
                ? `运输向上取整：消耗 ${sellTransportTotal} 运输单位，浪费 ${sellWasteTransport.toFixed(2)} 单位` : '';

            const grossProfit = revenue - productCost;
            const marketFee = revenue * 0.04;

            const d = DM();
            const profitColor = (v) => v >= 0 ? '#4CAF50' : '#f44336';
            const fmt = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // === 增量更新：检查是否已有展示元素 ===
            const existingDisplay = document.querySelector('.sc-profit-display');

            if (existingDisplay) {
                // 已有元素：仅更新文本值（不重建DOM，避免闪烁）
                _profitDetailExpanded = existingDisplay.getAttribute('data-expanded') === 'true';

                // 更新摘要
                const summary = existingDisplay.querySelector('#sc-profit-summary');
                if (summary) {
                    if (isContract) {
                        summary.innerHTML = `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
                    } else {
                        summary.innerHTML = `<span>市场利润: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>` +
                            `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
                    }
                }

                // 更新明细表格中各单元格
                const setVal = (id, text, color) => {
                    const el = existingDisplay.querySelector('#' + id);
                    if (el) { el.textContent = text; if (color) el.style.color = color; }
                };
                if (isContract) {
                    setVal('sc-pd-revenue', fmt(revenue));
                    setVal('sc-pd-cost', '-' + fmt(productCost));
                    setVal('sc-pd-fee', fmt(0));
                    setVal('sc-pd-transport', '-' + fmt(contractTransportCost));
                    const pEl = existingDisplay.querySelector('#sc-pd-profit');
                    if (pEl) { pEl.textContent = fmt(contractNet); pEl.style.color = profitColor(contractNet); }
                } else {
                    setVal('sc-pd-m-revenue', fmt(revenue));
                    setVal('sc-pd-c-revenue', fmt(revenue));
                    setVal('sc-pd-m-cost', '-' + fmt(productCost));
                    setVal('sc-pd-c-cost', '-' + fmt(productCost));
                    setVal('sc-pd-m-fee', '-' + fmt(marketFee));
                    setVal('sc-pd-c-fee', fmt(0));
                    setVal('sc-pd-m-transport', '-' + fmt(sellTransportCost));
                    setVal('sc-pd-c-transport', '-' + fmt(contractTransportCost));
                    const mpEl = existingDisplay.querySelector('#sc-pd-m-profit');
                    if (mpEl) { mpEl.textContent = fmt(marketNet); mpEl.style.color = profitColor(marketNet); }
                    const cpEl = existingDisplay.querySelector('#sc-pd-c-profit');
                    if (cpEl) { cpEl.textContent = fmt(contractNet); cpEl.style.color = profitColor(contractNet); }
                }

                // 更新运输浪费提醒
                const wasteEl = existingDisplay.querySelector('#sc-pd-waste');
                if (wasteEl) {
                    if (transportWasteNote) { wasteEl.textContent = '⚠️ ' + transportWasteNote; wasteEl.style.display = ''; }
                    else { wasteEl.style.display = 'none'; }
                } else if (transportWasteNote) {
                    const w = document.createElement('div');
                    w.id = 'sc-pd-waste';
                    w.style.cssText = 'color:#FF9800;margin-top:4px;';
                    w.textContent = '⚠️ ' + transportWasteNote;
                    const detail = existingDisplay.querySelector('#sc-profit-detail');
                    if (detail) detail.after(w);
                }
                return;
            }

            // === 首次创建 ===
            const isNarrow = window.innerWidth <= 576;
            const displayDiv = document.createElement('div');
            displayDiv.className = 'sc-profit-display';
            displayDiv.style.cssText = `
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

            let html = `<div id="sc-profit-header" style="font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:4px;">
                <span id="sc-profit-arrow">${_profitDetailExpanded ? '▼' : '▶'}</span> 📊 利润明细
            </div>`;

            html += `<div id="sc-profit-summary" style="display:flex;flex-wrap:wrap;gap:${isNarrow ? '4px' : '16px'};margin-top:4px;">`;
            if (isContract) {
                html += `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
            } else {
                html += `<span>市场利润: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>`;
                html += `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
            }
            html += `</div>`;

            const thStyle = `padding:2px 6px;text-align:right;font-weight:bold;color:${d ? '#aaa' : '#666'};`;
            const tdStyle = `padding:2px 6px;text-align:right;white-space:nowrap;`;
            const rowStyle = `border-bottom:1px solid ${d ? '#333' : '#e0e0e0'};`;
            const labelTd = (t, bold) => `<td style="${thStyle}text-align:left;${bold ? 'font-weight:bold;' : ''}">${t}</td>`;
            html += `<div id="sc-profit-detail" style="display:${_profitDetailExpanded ? 'block' : 'none'};margin-top:6px;">
                <table style="border-collapse:collapse;width:100%;">`;
            if (isContract) {
                html += `<tr>${labelTd('')}<th style="${thStyle}">合同</th></tr>
                    <tr style="${rowStyle}">${labelTd('收入')}<td id="sc-pd-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('成本')}<td id="sc-pd-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('手续费')}<td id="sc-pd-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('运输费用')}<td id="sc-pd-transport" style="${tdStyle};color:#f44336;">-${fmt(contractTransportCost)}</td></tr>
                    <tr>${labelTd('利润', true)}<td id="sc-pd-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
            } else {
                html += `<tr>${labelTd('')}<th style="${thStyle}">市场</th><th style="${thStyle}">合同</th></tr>
                    <tr style="${rowStyle}">${labelTd('收入')}<td id="sc-pd-m-revenue" style="${tdStyle}">${fmt(revenue)}</td><td id="sc-pd-c-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('成本')}<td id="sc-pd-m-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td><td id="sc-pd-c-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('手续费')}<td id="sc-pd-m-fee" style="${tdStyle};color:#f44336;">-${fmt(marketFee)}</td><td id="sc-pd-c-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('运输费用')}<td id="sc-pd-m-transport" style="${tdStyle};color:#f44336;">-${fmt(sellTransportCost)}</td><td id="sc-pd-c-transport" style="${tdStyle};color:#f44336;">-${fmt(contractTransportCost)}</td></tr>
                    <tr>${labelTd('利润', true)}<td id="sc-pd-m-profit" style="${tdStyle};font-weight:bold;color:${profitColor(marketNet)};">${fmt(marketNet)}</td><td id="sc-pd-c-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
            }
            html += `</table></div>`;

            if (transportWasteNote) {
                html += `<div id="sc-pd-waste" style="color:#FF9800;margin-top:4px;">⚠️ ${transportWasteNote}</div>`;
            }

            displayDiv.innerHTML = html;
            displayDiv.setAttribute('data-expanded', _profitDetailExpanded ? 'true' : 'false');

            displayDiv.querySelector('#sc-profit-header').addEventListener('click', () => {
                const detail = displayDiv.querySelector('#sc-profit-detail');
                const arrow = displayDiv.querySelector('#sc-profit-arrow');
                if (detail.style.display === 'none') {
                    detail.style.display = 'block';
                    arrow.textContent = '▼';
                    _profitDetailExpanded = true;
                } else {
                    detail.style.display = 'none';
                    arrow.textContent = '▶';
                    _profitDetailExpanded = false;
                }
                displayDiv.setAttribute('data-expanded', _profitDetailExpanded ? 'true' : 'false');
            });

            const rowContainer = priceInput.closest('.row');
            if (rowContainer && rowContainer.parentNode) {
                rowContainer.parentNode.insertBefore(displayDiv, rowContainer.nextSibling);
            }
        }

        function init() {
            mpLog('init 被调用');
            // 清理旧缓存（SPA 切换页面时）
            _qualityCache = {};
            _lastProfitKey = '';
            if (initTimer) { clearInterval(initTimer); initTimer = null; }
            document.querySelectorAll('.outgoingmp-btn-row').forEach(r => r.remove());
            document.querySelectorAll('.outgoingmp-info').forEach(e => e.remove());
            document.querySelectorAll('.sc-profit-display').forEach(e => e.remove());
            const prev = document.querySelector('[data-outgoing-mp-added]');
            if (prev) delete prev.dataset.outgoingMpAdded;

            // 启动运输利润计算观察器
            mpLog('启动 startProfitObserver');
            startProfitObserver();

            // 如果价格输入框已存在，直接初始化
            if (document.querySelector('input[name="price"]')) {
                mpLog('priceInput 已存在, 直接调用 initButtons');
                initButtons();
                return;
            }

            mpLog('priceInput 未找到, 启动轮询');
            // 持续轮询（不设上限），处理 SPA 内 URL 不变但 DOM 变化的场景
            // 离开页面时自动停止
            initTimer = setInterval(() => {
                const onPage = /\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/.test(location.href);
                if (!onPage) { mpLog('轮询: 离开页面, 停止'); clearInterval(initTimer); initTimer = null; return; }
                if (document.querySelector('input[name="price"]')) {
                    mpLog('轮询: 发现 priceInput, 调用 initButtons');
                    clearInterval(initTimer);
                    initTimer = null;
                    initButtons();
                }
            }, 500);
        }

        return { init };
    })();


window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.outgoingContractMPHandler = outgoingContractMPHandler;
