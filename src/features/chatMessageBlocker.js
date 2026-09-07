// ======================
// 聊天室全局屏蔽（v1.1：按公司名匹配 + CSS 隐藏）
// ----------------------
// 屏蔽名单：SC_ChatBlock_Names（全局键，backup:true 可随设置备份）。
// 匹配方式：聊天消息行内公司主页链接 href 中的公司 slug，与名单名称做归一化比较
//   （小写 + 去除非字母/数字/汉字，空格与连字符视为相同：
//    "Super Super Poop" / "super super poop" / slug "super-super-poop" 互相命中）。
// 隐藏：命中名单的消息行保留在 DOM 中，仅加 .sc-chatblock-hidden（display:none !important）
//   使其不可见且不占空间。不直接 remove()：React 上滚加载历史时会拿"当前首条消息"当
//   insertBefore 锚点，直接删除会让锚点脱离 DOM 触发 NotFoundError。
// v1 限制：按公司名匹配，同名但不同领域的公司会一起被屏蔽（跨领域误伤风险，
//   待后续按游戏 id 细化）。
// 聊天容器选择器与 paQuestAnswers/chatAccessibility 相同。
// ======================
import { registerExportInfo } from '../core/exportInfo.js';

(function () {
    'use strict';

    const MODULE_KEY = 'chatBlock';
    const STORAGE_KEY = 'SC_ChatBlock_Names';
    const COMPANY_LINK_SELECTOR = 'a[href*="/company/"]';
    const HIDDEN_CLASS = 'sc-chatblock-hidden';
    let styleInjected = false;

    registerExportInfo({
        name: '聊天室全局屏蔽名单',
        scope: 'global',
        backup: true,
        keys: [STORAGE_KEY]
    });

    let observer = null;
    let scanTimer = null;
    let containerWatchTimer = null;
    let initAttempts = 0;

    // 开关状态（默认关闭，与设置面板 defaultEnabled:false 一致）
    function isEnabled() {
        try {
            const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            return cfg[MODULE_KEY] === true;
        } catch (e) {
            return false;
        }
    }

    // ---------- 名单存储 ----------
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

    // 归一化：小写 + 去首尾空格 + 去除非字母/数字/汉字（空格、连字符等一并去除）
    function normalizeName(raw) {
        let s = String(raw == null ? '' : raw).trim().toLowerCase();
        try { s = decodeURIComponent(s); } catch (e) { /* 原样保留 */ }
        return s.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    }

    // 供设置面板 UI 调用
    window.scChatBlockList = () => readList();
    window.scChatBlockAdd = (raw) => {
        const name = String(raw == null ? '' : raw).trim();
        if (!name) return { ok: false, reason: 'empty' };
        const norm = normalizeName(name);
        if (!norm) return { ok: false, reason: 'invalid' };
        const list = readList();
        for (const existing of list) {
            if (normalizeName(existing) === norm) return { ok: false, reason: 'duplicate' };
        }
        list.push(name);
        writeList(list);
        return { ok: true, name };
    };
    window.scChatBlockRemove = (raw) => {
        writeList(readList().filter(n => n !== raw));
        return { ok: true };
    };

    // ---------- 聊天容器与消息行 ----------
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

    // 从公司主页链接提取公司 slug（/company/<realm>/<name>/ 或带域名/语言前缀）
    function companySlugFromLink(a) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/company\/\d+\/([^/?#]+)/);
        return m ? m[1] : null;
    }


    // 注入隐藏样式（display:none 需 !important 以覆盖行内/类样式）
    function injectStyles() {
        if (styleInjected) return;
        styleInjected = true;
        const style = document.createElement('style');
        style.textContent = `.${HIDDEN_CLASS}{display:none !important;}`;
        document.head.appendChild(style);
    }

    // 扫描单个容器：隐藏命中屏蔽名单的消息行（保留 DOM，避免 React insertBefore 锚点失效）
    function scanContainer(container) {
        const list = readList();
        if (list.length === 0) return 0;
        const normSet = new Set(list.map(normalizeName));
        const rows = container.querySelectorAll(':scope > div');
        let hidden = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.classList || row.classList.contains(HIDDEN_CLASS)) continue;
            const links = row.querySelectorAll(COMPANY_LINK_SELECTOR);
            let hit = false;
            for (let j = 0; j < links.length; j++) {
                const slug = companySlugFromLink(links[j]);
                if (slug && normSet.has(normalizeName(slug))) { hit = true; break; }
            }
            if (hit) { row.classList.add(HIDDEN_CLASS); hidden++; }
        }
        return hidden;
    }

    function scanAll() {
        if (!isEnabled()) return;
        findChatContainers().forEach(c => scanContainer(c));
    }

    // MutationObserver 触发后防抖重扫
    function scheduleScan() {
        if (!isEnabled()) return;
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(() => { scanTimer = null; scanAll(); }, 120);
    }

    // 供开关切换 / 名单变更后调用：立即删除当前可见的屏蔽消息
    window.scChatBlockRefresh = () => {
        initAttempts = 0;
        init();
        scanAll();
    };

    // ---------- 生命周期 ----------
    function init() {
        if (observer) { observer.disconnect(); observer = null; }
        const containers = findChatContainers();
        if (containers.length === 0) {
            // 聊天容器尚未渲染：有限次重试，SPA 导航/开关切换会再次触发
            if (initAttempts < 8) {
                initAttempts++;
                containerWatchTimer = setTimeout(init, 1000);
            }
            return;
        }
        initAttempts = 0;
        injectStyles();
        if (isEnabled()) scanAll();
        observer = new MutationObserver(scheduleScan);
        containers.forEach(c => observer.observe(c, { childList: true, subtree: true }));
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

    setTimeout(init, 800);
})();