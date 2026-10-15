// 对照 index-xSYKf8W7.js 的 OCi / salesOfficeSummary：
// ebrfvjt2 是订单结算表，最后一行是含寻单费用的净利润；ebrfvjt3 的
// .progress > span 是未格式化的「可用库存/需求」。寻单中的卡片没有结算表。
// 仅读取 DOM 与已有资源常量。交付按钮只改变视觉位置，不移动 React 节点、
// 不模拟点击、不访问 React 私有属性、不发请求。实际交付由用户点击原按钮完成。
const MODULE_KEY = 'salesOfficeHelper';
const PANEL_ID = 'sc-sales-office-helper';
const SLOT_ATTR = 'data-sc-sales-office-slot';
const TABLE_SELECTOR = 'table.ebrfvjt2';
const GROUPS = ['profit', 'loss'];
let observer = null;
let resizeObserver = null;
let scanTimer = null;
let pendingTimer = null;
let frame = null;
let route = '';
let panel = null;
let style = null;
let geometryStyle = null;
let orders = [];
let pending = null;
let lastMessage = '';
let resourceRaw = null;
let resourceImages = new Map();
const docked = new Map();
// 换楼时 React 可能短暂保留上一栋楼的卡片；这些节点不能在新路由重新接管。
const staleRows = new WeakSet();

function isEnabled() {
    return typeof window.isPageModuleEnabled !== 'function' || window.isPageModuleEnabled(MODULE_KEY);
}

function currentRoute() {
    return /\/b\/\d+\/?$/.test(location.pathname) ? location.pathname : '';
}

function imageKey(src) {
    // 游戏给文件名加内容 hash；保留资源原始名，包括 BFR 的大小写。
    return src?.match(/\/resources\/([^/.]+)(?:\.[^/]+)?\.[^/.]+(?:[?#].*)?$/)?.[1] || '';
}

function loadResourceImages() {
    try {
        const raw = localStorage.getItem('SimcompaniesConstantsData');
        if (raw === resourceRaw) return;
        resourceRaw = raw;
        resourceImages = new Map();
        const constants = JSON.parse(raw || '{}').constantsResources || {};
        Object.values(constants).forEach(resource => {
            const key = imageKey(resource.image);
            const id = Number(resource.dbLetter);
            if (key && Number.isSafeInteger(id) && id > 0) resourceImages.set(key, id);
        });
    } catch {
        resourceRaw = null;
        resourceImages = new Map();
    }
}

function readOrders() {
    loadResourceImages();
    return [...document.querySelectorAll(TABLE_SELECTOR)].map(table => {
        const controls = table.parentElement;
        const row = controls?.parentElement;
        if (!row?.querySelector('.ebrfvjt0') || staleRows.has(row)) return null;
        const requirements = [...row.querySelectorAll('.ebrfvjt3')].map(item => {
            const text = item.querySelector('.progress > span')?.textContent.trim() || '';
            const match = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
            return {
                id: resourceImages.get(imageKey(item.querySelector('img')?.getAttribute('src'))),
                available: match ? Number(match[1]) : NaN,
                required: match ? Number(match[2]) : NaN
            };
        });
        const profitText = table.querySelector('tbody > tr:last-child > td[colspan="2"]')?.textContent.trim() || '';
        // 按原生负号分类，保留 (-) $0 这类四舍五入后仍然亏损的订单。
        const validProfit = /^(?:\(-\)\s*)?\$\s*[\d\s.,\u00a0\u202f\u0660-\u0669\u06f0-\u06f9\u066b\u066c]+$/.test(profitText);
        return {
            row,
            controls,
            requirements,
            profitText,
            group: validProfit ? (profitText.startsWith('(-)') ? 'loss' : 'profit') : null,
            button: controls.querySelector(':scope > div.text-center > button.btn-primary'),
            error: controls.querySelector('.ebrfvjt6')?.textContent.trim() || ''
        };
    }).filter(Boolean);
}

function aggregateRequirements() {
    const totals = new Map();
    let consistent = true;
    for (const order of orders) {
        if (!order.requirements.length) return { valid: false, totals };
        for (const item of order.requirements) {
            if (!item.id || !Number.isFinite(item.required) || item.required <= 0 ||
                !Number.isFinite(item.available) || item.available < 0) return { valid: false, totals };
            const previous = totals.get(item.id);
            if (previous && previous.available !== item.available) consistent = false;
            totals.set(item.id, {
                required: (previous?.required || 0) + item.required,
                available: item.available
            });
        }
    }
    return { valid: totals.size > 0, consistent, totals };
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    const focused = document.activeElement;
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* 不支持旧剪贴板 API */ }
    textarea.remove();
    focused?.focus({ preventScroll: true });
    return copied;
}

async function copyRequirements(missingOnly) {
    scan(); // 点击时重新读取游戏 DOM，避免复制过期库存。
    if (!panel || pending) return;
    const snapshot = aggregateRequirements();
    if (!snapshot.valid || (missingOnly && !snapshot.consistent)) return;
    const lines = [...snapshot.totals].sort(([a], [b]) => a - b).map(([id, item]) => {
        const amount = Math.ceil(missingOnly ? Math.max(0, item.required - item.available) : item.required);
        return amount > 0 ? `:re-${id}: x${amount.toLocaleString('en-US')}` : null;
    }).filter(Boolean);
    if (!lines.length) {
        lastMessage = '库存充足，无需采购。';
        scan();
        return;
    }
    const text = `BUYING\n${lines.join('\n')}`;
    const owner = panel;
    let copied = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
        }
    } catch { /* 权限拒绝时使用兼容路径 */ }
    if (panel !== owner || currentRoute() !== route || !isEnabled()) return;
    if (!copied) copied = fallbackCopy(text);
    lastMessage = copied ? `已复制${missingOnly ? '缺货采购单' : '货物总需求'}，共 ${lines.length} 种货物。` : '复制失败，请检查剪贴板权限。';
    scan();
}

function addStyle() {
    style = document.createElement('style');
    style.id = 'sc-sales-office-style';
    style.textContent = `
        #${PANEL_ID} { position:fixed; right:16px; bottom:16px; width:360px; max-width:calc(100vw - 16px);
            box-sizing:border-box; padding:12px; border:1px solid var(--sc-so-border); border-radius:8px;
            background:var(--sc-so-bg); color:var(--sc-so-fg); z-index:900; box-shadow:0 3px 16px #0003;
            font-size:13px; line-height:1.4; }
        #${PANEL_ID}.sc-sales-office-hidden { display:none; }
        #${PANEL_ID} .sc-sales-office-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        #${PANEL_ID} .sc-sales-office-header strong { font-size:15px; }
        #${PANEL_ID} .sc-sales-office-copy, #${PANEL_ID} .sc-sales-office-groups { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
        #${PANEL_ID} .sc-sales-office-copy { margin-bottom:10px; }
        #${PANEL_ID} .sc-sales-office-copy button { margin:0; min-width:0; padding:7px 4px; white-space:normal; font-size:13px; }
        #${PANEL_ID} .sc-sales-office-group { min-width:0; border-top:3px solid var(--sc-so-profit); padding-top:6px; }
        #${PANEL_ID} .sc-sales-office-group[data-group="loss"] { border-color:var(--sc-so-loss); }
        #${PANEL_ID} .sc-sales-office-label { font-weight:bold; }
        #${PANEL_ID} .sc-sales-office-next { height:20px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
        #${PANEL_ID} .sc-sales-office-slot { height:36px; display:flex; align-items:center; justify-content:center;
            border:1px dashed var(--sc-so-border); border-radius:4px; margin-top:4px; }
        #${PANEL_ID} .sc-sales-office-status { height:38px; overflow:auto; margin-top:8px; font-size:12px; }
        button[${SLOT_ATTR}] { position:fixed!important; margin:0!important; box-sizing:border-box!important;
            z-index:901!important; min-width:0!important; max-width:none!important; padding:6px!important; }
        button[${SLOT_ATTR}="profit"] { outline:2px solid var(--sc-so-profit,#388e3c); }
        button[${SLOT_ATTR}="loss"] { outline:2px solid var(--sc-so-loss,#c83b3b); }
        button[${SLOT_ATTR}][data-sc-sales-office-wait] { pointer-events:none!important; }
        @media(max-width:767px) { #${PANEL_ID} { left:8px; right:8px; width:auto; bottom:calc(64px + env(safe-area-inset-bottom,0px)); padding:10px; } }
    `;
    geometryStyle = document.createElement('style');
    geometryStyle.id = 'sc-sales-office-geometry';
    document.head.append(style, geometryStyle);
}

function createPanel() {
    if (!style) addStyle();
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-label', '销售办公室优化（测试中）');
    panel.innerHTML = `
        <div class="sc-sales-office-header"><strong>销售办公室优化（测试中）</strong><span class="sc-sales-office-count"></span></div>
        <div class="sc-sales-office-copy"></div>
        <div class="sc-sales-office-groups">
            <div class="sc-sales-office-group" data-group="profit"><div class="sc-sales-office-label">盈利／持平 <span></span></div><div class="sc-sales-office-next"></div><div class="sc-sales-office-slot"></div></div>
            <div class="sc-sales-office-group" data-group="loss"><div class="sc-sales-office-label">亏损 <span></span></div><div class="sc-sales-office-next"></div><div class="sc-sales-office-slot"></div></div>
        </div>
        <div class="sc-sales-office-status" role="status" aria-live="polite"></div>`;
    const native = orders[0]?.controls.querySelector('button.btn-secondary');
    [false, true].forEach(missing => {
        const button = native ? native.cloneNode(false) : document.createElement('button');
        button.removeAttribute('id');
        button.removeAttribute('disabled');
        button.removeAttribute('aria-label');
        button.className = native?.className || 'btn btn-secondary';
        button.type = 'button';
        button.dataset.scSalesOfficeCopy = missing ? 'missing' : 'total';
        button.textContent = missing ? '复制缺货采购单' : '复制总需求';
        button.addEventListener('click', () => copyRequirements(missing));
        panel.querySelector('.sc-sales-office-copy').appendChild(button);
    });
    document.body.appendChild(panel);
    resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(panel);
}

function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

function releaseButtons() {
    docked.forEach(button => {
        button.removeAttribute(SLOT_ATTR);
        button.removeAttribute('data-sc-sales-office-wait');
    });
    docked.clear();
    if (geometryStyle) geometryStyle.textContent = '';
}

function hasDialog() {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
        .some(dialog => dialog.getClientRects().length > 0);
}

function canDock(button) {
    // 固定定位不能跨越 transform/filter/contain 形成的包含块；遇到这种布局保留原按钮。
    for (let element = button.parentElement; element; element = element.parentElement) {
        const css = getComputedStyle(element);
        if (css.display === 'none' || css.visibility === 'hidden' ||
            (css.transform && css.transform !== 'none') || (css.filter && css.filter !== 'none') ||
            (css.perspective && css.perspective !== 'none') || /paint|layout|strict|content/.test(css.contain) ||
            /transform|filter|perspective/.test(css.willChange)) return false;
    }
    return true;
}

function layout() {
    frame = null;
    if (!panel?.isConnected || panel.classList.contains('sc-sales-office-hidden')) return;
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [255, 255, 255];
    const dark = bg.reduce((a, b) => a + b, 0) < 380;
    panel.style.setProperty('--sc-so-bg', dark ? '#262b30' : '#fff');
    panel.style.setProperty('--sc-so-fg', dark ? '#eee' : '#333');
    panel.style.setProperty('--sc-so-border', dark ? '#626970' : '#bbb');
    panel.style.setProperty('--sc-so-profit', dark ? '#81c784' : '#388e3c');
    panel.style.setProperty('--sc-so-loss', dark ? '#ef9a9a' : '#c83b3b');
    const rules = [];
    docked.forEach((button, group) => {
        const rect = panel.querySelector(`[data-group="${group}"] .sc-sales-office-slot`).getBoundingClientRect();
        rules.push(`button[${SLOT_ATTR}="${group}"] { left:${rect.left}px!important; top:${rect.top}px!important; width:${rect.width}px!important; height:${rect.height}px!important; }`);
    });
    const css = rules.join('\n');
    if (geometryStyle.textContent !== css) geometryStyle.textContent = css;
    // 祖先 stacking context 也可能把按钮压在面板下面；不能留下看似可交付的空槽。
    let obscured = false;
    docked.forEach(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!hit || !button.contains(hit)) obscured = true;
    });
    if (obscured) {
        releaseButtons();
        panel.querySelectorAll('.sc-sales-office-slot').forEach(slot => setText(slot, '请使用原订单按钮'));
        setText(panel.querySelector('.sc-sales-office-status'), '集中按钮被页面其他内容遮挡，请使用原订单按钮。');
    }
}

function scheduleLayout() {
    if (frame === null) frame = requestAnimationFrame(layout);
}

function clearPending() {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    pending = null;
}

function onNativeClick(event) {
    const button = event.target.closest?.('button.btn-primary');
    const order = orders.find(item => item.button === button);
    if (!order || button.disabled) return;
    if (currentRoute() !== route || !isEnabled()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        destroy();
        return;
    }
    if (button.hasAttribute(SLOT_ATTR)) {
        const latest = readOrders().find(item => item.button === button);
        if (!latest || latest.group !== button.getAttribute(SLOT_ATTR)) {
            // 品质/成本刚刚重算，Observer 尚未刷新时，不让旧盈亏位置提交新分类的订单。
            event.preventDefault();
            event.stopImmediatePropagation();
            scheduleScan();
            return;
        }
    }
    if (pending || (button.hasAttribute(SLOT_ATTR) && event.detail > 1)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
    pending = { row: order.row, button };
    lastMessage = '';
    docked.forEach(item => item.setAttribute('data-sc-sales-office-wait', 'true'));
    if (panel) setText(panel.querySelector('.sc-sales-office-status'), '交付处理中，请等待游戏返回结果。');
    // 只观察事件结果，不改变原按钮 disabled，确保 React 能处理这次真实点击。
    pendingTimer = setTimeout(() => {
        if (pending?.button.isConnected && !pending.button.disabled) {
            clearPending();
            lastMessage = '未检测到交付进度，请重试原生交付按钮。';
            scheduleScan();
        }
    }, 1500);
    scheduleScan();
}

function scan() {
    clearTimeout(scanTimer);
    scanTimer = null;
    if (!isEnabled() || currentRoute() !== route) {
        destroy();
        return;
    }
    orders = readOrders();
    if (pending) {
        if (!pending.row.isConnected) {
            clearPending();
            lastMessage = '订单已移除，已更新剩余订单。';
        } else {
            const current = orders.find(order => order.row === pending.row);
            if (current?.error && current.button) {
                clearPending();
                lastMessage = `交付失败：${current.error}`;
            }
        }
    }
    if (!panel?.isConnected && orders.length) {
        releaseButtons();
        resizeObserver?.disconnect();
        createPanel();
    }
    if (!panel) return;
    releaseButtons();
    const hidden = hasDialog();
    panel.classList.toggle('sc-sales-office-hidden', hidden);
    const snapshot = aggregateRequirements();
    panel.querySelector('[data-sc-sales-office-copy="total"]').disabled = !!pending || !snapshot.valid;
    panel.querySelector('[data-sc-sales-office-copy="missing"]').disabled = !!pending || !snapshot.valid || !snapshot.consistent;
    setText(panel.querySelector('.sc-sales-office-count'), `${orders.length} 笔待交付`);
    let unsafeLayout = false;
    GROUPS.forEach(group => {
        const available = orders.filter(order => order.group === group && order.button && !order.button.disabled);
        const block = panel.querySelector(`[data-group="${group}"]`);
        setText(block.querySelector('.sc-sales-office-label span'), `(${available.length})`);
        const next = pending ? null : available[0];
        setText(block.querySelector('.sc-sales-office-next'), next ? `下一笔：${next.profitText}` : '—');
        const slot = block.querySelector('.sc-sales-office-slot');
        setText(slot, pending ? '交付处理中' : '暂无可交付订单');
        if (next && !hidden) {
            if (canDock(next.button)) {
                next.button.setAttribute(SLOT_ATTR, group);
                docked.set(group, next.button);
                setText(slot, '');
            } else {
                unsafeLayout = true;
                setText(slot, '请使用原订单按钮');
            }
        }
    });
    const missing = orders.filter(order => order.button?.disabled).length;
    const unknown = orders.filter(order => !order.group).length;
    const message = pending ? '交付处理中，请等待游戏返回结果。' : unsafeLayout ? '页面布局不支持集中交付，请使用原订单按钮。' :
        !orders.length ? '暂无已完成寻单的订单。' : !snapshot.valid ? '货物数据未识别完整，暂不能复制。请确认插件基础数据已更新。' :
        !snapshot.consistent ? '库存正在更新，暂不能复制缺货采购单。' : lastMessage ||
        `每次点击交付一笔。${missing ? ` ${missing} 笔库存不足。` : ''}${unknown ? ` ${unknown} 笔利润未识别，保留原按钮。` : ''}`;
    setText(panel.querySelector('.sc-sales-office-status'), message);
    layout();
}

function scheduleScan() {
    if (scanTimer === null) scanTimer = setTimeout(scan, 60);
}

function onStorage(event) {
    if (event.key === 'SC_PageActions_Settings' || event.key === 'SimcompaniesConstantsData') scheduleScan();
}

function init() {
    if (!isEnabled() || !currentRoute()) {
        destroy();
        return;
    }
    if (observer && route === currentRoute()) {
        scan();
        return;
    }
    destroy();
    route = currentRoute();
    observer = new MutationObserver(records => {
        if (records.some(record => !panel?.contains(record.target))) scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'class', 'style', 'src', 'aria-hidden'] });
    document.addEventListener('click', onNativeClick, true);
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('scroll', scheduleLayout, true);
    window.addEventListener('storage', onStorage);
    window.visualViewport?.addEventListener('resize', scheduleLayout);
    scan();
}

function destroy() {
    if (route && currentRoute() !== route) orders.forEach(order => staleRows.add(order.row));
    observer?.disconnect();
    observer = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    clearTimeout(scanTimer);
    scanTimer = null;
    clearPending();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    document.removeEventListener('click', onNativeClick, true);
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('scroll', scheduleLayout, true);
    window.removeEventListener('storage', onStorage);
    window.visualViewport?.removeEventListener('resize', scheduleLayout);
    releaseButtons();
    panel?.remove();
    style?.remove();
    geometryStyle?.remove();
    panel = style = geometryStyle = null;
    orders = [];
    lastMessage = route = '';
    resourceRaw = null;
    resourceImages = new Map();
}

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.salesOfficeHelper = { init, destroy };
