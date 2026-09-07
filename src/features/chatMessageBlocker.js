// ======================
// 聊天室全局屏蔽（v2.2：WS 实时过滤 + DOM 占位隐藏，不修改 HTTP 响应）
// ----------------------
// 屏蔽名单：SC_ChatBlock_List（全局键，backup:true）→ [{ id, name, realmId }]；
//   id 为游戏内公司唯一 id（sender.id，跨领域唯一，来自网络数据），匹配以 id 为准。
//
// 为什么不改 HTTP 响应：
//   bundle :299934 fullHistory = r.length < 30 —— 游戏按"返回条数 < 30"判断历史已到底。
//   若过滤掉被屏蔽消息把条数改少，会导致历史加载提前停止（曾复现"历史不能正常加载"）。
//   因此 /api/v2/chatroom/<room>/ 与 from-id 的 GET 响应一律不改，仅登记 sender 用于解析 id。
//
// 实时消息（WebSocket）：
//   帧样例：{routing:"NEW_MESSAGE"|"UPDATE_MESSAGE", data:{...sender:{id},...}}，
//           {routing:"GROUP", messages:[{routing:..., data:...}, ...]}。
//   拦截 WS 的 onmessage（属性赋值方式，bundle :70544-70567），命中名单 sender.id 的
//   消息/组内消息直接丢弃，不让其进入 React 状态 → 实时消息完全不渲染。
//
// 已渲染/缓存/历史中被屏蔽消息：不做 remove()（React 锚点/历史加载安全），
//   加 .sc-chatblock-hidden：visibility:hidden 且高度压为 0（不占空间），
//   在 MutationObserver 微任务里同帧执行，避免"先看到再隐藏"的闪现。
//   节点保留在 DOM 中，避免 React insertBefore 锚点失效；历史消息仍随游戏分页正常加载。
//
// 消息组 DOM：聊天容器直接子级（div.css-mnxdu9 等），同发送者连续消息为一组；
//   发送者 = 组的"直接子级"公司链接（头像区），正文里的 @提及/引用链接不算发送者。
// 屏蔽按钮：注入到组内回复按钮（svg[data-icon="reply"]）之后；点击经登记表解析
//   sender.id，按 id 加入名单并立即占位隐藏该组。
// v1 遗留：旧键 SC_ChatBlock_Names（字符串名单）不再读写，用户自行清空。
//
// 未来失效检查点（对照 bundle index-CcG5yGSH.js）：
//   - 端点路径变化 → :38472-38473（api_chatroom / api_chatroom_from_id）
//   - 消息字段改名 → :71291-71301（MESSAGES_LOADED 消费 sender.id / sender.company）
//   - fullHistory 判定 → :299934（r.length < 30；若改为服务端字段，可考虑恢复 HTTP 过滤）
//   - WS 事件结构 → :71105-71195（NEW_MESSAGE/UPDATE_MESSAGE/GROUP/RESYNC_AFTER_RECONNECT）、
//     WS 客户端 :70544-70567（onmessage 属性赋值方式；若改 addEventListener 需同步）
//   - 聊天 DOM：容器 :290732-290737（css-xo2rg1/e1llepen2）、消息组/按钮结构 :291485-291551
// ======================
import { registerExportInfo } from '../core/exportInfo.js';

(function () {
    'use strict';

    const MODULE_KEY = 'chatBlock';
    const STORAGE_KEY = 'SC_ChatBlock_List';
    // /api/v2/chatroom/<room>/ 或 /api/v2/chatroom/<room>/from-id/<id>/（GET）
    const CHATROOM_URL_RE = /\/api\/v2\/chatroom\/[^/?#]+(\/from-id\/\d+)?\/?(\?|$)/;
    const HIDDEN_CLASS = 'sc-chatblock-hidden';
    const BTN_CLASS = 'sc-chat-block-btn';
    const CHAT_CONTAINER_SEL = 'div.css-xo2rg1.e1llepen2';
    const CHAT_CONTAINER_SEL_ALL = 'div.css-xo2rg1.e1llepen2, div[style*="column-reverse"][style*="overflow"]';

    registerExportInfo({
        name: '聊天室全局屏蔽名单',
        scope: 'global',
        backup: true,
        keys: [STORAGE_KEY]
    });

    let observer = null;
    let bodyObserver = null;
    let scanScheduled = false;
    let containerWatchTimer = null;
    let initAttempts = 0;
    let styleInjected = false;
    let blockedCache = null;
    let observedContainers = new WeakSet();
    // (realmId|normalizeCompany) -> { id, name, realmId }，由 HTTP/WS 数据登记
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

    // ---------- 数据登记（不改动任何响应/帧的内容） ----------
    function indexSender(sender) {
        if (sender && typeof sender.id === 'number' && sender.company) {
            senderIndex.set(entryKey(sender.realmId, sender.company), {
                id: sender.id,
                name: sender.company,
                realmId: sender.realmId
            });
        }
    }
    function indexMessage(m) {
        if (m && m.sender) indexSender(m.sender);
    }
    function isBlockedSender(m) {
        const sid = m && m.sender && m.sender.id;
        return typeof sid === 'number' && blockedIds().has(sid);
    }

    // ---------- HTTP 钩子：仅登记 sender，绝不改响应（fullHistory=r.length<30 限制） ----------
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        try {
            if (!res || !res.ok) return res;
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (!CHATROOM_URL_RE.test(url)) return res;
            const text = await res.clone().text();
            if (!text) return res;
            const arr = JSON.parse(text);
            if (Array.isArray(arr)) {
                for (const m of arr) indexMessage(m);
            }
        } catch (e) { /* 忽略 */ }
        return res;
    };

    const prevOpen = XMLHttpRequest.prototype.open;
    const prevSend = XMLHttpRequest.prototype.send;
    const protoResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    const protoResponseDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');

    function indexOnlyGetter(origGet) {
        return function () {
            const raw = origGet ? origGet.call(this) : undefined;
            if (this.readyState === 4 && typeof raw === 'string' && raw) {
                try {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) {
                        for (const m of arr) indexMessage(m);
                    }
                } catch (e) { /* 忽略 */ }
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
                        get: indexOnlyGetter(protoResponseTextDesc.get)
                    });
                }
            } catch (e) { /* 忽略 */ }
            try {
                if (protoResponseDesc) {
                    Object.defineProperty(self, 'response', {
                        configurable: true,
                        get: indexOnlyGetter(protoResponseDesc.get)
                    });
                }
            } catch (e) { /* 忽略 */ }
        }
        return prevSend.apply(this, arguments);
    };

    // ---------- WebSocket 钩子：实时消息按名单过滤，不让其进入状态 ----------
    function filterWsFrame(frame) {
        if (!frame || typeof frame !== 'object') return { keep: true, data: null };
        if (frame.routing === 'NEW_MESSAGE' || frame.routing === 'UPDATE_MESSAGE') {
            if (frame.data) {
                indexMessage(frame.data);
                if (isBlockedSender(frame.data)) return { keep: false, data: null };
            }
            return { keep: true, data: null };
        }
        if (frame.routing === 'GROUP' && Array.isArray(frame.messages)) {
            let changed = false;
            const kept = [];
            for (const sub of frame.messages) {
                const r = filterWsFrame(sub);
                if (!r.keep) { changed = true; continue; }
                if (r.data) { kept.push(r.data); changed = true; }
                else kept.push(sub);
            }
            if (changed) {
                if (kept.length === 0) return { keep: false, data: null };
                return { keep: true, data: { ...frame, messages: kept } };
            }
            return { keep: true, data: null };
        }
        return { keep: true, data: null };
    }

    function patchWsOnMessage(ws) {
        let userHandler = null;
        const protoDesc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
        const nativeSet = protoDesc && protoDesc.set;
        if (!nativeSet) return;
        const wrapper = (ev) => {
            let out = ev;
            if (typeof ev.data === 'string') {
                try {
                    const frame = JSON.parse(ev.data);
                    const r = filterWsFrame(frame);
                    if (!r.keep) return; // 丢弃整帧
                    if (r.data) out = new MessageEvent('message', { data: JSON.stringify(r.data) });
                } catch (e) { /* 原样放行 */ }
            }
            if (userHandler) userHandler.call(ws, out);
        };
        Object.defineProperty(ws, 'onmessage', {
            configurable: true,
            enumerable: true,
            get() { return userHandler; },
            set(fn) {
                userHandler = fn;
                try { nativeSet.call(ws, wrapper); } catch (e) { /* 忽略 */ }
            }
        });
    }

    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket === 'function') {
        try {
            window.WebSocket = new Proxy(NativeWebSocket, {
                construct(target, args) {
                    const ws = new target(...args);
                    try { patchWsOnMessage(ws); } catch (e) { /* 忽略 */ }
                    return ws;
                }
            });
        } catch (e) { /* 忽略：不支持则退化为 DOM 兜底 */ }
    }

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
    // 开关切换/名单变更后调用：开启→立即扫描占位隐藏+补按钮；关闭→清理
    window.scChatBlockRefresh = () => {
        initAttempts = 0;
        init();
        if (isEnabled()) scanAll();
        else cleanupUI();
    };

    // ---------- 聊天容器与消息组解析 ----------
    function findChatContainers() {
        const byClass = document.querySelectorAll(CHAT_CONTAINER_SEL);
        if (byClass.length > 0) return byClass;
        return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
    }
    function isChatContainer(el) {
        if (!el || el.nodeType !== 1 || !el.matches) return false;
        return el.matches(CHAT_CONTAINER_SEL) ||
            el.matches('div[style*="column-reverse"][style*="overflow"]');
    }
    function senderCompanyLink(row) {
        if (!row || !row.children) return null;
        for (let i = 0; i < row.children.length; i++) {
            const ch = row.children[i];
            if (ch.tagName === 'A' && (ch.getAttribute('href') || '').includes('/company/')) return ch;
        }
        return null;
    }
    function parseCompanyHref(a) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/company\/(\d+)\/([^/?#]+)/);
        return m ? { realmId: Number(m[1]), name: m[2] } : null;
    }
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
    function findReplyButton(row) {
        const icons = row.querySelectorAll('button svg[data-icon="reply"]');
        for (const ic of icons) {
            const btn = ic.closest('button');
            if (btn) return btn;
        }
        return null;
    }

    // ---------- DOM 兜底：占位隐藏 + 屏蔽按钮注入 ----------
    function injectStyles() {
        if (styleInjected) return;
        styleInjected = true;
        const style = document.createElement('style');
        // 隐藏且高度归零：不占视觉空间；保留 DOM 节点（不做 remove()/display:none），
        // 避免 React 以该节点为 insertBefore 锚点时失效。
        style.textContent = `.${HIDDEN_CLASS}{visibility:hidden !important;height:0 !important;min-height:0 !important;max-height:0 !important;padding-top:0 !important;padding-bottom:0 !important;margin-top:0 !important;margin-bottom:0 !important;border-width:0 !important;overflow:hidden !important;}`;
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
        ensureObserved(container);
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
    function isBlockedRow(row) {
        const info = resolveSender(row);
        return !!(info && typeof info.id === 'number' && blockedIds().has(info.id));
    }
    function scanAll() {
        if (!isEnabled()) return;
        findChatContainers().forEach(c => processContainer(c));
    }
    function cleanupUI() {
        document.querySelectorAll(`.${BTN_CLASS}`).forEach(b => b.remove());
        document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(el => el.classList.remove(HIDDEN_CLASS));
    }

    // MutationObserver 触发后立即重扫：微任务在浏览器绘制前执行，避免"先看到再隐藏"闪现
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

    function ensureObserved(container) {
        if (!observer || observedContainers.has(container)) return;
        observedContainers.add(container);
        observer.observe(container, { childList: true, subtree: true });
    }
    function ensureBodyObserver() {
        if (bodyObserver) return;
        bodyObserver = new MutationObserver((muts) => {
            if (!isEnabled()) return;
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (n.matches && n.matches(CHAT_CONTAINER_SEL_ALL)) { scheduleScan(); return; }
                    if (n.closest && n.closest(CHAT_CONTAINER_SEL_ALL)) { scheduleScan(); return; }
                }
            }
        });
        // 容器元素可能被 React 整体重建，观察 body 以尽快覆盖新容器
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
    function detachBodyObserver() {
        if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
    }

    // ---------- 生命周期 ----------
    function init() {
        if (observer) { observer.disconnect(); observer = null; }
        observedContainers = new WeakSet();
        injectStyles();
        const containers = findChatContainers();
        if (containers.length === 0) {
            detachBodyObserver();
            if (initAttempts < 8) {
                initAttempts++;
                containerWatchTimer = setTimeout(init, 1000);
            }
            return;
        }
        initAttempts = 0;
        observer = new MutationObserver(scheduleScan);
        containers.forEach(c => ensureObserved(c));
        if (isEnabled()) {
            scanAll();
            ensureBodyObserver();
        } else {
            detachBodyObserver();
        }
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