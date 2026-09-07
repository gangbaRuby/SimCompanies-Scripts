// ======================
// 聊天室全局屏蔽（v2.1：数据层按 sender.id 过滤 + 消息组屏蔽按钮 + DOM 兜底隐藏）
// ----------------------
// 屏蔽名单：SC_ChatBlock_List（全局键，backup:true）→ [{ id, name, realmId }]；
//   id 为游戏内公司唯一 id（sender.id，跨领域唯一，来自网络数据），匹配以 id 为准。
// 数据层拦截（v2.1）：拦截 /api/v2/chatroom/<room>/ 与 .../from-id/<id>/ 的 GET 响应
//   （window.fetch + XMLHttpRequest 双钩子，沿用 requestHooks/marketInterceptor 模式）：
//   - 登记 (realmId, 公司名) → sender.id（DOM 没有 id，只能靠数据层登记表解析）；
//   - 功能开启时在响应交给 React/Redux 前直接滤掉命中 id 的消息 →
//     React 完全不渲染（历史/最新加载都不出现被屏蔽者）。
// 消息组 DOM：聊天容器直接子级（div.css-mnxdu9 等），同发送者连续消息为一组；
//   发送者 = 组的"直接子级"公司链接（头像区），正文里的 @提及/引用链接不算发送者。
// 屏蔽按钮：注入到组内回复按钮（svg[data-icon="reply"]）之后；点击时经登记表解析
//   sender.id，按 id 加入名单并立即隐藏该组。
// DOM 兜底隐藏：已渲染/实时（WS 尚未拦截）消息中命中 id 的组加 .sc-chatblock-hidden
//   （display:none !important，保留节点避免 React insertBefore 锚点失效）。
// v1 遗留：旧键 SC_ChatBlock_Names（字符串名单）不再读写，用户自行清空。
//
// 未来失效检查点（对照 bundle index-CcG5yGSH.js）：
//   - 端点路径变化 → :38472-38473（api_chatroom / api_chatroom_from_id）
//   - 消息字段改名 → :71291-71301（MESSAGES_LOADED 消费 sender.id / sender.company）
//   - WS 实时通道（尚未拦截）→ :71105-71195（NEW_MESSAGE/UPDATE_MESSAGE/GROUP）、
//     WS 客户端 :70544-70567（onmessage 属性赋值方式）
//   - 聊天 DOM：容器 :290732-290737（css-xo2rg1/e1llepen2）、消息组/按钮结构 :291485-291551
// ======================
import { registerExportInfo } from '../core/exportInfo.js';

(function () {
    'use strict';

    const MODULE_KEY = 'chatBlock';
    const STORAGE_KEY = 'SC_ChatBlock_List';
    // /api/v2/chatroom/<room>/ 或 /api/v2/chatroom/<room>/from-id/<id>/（GET）
    const CHATROOM_URL_RE = /\/api\/v2\/chatroom\/[^/?#]+(\/from-id\/\d+)?\/?(\?|$)/;
    const COMPANY_HREF_MARK = '/company/';
    const HIDDEN_CLASS = 'sc-chatblock-hidden';
    const BTN_CLASS = 'sc-chat-block-btn';

    registerExportInfo({
        name: '聊天室全局屏蔽名单',
        scope: 'global',
        backup: true,
        keys: [STORAGE_KEY]
    });

    let observer = null;
    let scanScheduled = false;
    let containerWatchTimer = null;
    let initAttempts = 0;
    let styleInjected = false;
    let blockedCache = null;
    // (realmId|normalizeCompany) -> { id, name, realmId }，由数据层登记
    const senderIndex = new Map();

    // ---------- 开关与名单存储 ----------
    function isEnabled() {
        try {
            const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            return cfg[MODULE_KEY] === true;
        } catch (e) {
            return false;
        }
    }
    function readList() {
        try {
            const arr = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }
    function writeList(arr) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    }
    function blockedIds() {
        if (!blockedCache) {
            blockedCache = new Set(readList().map(e => Number(e && e.id)).filter(n => Number.isFinite(n)));
        }
        return blockedCache;
    }
    function invalidateCache() {
        blockedCache = null;
    }
    function normalizeName(raw) {
        let s = String(raw == null ? '' : raw).trim().toLowerCase();
        try { s = decodeURIComponent(s); } catch (e) { /* 原样 */ }
        return s.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    }
    function entryKey(realmId, company) {
        return String(realmId == null ? '?' : realmId) + '|' + normalizeName(company);
    }

    // ---------- 数据层：登记 + 过滤 ----------
    function indexSender(sender) {
        if (sender && typeof sender.id === 'number' && sender.company) {
            senderIndex.set(entryKey(sender.realmId, sender.company), {
                id: sender.id,
                name: sender.company,
                realmId: sender.realmId
            });
        }
    }
    // 返回 true 表示数组被改动（有消息被滤掉）
    function indexAndFilter(arr) {
        if (!Array.isArray(arr)) return false;
        for (const m of arr) {
            if (m && m.sender) indexSender(m.sender);
        }
        if (!isEnabled()) return false;
        const ids = blockedIds();
        if (ids.size === 0) return false;
        let changed = false;
        for (let i = arr.length - 1; i >= 0; i--) {
            const m = arr[i];
            const sid = m && m.sender && m.sender.id;
            if (typeof sid === 'number' && ids.has(sid)) {
                arr.splice(i, 1);
                changed = true;
            }
        }
        return changed;
    }

    // fetch 钩子
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        try {
            if (!res || !res.ok) return res;
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (!CHATROOM_URL_RE.test(url)) return res;
            const method = ((args[1] && args[1].method) || 'GET').toUpperCase();
            if (method !== 'GET') return res;
            const text = await res.clone().text();
            if (!text) return res;
            const arr = JSON.parse(text);
            if (!indexAndFilter(arr)) return res;
            const headers = new Headers(res.headers);
            headers.delete('content-length');
            return new Response(JSON.stringify(arr), { status: res.status, statusText: res.statusText, headers });
        } catch (e) {
            return res;
        }
    };

    // XHR 钩子（axios 默认走 XHR）：在实例上覆盖 responseText/response 读取器，
    // 仅在命中聊天室 GET 且 readyState=4 时返回过滤后的文本。
    const prevOpen = XMLHttpRequest.prototype.open;
    const prevSend = XMLHttpRequest.prototype.send;
    const protoResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    const protoResponseDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');

    function filteredGetter(origGet) {
        return function () {
            const raw = origGet ? origGet.call(this) : undefined;
            if (this.readyState === 4 && typeof raw === 'string' && raw) {
                try {
                    const arr = JSON.parse(raw);
                    if (indexAndFilter(arr)) return JSON.stringify(arr);
                } catch (e) { /* 非 JSON 原样返回 */ }
            }
            return raw;
        };
    }

    XMLHttpRequest.prototype.open = function (method, url) {
        this.__scChatroomGet = String(method || '').toUpperCase() === 'GET' && CHATROOM_URL_RE.test(String(url));
        return prevOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        const self = this;
        if (self.__scChatroomGet) {
            try {
                if (protoResponseTextDesc) {
                    Object.defineProperty(self, 'responseText', {
                        configurable: true,
                        get: filteredGetter(protoResponseTextDesc.get)
                    });
                }
            } catch (e) { /* 忽略 */ }
            try {
                if (protoResponseDesc) {
                    Object.defineProperty(self, 'response', {
                        configurable: true,
                        get: filteredGetter(protoResponseDesc.get)
                    });
                }
            } catch (e) { /* 忽略 */ }
        }
        return prevSend.apply(this, arguments);
    };

    // ---------- 供设置面板/按钮调用 ----------
    window.scChatBlockList = () => readList();
    window.scChatBlockAddById = (entry) => {
        const id = Number(entry && entry.id);
        if (!Number.isFinite(id)) return { ok: false, reason: 'invalid' };
        const name = String((entry && entry.name) || '').trim() || `#${id}`;
        const list = readList();
        if (list.some(e => Number(e.id) === id)) return { ok: false, reason: 'duplicate' };
        list.push({
            id,
            name,
            realmId: (entry && entry.realmId != null) ? Number(entry.realmId) : null
        });
        writeList(list);
        invalidateCache();
        return { ok: true, id, name };
    };
    window.scChatBlockRemoveById = (id) => {
        const n = Number(id);
        writeList(readList().filter(e => Number(e.id) !== n));
        invalidateCache();
        return { ok: true };
    };
    // 开关切换/名单变更后调用：开启→立即扫描隐藏+补按钮；关闭→清理按钮并解除隐藏
    window.scChatBlockRefresh = () => {
        initAttempts = 0;
        init();
        if (isEnabled()) scanAll();
        else cleanupUI();
    };

    // ---------- 聊天容器与消息组解析 ----------
    function findChatContainers() {
        const byClass = document.querySelectorAll('div.css-xo2rg1.e1llepen2');
        if (byClass.length > 0) return byClass;
        return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
    }
    function isChatContainer(el) {
        if (!el || el.nodeType !== 1 || !el.matches) return false;
        return el.matches('div.css-xo2rg1.e1llepen2') ||
            el.matches('div[style*="column-reverse"][style*="overflow"]');
    }
    // 发送者链接 = 组的"直接子级"公司链接（头像区）；正文里的 @提及不算
    function senderCompanyLink(row) {
        if (!row || !row.children) return null;
        for (let i = 0; i < row.children.length; i++) {
            const ch = row.children[i];
            if (ch.tagName === 'A' && (ch.getAttribute('href') || '').includes(COMPANY_HREF_MARK)) return ch;
        }
        return null;
    }
    function parseCompanyHref(a) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/company\/(\d+)\/([^/?#]+)/);
        return m ? { realmId: Number(m[1]), name: m[2] } : null;
    }
    // 解析消息组发送者：优先登记表；回退按屏蔽名单（realm+名称）解析（WS/未登记场景）
    function resolveSender(row) {
        const link = senderCompanyLink(row);
        if (!link) return null;
        const p = parseCompanyHref(link);
        if (!p) return null;
        const idxInfo = senderIndex.get(entryKey(p.realmId, p.name));
        if (idxInfo) return idxInfo;
        const nameNorm = normalizeName(p.name);
        for (const e of readList()) {
            if (typeof e.id === 'number' && Number(e.realmId) === p.realmId && normalizeName(e.name) === nameNorm) {
                return { id: e.id, name: e.name, realmId: p.realmId };
            }
        }
        return null;
    }
    function isBlockedRow(row) {
        const info = resolveSender(row);
        return !!(info && typeof info.id === 'number' && blockedIds().has(info.id));
    }
    function findReplyButton(row) {
        const icons = row.querySelectorAll('button svg[data-icon="reply"]');
        for (const ic of icons) {
            const btn = ic.closest('button');
            if (btn) return btn;
        }
        return null;
    }

    // ---------- DOM 兜底隐藏 + 屏蔽按钮注入 ----------
    function injectStyles() {
        if (styleInjected) return;
        styleInjected = true;
        const style = document.createElement('style');
        style.textContent = `.${HIDDEN_CLASS}{display:none !important;}`;
        document.head.appendChild(style);
    }

    function injectBlockButton(row) {
        if (row.classList.contains(HIDDEN_CLASS)) return;
        if (row.querySelector(`.${BTN_CLASS}`)) return;
        const info = resolveSender(row);
        if (!info || typeof info.id !== 'number') return; // 未解析到唯一 id 不提供按钮
        const replyBtn = findReplyButton(row);
        if (!replyBtn) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BTN_CLASS;
        btn.textContent = '屏蔽';
        btn.title = '屏蔽此人消息';
        btn.setAttribute('aria-label', '屏蔽此人');
        btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;color:#f44336;padding:0 4px;line-height:1;opacity:.85;';
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            const cur = resolveSender(row);
            if (!cur || typeof cur.id !== 'number') {
                btn.textContent = '?';
                setTimeout(() => { btn.textContent = '屏蔽'; }, 1200);
                return;
            }
            const res = window.scChatBlockAddById ? window.scChatBlockAddById(cur) : { ok: false };
            if (res && res.ok) {
                row.classList.add(HIDDEN_CLASS);
                window.scChatBlockRefresh && window.scChatBlockRefresh();
            } else if (res && res.reason === 'duplicate') {
                row.classList.add(HIDDEN_CLASS);
            }
        });
        replyBtn.insertAdjacentElement('afterend', btn);
    }

    function processContainer(container) {
        if (!isEnabled()) return;
        const rows = container.querySelectorAll(':scope > div');
        for (const row of rows) {
            if (row.classList.contains(HIDDEN_CLASS)) continue;
            if (isBlockedRow(row)) {
                row.classList.add(HIDDEN_CLASS);
                continue;
            }
            injectBlockButton(row);
        }
    }
    function scanAll() {
        if (!isEnabled()) return;
        findChatContainers().forEach(c => processContainer(c));
    }
    // 关闭功能时：移除注入按钮，并解除已隐藏消息（再开启时 scanAll 会重新隐藏）
    function cleanupUI() {
        document.querySelectorAll(`.${BTN_CLASS}`).forEach(b => b.remove());
        document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(el => el.classList.remove(HIDDEN_CLASS));
    }

    // ---------- 生命周期 ----------
    function init() {
        if (observer) { observer.disconnect(); observer = null; }
        injectStyles();
        const containers = findChatContainers();
        if (containers.length === 0) {
            if (initAttempts < 8) {
                initAttempts++;
                containerWatchTimer = setTimeout(init, 1000);
            }
            return;
        }
        initAttempts = 0;
        if (isEnabled()) scanAll();
        observer = new MutationObserver(scheduleScan);
        containers.forEach(c => observer.observe(c, { childList: true, subtree: true }));
    }
    // MutationObserver 触发后立即重扫：用微任务在浏览器绘制前隐藏，
    // 避免"先看到被屏蔽消息再隐藏"的闪现（房间切换常从游戏内存缓存重绘，无 HTTP 可拦）
    const enqueueMicro = typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => setTimeout(fn, 0);
    function scheduleScan() {
        if (!isEnabled()) return;
        if (scanScheduled) return;
        scanScheduled = true;
        enqueueMicro(() => {
            scanScheduled = false;
            scanAll();
        });
    }

    // SPA 路由变化监听
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (lastUrl !== location.href) {
            lastUrl = location.href;
            initAttempts = 0;
            if (containerWatchTimer) clearTimeout(containerWatchTimer);
            setTimeout(init, 300);
        }
    }).observe(document, { subtree: true, childList: true });

    setTimeout(init, 500);
})();