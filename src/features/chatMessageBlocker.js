// ======================
// 聊天室全局屏蔽（v2.3：CSS :has 预隐藏 + WS 实时过滤 + JS 兜底）
// ----------------------
// 屏蔽名单：SC_ChatBlock_List（全局键，backup:true）→ [{ id, name, realmId, slug }]；
//   id 为游戏内公司唯一 id（sender.id），匹配以 id 为准；slug 为 href 里的公司段，
//   用于注入 CSS 预隐藏规则。
//
// 为什么不改 HTTP 响应：
//   bundle :299934 fullHistory = r.length < 30 —— 游戏按"返回条数 < 30"判断历史已到底，
//   过滤响应会误判并停载历史（曾复现）。因此聊天室 GET 一律不改，仅登记 sender。
//
// CSS 预隐藏（核心，杜绝"先看到再隐藏"闪现）：
//   每屏蔽一个 (realm, slug) 注入一条规则：
//     div:has(> a[href*="/company/<realm>/<slug>/"]) { visibility:hidden; height:0; ... }
//   消息组 div 的直接子级就是公司链接 a；浏览器在渲染/样式计算阶段即命中该规则，
//   从缓存重绘/整列挂载时被屏蔽行天然不占空间、不显示 —— 无需等待 JS，不会闪现。
//   （:has 由 Chrome105+/Safari15.4+/Firefox121+ 支持；旧浏览器回退到 JS 兜底。）
//
// 实时消息（WebSocket）：NEW_MESSAGE/UPDATE_MESSAGE/GROUP 帧命中名单 sender.id 直接丢弃。
// JS 兜底：MutationObserver + body 常驻监听，对新挂载行补隐藏（同帧微任务）。
// 屏蔽按钮：注入到组内回复按钮（svg[data-icon="reply"]）之后，点击按 id 加入名单。
// 名单自愈：被屏蔽者 id 不变但改名时，网络数据一出现该 id 即更新 name/realmId，
//   DOM 兜底隐藏时顺带更新 slug 并重建 CSS，之后缓存整列挂载也不闪。
//
// v1 遗留：旧键 SC_ChatBlock_Names（字符串名单）不再读写，用户自行清空。
//
// 未来失效检查点（对照 bundle index-CcG5yGSH.js）：
//   - 端点路径变化 → :38472-38473
//   - 消息字段改名 → :71291-71301（sender.id / sender.company）
//   - fullHistory 判定 → :299934（r.length < 30）
//   - WS 事件结构 → :71105-71195；WS 客户端 :70544-70567（onmessage 属性赋值方式）
//   - 聊天 DOM：容器 :290732-290737（css-xo2rg1/e1llepen2）、消息组/按钮结构 :291485-291551
//   - 消息组"直接子级 = 公司链接"的结构若变化，:has 规则与按钮定位都要检查
// ======================
import { registerExportInfo } from '../core/exportInfo.js';

(function () {
    'use strict';

    const MODULE_KEY = 'chatBlock';
    const STORAGE_KEY = 'SC_ChatBlock_List';
    const CHATROOM_URL_RE = /\/api\/v2\/chatroom\/[^/?#]+(\/from-id\/\d+)?\/?(\?|$)/;
    const HIDDEN_CLASS = 'sc-chatblock-hidden';
    const BTN_CLASS = 'sc-chat-block-btn';
    const QUICK_CLASS = 'sc-chat-block-quick';
    const CSS_ID = 'sc-chatblock-css';
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
    let cssReady = false;
    let paused = false; // 标题按钮"临时暂停屏蔽"（仅本次会话；看消息用，非功能总开关）
    let blockedCache = null;
    let observedContainers = new WeakSet();
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
    // 是否真正在屏蔽：功能开启且未临时暂停
    function isBlockingActive() {
        return isEnabled() && !paused;
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
        syncCss();
    }
    function normalizeName(raw) {
        let s = String(raw == null ? '' : raw).trim().toLowerCase();
        try { s = decodeURIComponent(s); } catch (e) { /* 原样 */ }
        return s.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    }
    function entryKey(realmId, company) {
        return String(realmId == null ? '?' : realmId) + '|' + normalizeName(company);
    }

    // ---------- CSS：基础隐藏类 + 每条屏蔽的 :has 预隐藏规则 ----------
    const HIDE_BASE = `.${HIDDEN_CLASS}{visibility:hidden !important;height:0 !important;min-height:0 !important;max-height:0 !important;padding-top:0 !important;padding-bottom:0 !important;margin-top:0 !important;margin-bottom:0 !important;border-width:0 !important;overflow:hidden !important;}`;
    function cssEscapeStr(s) {
        return String(s).replace(/["\\]/g, (m) => '\\' + m);
    }
    function syncCss() {
        let el = document.getElementById(CSS_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = CSS_ID;
            document.head.appendChild(el);
        }
        let css = HIDE_BASE;
        if (isEnabled() && !paused) { // 暂停时移除 :has 预隐藏规则
            // 只作用于聊天容器内部的消息组（组直接子级 = 公司链接 a），避免误伤页面其它公司链接
            for (const e of readList()) {
                if (typeof e.realmId === 'number' && e.slug) {
                    const hrefPart = '/company/' + e.realmId + '/' + e.slug + '/';
                    const rule = `visibility:hidden !important;height:0 !important;min-height:0 !important;max-height:0 !important;padding-top:0 !important;padding-bottom:0 !important;margin-top:0 !important;margin-bottom:0 !important;border-width:0 !important;overflow:hidden !important;`;
                    css += `div.css-xo2rg1.e1llepen2 div:has(> a[href*="${cssEscapeStr(hrefPart)}"]){${rule}}`;
                    css += `div[style*="column-reverse"][style*="overflow"] div:has(> a[href*="${cssEscapeStr(hrefPart)}"]){${rule}}`;
                }
            }
        }
        el.textContent = css;
        cssReady = true;
    }
    function ensureCss() {
        if (!cssReady || !document.getElementById(CSS_ID)) syncCss();
        else syncCss();
    }

    // ---------- 数据登记（不改动任何响应/帧内容） ----------
    function indexSender(sender) {
        if (sender && typeof sender.id === 'number' && sender.company) {
            senderIndex.set(entryKey(sender.realmId, sender.company), {
                id: sender.id,
                name: sender.company,
                realmId: sender.realmId
            });
            // 名单自愈：被屏蔽者改名后，网络数据里一出现该 id 就同步最新公司名/领域
            updateBlockedEntryFromSender(sender);
        }
    }

    // 用网络数据更新名单中该 id 的名字/领域（id 不变、名字变了也能持续识别）
    function updateBlockedEntryFromSender(sender) {
        if (!sender || typeof sender.id !== 'number') return;
        if (!blockedIds().has(sender.id)) return;
        let changed = false;
        const list = readList();
        for (const e of list) {
            if (Number(e.id) === sender.id) {
                if (sender.company && String(e.name || '') !== String(sender.company)) {
                    e.name = sender.company;
                    changed = true;
                }
                if (sender.realmId != null && Number(e.realmId) !== Number(sender.realmId)) {
                    e.realmId = Number(sender.realmId);
                    changed = true;
                }
            }
        }
        if (changed) {
            writeList(list);
            invalidateCache(); // 重建 CSS 预隐藏规则
        }
    }

    // 用 DOM 消息组链接更新名单中该 id 的 slug（改名后新链接段），并重建 CSS
    function rememberRowSlug(row, info) {
        if (!row || !info || typeof info.id !== 'number') return;
        const link = senderCompanyLink(row);
        if (!link) return;
        const p = parseCompanyHref(link);
        if (!p) return;
        let changed = false;
        const list = readList();
        for (const e of list) {
            if (Number(e.id) === info.id && (!e.slug || e.slug !== p.slug)) {
                e.slug = p.slug;
                changed = true;
            }
        }
        if (changed) {
            writeList(list);
            invalidateCache();
        }
    }
    function indexMessage(m) {
        if (m && m.sender) indexSender(m.sender);
    }
    function isBlockedSender(m) {
        const sid = m && m.sender && m.sender.id;
        return typeof sid === 'number' && blockedIds().has(sid);
    }

    // ---------- HTTP 钩子：仅登记 sender ----------
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

    // ---------- WebSocket 钩子：实时消息按名单过滤 ----------
    function filterWsFrame(frame) {
        if (!frame || typeof frame !== 'object') return { keep: true, data: null };
        if (frame.routing === 'NEW_MESSAGE' || frame.routing === 'UPDATE_MESSAGE') {
            if (frame.data) {
                indexMessage(frame.data);
                if (isBlockingActive() && isBlockedSender(frame.data)) return { keep: false, data: null };
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
                    if (!r.keep) return;
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
        } catch (e) { /* 忽略 */ }
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
            realmId: (entry && entry.realmId != null) ? Number(entry.realmId) : null,
            slug: (entry && entry.slug) ? String(entry.slug) : undefined
        });
        writeList(list);
        invalidateCache(); // 同步重建 CSS 预隐藏规则
        return { ok: true, id, name };
    };
    window.scChatBlockRemoveById = (id) => {
        const n = Number(id);
        writeList(readList().filter(e => Number(e.id) !== n));
        invalidateCache();
        return { ok: true };
    };
    // 开关切换/名单变更后调用
    window.scChatBlockRefresh = () => {
        initAttempts = 0;
        syncCss();
        init();
        if (isEnabled()) scanAll();
        else cleanupUI();
    };
    // 导入"当前领域"游戏内黑名单（/api/v2/contacts/ 的 ignoringCompanies，均为公司唯一 id）。
    // 注意：被屏蔽对象不一定是当前领域的公司，因此导入时【不写 realmId】，
    // 只在第一次在聊天数据里见到该 id 时自动补正确领域/名字/slug。
    window.scChatBlockImportFromGame = async () => {
        let ids;
        try {
            const resp = await fetch('/api/v2/contacts/', { credentials: 'same-origin' });
            if (!resp.ok) return { ok: false, error: 'HTTP ' + resp.status };
            const data = await resp.json();
            ids = Array.isArray(data && data.ignoringCompanies) ? data.ignoringCompanies : [];
        } catch (e) {
            return { ok: false, error: (e && e.message) ? e.message : String(e) };
        }
        let added = 0;
        let duplicate = 0;
        const list = readList();
        for (const raw of ids) {
            const id = Number(raw);
            if (!Number.isFinite(id)) continue;
            if (list.some(e => Number(e.id) === id)) { duplicate++; continue; }
            list.push({ id, name: '' });
            added++;
        }
        if (added > 0) {
            writeList(list);
            invalidateCache();
        }
        return { ok: true, added, duplicate };
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
        return m ? { realmId: Number(m[1]), slug: m[2] } : null;
    }
    function resolveSender(row) {
        const link = senderCompanyLink(row);
        if (!link) return null;
        const p = parseCompanyHref(link);
        if (!p) return null;
        const idxInfo = senderIndex.get(entryKey(p.realmId, p.slug));
        if (idxInfo) return idxInfo;
        const slugNorm = normalizeName(p.slug);
        for (const e of readList()) {
            if (typeof e.id === 'number' && Number(e.realmId) === p.realmId &&
                normalizeName(e.name || e.slug) === slugNorm) {
                return { id: e.id, name: e.name || e.slug, realmId: p.realmId, slug: e.slug || p.slug };
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

    // ---------- JS 兜底：隐藏 + 屏蔽按钮注入 ----------
    function injectBlockButton(row) {
        if (row.classList.contains(HIDDEN_CLASS)) return;
        if (row.querySelector(`.${BTN_CLASS}`)) return;
        const link = senderCompanyLink(row);
        if (!link) return;
        const cur = resolveSender(row);
        if (!cur || typeof cur.id !== 'number') return; // 未解析到唯一 id 不提供按钮
        const replyBtn = findReplyButton(row);
        if (!replyBtn) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BTN_CLASS;
        btn.title = '屏蔽此人消息';
        btn.setAttribute('aria-label', '屏蔽此人');
        // 颜色随官方图标：color:inherit 自动适配深浅色，不单独着色
        btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0 4px;line-height:1;display:inline-flex;align-items:center;color:inherit;';
        // eye-off 图标（lucide），stroke=currentColor 由按钮颜色控制
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';
        const doBlock = (rowInfo) => {
            const p = parseCompanyHref(link);
            const res = window.scChatBlockAddById
                ? window.scChatBlockAddById({ id: rowInfo.id, name: rowInfo.name, realmId: p ? p.realmId : rowInfo.realmId, slug: p ? p.slug : undefined })
                : { ok: false };
            if (res && (res.ok || res.reason === 'duplicate')) {
                if (!paused) row.classList.add(HIDDEN_CLASS); // 暂停查看期间不立即隐藏
                window.scChatBlockRefresh && window.scChatBlockRefresh();
            }
        };

        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            const rowInfo = resolveSender(row);
            if (!rowInfo || typeof rowInfo.id !== 'number') {
                btn.style.opacity = '0.35';
                setTimeout(() => { btn.style.opacity = '1'; }, 1200);
                return;
            }
            // 已在旁边显示确认条时再次点击视为确认（两步点）
            const existing = row.querySelector('.sc-chat-block-confirm');
            if (existing) {
                existing.remove();
                doBlock(rowInfo);
                return;
            }
            // 其它行残留的确认条先清理，避免同时出现多个
            document.querySelectorAll('.sc-chat-block-confirm').forEach(c => c.remove());

            const chip = document.createElement('span');
            chip.className = 'sc-chat-block-confirm';
            chip.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:2px;font-size:11px;line-height:1;color:inherit;white-space:nowrap;';
            const label = document.createElement('span');
            label.textContent = `屏蔽“${rowInfo.name}”?`;
            label.style.cssText = 'opacity:.85;';
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.textContent = '✓';
            okBtn.title = '确认屏蔽';
            okBtn.setAttribute('aria-label', '确认屏蔽');
            okBtn.style.cssText = 'background:none;border:1px solid currentColor;border-radius:3px;cursor:pointer;font-size:10px;line-height:1;padding:1px 4px;color:#4CAF50;';
            const noBtn = document.createElement('button');
            noBtn.type = 'button';
            noBtn.textContent = '✕';
            noBtn.title = '取消';
            noBtn.setAttribute('aria-label', '取消屏蔽');
            noBtn.style.cssText = 'background:none;border:1px solid currentColor;border-radius:3px;cursor:pointer;font-size:10px;line-height:1;padding:1px 4px;color:inherit;opacity:.7;';
            okBtn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); chip.remove(); doBlock(rowInfo); };
            noBtn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); chip.remove(); };
            chip.append(label, okBtn, noBtn);
            btn.insertAdjacentElement('afterend', chip);
            // 6 秒未操作自动取消
            setTimeout(() => chip.remove(), 6000);
        });
        replyBtn.insertAdjacentElement('afterend', btn);
    }

    function processContainer(container) {
        if (!isEnabled()) return;
        const active = isBlockingActive();
        ensureObserved(container);
        const rows = container.querySelectorAll(':scope > div');
        for (const row of rows) {
            if (row.classList.contains(HIDDEN_CLASS)) continue;
            const info = resolveSender(row);
            if (info && typeof info.id === 'number' && blockedIds().has(info.id)) {
                if (!active) continue; // 暂停期间：不隐藏，也不在其上放屏蔽按钮（供查看）
                row.classList.add(HIDDEN_CLASS);
                rememberRowSlug(row, info); // 记录最新 slug（改名自愈）
                continue;
            }
            injectBlockButton(row);
        }
    }
    function scanAll() {
        if (!isEnabled()) return;
        findChatContainers().forEach(c => processContainer(c));
        updateQuickButtons();
    }
    function cleanupUI() {
        paused = false;
        document.querySelectorAll(`.${BTN_CLASS}`).forEach(b => b.remove());
        document.querySelectorAll('.sc-chat-block-confirm').forEach(c => c.remove());
        document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(el => el.classList.remove(HIDDEN_CLASS));
        syncCss(); // 关闭时移除 :has 预隐藏规则
        updateQuickButtons(); // 功能关闭 → 移除标题按钮
    }

    // ---------- 标题"临时暂停屏蔽"按钮（仅功能开启时显示，紧挨标题文字左侧） ----------
    // 目的：暂时解除屏蔽以便查看被屏蔽消息，不是功能总开关（总开关在功能开关设置里）
    function chatRoomHeaders() {
        return Array.from(document.querySelectorAll('div.well-header.text-uppercase'));
    }
    function insertBeforeTitle(header, btn) {
        // 紧挨标题文字左侧：插到第一个有内容的文本节点前（跳过图标/其它控件/空白）
        let ref = header.firstChild;
        while (ref) {
            if (ref.nodeType === 3) {
                if (ref.textContent && ref.textContent.trim()) break;
            }
            ref = ref.nextSibling;
        }
        header.insertBefore(btn, ref || header.firstChild);
    }
    // 暂停 = 解除隐藏 + 去掉 :has 规则 + 放行实时消息；恢复 = 重新隐藏
    function setPaused(v) {
        if (paused === v) return;
        paused = v;
        if (v) {
            document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(el => el.classList.remove(HIDDEN_CLASS));
            syncCss(); // paused=true 时 syncCss 不注入 :has 规则
        } else {
            syncCss();
            scanAll();
        }
        updateQuickButtons();
    }
    function updateQuickButtons() {
        const on = isEnabled();
        if (!on) {
            document.querySelectorAll(`.${QUICK_CLASS}`).forEach(b => b.remove());
            return;
        }
        chatRoomHeaders().forEach(header => {
            let btn = header.querySelector(`.${QUICK_CLASS}`);
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = QUICK_CLASS;
                btn.style.cssText = 'background:none;border:1px solid currentColor;border-radius:4px;cursor:pointer;font-size:12px;padding:1px 6px;margin-right:8px;vertical-align:middle;line-height:1.4;color:inherit;opacity:0.8;';
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    setPaused(!paused);
                });
                insertBeforeTitle(header, btn);
            }
            btn.textContent = paused ? '▶ 恢复屏蔽' : '⏸ 暂停屏蔽';
            btn.title = paused ? '恢复屏蔽（再次隐藏被屏蔽消息）' : '暂时解除屏蔽，显示被屏蔽的消息（供查看）';
        });
    }

    // 微任务同帧重扫（兜底）
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
                    const cont = (n.matches && n.matches(CHAT_CONTAINER_SEL_ALL))
                        ? n
                        : (n.closest ? n.closest(CHAT_CONTAINER_SEL_ALL) : null);
                    if (cont && !observedContainers.has(cont)) {
                        scanAll();
                        return;
                    }
                }
            }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
    function detachBodyObserver() {
        if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
    }

    // ---------- 生命周期 ----------
    function init() {
        if (observer) { observer.disconnect(); observer = null; }
        observedContainers = new WeakSet();
        ensureCss();
        if (!isEnabled()) {
            detachBodyObserver();
            return;
        }
        ensureBodyObserver();
        const containers = findChatContainers();
        if (containers.length === 0) {
            if (initAttempts < 8) {
                initAttempts++;
                containerWatchTimer = setTimeout(init, 1000);
            }
            return;
        }
        initAttempts = 0;
        observer = new MutationObserver(scheduleScan);
        containers.forEach(c => ensureObserved(c));
        scanAll();
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

    setTimeout(() => {
        ensureCss();
        init();
    }, 500);
})();