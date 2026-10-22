import { getRealmIdFromLink } from '../core/storage.js';
import { normalizeSalesOrders, normalizeSalesStock, calculateSalesShortage, optimizeSalesOrders } from '../utils/salesOfficeOptimizer.js';
import { resourceIdNameMap } from '../constants/resourceMap.js';

// 对照 GamePages-Cqav9NJ6.js 的 jor / salesOfficeSummary：
// ebrfvjt2 是订单结算表，最后一行是含寻单费用的净利润；ebrfvjt3 的
// .progress > span 是未格式化的「可用库存/需求」。寻单中的卡片没有结算表。
// 当前需求读取 DOM 与已有资源常量。交付按钮只改变视觉位置，不移动 React 节点、
// 不模拟点击、不访问 React 私有属性。汇总/寻优仅 GET；交付由用户点击原按钮完成。
const MODULE_KEY = 'salesOfficeHelper';
const PANEL_ID = 'sc-sales-office-helper';
const SLOT_ATTR = 'data-sc-sales-office-slot';
const TABLE_SELECTOR = 'table.ebrfvjt2';
const SUMMARY_SELECTOR = '.exewzot8:not(#sc-sales-office-helper)';
let observer = null;
let resizeObserver = null;
let scanTimer = null;
let frame = null;
let route = '';
let panel = null;
let style = null;
let geometryStyle = null;
let orders = [];
const pending = new Map();
const slots = new Map();
let nextSlot = 0;
let job = null;
let generation = 0;
let snapshotSignature = '';
let profitSignature = '';
let qualitySignature = '';
let resultVisible = false;
let ownerRealm = null;
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
            card: row.parentElement?.parentElement,
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
    if (!panel || pending.size) return;
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
    await copyText(`BUYING\n${lines.join('\n')}`, `已复制${missingOnly ? '缺货' : '货物总需求'}，共 ${lines.length} 种货物。`);
}

async function copyText(text, message, valid = () => true) {
    const owner = panel;
    const version = generation;
    let copied = false;
    if (!valid()) return;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
        }
    } catch { /* 权限拒绝时使用兼容路径 */ }
    if (panel !== owner || version !== generation || currentRoute() !== route || !isEnabled() || !valid()) return;
    if (!copied) copied = fallbackCopy(text);
    lastMessage = copied ? message : '复制失败，请检查剪贴板权限。';
    scan();
}

function addStyle() {
    style = document.createElement('style');
    style.id = 'sc-sales-office-style';
    style.textContent = `
        #${PANEL_ID} { position:relative; width:100%; box-sizing:border-box; padding:12px; margin:8px 0 16px;
            border:1px solid var(--sc-so-border,#8886); border-radius:4px;
            color:inherit; font-size:13px; line-height:1.4; text-align:left; }
        #${PANEL_ID}.sc-sales-office-hidden, #${PANEL_ID} .sc-sales-office-hidden { display:none; }
        #${PANEL_ID} .sc-sales-office-header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
        #${PANEL_ID} .sc-sales-office-header strong { font-size:15px; }
        #${PANEL_ID} .sc-sales-office-notice { font-size:12px; }
        #${PANEL_ID} .sc-sales-office-count { flex-shrink:0; }
        #${PANEL_ID} .sc-sales-office-copy { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:10px; }
        #${PANEL_ID} .sc-sales-office-copy button { margin:0; min-width:0; padding:7px 8px; white-space:normal; font-size:13px; }
        #${PANEL_ID} select { color:inherit; background:transparent; border:1px solid #888; padding:6px; max-width:100%; }
        #${PANEL_ID} select option { color:#222; background:#fff; }
        #${PANEL_ID} .sc-sales-office-orders { display:grid; grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); gap:10px; }
        #${PANEL_ID} .sc-sales-office-order { min-width:0; border-top:3px solid var(--sc-so-profit,#388e3c); padding-top:6px; }
        #${PANEL_ID} .sc-sales-office-order[data-group="loss"] { border-color:var(--sc-so-loss,#c83b3b); }
        #${PANEL_ID} .sc-sales-office-order[data-group="unknown"] { border-color:#888; }
        #${PANEL_ID} .sc-sales-office-label { height:38px; font-weight:bold; overflow-wrap:anywhere; }
        #${PANEL_ID} .sc-sales-office-slot { height:36px; display:flex; align-items:center; justify-content:center;
            border:1px dashed #8888; border-radius:4px; margin-top:4px; }
        #${PANEL_ID} .sc-sales-office-status { min-height:20px; margin-top:8px; font-size:12px; overflow-wrap:anywhere; }
        #${PANEL_ID} .sc-sales-office-result { margin-top:10px; max-height:360px; overflow:auto; }
        #${PANEL_ID} table { width:100%; border-collapse:collapse; font-size:12px; }
        #${PANEL_ID} th, #${PANEL_ID} td { padding:6px; text-align:left; border-bottom:1px solid #8885; }
        #${PANEL_ID} .sc-sales-office-result-note { margin:6px 0; }
        button[${SLOT_ATTR}] { position:fixed!important; margin:0!important; box-sizing:border-box!important;
            z-index:901!important; min-width:0!important; max-width:none!important; padding:6px!important; }
        button[${SLOT_ATTR}][data-sc-sales-office-wait] { pointer-events:none!important; }
        @media(max-width:767px) { #${PANEL_ID} { padding:8px; } #${PANEL_ID} .sc-sales-office-header { flex-wrap:wrap; gap:4px; }
            #${PANEL_ID} .sc-sales-office-orders { grid-template-columns:repeat(auto-fill,minmax(115px,1fr)); } }
    `;
    geometryStyle = document.createElement('style');
    geometryStyle.id = 'sc-sales-office-geometry';
    document.head.append(style, geometryStyle);
}

function createPanel() {
    if (!style) addStyle();
    // 克隆原生汇总容器的外观，不移动任何 React 管理的节点。
    const summary = document.querySelector(SUMMARY_SELECTOR);
    panel = summary ? summary.cloneNode(false) : document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-label', '销售办公室优化（测试中，有问题请及时反馈）');
    panel.innerHTML = `
        <div class="sc-sales-office-header"><div><strong>销售办公室优化（测试中，有问题请及时反馈）</strong> <span class="sc-sales-office-notice">寻优功能未测试，请勿完全依赖结果，欢迎反馈。</span></div><span class="sc-sales-office-count"></span></div>
        <div class="sc-sales-office-copy"></div>
        <div class="sc-sales-office-orders"></div>
        <div class="sc-sales-office-status" role="status" aria-live="polite"></div>
        <div class="sc-sales-office-result sc-sales-office-hidden"></div>`;
    const native = orders[0]?.controls.querySelector('button.btn-secondary');
    [false, true].forEach(missing => {
        const button = native ? native.cloneNode(false) : document.createElement('button');
        button.removeAttribute('id');
        button.removeAttribute('disabled');
        button.removeAttribute('aria-label');
        button.className = native?.className || 'btn btn-secondary';
        button.type = 'button';
        button.dataset.scSalesOfficeCopy = missing ? 'missing' : 'total';
        button.textContent = missing ? '复制缺货' : '复制总需求';
        button.addEventListener('click', () => copyRequirements(missing));
        panel.querySelector('.sc-sales-office-copy').appendChild(button);
    });
    const actions = panel.querySelector('.sc-sales-office-copy');
    const makeButton = (text, action, handler) => {
        const button = actions.firstElementChild.cloneNode(false);
        delete button.dataset.scSalesOfficeCopy;
        button.dataset.scSalesOfficeAction = action;
        button.textContent = text;
        button.addEventListener('click', handler);
        actions.appendChild(button);
        return button;
    };
    makeButton('复制所有大楼缺货', 'all', () => runDataAction(false));
    const label = document.createElement('label');
    label.textContent = '寻优范围 ';
    const scope = document.createElement('select');
    scope.dataset.scSalesOfficeScope = '';
    scope.innerHTML = '<option value="current">当前大楼</option><option value="all">全部大楼</option>';
    scope.addEventListener('change', () => invalidateCalculation('范围已改变，请重新计算。'));
    label.appendChild(scope);
    actions.appendChild(label);
    makeButton('计算最优交单', 'optimize', () => runDataAction(true));
    makeButton('停止计算', 'stop', () => { if (job) job.stop = true; }).classList.add('sc-sales-office-hidden');
    if (summary) summary.after(panel);
    else orders[0]?.card?.before(panel);
    resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(panel);
}

function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

function releaseButtons() {
    docked.forEach(({ button }) => {
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
    docked.forEach(({ button, slot }, id) => {
        const rect = slot.getBoundingClientRect();
        button.setAttribute(SLOT_ATTR, id);
        rules.push(`button[${SLOT_ATTR}="${id}"] { left:${rect.left}px!important; top:${rect.top}px!important; width:${rect.width}px!important; height:${rect.height}px!important; }`);
    });
    const css = rules.join('\n');
    if (geometryStyle.textContent !== css) geometryStyle.textContent = css;
    // 祖先 stacking context 也可能把按钮压在面板下面；不能留下看似可交付的空槽。
    docked.forEach(({ button, slot }) => {
        const rect = button.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!hit || !button.contains(hit)) {
            button.removeAttribute(SLOT_ATTR);
            setText(slot, '请使用原订单按钮');
        } else setText(slot, '');
    });
}

function scheduleLayout() {
    if (frame === null) frame = requestAnimationFrame(layout);
}

function clearPending(row) {
    if (row) {
        clearTimeout(pending.get(row)?.timer);
        pending.delete(row);
    } else {
        pending.forEach(entry => clearTimeout(entry.timer));
        pending.clear();
    }
}

function onNativeClick(event) {
    const button = event.target.closest?.('button.btn-primary');
    if (!button) return;
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
        if (!latest || latest.group !== order.group) {
            // 品质/成本刚刚重算，Observer 尚未刷新时，不让旧盈亏位置提交新分类的订单。
            event.preventDefault();
            event.stopImmediatePropagation();
            scheduleScan();
            return;
        }
    }
    if (pending.has(order.row)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
    invalidateCalculation('订单已提交，请在交付完成后重新计算。');
    lastMessage = '';
    button.setAttribute('data-sc-sales-office-wait', 'true');
    // 只观察事件结果，不改变原按钮 disabled，确保 React 能处理这次真实点击。
    const timer = setTimeout(() => {
        if (button.isConnected && !button.disabled) {
            clearPending(order.row);
            button.removeAttribute('data-sc-sales-office-wait');
            lastMessage = '有订单未检测到交付进度，可重试该订单。';
            scheduleScan();
        }
    }, 1500);
    pending.set(order.row, { button, timer });
    scheduleScan();
}

function scan() {
    clearTimeout(scanTimer);
    scanTimer = null;
    if (!isEnabled() || currentRoute() !== route || getRealmIdFromLink() !== ownerRealm) {
        destroy();
        return;
    }
    orders = readOrders();
    pending.forEach((entry, row) => {
        if (!row.isConnected) {
            clearPending(row);
        } else {
            const current = orders.find(order => order.row === row);
            if (current?.error && current.button) {
                clearPending(row);
                lastMessage = `交付失败：${current.error}`;
            }
        }
    });
    if (!panel?.isConnected && orders.length) {
        invalidateCalculation('页面已刷新，请重新计算。');
        releaseButtons();
        resizeObserver?.disconnect();
        slots.clear();
        createPanel();
    }
    if (!panel) return;
    const summary = document.querySelector(SUMMARY_SELECTOR);
    if (summary && summary.nextElementSibling !== panel) summary.after(panel);
    releaseButtons();
    const hidden = hasDialog();
    panel.classList.toggle('sc-sales-office-hidden', hidden);
    const snapshot = aggregateRequirements();
    panel.querySelector('[data-sc-sales-office-copy="total"]').disabled = pending.size > 0 || !snapshot.valid;
    panel.querySelector('[data-sc-sales-office-copy="missing"]').disabled = pending.size > 0 || !snapshot.valid || !snapshot.consistent;
    panel.querySelector('[data-sc-sales-office-action="all"]').disabled = !!job || pending.size > 0;
    panel.querySelector('[data-sc-sales-office-action="optimize"]').disabled = !!job || pending.size > 0;
    panel.querySelector('[data-sc-sales-office-action="stop"]').classList.toggle('sc-sales-office-hidden', job?.phase !== 'calculating');
    setText(panel.querySelector('.sc-sales-office-count'), `${orders.length} 笔待交付`);
    let unsafeLayout = false;
    orders.forEach(order => {
        let entry = slots.get(order.row);
        if (!entry) {
            const block = document.createElement('div');
            block.className = 'sc-sales-office-order';
            block.innerHTML = '<div class="sc-sales-office-label"></div><div class="sc-sales-office-slot"></div>';
            entry = { id: String(++nextSlot), block, slot: block.lastElementChild };
            slots.set(order.row, entry);
            panel.querySelector('.sc-sales-office-orders').appendChild(block);
        }
        const { id, block, slot } = entry;
        block.dataset.group = order.group || 'unknown';
        block.title = order.requirements.map(item => `${resourceIdNameMap[item.id] || item.id || '?'} ×${item.required}`).join('、');
        const label = order.button?.disabled ? '缺货' : order.group === 'loss' ? '亏损' : order.group === 'profit' ? '盈利／持平' : '利润未知';
        setText(block.firstElementChild, `${id} · ${label} ${order.profitText}`);
        setText(slot, pending.has(order.row) || !order.button ? '处理中' : '请使用原订单按钮');
        if (order.button && !hidden && !pending.has(order.row)) {
            if (canDock(order.button)) {
                order.button.setAttribute(SLOT_ATTR, id);
                docked.set(id, { button: order.button, slot });
                setText(slot, '');
            } else {
                unsafeLayout = true;
            }
        }
    });
    // 保留已移除订单的占位，避免快速连点时下一笔突然补位。
    slots.forEach((entry, row) => {
        if (!orders.some(order => order.row === row)) {
            setText(entry.block.firstElementChild, `${entry.id} · 订单已移除`);
            setText(entry.slot, '—');
        }
    });
    // 寻优已包含高/低品质两种选择，用户照方案切品质无需作废；库存或订单变化才作废。
    const signature = JSON.stringify(orders.map(order => [slots.get(order.row)?.id, order.requirements, !!order.button]));
    const profits = JSON.stringify(orders.map(order => order.profitText));
    const qualities = JSON.stringify(orders.map(order => order.card?.querySelector('input[type="checkbox"]')?.checked));
    if (snapshotSignature && (signature !== snapshotSignature ||
        (profits !== profitSignature && qualities === qualitySignature))) invalidateCalculation('订单、库存或成本已变化，请重新计算。');
    snapshotSignature = signature;
    profitSignature = profits;
    qualitySignature = qualities;
    const missing = orders.filter(order => order.button?.disabled).length;
    const unknown = orders.filter(order => !order.group).length;
    const message = pending.size ? `${pending.size} 笔交付处理中，其余订单可继续点击。` : unsafeLayout ? '部分按钮无法集中显示，请使用对应的原订单按钮。' :
        !orders.length ? '暂无已完成寻单的订单。' : !snapshot.valid ? '货物数据未识别完整，暂不能复制。请确认插件基础数据已更新。' :
        !snapshot.consistent ? '库存正在更新，暂不能复制缺货采购单。' : lastMessage ||
        `每笔订单独立交付。${missing ? ` ${missing} 笔库存不足。` : ''}${unknown ? ` ${unknown} 笔利润未识别。` : ''}`;
    setText(panel.querySelector('.sc-sales-office-status'), message);
    layout();
}

function scheduleScan() {
    if (scanTimer === null) scanTimer = setTimeout(scan, 60);
}

function invalidateCalculation(message) {
    const hadWork = !!job || resultVisible;
    generation++;
    job = null;
    if (hadWork) lastMessage = message;
    if (resultVisible && panel) {
        const result = panel.querySelector('.sc-sales-office-result');
        result.replaceChildren();
        setText(result, message);
        resultVisible = false;
    }
    scheduleScan();
}

function assertJob(owner) {
    if (job !== owner || owner.generation !== generation || currentRoute() !== route ||
        !isEnabled() || ownerRealm !== getRealmIdFromLink()) throw new Error('操作已取消。');
}

async function getData(owner, url) {
    assertJob(owner);
    const network = window.__SC_Network;
    if (!network?.requestJson) throw new Error('数据服务尚未就绪，请稍后重试。');
    const data = await network.requestJson(url, 0);
    assertJob(owner);
    return data;
}

async function loadSalesData(owner, all, requireCost) {
    const auth = await getData(owner, '/api/v3/companies/auth-data/');
    const company = auth?.authCompany;
    if (!Number.isSafeInteger(company?.companyId) || company.realmId !== ownerRealm) {
        throw new Error('公司或领域已改变，请重新进入大楼。');
    }
    // 建筑接口只能复用游戏请求的拦截结果，直接 GET 会返回 403。
    // 与餐馆提醒共用 requestHooks 保存的领域建筑快照，不自行补发建筑请求。
    let region;
    try {
        region = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${ownerRealm}`) || 'null');
    } catch {
        throw new Error('建筑数据无法读取，请先进入地图并刷新，再返回大楼重试。');
    }
    const buildings = region?.buildings;
    if (!Array.isArray(buildings) || !buildings.length) {
        throw new Error('尚未获取建筑数据，请先进入地图并刷新，再返回大楼重试。');
    }
    if (region.companyId != null && Number(region.companyId) !== company.companyId) {
        throw new Error('建筑数据所属公司尚未同步，请先进入地图并刷新，再返回大楼重试。');
    }
    const currentId = Number(route.match(/\/b\/(\d+)/)?.[1]);
    const offices = buildings.filter(building => building?.kind === 'B' && (all || building.id === currentId));
    if (!offices.some(building => building.id === currentId)) {
        throw new Error('建筑数据中没有当前销售办公室，请先进入地图并刷新，再返回大楼重试。');
    }
    const seenBuildings = new Set();
    const sales = [];
    for (const building of offices) {
        if (!Number.isSafeInteger(building.id) || building.id <= 0 || seenBuildings.has(building.id)) {
            throw new Error('建筑编号无法识别。');
        }
        seenBuildings.add(building.id);
        lastMessage = `正在读取大楼 ${seenBuildings.size}/${offices.length}…`;
        scan();
        try {
            const data = await getData(owner, `/api/v2/companies/buildings/${building.id}/sales-orders/`);
            sales.push(...normalizeSalesOrders(data, building));
        } catch (error) {
            assertJob(owner);
            throw new Error(`${building.name || `大楼 #${building.id}`}：${error.message}`);
        }
    }
    const resources = await getData(owner, `/api/v3/resources/${company.companyId}/`);
    const kinds = new Set(sales.flatMap(order => order.resources.map(resource => resource.kind)));
    const stock = normalizeSalesStock(resources, kinds, requireCost);
    const currentSales = sales.filter(order => order.buildingId === currentId);
    const currentDom = readOrders();
    const fingerprint = entries => entries.map(entry => `${entry.kind}:${entry.amount}`).sort().join('|');
    if (currentSales.length !== currentDom.length || currentSales.some((order, index) =>
        fingerprint(order.resources) !== fingerprint(currentDom[index].requirements.map(entry => ({ kind: entry.id, amount: entry.required }))))) {
        throw new Error('当前页面与订单数据尚未同步，请刷新大楼后重试。');
    }
    for (let index = 0; index < currentSales.length; index++) {
        currentSales[index].displayNumber = slots.get(currentDom[index].row)?.id || currentSales[index].ordinal;
    }
    // 请求期间仍可能切公司；双端核对身份，旧请求的结果不进入面板或剪贴板。
    const finalAuth = await getData(owner, '/api/v3/companies/auth-data/');
    if (finalAuth?.authCompany?.companyId !== company.companyId || finalAuth?.authCompany?.realmId !== company.realmId) {
        throw new Error('公司已切换，请重新读取。');
    }
    return { sales, stock, offices };
}

function money(value) {
    return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function showOptimization(result, data) {
    const block = panel.querySelector('.sc-sales-office-result');
    block.replaceChildren();
    block.classList.remove('sc-sales-office-hidden');
    resultVisible = true;
    const note = document.createElement('p');
    note.className = 'sc-sales-office-result-note';
    note.textContent = `${result.exact ? '最优方案' : '当前最佳（搜索未完成）'}：${result.steps.length}/${data.sales.length} 笔，合计净利润 ${money(result.profit)}。`;
    block.appendChild(note);
    if (!result.steps.length) {
        const empty = document.createElement('p');
        empty.textContent = data.sales.length ? '现有库存下未找到合计净利润更高的可交付方案。' : '暂无已完成寻单的订单。';
        block.appendChild(empty);
        return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>顺序／订单</th><th>品质优先</th><th>预计净利润</th></tr></thead><tbody></tbody>';
    result.steps.forEach((step, index) => {
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        const link = document.createElement('a');
        const prefix = location.pathname.match(/^(\/[a-z]{2}(?:-[a-z]+)?)\/b\//)?.[1] || '';
        link.href = `${prefix}/b/${step.order.buildingId}/`;
        link.textContent = `${index + 1}. ${step.order.buildingName} · 第 ${step.order.displayNumber || step.order.ordinal} 单`;
        identity.appendChild(link);
        const details = document.createElement('div');
        details.textContent = step.order.resources.map(resource => `${resourceIdNameMap[resource.kind] || `#${resource.kind}`} ×${resource.amount}`).join('、');
        details.title = `订单 #${step.order.id}；` + step.deliveries.map(entry => `${resourceIdNameMap[entry.kind] || entry.kind} Q${entry.quality} ×${entry.amount}`).join('、');
        identity.appendChild(details);
        const quality = document.createElement('td');
        quality.textContent = step.lowestQualityFirst ? '低品质（取消勾选）' : '高品质（勾选）';
        const profit = document.createElement('td');
        profit.textContent = money(step.profit);
        row.append(identity, quality, profit);
        table.tBodies[0].appendChild(row);
    });
    block.appendChild(table);
    const hint = document.createElement('p');
    hint.textContent = '按当前库存及成本估算，已扣寻单费用。请按顺序设置原订单的品质选项并交付；快速同时提交时，实际取货顺序可能不同。';
    block.appendChild(hint);
}

async function runDataAction(optimize) {
    scan();
    if (!panel || job || pending.size) return;
    invalidateCalculation('正在读取最新订单与库存…');
    const owner = { generation, phase: 'loading', stop: false };
    job = owner;
    lastMessage = '正在读取最新订单与库存…';
    scan();
    try {
        const all = !optimize || panel.querySelector('[data-sc-sales-office-scope]').value === 'all';
        const data = await loadSalesData(owner, all, optimize);
        assertJob(owner);
        if (optimize) {
            owner.phase = 'calculating';
            lastMessage = '正在比较交单顺序和品质选择…';
            scan();
            const result = await optimizeSalesOrders(data.sales, data.stock, {
                isCancelled: () => job !== owner || owner.generation !== generation,
                shouldStop: () => owner.stop,
                onProgress: progress => {
                    if (job !== owner) return;
                    lastMessage = `已比较 ${progress.visited.toLocaleString('en-US')} 个状态，当前最佳 ${money(progress.profit)}。`;
                    setText(panel.querySelector('.sc-sales-office-status'), lastMessage);
                }
            });
            assertJob(owner);
            if (!result.cancelled) {
                showOptimization(result, data);
                lastMessage = `已读取 ${data.offices.length} 栋大楼；${result.exact ? '搜索完成' : '搜索已停止，结果为当前最佳'}。`;
            }
        } else {
            const shortage = calculateSalesShortage(data.sales, data.stock);
            if (!shortage.length) lastMessage = `已检查 ${data.offices.length} 栋大楼，暂无缺货。`;
            else await copyText(`BUYING\n${shortage.map(entry => `:re-${entry.kind}: x${entry.amount.toLocaleString('en-US')}`).join('\n')}`,
                `已复制 ${data.offices.length} 栋大楼缺货，共 ${shortage.length} 种货物。`, () => job === owner && owner.generation === generation);
        }
    } catch (error) {
        if (job === owner) lastMessage = `读取或计算失败：${error.message}`;
    } finally {
        if (job === owner) {
            job = null;
            scan();
        }
    }
}

function onStorage(event) {
    if (event.key?.startsWith('SimcompaniesRetailCalculation_')) invalidateCalculation('仓库或公司数据已更新，请重新计算。');
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
    ownerRealm = getRealmIdFromLink();
    observer = new MutationObserver(records => {
        if (records.some(record => !panel?.contains(record.target) && record.target !== geometryStyle &&
            record.target !== style && record.target.parentElement !== geometryStyle)) scheduleScan();
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
    generation++;
    job = null;
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
    slots.clear();
    nextSlot = 0;
    snapshotSignature = '';
    profitSignature = qualitySignature = '';
    resultVisible = false;
    ownerRealm = null;
    lastMessage = route = '';
    resourceRaw = null;
    resourceImages = new Map();
}

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.salesOfficeHelper = { init, destroy };
