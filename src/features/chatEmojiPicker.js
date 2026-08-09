import { resourceIdNameMap } from '../constants/resourceMap.js';
import { DM } from '../utils/ui.js';
import { registerExportInfo } from '../core/exportInfo.js';

registerExportInfo({
    name: '聊天表情选择器最近使用',
    scope: 'global',
    keys: ['SC_EmojiPicker_Recent']
});

(function () {
    'use strict';

    const MODULE_KEY = 'chatEmojiPicker';
    const BUTTON_SELECTOR = '[data-sc-emoji-picker-added]';
    const BUNDLE_SELECTOR = 'script[type="module"][crossorigin][src^="https://www.simcompanies.com/static/bundle/assets/index-"][src$=".js"]';
    const RECENT_KEY = 'SC_EmojiPicker_Recent';
    const RECENT_MAX = 30;

    const BUILDING_NAMES = {
        P: '农场',
        W: '水库',
        E: '发电厂',
        O: '油田',
        R: '炼油厂',
        S: '运输站',
        G: '杂货店',
        C: '电子产品商店',
        A: '加油站',
        F: '牧场',
        M: '矿井',
        Y: '工厂',
        L: '电子工厂',
        T: '时装工厂',
        B: '销售办公室',
        d: '五金店',
        g: '建筑承包商',
        H: '时装店',
        i: '磨坊',
        I: '春季市场',
        j: '面包房',
        k: '食品加工厂',
        m: '餐饮',
        n: '屠宰场',
        o: '混凝土厂',
        p: '推进器工厂',
        Q: '采石场',
        r: '餐厅',
        t: '苗圃',
        x: '建筑工厂',
        y: '学院',
        z: '泳池市场',
    };

    let openPanel = null;
    let openButton = null;
    let variantPopup = null;
    let scanTimer = null;
    let started = false;
    let lastUrl = location.href;
    let emojiDataPromise = null;
    let insertQueue = Promise.resolve();

    function isEnabled() {
        try {
            const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            return cfg[MODULE_KEY] !== false;
        } catch (e) {
            return true;
        }
    }

    function isChatInput(el) {
        if (!el || el.tagName !== 'TEXTAREA') return false;
        if (!el.closest('.input-group')) return false;

        let cur = el.parentElement;
        while (cur && cur !== document.body) {
            if (cur.classList.contains('e1llepen1') ||
                cur.querySelector('.e1llepen2') ||
                cur.querySelector('div[style*="column-reverse"]')) {
                return true;
            }
            cur = cur.parentElement;
        }
        return false;
    }

    function getStaticBaseUrl() {
        try {
            const props = window.reactjs && window.reactjs.props;
            const staticUrl = props && props.staticUrl;
            if (typeof staticUrl === 'string' && staticUrl) {
                if (staticUrl.startsWith('http')) return staticUrl.replace(/\/?$/, '/');
                return location.origin + (staticUrl.startsWith('/') ? staticUrl : '/' + staticUrl);
            }
        } catch (e) { /* ignore */ }
        return location.origin + '/static/';
    }

    function getBundleUrl() {
        const tag = document.querySelector(BUNDLE_SELECTOR);
        return tag ? tag.src : '';
    }

    function getEmojiSourceUrls() {
        const urls = new Set();
        const mainUrl = getBundleUrl();
        if (mainUrl) urls.add(mainUrl);
        document.querySelectorAll('script[src]').forEach(script => {
            const src = script.src;
            if (!src) return;
            if (/\.js(\?|#)?$/.test(src) &&
                (src.toLowerCase().includes('emoji') || /\/assets\/[^/]*index-[^/]+\.js$/.test(src))) {
                urls.add(src);
            }
        });
        return Array.from(urls);
    }

    async function requestBundleRaw(url) {
        const network = window.__SC_Network;
        if (network && typeof network.requestRaw === 'function') {
            return await network.requestRaw(url);
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('bundle-fetch-failed');
        return await res.text();
    }

    function parseAssetMap(raw) {
        const match = raw.match(/JSON\.parse\('((?:\\.|[^'\\])*)'\)/);
        if (!match) return {};
        try {
            return JSON.parse(match[1]);
        } catch (e) {
            return {};
        }
    }

    function resolveAssetUrl(assets, path) {
        const hashed = assets[path] || path;
        return getStaticBaseUrl() + hashed;
    }

    function parseSpecialEmojis(raw, assets) {
        const fallback = [
            { code: ':sc:', name: 'Sim Companies', image: resolveAssetUrl(assets, 'images/logo.png') },
            { code: ':simboosts:', name: 'Sim Boosts', image: resolveAssetUrl(assets, 'images/sim-boosts2.png') },
        ];
        try {
            const start = raw.indexOf('const qBt =');
            if (start === -1) return fallback;
            const end = raw.indexOf('tMn =', start);
            const segment = end === -1 ? raw.slice(start) : raw.slice(start, end);
            const entryRe = /\{\s*name:\s*"([^"]+)",\s*shortNames:\s*\[([^\]]+)\],\s*imageUrl:\s*xe\("([^"]+)"\)/g;
            const result = [];
            let match;
            while ((match = entryRe.exec(segment)) !== null) {
                const names = match[2].match(/"([^"]+)"/g) || [];
                const first = names[0] ? names[0].slice(1, -1) : '';
                if (!first) continue;
                result.push({
                    code: `:${first}:`,
                    name: match[1],
                    image: resolveAssetUrl(assets, match[3]),
                });
            }
            return result.length > 0 ? result : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function parseEmojiData(raw) {
        const assets = parseAssetMap(raw);
        const resources = [];
        const seenResources = new Set();
        const resourceRe = /\bdbLetter:\s*(\d+),[\s\S]{0,2500}?image:\s*"images\/resources\/([^"]+)"/g;
        let match;
        while ((match = resourceRe.exec(raw)) !== null) {
            const id = Number(match[1]);
            if (seenResources.has(id)) continue;
            seenResources.add(id);
            resources.push({
                code: `:re-${id}:`,
                name: resourceIdNameMap[id] || '',
                image: resolveAssetUrl(assets, 'images/resources/' + match[2]),
            });
        }
        resources.sort((a, b) => Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, '')));

        const buildings = [];
        const seenBuildings = new Set();
        const buildingRe = /\bdbLetter:\s*"([A-Za-z])",[\s\S]{0,4000}?levelImages:\s*\[\s*\{\s*level:\s*\d+,\s*image:\s*"([^"]+)"/g;
        while ((match = buildingRe.exec(raw)) !== null) {
            const file = match[2];
            if (!file.startsWith('images/buildings/') || seenBuildings.has(match[1])) continue;
            seenBuildings.add(match[1]);
            buildings.push({
                code: `:bd-${match[1]}:`,
                name: BUILDING_NAMES[match[1]] || '',
                image: resolveAssetUrl(assets, file),
            });
        }
        buildings.sort((a, b) => a.code.localeCompare(b.code));

        const eggs = [];
        const eggRe = /id:\s*"([A-Z0-9_]+)",\s*rarity:\s*"[A-Z]+",\s*image:\s*"([^"]+)"/g;
        while ((match = eggRe.exec(raw)) !== null) {
            const file = match[2];
            if (!file.startsWith('images/eggs/')) continue;
            eggs.push({
                code: `:egg-${match[1]}:`,
                name: match[1].replace(/_/g, ' '),
                image: resolveAssetUrl(assets, file),
            });
        }
        eggs.sort((a, b) => a.code.localeCompare(b.code));

        const realms = [];
        const realmRe = /\b(\d+):\s*\{\s*idx:\s*(\d+),\s*textId:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*logo:\s*"([^"]+)"/g;
        while ((match = realmRe.exec(raw)) !== null) {
            realms.push({
                code: `:realm-${Number(match[2]) + 1}:`,
                name: match[4],
                image: resolveAssetUrl(assets, match[5]),
            });
        }
        realms.sort((a, b) => Number(a.code.replace(/\D/g, '')) - Number(b.code.replace(/\D/g, '')));

        return {
            resources,
            buildings,
            eggs,
            realms,
            special: parseSpecialEmojis(raw, assets),
            other: parseUnicodeEmojis(raw),
        };
    }

    function parseUnicodeEmojis(raw) {
        const seen = new Set();
        const result = [];
        const patterns = [
            /emoji:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g,
            /description:\s*"([^"]+)",\s*emoji:\s*"([^"]+)"/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(raw)) !== null) {
                const emojiRaw = pattern.source.startsWith('emoji') ? match[1] : match[2];
                const name = pattern.source.startsWith('emoji') ? match[2] : match[1];
                let emoji = emojiRaw;
                try {
                    emoji = JSON.parse('"' + emojiRaw + '"');
                } catch (e) { /* keep raw */ }
                if (seen.has(emoji)) continue;
                seen.add(emoji);
                result.push({
                    code: emoji,
                    emoji,
                    name,
                });
            }
        }

        const grouped = new Map();
        for (const item of result) {
            const base = item.emoji.replace(/[\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, '');
            if (!base) continue;
            if (!grouped.has(base)) {
                grouped.set(base, { item, variants: [] });
                continue;
            }
            const group = grouped.get(base);
            if (item.emoji === group.item.emoji) continue;
            if (item.emoji.length < group.item.emoji.length) {
                group.variants.push(group.item);
                group.item = item;
            } else if (!group.variants.some(variant => variant.emoji === item.emoji)) {
                group.variants.push(item);
            }
        }
        return Array.from(grouped.values()).map(group => ({
            ...group.item,
            variants: group.variants,
        }));
    }

    function loadEmojiData() {
        if (!emojiDataPromise) {
            emojiDataPromise = (async () => {
                const url = getBundleUrl();
                if (!url) throw new Error('emoji-bundle-not-found');
                const raw = await requestBundleRaw(url);
                const data = parseEmojiData(raw);
                if (data.other.length === 0) {
                    for (const candidate of getEmojiSourceUrls()) {
                        if (candidate === url) continue;
                        try {
                            const candidateRaw = await requestBundleRaw(candidate);
                            const other = parseUnicodeEmojis(candidateRaw);
                            if (other.length > 0) {
                                data.other = other;
                                break;
                            }
                        } catch (e) { /* try next */ }
                    }
                }
                if (data.other.length === 0) {
                    console.warn('[SC-EmojiPicker] Unicode emoji data not found in loaded scripts.');
                }
                return data;
            })().catch(err => {
                emojiDataPromise = null;
                throw err;
            });
        }
        return emojiDataPromise;
    }

    function getRecentCodes() {
        try {
            const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(raw) ? raw.filter(code => typeof code === 'string') : [];
        } catch (e) {
            return [];
        }
    }

    function rememberRecent(code) {
        const list = getRecentCodes().filter(item => item !== code);
        list.unshift(code);
        if (list.length > RECENT_MAX) list.length = RECENT_MAX;
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(list));
        } catch (e) { /* ignore */ }
    }

    function applyPanelTheme(panel) {
        const dark = typeof DM === 'function' ? DM() : false;
        panel.style.background = dark ? 'rgba(35,35,38,0.98)' : 'rgba(255,255,255,0.98)';
        panel.style.setProperty('--sc-fg', dark ? '#efefef' : '#333');
        panel.style.setProperty('--sc-border', dark ? '#555' : '#ccc');
        panel.style.setProperty('--sc-input-bg', dark ? '#1d1d1f' : '#f4f4f4');
        panel.style.setProperty('--sc-hover', dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
        panel.style.setProperty('--sc-accent', '#2196F3');
    }

    function positionPanel(panel, btn) {
        const rect = btn.getBoundingClientRect();
        const gap = 6;
        const panelWidth = Math.min(360, window.innerWidth - 16);
        const panelHeight = panel.offsetHeight || 340;
        const maxHeight = Math.min(420, window.innerHeight - 16);
        let top = rect.bottom + gap;
        if (top + panelHeight > window.innerHeight - 8) {
            top = Math.max(8, rect.top - panelHeight - gap);
        }
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
        panel.style.width = panelWidth + 'px';
        panel.style.maxHeight = maxHeight + 'px';
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    }

    function findMentionsComponent(textarea) {
        const fiberKey = Object.keys(textarea).find(key =>
            key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
        );
        if (!fiberKey) return null;
        let fiber = textarea[fiberKey];
        while (fiber) {
            const node = fiber.stateNode;
            if (node && typeof node.executeOnChange === 'function' &&
                (node.inputElement === textarea ||
                 (typeof node.handleChange === 'function' && typeof node.addMention === 'function'))) {
                return node;
            }
            fiber = fiber.return;
        }
        return null;
    }

    function waitForMentionsValue(component, textarea, expected, timeout = 300) {
        return new Promise(resolve => {
            if (component.props.value === expected || textarea.value === expected) {
                resolve(true);
                return;
            }
            const started = Date.now();
            const timer = setInterval(() => {
                if (component.props.value === expected || textarea.value === expected) {
                    clearInterval(timer);
                    resolve(true);
                } else if (Date.now() - started > timeout) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, 5);
        });
    }

    async function insertViaMentions(component, textarea, code) {
        const currentValue = typeof component.props.value === 'string'
            ? component.props.value
            : (textarea.value || '');
        const stateStart = component.state && typeof component.state.selectionStart === 'number'
            ? component.state.selectionStart
            : (typeof textarea.selectionStart === 'number' ? textarea.selectionStart : 0);
        const stateEnd = component.state && typeof component.state.selectionEnd === 'number'
            ? component.state.selectionEnd
            : stateStart;
        const start = Math.max(0, Math.min(stateStart, currentValue.length));
        const end = Math.max(start, Math.min(stateEnd, currentValue.length));
        const before = currentValue.slice(0, start);
        const after = currentValue.slice(end);
        const leading = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
        const trailing = ' ';
        const text = leading + code + trailing;
        const next = currentValue.slice(0, start) + text + currentValue.slice(end);
        const pos = start + text.length;
        component.setState({
            selectionStart: pos,
            selectionEnd: pos,
            setSelectionAfterMentionChange: true
        });
        component.executeOnChange({ target: { value: next } }, next, next, []);
        await waitForMentionsValue(component, textarea, next);
    }

    function insertViaDom(textarea, code) {
        return new Promise(resolve => {
            textarea.focus();
            const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : 0;
            const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
            textarea.setSelectionRange(start, end);
            textarea.dispatchEvent(new Event('select', { bubbles: true }));

            setTimeout(() => {
                try {
                    if (!textarea.isConnected) return;

                    textarea.focus();
                    const currentStart = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : start;
                    const currentEnd = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : end;
                    const value = textarea.value || '';
                    const before = value.slice(0, currentStart);
                    const after = value.slice(currentEnd);
                    const leading = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
                    const trailing = ' ';
                    const text = leading + code + trailing;

                    textarea.setSelectionRange(currentStart, currentEnd);
                    const inserted = document.execCommand('insertText', false, text);
                    if (!inserted) {
                        textarea.setRangeText(text, currentStart, currentEnd, 'preserve');
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    const pos = currentStart + text.length;
                    textarea.setSelectionRange(pos, pos);
                    textarea.dispatchEvent(new Event('select', { bubbles: true }));
                    textarea.focus();
                } catch (e) { /* keep queue alive */ }
                resolve();
            }, 0);
        });
    }

    function insertCode(textarea, code) {
        if (!textarea) return Promise.resolve();
        insertQueue = insertQueue.then(() => {
            const component = findMentionsComponent(textarea);
            if (component) {
                console.log('[SC-EmojiPicker] using react-mentions insertion path.');
                return insertViaMentions(component, textarea, code).catch(() => insertViaDom(textarea, code));
            }
            console.warn('[SC-EmojiPicker] react-mentions component not found, using DOM fallback.');
            return insertViaDom(textarea, code);
        });
        return insertQueue;
    }

    function closeVariantPopup() {
        if (variantPopup) variantPopup.remove();
        variantPopup = null;
        document.removeEventListener('pointerdown', onVariantPopupPointerDown, true);
        document.removeEventListener('keydown', onVariantPopupKeyDown);
    }

    function onVariantPopupPointerDown(e) {
        if (!variantPopup) return;
        if (variantPopup.contains(e.target)) return;
        closeVariantPopup();
    }

    function onVariantPopupKeyDown(e) {
        if (e.key === 'Escape') closeVariantPopup();
    }

    function openVariantPopup(item, anchor, getTextarea, afterInsert) {
        closeVariantPopup();

        const popup = document.createElement('div');
        popup.className = 'sc-chat-emoji-variant-popup';
        popup.style.cssText =
            'position:fixed;z-index:2147483647;display:flex;flex-wrap:wrap;gap:4px;padding:6px;' +
            'max-width:190px;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,0.35);';
        applyPanelTheme(popup);

        const choices = [item, ...(item.variants || [])];
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = choice.emoji || choice.code;
            btn.title = choice.name || choice.code;
            btn.style.cssText =
                'width:34px;height:34px;padding:0;border:1px solid var(--sc-border);border-radius:4px;' +
                'background:var(--sc-input-bg);color:var(--sc-fg);cursor:pointer;font-size:22px;line-height:1;';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                rememberRecent(choice.code);
                if (afterInsert) afterInsert();
                insertCode(getTextarea(), choice.code);
                closeVariantPopup();
            });
            popup.appendChild(btn);
        });

        document.body.appendChild(popup);
        variantPopup = popup;
        requestAnimationFrame(() => {
            const rect = anchor.getBoundingClientRect();
            const popupRect = popup.getBoundingClientRect();
            let top = rect.bottom + 6;
            if (top + popupRect.height > window.innerHeight - 8) {
                top = Math.max(8, rect.top - popupRect.height - 6);
            }
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupRect.width - 8));
            popup.style.top = top + 'px';
            popup.style.left = left + 'px';
        });

        document.addEventListener('pointerdown', onVariantPopupPointerDown, true);
        document.addEventListener('keydown', onVariantPopupKeyDown);
    }

    function buildItemButton(item, getTextarea, afterInsert) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-chat-emoji-picker-item';
        btn.title = item.name ? `${item.code} ${item.name}` : item.code;
        const hasVariants = !!(item.variants && item.variants.length > 0);
        btn.style.cssText =
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
            'width:52px;height:46px;padding:3px;border:1px solid transparent;border-radius:5px;' +
            'background:transparent;cursor:pointer;font-size:9px;line-height:1;color:var(--sc-fg);' +
            'touch-action:manipulation;';

        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--sc-hover)';
            btn.style.borderColor = 'var(--sc-accent)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
            btn.style.borderColor = 'transparent';
        });

        if (item.emoji) {
            const emojiSpan = document.createElement('span');
            emojiSpan.textContent = item.emoji;
            emojiSpan.style.cssText =
                'width:24px;height:24px;display:flex;align-items:center;justify-content:center;' +
                'font-size:22px;line-height:1;pointer-events:none;';
            btn.appendChild(emojiSpan);
        } else if (item.image) {
            const img = document.createElement('img');
            img.src = item.image;
            img.alt = item.name || item.code;
            img.loading = 'lazy';
            img.style.cssText = 'width:24px;height:24px;object-fit:contain;pointer-events:none;';
            img.addEventListener('error', () => img.remove());
            btn.appendChild(img);
        }

        const code = document.createElement('span');
        code.textContent = item.code;
        code.style.cssText = 'max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        btn.appendChild(code);

        let pressTimer = null;
        let longPressTriggered = false;

        if (hasVariants) {
            btn.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                clearTimeout(pressTimer);
                longPressTriggered = false;
                pressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    e.preventDefault();
                    openVariantPopup(item, btn, getTextarea, afterInsert);
                }, 420);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => {
                btn.addEventListener(type, () => clearTimeout(pressTimer));
            });
            btn.addEventListener('contextmenu', e => e.preventDefault());
        }

        btn.addEventListener('click', (e) => {
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            rememberRecent(item.code);
            if (afterInsert) afterInsert();
            insertCode(getTextarea(), item.code);
        });
        return btn;
    }

    function renderPanelContent(panel, items, inputGroup) {
        const search = panel.querySelector('.sc-chat-emoji-picker-search');
        const tabs = panel.querySelector('.sc-chat-emoji-picker-tabs');
        const grid = panel.querySelector('.sc-chat-emoji-picker-grid');
        const getTextarea = () => inputGroup.querySelector('textarea');
        const allItems = []
            .concat(items.special, items.resources, items.buildings, items.eggs, items.realms, items.other);

        const groupLabels = {
            recent: '最近',
            resources: '资源',
            buildings: '建筑',
            eggs: '彩蛋',
            realms: '领域',
            special: '特殊',
            other: '其它',
        };
        function recentItems() {
            const byCode = new Map(allItems.map(item => [item.code, item]));
            return getRecentCodes().map(code => byCode.get(code)).filter(Boolean);
        }

        let activeKey = recentItems().length > 0 ? 'recent' : 'resources';
        const PAGE_SIZE = 240;
        let visibleLimit = PAGE_SIZE;

        function getGroupItems(key) {
            if (key === 'recent') return recentItems();
            return items[key] || [];
        }

        function renderTabs() {
            tabs.textContent = '';
            Object.entries(groupLabels).forEach(([key, label]) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                const active = key === activeKey;
                const count = getGroupItems(key).length;
                tab.textContent = label;
                tab.title = `${label} (${count})`;
                tab.style.cssText =
                    'flex:0 0 auto;min-height:30px;padding:4px 10px;border:1px solid ' +
                    (active ? 'var(--sc-accent)' : 'var(--sc-border)') + ';border-radius:4px;' +
                    'background:' + (active ? 'var(--sc-accent)' : 'transparent') + ';color:' + (active ? '#fff' : 'var(--sc-fg)') + ';' +
                    'cursor:pointer;font-size:12px;line-height:1.4;white-space:nowrap;box-sizing:border-box;';
                tab.addEventListener('click', () => {
                    activeKey = key;
                    search.value = '';
                    visibleLimit = PAGE_SIZE;
                    grid.scrollTop = 0;
                    renderTabs();
                    renderGrid();
                });
                tabs.appendChild(tab);
            });
        }

        function renderGrid() {
            const prevScroll = grid.scrollTop;
            grid.textContent = '';
            const q = search.value.trim().toLowerCase();
            const list = getGroupItems(activeKey).filter(item =>
                !q ||
                item.code.toLowerCase().includes(q) ||
                (item.name || '').toLowerCase().includes(q)
            );
            const shown = list.slice(0, visibleLimit);

            if (list.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = activeKey === 'recent'
                    ? '还没有最近使用的表情'
                    : (search.value.trim()
                        ? `没有匹配“${search.value.trim()}”的表情`
                        : (activeKey === 'other' && items.other.length === 0 ? '其它表情暂未加载成功' : '该分类暂无表情'));
                empty.style.cssText = 'color:var(--sc-fg);opacity:0.75;font-size:12px;padding:16px;text-align:center;';
                grid.appendChild(empty);
                repositionPanel();
                return;
            }

            shown.forEach(item => grid.appendChild(buildItemButton(item, getTextarea, () => {
                if (activeKey === 'recent') renderGrid();
            })));

            if (list.length > shown.length) {
                const more = document.createElement('button');
                more.type = 'button';
                more.textContent = `显示更多 (${list.length - shown.length})`;
                more.style.cssText =
                    'grid-column:1 / -1;min-height:34px;margin-top:4px;border:1px solid var(--sc-border);border-radius:4px;' +
                    'background:var(--sc-input-bg);color:var(--sc-fg);cursor:pointer;font-size:12px;line-height:1.4;';
                more.addEventListener('click', () => {
                    visibleLimit += PAGE_SIZE;
                    renderGrid();
                });
                grid.appendChild(more);
            }

            grid.scrollTop = prevScroll;
            repositionPanel();
        }

        function repositionPanel() {
            if (openPanel === panel && openButton) {
                requestAnimationFrame(() => positionPanel(panel, openButton));
            }
        }

        search.addEventListener('input', () => {
            visibleLimit = PAGE_SIZE;
            renderGrid();
        });
        renderTabs();
        renderGrid();
    }

    function buildPanel(btn, inputGroup) {
        const panel = document.createElement('div');
        panel.className = 'sc-chat-emoji-picker-panel';
        panel.style.cssText =
            'position:fixed;z-index:2147483646;display:flex;flex-direction:column;box-sizing:border-box;' +
            'overflow:hidden;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.35);';
        applyPanelTheme(panel);

        const hint = document.createElement('div');
        hint.className = 'sc-chat-emoji-picker-hint';
        hint.textContent = '该功能测试中，如出现问题请反馈并设置中关闭该功能';
        hint.style.cssText =
            'padding:6px 8px;font-size:11px;line-height:1.4;color:var(--sc-fg);opacity:0.75;' +
            'border-bottom:1px solid var(--sc-border);';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--sc-border);';

        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'sc-chat-emoji-picker-search';
        search.placeholder = '搜索表情';
        search.style.cssText =
            'flex:1;min-width:0;height:30px;padding:4px 8px;border:1px solid var(--sc-border);border-radius:4px;' +
            'background:var(--sc-input-bg);color:var(--sc-fg);font-size:13px;outline:none;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.title = '关闭';
        closeBtn.style.cssText =
            'flex:0 0 30px;width:30px;height:30px;padding:0;border:1px solid var(--sc-border);border-radius:4px;' +
            'background:transparent;color:var(--sc-fg);cursor:pointer;font-size:18px;line-height:1;';
        closeBtn.addEventListener('click', () => closePanel());

        const tabs = document.createElement('div');
        tabs.className = 'sc-chat-emoji-picker-tabs';
        tabs.style.cssText =
            'display:flex;flex-wrap:wrap;gap:6px;padding:8px 8px 4px;';

        const grid = document.createElement('div');
        grid.className = 'sc-chat-emoji-picker-grid';
        grid.style.cssText =
            'flex:1;overflow:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:4px;align-content:start;';

        const loading = document.createElement('div');
        loading.textContent = '加载表情中...';
        loading.style.cssText = 'color:var(--sc-fg);opacity:0.75;font-size:12px;padding:16px;text-align:center;';
        grid.appendChild(loading);

        header.append(search, closeBtn);
        panel.append(hint, header, tabs, grid);

        loadEmojiData().then(items => {
            if (!panel.isConnected) return;
            renderPanelContent(panel, items, inputGroup);
        }).catch(() => {
            if (!panel.isConnected) return;
            grid.textContent = '';
            const error = document.createElement('div');
            error.textContent = '表情数据加载失败，请刷新页面重试';
            error.style.cssText = 'color:var(--sc-fg);opacity:0.8;font-size:12px;padding:16px;text-align:center;';
            grid.appendChild(error);
            if (openPanel === panel && openButton) {
                requestAnimationFrame(() => positionPanel(panel, openButton));
            }
        });

        return panel;
    }

    function ensureButton(inputGroup) {
        if (inputGroup.querySelector(BUTTON_SELECTOR)) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-chat-emoji-picker-btn';
        btn.setAttribute('data-sc-emoji-picker-added', '1');
        btn.title = '选择表情';
        btn.textContent = '🙂';
        btn.style.cssText =
            'display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;height:34px;' +
            'min-width:34px;padding:0;margin:0 2px;border:1px solid rgba(128,128,128,0.55);border-radius:4px;' +
            'background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:1;vertical-align:middle;box-sizing:border-box;';
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(128,128,128,0.18)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePanel(btn, inputGroup);
        });

        const btnGroup = inputGroup.querySelector('.input-group-btn');
        if (btnGroup) {
            btnGroup.insertBefore(btn, btnGroup.firstChild);
        } else {
            inputGroup.appendChild(btn);
        }
    }

    function closePanel() {
        closeVariantPopup();
        if (openPanel) openPanel.remove();
        openPanel = null;
        openButton = null;
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
    }

    function onPointerDown(e) {
        if (variantPopup && variantPopup.contains(e.target)) return;
        if (!openPanel || !openButton) return;
        if (openPanel.contains(e.target) || openButton.contains(e.target)) return;
        closePanel();
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            if (variantPopup) closeVariantPopup();
            else closePanel();
        }
    }

    function onViewportChange() {
        if (openPanel && openButton) positionPanel(openPanel, openButton);
    }

    function togglePanel(btn, inputGroup) {
        if (openButton === btn && openPanel) {
            closePanel();
            return;
        }
        closePanel();
        if (!inputGroup.querySelector('textarea')) return;

        const panel = buildPanel(btn, inputGroup);
        document.body.appendChild(panel);
        openPanel = panel;
        openButton = btn;

        requestAnimationFrame(() => positionPanel(panel, btn));
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);

        const search = panel.querySelector('.sc-chat-emoji-picker-search');
        if (search) setTimeout(() => search.focus(), 0);
    }

    function removeAll() {
        closePanel();
        document.querySelectorAll(BUTTON_SELECTOR).forEach(btn => btn.remove());
    }

    function requestScan() {
        if (scanTimer) return;
        scanTimer = setTimeout(() => {
            scanTimer = null;
            scan();
        }, 150);
    }

    function scan() {
        if (!isEnabled()) {
            removeAll();
            return;
        }

        document.querySelectorAll('textarea').forEach(textarea => {
            if (!isChatInput(textarea)) return;
            const inputGroup = textarea.closest('.input-group');
            if (inputGroup) ensureButton(inputGroup);
        });
    }

    function start() {
        if (started) return;
        if (!document.body) {
            setTimeout(start, 200);
            return;
        }
        started = true;

        new MutationObserver(() => requestScan()).observe(document.body, { childList: true, subtree: true });

        new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                closePanel();
                setTimeout(scan, 400);
            }
        }).observe(document.body, { childList: true, subtree: true });

        const themeObserver = new MutationObserver(() => {
            if (openPanel) applyPanelTheme(openPanel);
        });
        [document.documentElement, document.body].forEach(target => {
            themeObserver.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });
        });

        window.scChatEmojiPickerRefresh = () => {
            removeAll();
            scan();
        };

        scan();
        loadEmojiData().catch(() => {});
    }

    setTimeout(start, 300);
})();
