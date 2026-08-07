import { registerExportInfo } from '../core/exportInfo.js';

const RestaurantStockReminder = (function () {
    const STORAGE_KEY = 'script_restaurant_stock_restaurant_count';

    registerExportInfo({
        name: '餐馆备货提醒设置',
        scope: 'global',
        keys: [STORAGE_KEY]
    });

    const state = {
        menuObserver: null,
        watchTimer: null,
        panelNode: null,
        panelContentNode: null,
        tableBodyNode: null,
        menuContainer: null,
        observedMenuContainer: null,
        panelPositionInitialized: false,
        panelMovedByUser: false,
        panelCollapsed: true,
        dragMoved: false,
        dragStartX: 0,
        dragStartY: 0,
        dragOriginLeft: 0,
        dragOriginTop: 0,
        handleDragMove: null,
        handleDragEnd: null,
        currentUrl: ''
    };

    let restaurantCount = loadRestaurantCount();

    function isEnabled() {
        return typeof window.isPageModuleEnabled !== 'function' || window.isPageModuleEnabled('restaurantStock');
    }

    function init() {
        if (!isEnabled()) {
            cleanupAll();
            return;
        }
        startWatch();
    }

    function startWatch() {
        if (state.watchTimer) return;
        state.watchTimer = setInterval(() => mainFunc(), 1200);
        mainFunc();
    }

    function stopWatch() {
        if (state.watchTimer) {
            clearInterval(state.watchTimer);
            state.watchTimer = null;
        }
    }

    function cleanupAll() {
        stopWatch();
        disconnectMenuObserver();
        destroyPanel();
        state.menuContainer = null;
        state.currentUrl = '';
    }

    function getRestaurantDetailAnchor() {
        const labels = Array.from(document.querySelectorAll('label'));
        const openTexts = ['Restaurant is open', '餐馆营业中', '餐廳營業中'];
        return labels.find(label => openTexts.includes(label.textContent?.trim())) || null;
    }

    function isRestaurantPage() {
        return Boolean(getRestaurantDetailAnchor());
    }

    function getTargetMenuContainer() {
        const containers = Array.from(document.querySelectorAll('div.css-12ocart'));
        if (containers.length >= 3) {
            return containers[2];
        }
        return containers.find(container => {
            return Boolean(container.querySelector('label') && container.querySelector('.css-1v345k9, .css-1k48byk'));
        }) || containers.find(container => Boolean(container.querySelector('label'))) || null;
    }

    function mainFunc() {
        if (!isEnabled() || !/\/b\/\d+\/?$/.test(location.href)) {
            cleanupAll();
            return;
        }

        if (!isRestaurantPage()) {
            destroyPanel();
            disconnectMenuObserver();
            state.menuContainer = null;
            return;
        }

        const menuContainer = getTargetMenuContainer();
        if (!menuContainer) return;

        if (state.currentUrl !== location.href) {
            state.currentUrl = location.href;
            disconnectMenuObserver();
            state.panelPositionInitialized = false;
            state.panelMovedByUser = false;
        }

        state.menuContainer = menuContainer;
        ensurePanel(menuContainer);
        observeMenu(menuContainer);
        refreshPanel();
    }

    function loadRestaurantCount() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const value = parseInt(raw || '1', 10);
            return value > 0 ? value : 1;
        } catch (error) {
            return 1;
        }
    }

    function saveRestaurantCount(value) {
        try {
            localStorage.setItem(STORAGE_KEY, String(value));
        } catch (error) {
            console.error('[餐馆备货提醒] 存储餐馆数量失败', error);
        }
    }

    function getRestaurantCount() {
        const input = document.querySelector('#script_restaurant_count');
        const inputValue = parseInt(input?.value || String(restaurantCount), 10);
        const count = Number.isFinite(inputValue) && inputValue > 0 ? inputValue : 1;
        restaurantCount = count;
        return count;
    }

    function parseNumber(text) {
        if (!text) return 0;
        const clean = String(text).replace(/,/g, '').replace(/[^\d-]/g, '');
        const value = parseInt(clean, 10);
        return Number.isFinite(value) ? value : 0;
    }

    function parseConsumeNumber(text) {
        if (!text) return 0;
        const cleanText = String(text).replace(/,/g, '');
        const match = cleanText.match(/-\s*(\d+(?:\.\d+)?)/) || cleanText.match(/(\d+(?:\.\d+)?)/);
        if (!match) return 0;
        const value = parseFloat(match[1]);
        return Number.isFinite(value) ? value : 0;
    }

    function ensurePanel(menuContainer) {
        if (!state.panelNode || !state.panelNode.isConnected) {
            const panel = createPanelDOM();
            document.body.appendChild(panel);

            state.panelNode = panel;
            state.panelContentNode = panel.querySelector('#script_restaurant_stock_content');
            state.tableBodyNode = panel.querySelector('#script_restaurant_stock_tbody');

            bindPanelInteractions();
            bindRestaurantCountInput(panel);
        }

        if (!state.panelMovedByUser && !state.panelPositionInitialized) {
            alignPanelToMenu(menuContainer);
            state.panelPositionInitialized = true;
        }
    }

    function createPanelDOM() {
        const panel = document.createElement('div');
        panel.id = 'script_restaurant_stock_panel';
        panel.style.cssText = [
            'position:fixed',
            'z-index:999',
            'width:360px',
            'left:30px',
            'top:70px',
            'max-height:75vh',
            'overflow:auto',
            'background:rgba(17,24,39,0.95)',
            'color:#e5e7eb',
            'border:1px solid rgba(255,255,255,0.12)',
            'border-radius:8px',
            'padding:10px',
            'box-shadow:0 8px 20px rgba(0,0,0,0.35)',
            'font-size:12px',
            'line-height:1.4'
        ].join(';');

        panel.innerHTML = `
            <div id="script_restaurant_stock_header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move;user-select:none;">
                <strong style="font-size:13px;">餐馆备货提醒</strong>
                <button id="script_restaurant_stock_collapse" type="button" style="height:22px;padding:0 8px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);color:#fff;border-radius:4px;cursor:pointer;">收起</button>
            </div>
            <div id="script_restaurant_stock_content">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;">
                        餐馆：<input id="script_restaurant_count" type="number" min="1" step="1" style="width:52px;height:22px;padding:0 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.4);background:rgba(0,0,0,0.35);color:#fff;font-size:12px;">
                    </span>
                    <span id="script_restaurant_stock_meta" style="opacity:0.85;">加载中...</span>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left;border-bottom:1px solid rgba(255,255,255,0.15);">
                            <th style="padding:4px 2px;">菜品</th>
                            <th style="padding:4px 2px;">库存</th>
                            <th style="padding:4px 2px;">每日消耗量</th>
                            <th style="padding:4px 2px;">剩余天数</th>
                        </tr>
                    </thead>
                    <tbody id="script_restaurant_stock_tbody"></tbody>
                </table>
            </div>
        `;

        return panel;
    }

    function alignPanelToMenu(menuContainer) {
        const panel = state.panelNode;
        if (!menuContainer || !panel || !panel.isConnected) return;

        const panelWidth = panel.offsetWidth || 360;
        const panelHeight = panel.offsetHeight || 260;
        const left = 30;
        const top = 70;
        const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
        const safeLeft = Math.min(Math.max(8, left), maxLeft);
        const safeTop = Math.min(Math.max(8, top), maxTop);

        panel.style.left = `${safeLeft}px`;
        panel.style.top = `${safeTop}px`;
    }

    function bindPanelInteractions() {
        const panel = state.panelNode;
        if (!panel) return;

        const header = panel.querySelector('#script_restaurant_stock_header');
        const collapseBtn = panel.querySelector('#script_restaurant_stock_collapse');
        const content = state.panelContentNode;
        if (!header || !collapseBtn || !content) return;

        collapseBtn.addEventListener('click', () => {
            state.panelCollapsed = !state.panelCollapsed;
            content.style.display = state.panelCollapsed ? 'none' : 'block';
            collapseBtn.textContent = state.panelCollapsed ? '展开' : '收起';
        });

        state.handleDragMove = (event) => {
            if (!state.dragMoved && (Math.abs(event.clientX - state.dragStartX) > 2 || Math.abs(event.clientY - state.dragStartY) > 2)) {
                state.dragMoved = true;
            }
            const nextLeft = state.dragOriginLeft + (event.clientX - state.dragStartX);
            const nextTop = state.dragOriginTop + (event.clientY - state.dragStartY);
            const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - 40);
            panel.style.left = `${Math.min(Math.max(8, nextLeft), maxLeft)}px`;
            panel.style.top = `${Math.min(Math.max(8, nextTop), maxTop)}px`;
        };

        state.handleDragEnd = () => {
            if (state.dragMoved) {
                state.panelMovedByUser = true;
            }
            document.removeEventListener('mousemove', state.handleDragMove);
            document.removeEventListener('mouseup', state.handleDragEnd);
        };

        header.addEventListener('mousedown', (event) => {
            if (event.button !== 0 || event.target === collapseBtn) return;
            event.preventDefault();
            state.dragMoved = false;
            state.dragStartX = event.clientX;
            state.dragStartY = event.clientY;
            state.dragOriginLeft = parseFloat(panel.style.left || '8') || 8;
            state.dragOriginTop = parseFloat(panel.style.top || '8') || 8;
            document.addEventListener('mousemove', state.handleDragMove);
            document.addEventListener('mouseup', state.handleDragEnd);
        });
    }

    function bindRestaurantCountInput(panel) {
        const input = panel.querySelector('#script_restaurant_count');
        if (!input) return;

        input.value = String(restaurantCount || 1);

        const handleChange = () => {
            const value = parseInt(input.value, 10);
            const fixedValue = Number.isFinite(value) && value > 0 ? value : 1;
            input.value = String(fixedValue);
            restaurantCount = fixedValue;
            saveRestaurantCount(fixedValue);
            refreshPanel();
        };

        input.addEventListener('change', handleChange);

        input.addEventListener('input', () => {
            const value = parseInt(input.value, 10);
            if (!Number.isFinite(value) || value <= 0) return;
            restaurantCount = value;
            saveRestaurantCount(value);
            refreshPanel();
        });
    }

    function extractMenuRows() {
        const menuContainer = state.menuContainer;
        const count = getRestaurantCount();
        if (!menuContainer) return [];

        const cards = menuContainer.querySelectorAll('.css-1v345k9, .css-1k48byk');
        const rows = [];

        cards.forEach(card => {
            if (card.classList.contains('css-1k48byk')) return;

            const name = card.querySelector('b')?.textContent?.trim() || '未知菜品';
            const valueWrap = card.querySelector('.css-aqbich');
            if (!valueWrap) return;

            const stock = parseNumber(valueWrap.querySelector('div:nth-child(1)')?.textContent);
            const periodConsume = Math.abs(parseConsumeNumber(valueWrap.querySelector('div:nth-child(2)')?.textContent));
            if (!periodConsume) return;

            const dailyConsume = periodConsume * 2 * count;
            const remainDays = stock / dailyConsume;

            rows.push({
                name,
                stock,
                dailyConsume,
                remainDays,
                isWarning: remainDays < 2
            });
        });

        return rows;
    }

    function formatNumber(num) {
        return Number.isFinite(num) ? num.toLocaleString() : '0';
    }

    function renderRows(rows) {
        const tbody = state.tableBodyNode;
        const panel = state.panelNode;
        if (!tbody || !panel) return;

        const metaNode = panel.querySelector('#script_restaurant_stock_meta');
        const warningCount = rows.filter(row => row.isWarning).length;
        if (metaNode) {
            metaNode.textContent = `菜品:${rows.length} | 预警:${warningCount}`;
        }

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding:10px 2px;opacity:0.8;">未检测到可计算菜品，等待页面数据加载...</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(row => {
            const warnStyle = row.isWarning
                ? 'background:rgba(220,38,38,0.2);color:#fecaca;font-weight:600;'
                : '';
            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08);${warnStyle}">
                    <td style="padding:5px 2px;">${row.name}</td>
                    <td style="padding:5px 2px;">${formatNumber(row.stock)}</td>
                    <td style="padding:5px 2px;">${formatNumber(row.dailyConsume)}</td>
                    <td style="padding:5px 2px;">${row.remainDays.toFixed(2)}</td>
                </tr>
            `;
        }).join('');
    }

    function refreshPanel() {
        const rows = extractMenuRows();
        renderRows(rows);
    }

    function observeMenu(menuContainer) {
        if (state.menuObserver && state.observedMenuContainer === menuContainer) return;

        disconnectMenuObserver();
        state.menuObserver = new MutationObserver(() => refreshPanel());
        state.menuObserver.observe(menuContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
        state.observedMenuContainer = menuContainer;
    }

    function disconnectMenuObserver() {
        if (state.menuObserver) {
            state.menuObserver.disconnect();
            state.menuObserver = null;
        }
        state.observedMenuContainer = null;
    }

    function destroyPanel() {
        if (state.handleDragMove) {
            document.removeEventListener('mousemove', state.handleDragMove);
        }
        if (state.handleDragEnd) {
            document.removeEventListener('mouseup', state.handleDragEnd);
        }
        if (state.panelNode && state.panelNode.isConnected) {
            state.panelNode.remove();
        }
        state.panelNode = null;
        state.panelContentNode = null;
        state.tableBodyNode = null;
        state.panelPositionInitialized = false;
        state.panelMovedByUser = false;
        state.handleDragMove = null;
        state.handleDragEnd = null;
    }

    return { init };
})();

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.RestaurantStockReminder = RestaurantStockReminder;
