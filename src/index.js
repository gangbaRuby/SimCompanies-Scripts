import './core/requestHooks.js';
import './features/autoRefresh.js';
import './features/paQuestAnswers.js';
import './features/pageObserver.js';
import './features/landscapeIdleBuildingHighlight.js';
import './features/restaurantStockReminder.js';
import './features/formerExecutivesModule.js';
import './features/executiveTrainingModule.js';
import './features/outgoingContractMPHandler.js';
import './features/resourceMarketHandler.js';
import './features/incomingContractsHandler.js';
import './features/marketInterceptor.js';
import './features/warehouseRetailProfit.js';
import './features/chatAccessibility.js';
import './features/executiveBoardroom.js';
import { Network } from './core/network.js';
import { state } from './core/state.js';
import { constantsData } from './features/constantsData.js';
import { RegionData } from './features/regionData.js';
import { Storage } from './features/dataStorage.js';
import { ConstantsAutoUpdater, RegionAutoUpdater } from './features/autoUpdaters.js';
import { resourceIdNameMap } from './constants/resourceMap.js';
import './features/pageModuleConfig.js';
import { getRealmIdFromLink, getScopedKey } from './core/storage.js';
import { isDarkMode, DM, theme, showToast } from './utils/ui.js';
import { createGlobalCustomToggle } from './utils/uiComponents.js';
(function () {
    'use strict';
    let hasNewVersion = false;
    let latestVersion = null;
    let { localVersion, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;



    // ======================
    // 计算用到的函数
    // ======================
    let zn, lwe; //使用SimcompaniesConstantsData内数据
    let size, acceleration, economyState, resource,
        salesModifierWithRecreationBonus, skillCMO, skillCOO,
        saturation, administrationOverhead, wages,
        buildingKind, forceQuality, cogs, quality, quantity
    const Ul = (overhead, skillCOO) => {
        const r = overhead || 1;
        return r - (r - 1) * skillCOO / 100;
    };
    const wv = (e, t, r) => {
        return r === null ? lwe[e][t] : lwe[e][t].quality[r]
    }
    const Upt = (e, t, r, n) => t + (e + n) / r;
    const Hpt = (e, t, r, n, a) => {
        const o = (n + e) / ((t - a) * (t - a));
        return e - (r - t) * (r - t) * o;
    };
    const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
    const Bpt = (e, t, r, n, a, o) => {
        const g = RETAIL_ADJUSTMENT[e] ?? 1;
        const s = Math.min(Math.max(2 - n, 0), 2), l = Math.max(0.9, s / 2 + 0.5), c = r / 12;
        const d = PROFIT_PER_BUILDING_LEVEL * (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) * g * (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) + (t.modeledStoreWages ?? 0) * SCXXCS;
        // console.log(`t.buildingLevelsNeededPerUnitPerHour:${t.buildingLevelsNeededPerUnitPerHour}, t.modeledUnitsSoldAnHour:${t.modeledUnitsSoldAnHour}, t.modeledStoreWages:${t.modeledStoreWages} , s:${s} , c:${c}, g:${g}`)
        const h = t.modeledUnitsSoldAnHour * l;
        const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
        const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
        return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
    };
    const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
        const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
        if (u <= 0) return NaN;
        const d = u / acc / size;
        let p = d - d * salesModifier / 100;
        return weather && (p /= weather.sellingSpeedMultiplier), p
    };

    // ======================

    // ======================
    // 全局按钮：高管自定义开关
    // ======================

    // 映射表已抽离至 src/constants/resourceMap.js

    // 模块1：网络请求模块 (已抽离至 src/core/network.js)
    window.__SC_Network = Network;

    // 模块2：领域数据模块 (已抽离至 src/features/regionData.js)

    // ======================
    // 模块2-1 和 模块2-2 (Fetch Hooks) 已抽离至 src/core/requestHooks.js
    // 模块3：基本数据模块 (已抽离至 src/features/constantsData.js)
    // 模块4：数据存储模块 (已抽离至 src/features/dataStorage.js)
    // ======================
    // 模块5：界面模块
    // ======================
    const PanelUI = (() => {
        let panelElement = null;
        const statusElements = {};
        let needsPositionRecalc = true; // 页面刷新后/拖拽后首次打开面板时重新计算位置
        let intendedLeft = null;   // 用户拖拽/存储的预期 left（窗口缩放时据此贴边，不保存）
        let intendedBottom = null; // 用户拖拽/存储的预期 bottom

        const typeDisplayNames = {
            r1: 'R1',
            r2: 'R2',
            constants: '基本'
        };

        // 插入样式（使用CSS变量，在面板首次打开时由refreshPanelTheme动态更新）
        const injectStyles = () => {
            const style = document.createElement('style');
            style.id = 'sc-panel-dynamic-styles';
            style.textContent = `
            .SimcompaniesRetailCalculation-mini-panel {
                position: fixed;
                z-index: 9999;
                font-family: Arial, sans-serif;
            }
            .SimcompaniesRetailCalculation-trigger-btn {
                width: 32px;
                height: 32px;
                background: #4CAF50;
                border-radius: 50%;
                border: none;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 18px;
                user-select: none;
                -webkit-user-select: none;
                line-height: 1;
            }
            .SimcompaniesRetailCalculation-panel-content {
                display: none;
                position: absolute;
                bottom: 40px;
                left: 0;
                background: var(--sc-panel-bg, rgba(40,40,40,0.95));
                border-radius: 4px;
                padding: 8px;
                min-width: min(260px, calc(100vw - 26px));
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 100px);
                overflow-y: auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                color: var(--sc-panel-fg, #efefef);
            }
            .SimcompaniesRetailCalculation-data-row {
                margin: 6px 0;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .SimcompaniesRetailCalculation-region-label {
                color: var(--sc-panel-label, #BDBDBD);
                min-width: 70px;
            }
            .SimcompaniesRetailCalculation-region-status {
                font-family: monospace;
                margin-left: 10px;
                text-align: right;
                flex-grow: 1;
            }
            .SimcompaniesRetailCalculation-btn-group {
                margin-top: 8px;
                display: grid;
                gap: 6px;
            }
            .SimcompaniesRetailCalculation-action-btn {
                background: #2196F3;
                border: none;
                color: white;
                padding: 6px 10px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }
            .SimcompaniesRetailCalculation-action-btn:disabled {
                background: #607D8B;
                cursor: not-allowed;
            }
            .SimcompaniesRetailCalculation-no-data { color: #f44336; }
            .SimcompaniesRetailCalculation-has-data { color: #4CAF50; }

            /* 1. 默认状态：隐藏二级菜单 */
            #secondary-menu-container {
                display: none;
            }

            /* 2. 联动逻辑：当 content 拥有 show-settings 类时 */
            /* 隐藏一级菜单 */
            .SimcompaniesRetailCalculation-panel-content.show-settings #main-menu-container {
                display: none;
            }

            /* 显示二级菜单 */
            .SimcompaniesRetailCalculation-panel-content.show-settings #secondary-menu-container {
                display: block;
            }
        `;
            document.head.appendChild(style);
        };

        // 饱和度表格功能
        const showSaturationTable = () => {
            const realmId = getRealmIdFromLink();
            if (realmId === null) return alert("未识别到 realmId！");

            const dataStr = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
            if (!dataStr) return alert(`没有找到领域 ${realmId} 数据，请先更新！`);

            const data = JSON.parse(dataStr);
            // 调用提取出的显示模块
            SaturationDisplay.toggle(data);
        };

        // 自定义运行时长开关按钮的初始化逻辑
        const initAutoAmountToggle = () => {
            const btn = document.getElementById('auto-amount-toggle-btn');
            if (!btn) return;

            // 确保函数已挂载到 window，否则不执行
            if (typeof window.isAutoAmountEnabled !== 'function') {
                btn.textContent = '自定义运行时长: (加载中...)';
                btn.style.backgroundColor = '#607D8B';
                return;
            }

            const updateToggleBtn = () => {
                const isEnabled = window.isAutoAmountEnabled();
                btn.textContent = isEnabled ? '自定义运行时长: 🟢 已启用' : '自定义运行时长: 🔴 已禁用';
                btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            };

            updateToggleBtn();

            // 重新绑定事件，确保使用 window 上的函数
            btn.onclick = () => {
                if (typeof window.isAutoAmountEnabled === 'function' &&
                    typeof window.saveAutoAmountEnabled === 'function' &&
                    typeof window.initAutoAmountButtons === 'function') {

                    const isCurrentlyEnabled = window.isAutoAmountEnabled();
                    const newEnabledState = !isCurrentlyEnabled;

                    window.saveAutoAmountEnabled(newEnabledState);
                    window.initAutoAmountButtons(true);
                    updateToggleBtn();
                } else {
                    alert('错误：自定义运行时长控制函数未找到！');
                }
            };
        };

        // 刷新所有 PageAction 开关按钮的状态
        const refreshPageActionToggles = () => {
            if (!panelElement) return;
            const configKey = 'SC_PageActions_Settings';

            // 获取当前真实的存储数据
            let config = {};
            try {
                config = JSON.parse(localStorage.getItem(configKey)) || {};
            } catch (e) { config = {}; }

            // 找到所有带有特定标识的按钮
            const toggles = panelElement.querySelectorAll('.page-action-toggle');
            toggles.forEach(btn => {
                const key = btn.dataset.key;
                const label = btn.dataset.label;
                if (!key || !label) return;

                // 判定逻辑：读取按钮上存储的默认值，只有明确为 false 时才关闭
                const defaultEnabled = btn.dataset.defaultEnabled !== 'false';
                const isEnabled = config[key] !== undefined ? config[key] !== false : defaultEnabled;

                btn.textContent = `${label}: ${isEnabled ? '🟢 已启用' : '🔴 已禁用'}`;
                btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            });
        };

        // --- 面板拖拽位置存储相关 ---
        const PANEL_POS_KEY = 'SC_PanelPosition';
        const getSavedPos = () => {
            try {
                const raw = localStorage.getItem(PANEL_POS_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) { /* ignore */ }
            return null;
        };
        const savePos = (left, bottom) => {
            try { localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left, bottom })); } catch (e) { /* ignore */ }
        };

        // 还原按钮到默认位置（油猴菜单保底操作）
        const resetPanelPosition = () => {
            localStorage.removeItem(PANEL_POS_KEY);
            intendedLeft = 10;
            intendedBottom = 55;
            if (panelElement) {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const btnW = panelElement.offsetWidth || 32;
                const btnH = panelElement.offsetHeight || 32;
                const intendedTop = vh - intendedBottom - btnH;
                const left = Math.max(0, Math.min(vw - btnW, intendedLeft));
                const top = Math.max(0, Math.min(vh - btnH, intendedTop));
                panelElement.style.left = left + 'px';
                panelElement.style.bottom = (vh - top - btnH) + 'px';
                panelElement.style.top = 'auto';
            }
        };

        // 面板展开位置自动适配视口（每次打开时调用，先重置再计算）
        const adjustPanelPosition = (contentEl) => {
            // 重置所有位置样式
            contentEl.style.top = ''; contentEl.style.bottom = '';
            contentEl.style.left = ''; contentEl.style.right = '';
            contentEl.style.maxHeight = ''; contentEl.style.maxWidth = '';
            contentEl.style.overflowY = '';
            void contentEl.offsetHeight;

            const triggerEl = panelElement.querySelector('.SimcompaniesRetailCalculation-trigger-btn');
            if (!triggerEl) return;
            const margin = 10;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const triggerRect = triggerEl.getBoundingClientRect();
            const triggerH = triggerRect.height;

            // ---- 1. 自适应面板尺寸 ----
            // 内容不能挡按钮：上方空间 = 按钮顶部到视口顶；下方空间 = 视口底到按钮底
            const availTop = triggerRect.top - margin;
            const availBottom = vh - triggerRect.bottom - margin;
            const availLeft = triggerRect.left - margin;
            const availRight = vw - triggerRect.right - margin;

            contentEl.style.maxHeight = Math.max(availTop, availBottom, 100) + 'px';
            contentEl.style.overflowY = 'auto';
            contentEl.style.maxWidth = Math.max(triggerRect.width + Math.max(availLeft, availRight), vw - margin * 2, 260) + 'px';

            // ---- 2. 垂直定位：选择空间更大的一侧，紧贴按钮 ----
            const gap = triggerH; // 内容紧贴按钮边缘
            contentEl.style.top = 'auto';
            contentEl.style.bottom = gap + 'px';
            void contentEl.offsetHeight;
            let rect = contentEl.getBoundingClientRect();
            const neededH = Math.min(rect.height, parseFloat(contentEl.style.maxHeight));

            if (rect.top < margin && availBottom >= neededH) {
                // 上方出界，下方有空间 → 向下展开
                contentEl.style.bottom = 'auto';
                contentEl.style.top = gap + 'px';
            } else if (availTop < neededH && availBottom >= neededH) {
                // 上方空间不够但下方够 → 向下展开
                contentEl.style.bottom = 'auto';
                contentEl.style.top = gap + 'px';
            } else {
                // 默认向上展开
                contentEl.style.top = 'auto';
                contentEl.style.bottom = gap + 'px';
            }

            // ---- 3. 水平定位：哪边空间大就朝哪边展开，紧贴按钮 ----
            const panelRect = panelElement.getBoundingClientRect();

            // 按钮在右半屏 → 面板向左展开（right 对齐）；按钮在左半屏 → 向右展开（left 对齐）
            const btnCenterX = triggerRect.left + triggerRect.width / 2;
            if (btnCenterX > vw / 2) {
                // 按钮偏右 → 面板向左展开，内容右边缘对齐按钮右边缘
                contentEl.style.left = 'auto';
                contentEl.style.right = (panelRect.right - triggerRect.right) + 'px';
            } else {
                // 按钮偏左 → 面板向右展开，内容左边缘对齐按钮左边缘
                contentEl.style.right = 'auto';
                contentEl.style.left = (triggerRect.left - panelRect.left) + 'px';
            }

            // ---- 4. 最终边界检查 ----
            void contentEl.offsetHeight;
            rect = contentEl.getBoundingClientRect();
            if (rect.left < margin) { contentEl.style.left = margin + 'px'; contentEl.style.right = 'auto'; }
            if (rect.right > vw - margin) { contentEl.style.right = (vw - rect.right) + 'px'; contentEl.style.left = 'auto'; }
            if (rect.top < margin) { contentEl.style.bottom = 'auto'; contentEl.style.top = margin + 'px'; }
        };

        // 创建界面元素
        const createPanel = () => {
            const panel = document.createElement('div');
            panel.className = 'SimcompaniesRetailCalculation-mini-panel';

            // 触发器按钮（可拖拽）
            const trigger = document.createElement('button');
            trigger.className = 'SimcompaniesRetailCalculation-trigger-btn';
            trigger.textContent = '≡';

            // --- 拖拽逻辑（长按1秒启动 + 鼠标 + 触摸） ---
            let dragState = null;
            let longPressTimer = null;
            const clearLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };

            const getClientPos = (e) => {
                if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
                return { x: e.clientX, y: e.clientY };
            };
            const getPanelBounds = () => {
                const w = panel.offsetWidth || 40;
                const h = panel.offsetHeight || 40;
                return { w, h };
            };
            const clampPosition = (left, top) => {
                const { w, h } = getPanelBounds();
                return {
                    left: Math.max(0, Math.min(window.innerWidth - w, left)),
                    top: Math.max(0, Math.min(window.innerHeight - h, top))
                };
            };
            const saveDragPosition = () => {
                const rect = panel.getBoundingClientRect();
                intendedLeft = Math.round(rect.left);
                intendedBottom = Math.round(window.innerHeight - rect.bottom);
                savePos(intendedLeft, intendedBottom);
            };

            // 根据预期位置 + 当前视口边界自动贴边（不保存，保留用户原始位置）
            const applyClampedPosition = () => {
                if (intendedLeft === null || !panel) return;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const btnW = panel.offsetWidth || 32;
                const btnH = panel.offsetHeight || 32;
                const intendedTop = vh - intendedBottom - btnH;
                const left = Math.max(0, Math.min(vw - btnW, intendedLeft));
                const top = Math.max(0, Math.min(vh - btnH, intendedTop));
                panel.style.left = left + 'px';
                panel.style.bottom = (vh - top - btnH) + 'px';
                panel.style.top = 'auto';
            };

            // 恢复上次拖拽位置（或默认位置），并贴边
            const savedPos = getSavedPos();
            if (savedPos) {
                intendedLeft = savedPos.left;
                intendedBottom = savedPos.bottom;
            } else {
                intendedLeft = 10;
                intendedBottom = 55;
            }
            applyClampedPosition();

            window.addEventListener('resize', applyClampedPosition);

            const onDragStart = (e) => {
                // 鼠标：只响应左键
                if (e.button !== undefined && e.button !== 0) return;
                const isTouch = !!e.touches;
                const pos = getClientPos(e);
                const rect = panel.getBoundingClientRect();
                const state = {
                    startX: pos.x, startY: pos.y,
                    origLeft: rect.left, origTop: rect.top,
                    isDragging: false,
                    readyToDrag: !isTouch // 鼠标立即生效，触摸需等长按
                };
                dragState = state;

                if (isTouch) {
                    // 触摸：长按 0.5 秒后进入拖拽模式
                    clearLongPress();
                    longPressTimer = setTimeout(() => {
                        state.readyToDrag = true;
                        longPressTimer = null;
                    }, 500);
                }
                // 不 preventDefault，让 click 事件能正常触发
            };
            const onDragMove = (e) => {
                if (!dragState) return;
                const pos = getClientPos(e);
                const dx = pos.x - dragState.startX;
                const dy = pos.y - dragState.startY;

                // 还没进入就绪状态：移动超过阈值则取消（触摸时为防止长按后误触）
                if (!dragState.readyToDrag) {
                    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                        clearLongPress();
                        dragState = null;
                    }
                    return;
                }

                // 已就绪：进入拖拽状态
                dragState.isDragging = true;
                let newLeft = dragState.origLeft + dx;
                let newTop = dragState.origTop + dy;
                const clamped = clampPosition(newLeft, newTop);
                panel.style.left = clamped.left + 'px';
                panel.style.top = clamped.top + 'px';
                panel.style.bottom = 'auto';
                if (e.cancelable) e.preventDefault();
            };
            const onDragEnd = () => {
                clearLongPress();
                if (!dragState) return;
                if (dragState.isDragging) {
                    const rect = panel.getBoundingClientRect();
                    const clamped = clampPosition(rect.left, rect.top);
                    panel.style.left = clamped.left + 'px';
                    panel.style.top = clamped.top + 'px';
                    saveDragPosition();
                    // 如果面板正展开着，拖拽后重新计算内容位置
                    if (content.style.display === 'block') {
                        setTimeout(() => adjustPanelPosition(content), 50);
                    } else {
                        // 面板关闭时拖拽了按钮，下次打开需要重新计算位置
                        needsPositionRecalc = true;
                    }
                    // 标记本次拖拽，防止 click 触发面板切换
                    trigger.dataset.dragged = 'true';
                    setTimeout(() => { trigger.dataset.dragged = 'false'; }, 100);
                }
                dragState = null;
            };

            // 鼠标事件（立即拖拽）
            trigger.addEventListener('mousedown', onDragStart);
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);

            // 触摸事件（长按1秒后拖拽）
            trigger.addEventListener('touchstart', onDragStart, { passive: true });
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);

            // 防止移动端长按弹出上下文菜单
            trigger.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            // 点击时区分拖拽和点击
            trigger.addEventListener('click', (e) => {
                if (trigger.dataset.dragged === 'true') {
                    e.stopPropagation();
                    return;
                }
                togglePanel(e);
            });

            // 内容面板
            const content = document.createElement('div');
            content.className = 'SimcompaniesRetailCalculation-panel-content';

            // 状态显示行
            const createStatusRow = (type) => {
                const row = document.createElement('div');
                row.className = 'SimcompaniesRetailCalculation-data-row';

                const label = document.createElement('span');
                label.className = 'SimcompaniesRetailCalculation-region-label';
                // 使用映射后的显示名称
                label.textContent = `${typeDisplayNames[type]}数据：`;

                const status = document.createElement('span');
                status.className = 'SimcompaniesRetailCalculation-region-status';
                statusElements[type] = status;

                row.append(label, status);
                return row;
            };

            // --- 新增：定义切换函数 ---
            const switchMenu = (isSettings) => {
                content.classList.toggle('show-settings', isSettings);
                if (isSettings) {
                    initAutoAmountToggle();
                    refreshPageActionToggles();
                }
            };

            // 面板位置自动适配视口（定义已移至 PanelUI 顶层作用域）
            const mainMenu = document.createElement('div');
            mainMenu.id = 'main-menu-container';
            const secondaryMenu = document.createElement('div');
            secondaryMenu.id = 'secondary-menu-container';

            // 操作按钮
            const createActionButton = (text, type) => {
                const btn = document.createElement('button');
                btn.className = 'SimcompaniesRetailCalculation-action-btn';
                btn.textContent = text;
                btn.dataset.actionType = type;
                return btn;
            };

            // PageAction操作按钮
            const createPageActionToggle = (key, label, defaultEnabled = true) => {
                const btn = document.createElement('button');
                btn.className = 'SimcompaniesRetailCalculation-action-btn page-action-toggle';

                // 必须绑定这些数据，以便刷新函数能识别按钮用途
                btn.dataset.key = key;
                btn.dataset.label = label;
                btn.dataset.defaultEnabled = defaultEnabled ? 'true' : 'false';

                const updateUI = () => {
                    refreshPageActionToggles(); // 触发全局刷新
                };

                btn.onclick = (e) => {
                    e.stopPropagation(); // 防止冒泡触发面板关闭

                    const configKey = 'SC_PageActions_Settings';
                    const stored = localStorage.getItem(configKey) || '{}';
                    let config = {};
                    try { config = JSON.parse(stored); } catch (e) { }

                    // 执行切换逻辑：如果当前不是 false，则设为 false；反之设为 true
                    const newState = config[key] === false;
                    config[key] = newState;

                    localStorage.setItem(configKey, JSON.stringify(config));
                    updateUI(); // 保存后立即同步 UI
                };

                // 初始状态下手动更新一次文字，避免显示空白
                const initialConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                const isEnabled = initialConfig[key] !== undefined ? initialConfig[key] !== false : defaultEnabled;
                btn.textContent = `${label}: ${isEnabled ? '🟢 已启用' : '🔴 已禁用'}`;
                btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';

                return btn;
            };

            // 聊天输入框扩大高度配置（桌面/移动端分开存储，预留后续分别调整）
            const CHAT_INPUT_HEIGHT_KEY = {
                desktop: 'chatInputExpanderHeight',
                mobile: 'chatInputExpanderHeightMobile',
            };
            const CHAT_INPUT_HEIGHT_DEFAULTS = { desktop: 130, mobile: 90 };
            const CHAT_INPUT_HEIGHT_RANGE = { min: 40 };

            const readChatInputHeight = (key, fallback) => {
                try {
                    const config = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                    const value = parseInt(config[key], 10);
                    return isFinite(value) ? value : fallback;
                } catch (e) {
                    return fallback;
                }
            };

            const createChatInputHeightControls = () => {
                const row = document.createElement('div');
                row.className = 'sc-chat-input-height-row';
                row.style.cssText = 'display:grid;grid-template-columns:auto 64px auto;gap:6px;align-items:center;margin-top:6px;font-size:12px;color:var(--sc-panel-fg,#efefef);';

                const makeInput = (label, key, fallback) => {
                    const labelSpan = document.createElement('span');
                    labelSpan.textContent = label;
                    labelSpan.style.cssText = 'white-space:nowrap;line-height:24px;';
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = CHAT_INPUT_HEIGHT_RANGE.min;
                    input.step = 10;
                    input.value = readChatInputHeight(key, fallback);
                    input.style.cssText = 'width:100%;height:24px;box-sizing:border-box;padding:2px 4px;border:1px solid #666;border-radius:3px;background:rgba(255,255,255,0.08);color:inherit;font-size:12px;';
                    const unit = document.createElement('span');
                    unit.textContent = 'px';
                    unit.style.cssText = 'line-height:24px;';
                    row.append(labelSpan, input, unit);
                    return input;
                };

                const desktopInput = makeInput('桌面端高度:', CHAT_INPUT_HEIGHT_KEY.desktop, CHAT_INPUT_HEIGHT_DEFAULTS.desktop);
                const mobileInput = makeInput('移动端高度:', CHAT_INPUT_HEIGHT_KEY.mobile, CHAT_INPUT_HEIGHT_DEFAULTS.mobile);

                const clampHeight = (value, fallback) => {
                    const n = parseInt(value, 10);
                    if (!isFinite(n)) return fallback;
                    return Math.max(CHAT_INPUT_HEIGHT_RANGE.min, n);
                };

                // 按钮短暂变换文字作为操作反馈，随后恢复
                const flashButton = (btn, activeText, activeColor, idleText, idleColor) => {
                    if (btn._flashTimer) clearTimeout(btn._flashTimer);
                    btn.textContent = activeText;
                    btn.style.backgroundColor = activeColor;
                    btn._flashTimer = setTimeout(() => {
                        btn.textContent = idleText;
                        btn.style.backgroundColor = idleColor;
                    }, 1500);
                };

                const applyBtn = document.createElement('button');
                applyBtn.className = 'SimcompaniesRetailCalculation-action-btn';
                applyBtn.textContent = '应用';
                applyBtn.style.cssText = 'flex:1;background:#2196F3;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:12px;';
                applyBtn.onclick = (e) => {
                    e.stopPropagation();
                    const configKey = 'SC_PageActions_Settings';
                    let config = {};
                    try { config = JSON.parse(localStorage.getItem(configKey)) || {}; } catch (err) { config = {}; }
                    config[CHAT_INPUT_HEIGHT_KEY.desktop] = clampHeight(desktopInput.value, CHAT_INPUT_HEIGHT_DEFAULTS.desktop);
                    config[CHAT_INPUT_HEIGHT_KEY.mobile] = clampHeight(mobileInput.value, CHAT_INPUT_HEIGHT_DEFAULTS.mobile);
                    localStorage.setItem(configKey, JSON.stringify(config));
                    desktopInput.value = config[CHAT_INPUT_HEIGHT_KEY.desktop];
                    mobileInput.value = config[CHAT_INPUT_HEIGHT_KEY.mobile];
                    if (typeof window.scChatInputExpanderApplyStyles === 'function') {
                        window.scChatInputExpanderApplyStyles();
                    }
                    flashButton(applyBtn, '✓ 已应用', '#4CAF50', '应用', '#2196F3');
                };

                const resetBtn = document.createElement('button');
                resetBtn.className = 'SimcompaniesRetailCalculation-action-btn';
                resetBtn.textContent = '重置';
                resetBtn.style.cssText = 'flex:1;background:#607D8B;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:12px;';
                resetBtn.onclick = (e) => {
                    e.stopPropagation();
                    const configKey = 'SC_PageActions_Settings';
                    let config = {};
                    try { config = JSON.parse(localStorage.getItem(configKey)) || {}; } catch (err) { config = {}; }
                    delete config[CHAT_INPUT_HEIGHT_KEY.desktop];
                    delete config[CHAT_INPUT_HEIGHT_KEY.mobile];
                    localStorage.setItem(configKey, JSON.stringify(config));
                    desktopInput.value = CHAT_INPUT_HEIGHT_DEFAULTS.desktop;
                    mobileInput.value = CHAT_INPUT_HEIGHT_DEFAULTS.mobile;
                    if (typeof window.scChatInputExpanderApplyStyles === 'function') {
                        window.scChatInputExpanderApplyStyles();
                    }
                    flashButton(resetBtn, '✓ 已重置', '#4CAF50', '重置', '#607D8B');
                };

                const actionRow = document.createElement('div');
                actionRow.style.cssText = 'display:flex;gap:6px;grid-column:1 / -1;margin-top:2px;';
                actionRow.append(applyBtn, resetBtn);
                row.appendChild(actionRow);
                return row;
            };

            mainMenu.append(
                createStatusRow('r1'),
                createStatusRow('r2'),
                createStatusRow('constants')
            );

            const btnGroup = document.createElement('div');
            btnGroup.className = 'SimcompaniesRetailCalculation-btn-group';
            btnGroup.append(
                createActionButton('更新领域数据', 'region'),
                createActionButton('更新基本数据', 'constants'),
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';
                    btn.textContent = '当前领域天气和饱和度表';
                    btn.onclick = showSaturationTable;
                    return btn;
                })(),
                createActionButton('MP-?%', 'mpShow'),
                createActionButton('计算当前冰淇淋剩余量', 'calculateDecay'),
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';

                    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

                    // 初始状态（默认未安装）
                    btn.textContent = 'SC图片替换管理 (检测中...)';
                    btn.style.backgroundColor = '#546E7A';

                    let retry = 0;
                    const maxRetry = 20; // 最多等 20 次（约10秒）

                    const timer = setInterval(() => {
                        if (typeof win.SCobg_TogglePanel === 'function') {
                            clearInterval(timer);

                            btn.textContent = 'SC图片替换管理';
                            btn.style.backgroundColor = '#9C27B0';
                            btn.onclick = () => win.SCobg_TogglePanel();
                        } else if (retry++ > maxRetry) {
                            clearInterval(timer);

                            btn.textContent = 'SC图片替换管理 (未安装)';
                            btn.onclick = () => {
                                if (confirm('检测到未安装图片替换脚本，是否前往安装？')) {
                                    window.open('https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js', '_blank');
                                }
                            };
                        }
                    }, 500);

                    return btn;
                })(),
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';
                    btn.textContent = '⚙️ 功能开关设置';
                    btn.style.backgroundColor = '#607D8B';
                    btn.onclick = () => switchMenu(true);
                    return btn;
                })()
            );
            content.appendChild(btnGroup);

            // --- 新增：填充二级菜单内容 ---
            const secBtnGroup = document.createElement('div');
            secBtnGroup.className = 'SimcompaniesRetailCalculation-btn-group';

            const backBtn = document.createElement('button');
            backBtn.className = 'SimcompaniesRetailCalculation-action-btn';
            backBtn.textContent = '⬅ 返回';
            backBtn.style.backgroundColor = '#E91E63';
            backBtn.onclick = () => switchMenu(false);

            secBtnGroup.append(backBtn);
            // 分页渲染：所有开关项
            const toggleItems = [
                {
                    type: 'factory', fn: () => {
                        const b = document.createElement('button');
                        b.className = 'SimcompaniesRetailCalculation-action-btn';
                        b.id = 'auto-amount-toggle-btn';
                        const refreshState = () => {
                            try {
                                const enabled = typeof window.isAutoAmountEnabled === 'function' && window.isAutoAmountEnabled();
                                b.textContent = enabled ? '自定义运行时长: 🟢 已启用' : '自定义运行时长: 🔴 已禁用';
                                b.style.backgroundColor = enabled ? '#4CAF50' : '#f44336';
                            } catch (e) { b.textContent = '自定义运行时长: (加载中...)'; b.style.backgroundColor = '#607D8B'; }
                        };
                        refreshState();
                        b.onclick = (ev) => {
                            ev.stopPropagation();
                            if (typeof window.isAutoAmountEnabled !== 'function') return;
                            window.saveAutoAmountEnabled(!window.isAutoAmountEnabled());
                            window.initAutoAmountButtons(true);
                            refreshState();
                        };
                        return b;
                    }
                },
                { type: 'toggle', key: 'marketProfit', label: '交易所计算时利润' },
                { type: 'toggle', key: 'contractProfit', label: '合同计算时利润' },
                { type: 'toggle', key: 'executiveHistory', label: '显示高管培训记录' },
                { type: 'toggle', key: 'formerExecEnhance', label: '前任高管更多信息' },
                { type: 'toggle', key: 'outgoingMP', label: '出库合同MP-?%' },
                { type: 'toggle', key: 'autoSelectBestMarketRow', label: '交易所自动选中高亮行', defaultEnabled: false },
                { type: 'toggle', key: 'warehouseProfit', label: '仓库时利润计算' },
                { type: 'toggle', key: 'chatAccessibility', label: '聊天室色弱辅助', defaultEnabled: false },
                { type: 'toggle', key: 'landscapeHighlight', label: '地图空闲建筑高亮' },
                { type: 'toggle', key: 'restaurantStock', label: '餐馆备货提醒' },
                { type: 'toggle', key: 'paQuestAnswers', label: 'PA任务答案', defaultEnabled: true },
                { type: 'toggle', key: 'snipboardPreview', label: 'Snipboard图片预览', defaultEnabled: true },
                { type: 'toggle', key: 'chatInputExpander', label: '聊天输入框自动扩大', defaultEnabled: true, heightInput: true },
            ];
            const ITEMS_PER_PAGE = 5;
            let currentPage = 0;
            const totalPages = Math.ceil(toggleItems.length / ITEMS_PER_PAGE);
            function renderPage(page) {
                secBtnGroup.querySelectorAll('.sc-toggle-item, .sc-page-controls').forEach(el => el.remove());
                const startIdx = page * ITEMS_PER_PAGE;
                const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, toggleItems.length);
                for (let i = startIdx; i < endIdx; i++) {
                    const item = toggleItems[i];
                    let el;
                    if (item.type === 'factory') { el = item.fn(); }
                    else { el = createPageActionToggle(item.key, item.label, item.defaultEnabled !== false); }
                    if (item.heightInput) {
                        const wrap = document.createElement('div');
                        wrap.className = 'sc-toggle-item';
                        wrap.style.cssText = 'display:flex;flex-direction:column;';
                        wrap.appendChild(el);
                        wrap.appendChild(createChatInputHeightControls());
                        el = wrap;
                    } else {
                        el.classList.add('sc-toggle-item');
                    }
                    secBtnGroup.appendChild(el);
                }
                const controls = document.createElement('div');
                controls.className = 'sc-page-controls';
                controls.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px;';
                const prevBtn = document.createElement('button');
                prevBtn.className = 'SimcompaniesRetailCalculation-action-btn';
                prevBtn.textContent = '◀ 上一页';
                prevBtn.style.cssText = `background:${page === 0 ? '#607D8B' : '#2196F3'};color:white;border:none;padding:4px 8px;border-radius:3px;cursor:${page === 0 ? 'not-allowed' : 'pointer'};font-size:11px;flex:1;`;
                prevBtn.disabled = page === 0;
                prevBtn.onclick = (e) => { e.stopPropagation(); if (page > 0) { currentPage = page - 1; renderPage(currentPage); } };
                const pageInfo = document.createElement('span');
                pageInfo.textContent = `${page + 1} / ${totalPages}`;
                pageInfo.style.cssText = 'font-size:12px;color:var(--sc-panel-fg,#efefef);white-space:nowrap;';
                const nextBtn = document.createElement('button');
                nextBtn.className = 'SimcompaniesRetailCalculation-action-btn';
                nextBtn.textContent = '下一页 ▶';
                nextBtn.style.cssText = `background:${page >= totalPages - 1 ? '#607D8B' : '#2196F3'};color:white;border:none;padding:4px 8px;border-radius:3px;cursor:${page >= totalPages - 1 ? 'not-allowed' : 'pointer'};font-size:11px;flex:1;`;
                nextBtn.disabled = page >= totalPages - 1;
                nextBtn.onclick = (e) => { e.stopPropagation(); if (page < totalPages - 1) { currentPage = page + 1; renderPage(currentPage); } };
                controls.appendChild(prevBtn);
                controls.appendChild(pageInfo);
                controls.appendChild(nextBtn);
                secBtnGroup.appendChild(controls);
            }
            secondaryMenu.appendChild(secBtnGroup);
            renderPage(0);

            // 插件信息区块（初始用默认暗色，首次打开面板时refreshPanelTheme更新为正确主题色）
            const info = document.createElement('div');
            info.style.cssText = `margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:#ccc;border-top:1px solid #555;`;

            const version = GM_info?.script?.version || '未知版本';

            info.innerHTML = `
                作者：<a href="https://www.simcompanies.com/zh-cn/company/0/Rabbit-House/" target="_blank" class="sc-info-link">Rabbit House</a> 反馈请说明问题<br>
                反馈群：798670333 <br>
                源码：<a href="https://github.com/gangbaRuby/SimCompanies-Scripts" target="_blank" class="sc-info-link">GitHub</a> ⭐🙇<br>
                版本：<span id="script-version">${version}</span>
            `;

            // 轮询检测 hasNewVersion
            let checkTimer = setInterval(() => {
                console.log(hasNewVersion)
                if (hasNewVersion === true) {
                    // 更新DOM
                    const verNode = document.getElementById("script-version");
                    if (verNode) {
                        verNode.innerHTML = `${version} <a href="https://sc.22-7.top/scripts/autoMaxPPHPL.user.js" span style="color:#ff6;">（发现新版本：${latestVersion}）</span>`;
                    }
                    clearInterval(checkTimer); // 停止轮询
                } else if (hasNewVersion === false) {
                    // 未发现新版本 → 停止轮询
                    clearInterval(checkTimer);
                }
                // 如果是 undefined，则继续轮询
            }, 500);

            mainMenu.appendChild(btnGroup);
            content.append(mainMenu, secondaryMenu, info);
            panel.append(trigger, content);
            return panel;
        };

        // 切换面板可见性
        let panelThemeInited = false;
        const refreshPanelTheme = () => {
            const d = DM();
            const root = document.documentElement;
            root.style.setProperty('--sc-panel-bg', d ? 'rgba(40,40,40,0.95)' : 'rgba(255,255,255,0.98)');
            root.style.setProperty('--sc-panel-fg', d ? '#efefef' : '#333');
            root.style.setProperty('--sc-panel-label', d ? '#BDBDBD' : '#666');
            // 更新信息区和链接色（首次打开面板时DM()才准确）
            const linkColor = d ? '#6cf' : '#2196F3';
            document.querySelectorAll('.sc-info-link').forEach(a => { a.style.color = linkColor; });
            const infoDiv = panelElement?.querySelector('.SimcompaniesRetailCalculation-panel-content > div:last-child');
            if (infoDiv) {
                infoDiv.style.cssText = `margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:${d ? '#ccc' : '#666'};border-top:1px solid ${d ? '#555' : '#ddd'};`;
            }
            panelThemeInited = true;
        };

        const togglePanel = (e) => {
            e.stopPropagation();
            const content = panelElement.querySelector('.SimcompaniesRetailCalculation-panel-content');
            const isCurrentlyVisible = content.style.display === 'block';

            if (isCurrentlyVisible) {
                content.style.display = 'none';
                return;
            }

            // 先显示但隐藏，计算好位置后再可见，避免闪现
            content.style.display = 'block';
            content.style.visibility = 'hidden';

            if (!panelThemeInited) refreshPanelTheme();
            content.classList.remove('show-settings');
            refreshStatus();
            initAutoAmountToggle();
            refreshPageActionToggles();

            // 自动调整展开方向（仅页面刷新后首次/拖拽后首次）
            if (needsPositionRecalc) {
                adjustPanelPosition(content);
                needsPositionRecalc = false;
            }

            // 位置计算完毕，显示面板
            content.style.visibility = 'visible';
        };

        // 刷新状态显示
        const refreshStatus = () => {
            ['r1', 'r2', 'constants'].forEach(type => {
                const { text, className } = Storage.getFormattedStatus(type);
                statusElements[type].textContent = text;
                statusElements[type].className = `SimcompaniesRetailCalculation-region-status ${className}`;
            });
        };

        const MpPanel = (() => {
            let inputPercent = (() => {
                const val = localStorage.getItem('mp_inputPercent');
                return val === null ? 2.5 : parseFloat(val);
            })();

            // 监听url变化，自动更新面板内容和标题
            function addUrlChangeListener(callback) {
                let lastUrl = location.href;
                new MutationObserver(() => {
                    const url = location.href;
                    if (url !== lastUrl) {
                        lastUrl = url;
                        callback(url);
                    }
                }).observe(document, { subtree: true, childList: true });
            }

            // 获取当前资源ID（路径中提取）
            function getCurrentResourceId() {
                const url = location.pathname;
                const match = url.match(/\/market\/resource\/(\d+)(\/|$)/);
                return match ? match[1] : null;
            }

            // 监听调用
            addUrlChangeListener(() => {
                updateContent('请点击计算');
                const titleEl = document.querySelector('#mp-floating-box div:first-child div');
                if (titleEl) {
                    titleEl.textContent = `MP-?% - 点合同时利润降序，点卖家跳转私信`;
                }
            });

            function renderResultTable(results) {
                if (!Array.isArray(results) || results.length === 0) {
                    return '<p>无数据</p>';
                }
                const headers = ['卖家', '市场价', '品质', '数量', '合同价', '合同时利润'];
                let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; width: 100%;">';
                // 普通表头，不带sticky样式
                html += '<thead><tr>' + headers.map((h, i) => `<th class="th-${i}">${h}</th>`).join('') + '</tr></thead>';
                html += '<tbody>';
                for (const row of results) {
                    html += '<tr>' +
                        `<td style="max-width:120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <a href="https://www.simcompanies.com/zh-cn/messages/${encodeURIComponent(row.seller)}" target="_blank"
                       style="color: inherit; text-decoration: none; display: inline-block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                       ${row.seller}
                    </a>
                 </td>` +
                        `<td>${row.marketPrice}</td>` +
                        `<td>${row.quality}</td>` +
                        `<td>${row.saleAmout}</td>` +
                        `<td>${row.contractPrice.toFixed(2)}</td>` +
                        `<td>${row.contractMaxProfit}</td>` +
                        '</tr>';
                }
                html += '</tbody></table>';
                return html;
            }

            // 插入表格后调用此函数绑定样式和排序事件
            function enableTableFeatures() {
                const table = document.querySelector('#mp-table-container table');
                if (!table) return;

                const profitTh = table.querySelector('thead th.th-5');
                if (!profitTh) return;

                let ascending = false; // 默认降序
                profitTh.style.cursor = 'pointer';

                profitTh.onclick = () => {
                    const tbody = table.querySelector('tbody');
                    const rows = Array.from(tbody.querySelectorAll('tr'));

                    rows.sort((a, b) => {
                        const aVal = parseFloat(a.cells[5].textContent) || 0;
                        const bVal = parseFloat(b.cells[5].textContent) || 0;
                        return ascending ? aVal - bVal : bVal - aVal;
                    });

                    rows.forEach(row => tbody.appendChild(row));
                    ascending = !ascending;
                };
            }

            // 面板显示和初始化
            function showPanel() {
                let box = document.getElementById('mp-floating-box');
                if (box) {
                    box.style.display = box.style.display === 'none' ? 'block' : 'none';
                    updateContent('点击“计算”开始计算');
                    return;
                }

                const dMp = DM();
                box = document.createElement('div');
                box.id = 'mp-floating-box';
                box.style.cssText = `
                position: fixed;
                left: min(25px, 5vw);
                top: 50px;
                width: min(450px, 90vw);
                max-height: 70vh;
                background: ${dMp ? '#222' : '#fff'};
                color: ${dMp ? '#eee' : '#333'};
                padding: 12px;
                border-radius: 6px;
                box-shadow: 0 0 15px rgba(0,0,0,0.3);
                z-index: 9998;
                overflow: hidden;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                white-space: normal;
                word-break: break-word;
                user-select: none;
                display: flex;
                flex-direction: column;
                border: 1px solid ${dMp ? '#444' : '#ddd'};
              `;
                // header
                const header = document.createElement('div');
                header.style.cssText = `
                cursor: move;
                padding: 6px 10px;
                background: ${dMp ? '#111' : '#f0f0f0'};
                border-radius: 6px 6px 0 0;
                font-weight: bold;
                user-select: none;
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: ${dMp ? '#eee' : '#333'};
              `;
                const title = document.createElement('div');
                title.textContent = `MP-?% - 点合同时利润降序，点公司跳转私信`;
                header.appendChild(title);

                const closeBtn = document.createElement('span');
                closeBtn.textContent = '✖';
                closeBtn.title = '关闭';
                closeBtn.style.cssText = `
                cursor: pointer;
                font-weight: bold;
                color: ${dMp ? '#aaa' : '#888'};
                user-select: none;
                margin-left: 10px;
              `;
                closeBtn.onmouseenter = () => (closeBtn.style.color = dMp ? '#fff' : '#333');
                closeBtn.onmouseleave = () => (closeBtn.style.color = dMp ? '#aaa' : '#888');
                closeBtn.onclick = () => (box.style.display = 'none');
                header.appendChild(closeBtn);
                box.appendChild(header);

                // 输入区
                const inputWrapper = document.createElement('div');
                inputWrapper.style.cssText = `display: flex; align-items: center; gap: 8px; margin: 10px 0; color: ${dMp ? '#eee' : '#333'}; font-weight: bold;`;

                inputWrapper.innerHTML = `
                <span style="flex: 0 0 auto;">MP-</span>
                <input id="mp-percent-input" type="number" min="0" step="0.1" value="${inputPercent}" style="background: ${dMp ? '#2c3e50' : '#e8f0fe'}; color: ${dMp ? '#fff' : '#333'}; width: 40px; border: 1px solid ${dMp ? '#555' : '#bbb'};">
                <span style="flex: 0 0 auto;">% 输入负数为直接减去</span>
                <button id="mp-calc-btn" style="background: #2196F3; color: white; flex: 0 0 auto; margin-left: 12px; cursor: pointer;">计算</button>
              `;
                box.appendChild(inputWrapper);

                // 提示区
                const content = document.createElement('div');
                content.id = 'mp-floating-content';
                content.style.cssText = `
                  flex-shrink: 0;
                  height: 28px;
                  line-height: 28px;
                  overflow: hidden;
                  margin-top: 8px;
                  color: ${dMp ? '#eee' : '#333'};
                  white-space: nowrap;
                  text-overflow: ellipsis;
                `;
                box.appendChild(content);

                // 表格容器
                const tableContainer = document.createElement('div');
                tableContainer.id = 'mp-table-container';
                tableContainer.style.cssText = `
                  flex-grow: 1;
                  margin-top: 8px;
                  max-height: 320px;  /* 你可以调节这个高度 */
                  overflow-y: auto;
                `;
                box.appendChild(tableContainer);

                document.body.appendChild(box);

                // 表格样式：固定第一列，其他列自适应
                const style = document.createElement('style');
                style.textContent = `
                    #mp-table-container table {
                        width: 100%;
                        table-layout: fixed;
                        word-break: break-word;
                    }
                    #mp-table-container table th:first-child,
                    #mp-table-container table td:first-child {
                        width: auto;
                        min-width: 50px;
                        text-align: center;
                    }
                    #mp-floating-box div {
                        flex-wrap: wrap;   /* 小屏幕自动换行 */
                    }
                    #mp-floating-box input,
                    #mp-floating-box button,
                    #mp-floating-box span {
                        flex-shrink: 1;    /* 缩小避免撑出 */
                    }
                `;
                document.head.appendChild(style);

                // 计算按钮事件
                const calcBtn = document.getElementById('mp-calc-btn');
                const percentInput = document.getElementById('mp-percent-input');

                calcBtn.addEventListener('click', async () => {
                    calcBtn.disabled = true;
                    inputPercent = parseFloat(percentInput.value) || 0;
                    localStorage.setItem('mp_inputPercent', inputPercent);

                    const realm = getRealmIdFromLink();
                    const resourceId = getCurrentResourceId();
                    const name = resourceIdNameMap[resourceId] || `未知(${resourceId})`;
                    if (realm === null || resourceId === null) {
                        updateContent('无法确定 realmId 或 resourceId');
                        calcBtn.disabled = false;
                        return;
                    }

                    const raw = localStorage.getItem(`market_${realm}_${resourceId}`);
                    if (!raw) {
                        updateContent('无市场数据，无法计算');
                        calcBtn.disabled = false;
                        return;
                    }

                    let data;
                    try {
                        const parsed = JSON.parse(raw);
                        // 新格式: { timestamp: ..., data: [...] }
                        // 旧格式: [...] (直接数组，兼容处理)
                        data = Array.isArray(parsed) ? parsed : parsed.data;
                    } catch {
                        updateContent('市场数据解析错误');
                        calcBtn.disabled = false;
                        return;
                    }

                    updateContent('计算中，请稍候...');
                    document.getElementById('mp-table-container').innerHTML = ''; // 清空表格区域

                    try {
                        if (!window.MarketInterceptor || !window.MarketInterceptor.calculateProfit) {
                            updateContent('计算服务未准备好');
                            calcBtn.disabled = false;
                            return;
                        }
                        const result = await window.MarketInterceptor.calculateProfit(inputPercent, data, getRealmIdFromLink());
                        updateContent(`计算完成,当前产品为：${name}`);
                        document.getElementById('mp-table-container').innerHTML = renderResultTable(result);
                        enableTableFeatures();
                    } catch (e) {
                        updateContent('计算发生错误');
                        console.error(e);
                    } finally {
                        calcBtn.disabled = false;
                    }
                });

                updateContent('请输入参数，点击计算');

                dragElement(box, header);
            }

            function updateContent(text) {
                const content = document.getElementById('mp-floating-content');
                if (!content) return;
                content.textContent = text;
            }

            // 外部调用入口
            return {
                showPanel
            };
        })();

        // 拖拽函数，复制自已有代码
        const dragElement = (elmnt, dragHandle) => {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            dragHandle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                let newTop = elmnt.offsetTop - pos2;
                let newLeft = elmnt.offsetLeft - pos1;

                newTop = Math.max(0, Math.min(window.innerHeight - elmnt.offsetHeight, newTop));
                newLeft = Math.max(0, Math.min(window.innerWidth - elmnt.offsetWidth, newLeft));

                elmnt.style.top = newTop + 'px';
                elmnt.style.left = newLeft + 'px';
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        };

        // 处理数据更新
        const handleUpdate = async (type) => {
            // 1. 获取按钮引用
            const button = panelElement.querySelector(`[data-action-type="${type}"]`);
            if (!button) return;

            // 2. 特殊 UI 分流（不涉及加载状态的）
            if (type === 'mpShow') return MpPanel.showPanel();

            // 3. 定义功能配置映射
            const updateConfigs = {
                'region': {
                    action: async () => {
                        await RegionData.getCurrentRealmId();
                        return await RegionData.fetchFullRegionData();
                    },
                    statusKey: 'r1',
                    failText: '领域更新失败'
                },
                'constants': {
                    action: async () => await constantsData.initialize(),
                    statusKey: 'constants',
                    failText: '基础更新失败'
                },
                'calculateDecay': {
                    action: async () => await window.calculateAll(),
                    onSuccess: () => {
                        const wasOpen = document.getElementById('decayDataPanel')?.style.display !== 'none';
                        wasOpen ? DecayResultViewer.show() : DecayResultViewer.toggle();
                    }
                }
            };

            const config = updateConfigs[type];
            if (!config) return;

            // 4. 执行标准化异步流程
            const originalText = button.textContent;
            try {
                button.disabled = true;
                button.textContent = type === 'calculateDecay' ? '计算中...' : '更新中...';

                const result = await config.action();

                // 如果有保存逻辑且不是计算操作
                if (result && type !== 'calculateDecay') {
                    Storage.save(type, result);
                }

                // 执行成功后的回调（如刷新 UI）
                if (config.onSuccess) {
                    config.onSuccess();
                } else {
                    refreshStatus();
                }

            } catch (error) {
                console.error(`${type}操作失败:`, error);
                // 如果配置了状态栏，则显示失败状态
                if (config.statusKey && statusElements[config.statusKey]) {
                    const el = statusElements[config.statusKey];
                    el.textContent = '更新失败';
                    el.className = 'SimcompaniesRetailCalculation-region-status SimcompaniesRetailCalculation-no-data';
                }
            } finally {
                button.disabled = false;
                button.textContent = originalText; // 自动恢复原始文字
            }
        };

        return {
            init() {
                injectStyles();
                panelElement = createPanel();
                document.body.appendChild(panelElement);

                // 事件委托处理按钮点击
                panelElement.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action-type]')) {
                        const type = e.target.dataset.actionType;
                        handleUpdate(type);
                    }
                });

                // 点击外部关闭面板
                document.addEventListener('click', (e) => {
                    if (!panelElement.contains(e.target)) {
                        panelElement.querySelector('.SimcompaniesRetailCalculation-panel-content').style.display = 'none';
                    }
                });

                // 初始状态刷新
                refreshStatus();
            },
            initAutoAmountToggle: initAutoAmountToggle,
            resetPanelPosition: resetPanelPosition
        };
    })();

    // 初始化界面
    PanelUI.init();

    // 油猴菜单：还原按钮默认位置（保底操作）
    const registerMenu = typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : (typeof GM !== 'undefined' && GM.registerMenuCommand ? GM.registerMenuCommand.bind(GM) : null);
    if (registerMenu) {
        registerMenu('还原按钮默认位置', () => PanelUI.resetPanelPosition());
    }

    // ======================
    // 模块5-1：自定义运行时长 (已抽离至 src/features/autoRefresh.js)
    // ======================
    // 模块5-2：饱和度表格
    // ======================
    const SaturationDisplay = (() => {
        let saturationTableElement = null;

        // 构建表格内容
        const createTable = (list) => {
            const d = DM();
            const table = document.createElement("table");
            table.style.cssText = `border-collapse:collapse;margin:10px 0;background:${d ? '#333' : '#f9f9f9'};color:${d ? 'white' : '#333'};font-size:13px;width:100%;`;

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            ["物品", "质量", "饱和度"].forEach(text => {
                const th = document.createElement("th");
                th.textContent = text;
                th.style.cssText = `border:1px solid ${d ? '#666' : '#ccc'};padding:4px 8px;`;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");
            list.forEach(item => {
                const row = document.createElement("tr");
                const name = resourceIdNameMap[item.dbLetter] || `未知(${item.dbLetter})`;
                [name, item.quality ?? "-", String(item.saturation)].forEach(text => {
                    const td = document.createElement("td");
                    td.textContent = text;
                    td.style.cssText = `border:1px solid ${d ? '#666' : '#ccc'};padding:4px 8px;text-align:center;`;
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            return table;
        };

        return {
            toggle(data, onClose) {
                if (saturationTableElement) {
                    saturationTableElement.remove();
                    saturationTableElement = null;
                    return;
                }

                const d = DM();
                const list = data.ResourcesRetailInfo;
                const weatherMultiplier = data.sellingSpeedMultiplier.sellingSpeedMultiplier;

                // 1. 创建容器
                saturationTableElement = document.createElement("div");
                saturationTableElement.style.cssText = `
                position:fixed; left:10px; top:50px; z-index:9998;
                background:${d ? '#2c2c2c' : '#fff'}; color:${d ? '#fff' : '#333'}; padding:12px;
                border-radius:8px; max-height:400px; overflow:auto;
                max-width: calc(100vw - 20px);
                box-shadow:0 4px 15px rgba(0,0,0,0.5); font-family:Arial, sans-serif;
            `;

                // 2. 创建头部信息
                const headerInfo = document.createElement("div");
                headerInfo.innerHTML = `
                <div style="margin-bottom:6px; font-size:14px; font-weight:bold; color:${d ? '#f1c40f' : '#b8860b'};">天气速度加成: ${weatherMultiplier}</div>
                <div style="margin-bottom:6px; font-size:13px; color:${d ? '#ddd' : '#666'};">查询历史饱和度: <a href="https://marketsaturation.22-7.top/" target="_blank" style="color:#3498db; text-decoration:underline;">点击查看</a></div>
            `;

                // 3. 关闭按钮
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "×";
                closeBtn.style.cssText = `
                position:absolute; top:6px; right:6px; background:#e74c3c; color:white;
                border:none; border-radius:50%; width:24px; height:24px; cursor:pointer;
            `;
                closeBtn.onclick = () => {
                    saturationTableElement.remove();
                    saturationTableElement = null;
                    if (onClose) onClose();
                };

                // 4. 组装
                saturationTableElement.appendChild(closeBtn);
                saturationTableElement.appendChild(headerInfo);
                saturationTableElement.appendChild(createTable(list));

                document.body.appendChild(saturationTableElement);
            }
        };
    })();

    // 模块5-3：PAGE_ACTIONS 专用配置管理 (已抽离至 src/features/pageModuleConfig.js)

    // ======================
    // 模块6：商店内的最大时利润 本模块只使用了SimcompaniesConstantsData
    // ======================
    (function () {
        // setInput: 输入并触发 input 事件
        function setInput(inputNode, value, count = 3) {
            let lastValue = inputNode.value;
            inputNode.value = value;
            let event = new Event("input", { bubbles: true });
            event.simulated = true;
            if (inputNode._valueTracker) inputNode._valueTracker.setValue(lastValue);
            inputNode.dispatchEvent(event);
            if (count >= 0) return setInput(inputNode, value, --count);
        }

        // 获取 React 组件
        function findReactComponent(element) {
            // 动态匹配所有可能的 React 内部属性
            const reactKeys = Object.keys(element).filter(key =>
                key.startsWith('__reactInternalInstance') ||
                key.startsWith('__reactFiber')
            );

            for (const key of reactKeys) {
                let fiberNode = element[key];
                while (fiberNode) {
                    if (fiberNode.stateNode?.updateProfitPerUnit) {
                        return fiberNode.stateNode;
                    }
                    fiberNode = fiberNode.return;
                }
            }
            return null;
        }



        const workerCode = `
        self.onmessage = function(e) {
        const { lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
            v, b,
            cogs, quality, quantity, cardIndex, retryCount,
            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
            calcMode} = e.data;

        // Utility functions defined inside to use local lwe and zn
        const wv = (e, t, r) => {
            return r === null ? lwe[e][t] : lwe[e][t].quality[r];
        };
        const Upt = (e, t, r, n) => t + (e + n) / r;
        const Hpt = (e, t, r, n, a) => {
            const o = (n + e) / ((t - a) * (t - a));
            return e - (r - t) * (r - t) * o;
        };
        const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
        const Bpt = (e, t, r, n, a, o) => {
            const g = RETAIL_ADJUSTMENT[e] ?? 1;
            const s = Math.min(Math.max(2 - n, 0), 2),
                  l = Math.max(0.9, s / 2 + 0.5),
                  c = r / 12;
            const d = PROFIT_PER_BUILDING_LEVEL *
                (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                g *
                (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                (t.modeledStoreWages ?? 0) * SCXXCS;
            const h = t.modeledUnitsSoldAnHour * l;
            const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
            const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
            return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
        };
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / size;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
        };

        // Initial debug log

        // profit calculation loop
        let currentPrice = Math.floor(cogs / quantity) || 1;
        let bestPrice = currentPrice;
        let maxProfit = -Infinity;
        let _, w, revenue, wagesTotal, secondsToFinish = 0


        while (currentPrice > 0) {

            w = zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, currentPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size, resource.retailSeason === "Summer" ? weather : void 0);

            revenue = currentPrice * quantity;
            wagesTotal = Math.ceil(w * wages * acceleration * b / 60 / 60);
            secondsToFinish = w;

            if (!secondsToFinish || secondsToFinish <= 0) break;

            let profit = revenue - cogs - wagesTotal;
            if (calcMode === 'hourly') {
                profit = profit / secondsToFinish;
            }

            if (profit > maxProfit) {
                maxProfit = profit;
                bestPrice = currentPrice;
            }

            if (currentPrice < 8) {
                currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
            } else if (currentPrice < 2001) {
                currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
            } else {
                currentPrice = Math.round(currentPrice + 1);
            }
        }

        const finalW = zL(
            buildingKind,
            wv(economyState, resource.dbLetter, forceQuality ?? null),
            parseFloat(quantity),
            v,
            bestPrice, // 使用找到的最佳价格
            forceQuality === undefined ? quality : 0,
            saturation,
            acceleration,
            size,
            resource.retailSeason === "Summer" ? weather : undefined
        );

        // 计算对应的工资总额
        const calculatedWages = Math.ceil(finalW * wages * acceleration * b / 3600);

        // 发送结果，带上 calculatedWages, calcMode, finalTotalProfit, finalW
        self.postMessage({
            bestPrice: bestPrice,
            maxProfit: maxProfit,
            calculatedWages: calculatedWages,
            cardIndex: cardIndex,
            retryCount: retryCount,
            calcMode: calcMode,
            finalTotalProfit: (bestPrice * parseFloat(quantity)) - cogs - calculatedWages,
            finalW: finalW
        });

    };
    `;

        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        function triggerCalculation(comp, index, retryCount = 0, calcMode = 'hourly') {
            if (localStorage.getItem('SimcompaniesConstantsData') == null) {
                showToast("请先点击左下角更新基础数据", 'error');
                return;
            }

            const lweData = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
            const znData = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;

            // 解构 Props
            const {
                size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
                skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather
            } = comp.props;

            // 解构 State
            const { cogs: originalCogs, quality, quantity } = comp.state;

            // 读取自定义单位成本（通过 index 找到对应卡片上的输入框），仅当 >0 时覆盖 cogs
            const cardEl = document.querySelectorAll('div[style="overflow: visible;"]')[index];
            const customCostEl = cardEl?.querySelector('.custom-unit-cost-input');
            const customUnitCostVal = customCostEl ? (parseFloat(customCostEl.value) || 0) : 0;
            const cogs = customUnitCostVal > 0 ? customUnitCostVal * quantity : originalCogs;

            // 在主线程预计算 Worker 无法访问的函数结果
            // ⚠️ 这里直接使用了父作用域中的 Ul 函数
            const vVal = salesModifierWithRecreationBonus + Math.floor(skillCMO / 3);
            const bVal = Ul(administrationOverhead, skillCOO);

            profitWorker.postMessage({
                lwe: lweData, zn: znData,
                size, acceleration, economyState, resource,
                wages, buildingKind, forceQuality, weather,
                v: vVal, b: bVal, // 传入预计算结果
                skillCMO, skillCOO, saturation, // 备用
                cogs, quality, quantity,
                cardIndex: index,
                retryCount: retryCount,
                SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
                calcMode: calcMode
            });
        }

        // 注册 Worker 异步回调 (处理结果和校验)
        profitWorker.onmessage = (event) => {
            // 1. 接收 Worker 返回的数据 (包括计算出的预计工资 calculatedWages)
            const { bestPrice, maxProfit, calculatedWages, cardIndex, retryCount, calcMode, finalTotalProfit, finalW } = event.data;
            const mode = calcMode || 'hourly';

            // 使用 index 查找对应的卡片
            const card = document.querySelectorAll('div[style="overflow: visible;"]')[cardIndex];
            if (!card) return;

            const priceInput = card.querySelector('input[name="price"]');
            const btnHourly = card.querySelector('.btn-max-hourly-profit');
            const btnTotal = card.querySelector('.btn-max-total-profit');
            const profitDisplay = card.querySelector('.auto-profit-display');

            if (!priceInput || !profitDisplay) return;

            // 2. 重新获取 comp 实例，准备获取 size 和 wagesTotal
            const comp = findReactComponent(priceInput);
            if (!comp) return;
            const size = comp.props.size || 1; // 修正：在回调中获取 size

            // 3. 设置价格 (触发 React State 异步更新)
            setInput(priceInput, bestPrice.toFixed(2));

            // 4. 更新显示 UI
            const hourlyProfit = finalW > 0 ? ((finalTotalProfit / finalW) / size * 3600) : 0;

            profitDisplay.innerHTML = `
                <div>总利润: ${finalTotalProfit.toFixed(2)}</div>
                <div style="margin-top: 2px;">每级时利润: ${hourlyProfit.toFixed(2)}</div>
            `;
            profitDisplay.style.background = '#4CAF50'; // 绿色表示成功
            profitDisplay.style.color = 'white';
            profitDisplay.style.fontWeight = 'bold';

            if (btnHourly) {
                btnHourly.textContent = '最大时利润';
                btnHourly.disabled = false;
            }
            if (btnTotal) {
                btnTotal.textContent = '最大利润';
                btnTotal.disabled = false;
            }

            // 5. 异步校验 (等待 React State 更新)
            setTimeout(() => {
                const updatedComp = findReactComponent(priceInput);
                if (!updatedComp) return;

                const actualWages = updatedComp.state.wagesTotal;

                // 校验误差
                if (Math.abs(calculatedWages - actualWages) > 1) {
                    if (retryCount < 5) {
                        const newQty = updatedComp.state.quantity;
                        // console.log(`[修正重试 ${retryCount + 1}/3] 数量已更新为: ${newQty}，重新发起计算...`);

                        profitDisplay.style.background = '#2196F3'; // 蓝色提示正在修正
                        profitDisplay.style.color = 'white';
                        profitDisplay.innerHTML = '🔄 修正数量中...';

                        // ⚠️ 优先使用 card.doAutoCalc 调用以传递 mode 参数
                        if (typeof card.doAutoCalc === "function") {
                            card.doAutoCalc(updatedComp, retryCount + 1, mode);
                        } else if (typeof triggerCalculation === "function") {
                            triggerCalculation(updatedComp, cardIndex, retryCount + 1, mode);
                        } else {
                            // console.error("triggerCalculation 函数未定义，请确保它在作用域内。");
                        }
                    } else {
                        profitDisplay.style.background = '#f44336'; // 最终失败变红
                        profitDisplay.style.color = 'white';
                        profitDisplay.innerHTML = '⚠️ 计算偏差过大';
                        showToast("利润计算偏差：建议手动输入具体数量或更新基础数据,依然报错请联系Rabbit House", 'error');
                    }
                }
            }, 100); // 100ms 等待 React 状态更新

        };

        // 主功能
        function initAutoPricing() {
            try {
                const input = document.querySelector('input[name="price"]');
                if (!input) return;

                const reactInstance = findReactComponent(input);
                if (!reactInstance) return;

                const cards = document.querySelectorAll('div[style="overflow: visible;"]');

                cards.forEach((card, index) => {
                    if (card.dataset.autoPricingAdded) return;

                    const priceInput = card.querySelector('input[name="price"]');
                    if (!priceInput) return;

                    const comp = findReactComponent(priceInput);
                    if (!comp) return;

                    const btnContainer = document.createElement('div');
                    btnContainer.style = `display: flex; flex-direction: column; gap: 4px; margin-top: 5px;`;

                    const btnHourly = document.createElement('button');
                    btnHourly.textContent = '最大时利润';
                    btnHourly.type = 'button';
                    btnHourly.className = 'btn-max-hourly-profit';
                    btnHourly.setAttribute('data-index', index);
                    btnHourly.style = `background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;`;

                    const btnTotal = document.createElement('button');
                    btnTotal.textContent = '最大利润';
                    btnTotal.type = 'button';
                    btnTotal.className = 'btn-max-total-profit';
                    btnTotal.setAttribute('data-index', index);
                    btnTotal.style = `background: #e91e63; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;`;

                    btnContainer.appendChild(btnHourly);
                    btnContainer.appendChild(btnTotal);

                    const d = DM();
                    const profitDisplay = document.createElement('div');
                    profitDisplay.className = 'auto-profit-display';
                    profitDisplay.textContent = `等待计算...`;
                    profitDisplay.style = `margin-top: 5px; font-size: 14px; color: ${d ? '#fff' : '#333'}; background: ${d ? '#555' : '#e0e0e0'}; padding: 4px 8px; text-align: center; border-radius: 4px;`;

                    // 自定义成本输入框
                    const customCostInput = document.createElement('input');
                    customCostInput.type = 'number';
                    customCostInput.className = 'custom-unit-cost-input';
                    customCostInput.placeholder = '假设单位成本';
                    customCostInput.min = '0';
                    customCostInput.step = '0.01';
                    customCostInput.style = `margin-top: 5px; width: 100%; padding: 4px 8px; border: 1px solid ${d ? '#555' : '#bbb'}; border-radius: 4px; background: ${d ? '#333' : '#fff'}; color: ${d ? '#fff' : '#333'}; font-size: 13px; box-sizing: border-box;`;

                    // --- 提取核心发送逻辑 ---
                    // 这样按钮点击能用，后续重试也能用
                    const startCalc = (targetComp, retryIdx = 0, mode = 'hourly') => {
                        if (localStorage.getItem('SimcompaniesConstantsData') == null) {
                            showToast("请尝试更新基本数据（左下角按钮）"); // 替换了 alert
                            return;
                        }

                        // UI反馈
                        if (retryIdx === 0) {
                            if (mode === 'hourly') {
                                btnHourly.textContent = '计算中...';
                                btnHourly.disabled = true;
                            } else {
                                btnTotal.textContent = '计算中...';
                                btnTotal.disabled = true;
                            }
                        }
                        profitDisplay.textContent = retryIdx > 0 ? `修正中(${retryIdx})...` : `计算中...`;

                        const lwe = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
                        const zn = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;

                        // 重新获取最新的 state 和 props
                        const { size, acceleration, economyState, resource, salesModifierWithRecreationBonus, skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather = null } = targetComp.props;
                        const { cogs: originalCogs, quality, quantity } = targetComp.state;

                        // 读取自定义单位成本，仅当输入 >0 时用 单位成本*数量 覆盖 cogs
                        const customUnitCost = parseFloat(customCostInput.value) || 0;
                        const cogs = customUnitCost > 0 ? customUnitCost * quantity : originalCogs;

                        const v = salesModifierWithRecreationBonus + Math.floor(skillCMO / 3);
                        const b = Ul(administrationOverhead, skillCOO);

                        profitWorker.postMessage({
                            lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
                            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
                            v, b, cogs, quality, quantity,
                            cardIndex: index,
                            retryCount: retryIdx, // 发送当前是第几次尝试
                            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
                            calcMode: mode
                        });
                    };

                    btnHourly.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCalc(comp, 0, 'hourly');
                    };

                    btnTotal.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCalc(comp, 0, 'total');
                    };

                    // 将函数引用挂载在 DOM 上，方便 onmessage 找到并调用重试
                    card.doAutoCalc = startCalc;

                    priceInput.parentNode.insertBefore(btnContainer, priceInput.nextSibling);
                    priceInput.parentNode.insertBefore(profitDisplay, btnContainer.nextSibling);
                    priceInput.parentNode.insertBefore(customCostInput, profitDisplay.nextSibling);
                    card.dataset.autoPricingAdded = 'true';
                });
            } catch (err) { }
        }

        window.initAutoPricing = initAutoPricing;

        // 启动观察器，只在商品卡片变化时运行自动定价逻辑
        function observeCardsForAutoPricing() {
            // 防抖计时器
            let debounceTimer;
            let lateCheckTimer; // 延迟二次检查，捕获 React 异步渲染的卡片

            // 目标容器 - 改为更具体的容器选择器（如果能确定的话）
            const targetNode = document.body; // 或者更具体的容器如 '#shop-container'

            // 优化后的观察器配置
            const observer = new MutationObserver((mutationsList) => {
                // 使用防抖避免频繁触发
                clearTimeout(debounceTimer);
                clearTimeout(lateCheckTimer);
                debounceTimer = setTimeout(() => {
                    // 检查是否有新增的卡片节点
                    const hasNewCards = mutationsList.some(mutation => {
                        return mutation.type === 'childList' &&
                            mutation.addedNodes.length > 0 &&
                            Array.from(mutation.addedNodes).some(node => {
                                return node.nodeType === 1 && // 元素节点
                                    (node.matches('div[style="overflow: visible;"]') ||
                                        node.querySelector('div[style="overflow: visible;"]'));
                            });
                    });

                    if (hasNewCards) {
                        initAutoPricing();
                        // 追加延迟二次检查：React 组件可能分批次渲染，
                        // 首次检查时部分卡片可能尚未挂载到 DOM
                        lateCheckTimer = setTimeout(() => {
                            initAutoPricing();
                        }, 500);
                    }
                }, 100); // 100ms防抖延迟
            });

            // 优化观察配置
            observer.observe(targetNode, {
                childList: true,   // 观察直接子节点的添加/删除
                subtree: true,     // 观察所有后代节点
                attributes: false, // 不需要观察属性变化
                characterData: false // 不需要观察文本变化
            });

            // 初始执行 + 轮询双保险
            function ensureInputsLoaded() {
                let tries = 0;
                const timer = setInterval(() => {
                    const inputs = document.querySelectorAll('input[name="price"]');
                    if (inputs.length > 0 || tries > 50) { // 最多等5秒
                        clearInterval(timer);
                        if (inputs.length > 0) {
                            initAutoPricing();
                        }
                    }
                    tries++;
                }, 100);
            }

            requestAnimationFrame(() => {
                ensureInputsLoaded(); // 启动轮询检测
            });
        }

        if (typeof window.isPageModuleEnabled === 'function' && window.isPageModuleEnabled('autoPricing')) {
            observeCardsForAutoPricing();
        }
    })();

    // ======================
    // 模块7：交易所计算时利润 使用SimcompaniesRetailCalculation_{realmId} SimcompaniesConstantsData

    // ======================
    // 模块8：合同计算时利润 使用SimcompaniesRetailCalculation_{realmId} SimcompaniesConstantsData
    // ======================

    // ======================
    // 模块9：判断当前页面 (已抽离至 src/features/pageObserver.js，依赖桥接)
    // ======================
    // 模块10：自动或定时更新数据 SimcompaniesConstantsData SimcompaniesRetailCalculation超过一小时就更新
    // 只在打开新标签页和切换领域是才会判断时间更新 更新数据无锁
    // ======================
    // 使用 MutationObserver 监听 DOM 变化并提取 realmId


    // ConstantsAutoUpdater 和 RegionAutoUpdater 已抽离至 src/features/autoUpdaters.js
    // 首先执行 ConstantsAutoUpdater 的检查和更新
    ConstantsAutoUpdater.checkAndUpdate();

    // 然后执行 RegionAutoUpdater 的检查和更新
    setTimeout(() => {
        RegionAutoUpdater.checkAndUpdate(getRealmIdFromLink());
    }, 3000);

    // ======================
    // 模块11：计算预测剩余量
    // ======================
    (function () {

        // 计算入口函数（可被按钮触发调用）
        async function calculateAllDecayResources() {
            try {
                const realmId = getRealmIdFromLink();
                const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
                const SRC = JSON.parse(localStorage.getItem(regionKey));
                if (!SRC || !SRC.companyId) {
                    console.warn("[库存模块] 未找到 companyId，无法发起请求");
                    return;
                }

                const url = `https://www.simcompanies.com/api/v3/resources/${SRC.companyId}/`;
                const response = await fetch(url);
                const data = await response.json();
                const now = Date.now();

                const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetime);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.amount * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetime);
                    const quantity = entry.amount;
                    const totalCost = Object.values(entry.cost || {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetime, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        const unitCost = amount === 0 ? Infinity : Number((totalCost / amount).toFixed(3));
                        results.push({
                          time: dateStr,
                          amount,
                          unitCost
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                      kind: entry.kind,
                      quality: entry.quality,
                      result: results
                    };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind)) {
                      if (!output[entry.kind]) output[entry.kind] = {};
                      if (!output[entry.kind][entry.quality]) {
                        output[entry.kind][entry.quality] = calculate(entry);
                      }
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;

                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const worker = new Worker(URL.createObjectURL(blob));

                worker.onmessage = function (e) {
                    const { companyId, output } = e.data;
                    const key = `wareHouse-${companyId}`;
                    localStorage.setItem(key, JSON.stringify(output));
                    window.dispatchEvent(new Event('warehouse-updated'));
                    //console.log(`[📦资源剩余量已计算] ${key}`, output);
                };

                worker.postMessage({ data, now, companyId: SRC.companyId });

            } catch (e) {
                console.error("[库存模块] 处理失败：", e);
            }
        }

        async function calculateContractsOutgoing() {
            try {
                const realmId = getRealmIdFromLink();
                const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
                const SRC = JSON.parse(localStorage.getItem(regionKey));
                if (!SRC || !SRC.companyId) {
                    console.warn("[合同模块] 未找到 companyId，无法发起请求");
                    return;
                }

                const url = `https://www.simcompanies.com/api/v2/contracts-outgoing/`;
                const response = await fetch(url);
                const data = await response.json();
                const now = Date.now();

                const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetime);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.quantity * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetime);
                    const quantity = entry.quantity;
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetime, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        results.push({
                          time: dateStr,
                          amount,
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                      kind: entry.kind,
                      buyer: entry.buyer.company,
                      quality: entry.quality,
                      quantity: entry.quantity,
                      price: entry.price,
                      datetime: entry.datetime,
                      rawTime: decayTime,
                      result: results
                    };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind) && entry.datetime) {
                        if (!output[entry.kind]) output[entry.kind] = {};
                        if (!output[entry.kind][entry.buyer.company]) output[entry.kind][entry.buyer.company] = [];
                        output[entry.kind][entry.buyer.company].push(calculate(entry));
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;

                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const worker = new Worker(URL.createObjectURL(blob));

                worker.onmessage = function (e) {
                    const { companyId, output } = e.data;
                    const key = `contractsOutgoing-${companyId}`;
                    localStorage.setItem(key, JSON.stringify(output));
                    window.dispatchEvent(new Event('contractsOutgoing-updated'));
                    //console.log(`[📦合同剩余量已计算] ${key}`, output);
                };

                worker.postMessage({ data, now, companyId: SRC.companyId });

            } catch (e) {
                console.error("[合同模块] 处理失败：", e);
            }
        }

        async function calculateContractsIncoming() {
            try {
                const realmId = getRealmIdFromLink();
                const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
                const SRC = JSON.parse(localStorage.getItem(regionKey));
                if (!SRC || !SRC.companyId) {
                    console.warn("[合同模块] 未找到 companyId，无法发起请求");
                    return;
                }

                const url = `https://www.simcompanies.com/api/v2/contracts-incoming/`;
                const response = await fetch(url);
                const json = await response.json();
                const data = json.incomingContracts;
                const now = Date.now();

                const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetime);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.quantity * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetime);
                    const quantity = entry.quantity;
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetime, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        results.push({
                          time: dateStr,
                          amount,
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                        kind: entry.kind,
                        seller: entry.seller.company,
                        quality: entry.quality,
                        quantity: entry.quantity,
                        price: entry.price,
                        datetime: entry.datetime,
                        rawTime: decayTime,
                        result: results
                      };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind) && entry.datetime) {
                        if (!output[entry.kind]) output[entry.kind] = {};
                        if (!output[entry.kind][entry.buyer.company]) output[entry.kind][entry.buyer.company] = [];
                        output[entry.kind][entry.buyer.company].push(calculate(entry));
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;

                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const worker = new Worker(URL.createObjectURL(blob));

                worker.onmessage = function (e) {
                    const { companyId, output } = e.data;
                    const key = `contractsIncoming-${companyId}`;
                    localStorage.setItem(key, JSON.stringify(output));
                    window.dispatchEvent(new Event('contractsIncoming-updated'));
                };

                worker.postMessage({ data, now, companyId: SRC.companyId });

            } catch (e) {
                console.error("[合同模块] 处理失败：", e);
            }
        }

        async function calculateMarket() {
            try {
                const realmId = getRealmIdFromLink();
                const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
                const SRC = JSON.parse(localStorage.getItem(regionKey));
                if (!SRC || !SRC.companyId) {
                    console.warn("[市场模块] 未找到 companyId，无法发起请求");
                    return;
                }

                const url = `https://www.simcompanies.com/api/v2/companies/${SRC.companyId}/market-orders/`;
                const response = await fetch(url);
                const data = await response.json();
                const now = Date.now();

                const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetimeDecayUpdated);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.quantity * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetimeDecayUpdated);
                    const quantity = entry.quantity;
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetimeDecayUpdated, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        results.push({
                          time: dateStr,
                          amount,
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                      kind: entry.kind,
                      quality: entry.quality,
                      price: entry.price,
                      result: results
                    };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind) && entry.datetimeDecayUpdated) {
                      if (!output[entry.kind]) output[entry.kind] = {};
                      if (!output[entry.kind][entry.quality]) output[entry.kind][entry.quality] = {};
                      if (!output[entry.kind][entry.quality][entry.price]) {
                        output[entry.kind][entry.quality][entry.price] = calculate(entry);
                      }
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;

                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const worker = new Worker(URL.createObjectURL(blob));

                worker.onmessage = function (e) {
                    const { companyId, output } = e.data;
                    const key = `marketOrders-${companyId}`;
                    localStorage.setItem(key, JSON.stringify(output));
                    window.dispatchEvent(new Event('marketOrders-updated'));
                    //console.log(`[📦市场剩余量已计算] ${key}`, output);
                };

                worker.postMessage({ data, now, companyId: SRC.companyId });

            } catch (e) {
                console.error("[市场模块] 处理失败：", e);
            }
        }

        async function calculateAll() {
            await calculateAllDecayResources();
            await calculateContractsOutgoing();
            await calculateContractsIncoming();
            await calculateMarket();
        }

        // 暴露到 window 供外部按钮调用
        window.calculateAll = calculateAll;
    })();

    // ======================
    // 模块12：展示预测剩余量
    // ======================
    const DecayResultViewer = (() => {
        let container, header, content;

        const KIND_NAMES = {
            153: '巧克力冰淇凌',
            154: '苹果冰淇凌',
        };

        const getCurrentCompanyData = () => {
            const realmId = getRealmIdFromLink();
            const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
            const SRC = JSON.parse(localStorage.getItem(regionKey));
            if (!SRC || !SRC.companyId) {
                console.warn("[资源模块] 未找到 companyId，无法展示资源面板");
                return { inventory: [], market: [], contract: [] };
            }

            const inventoryKey = `wareHouse-${SRC.companyId}`;
            const marketKey = `marketOrders-${SRC.companyId}`;
            const contractsOutgoingKey = `contractsOutgoing-${SRC.companyId}`;
            const contractsIncomingKey = `contractsIncoming-${SRC.companyId}`;

            const inventory = [];
            const market = [];
            let contractsOutgoing = {};
            let contractsIncoming = {};

            const rawInventory = localStorage.getItem(inventoryKey);
            if (rawInventory) {
                try {
                    const obj = JSON.parse(rawInventory);
                    for (const kind in obj) {
                        for (const quality in obj[kind]) {
                            inventory.push(obj[kind][quality]);
                        }
                    }
                } catch (e) {
                    console.warn('解析库存数据失败', e);
                }
            }

            const rawMarket = localStorage.getItem(marketKey);
            if (rawMarket) {
                try {
                    const obj = JSON.parse(rawMarket);
                    for (const kind in obj) {
                        for (const quality in obj[kind]) {
                            for (const price in obj[kind][quality]) {
                                market.push(obj[kind][quality][price]);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('解析市场数据失败', e);
                }
            }

            const rawContractsOutgoing = localStorage.getItem(contractsOutgoingKey);
            if (rawContractsOutgoing) {
                try {
                    contractsOutgoing = JSON.parse(rawContractsOutgoing);
                } catch (e) {
                    console.warn('解析出库合同数据失败', e);
                }
            }

            const rawContractsIncoming = localStorage.getItem(contractsIncomingKey);
            if (rawContractsIncoming) {
                try {
                    contractsIncoming = JSON.parse(rawContractsIncoming);
                } catch (e) {
                    console.warn('解析入库合同数据失败', e);
                }
            }

            return { inventory, market, contractsOutgoing, contractsIncoming };
        };

        const getDataFromStorage = () => {
            const data = getCurrentCompanyData();

            return data;
        };

        const formatSimpleDate = (dateStr) => {
            const d = new Date(dateStr);
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const createToggleSection = (title, contentElement, isOpen = true) => {
            const d12t = DM();
            const section = document.createElement("div");
            section.style.marginBottom = '8px';

            const header = document.createElement("div");
            header.textContent = (isOpen ? '▼ ' : '▶ ') + title;
            header.style.cssText = `cursor:pointer;font-weight:bold;padding:6px;background:${d12t ? '#444' : '#e8e8e8'};border-radius:4px;user-select:none;color:${d12t ? 'white' : '#333'};`;
            header.addEventListener("click", () => {
                const isHidden = contentElement.style.display === "none";
                contentElement.style.display = isHidden ? "block" : "none";
                header.textContent = (isHidden ? '▼ ' : '▶ ') + title;
            });

            section.appendChild(header);
            section.appendChild(contentElement);
            contentElement.style.display = isOpen ? "block" : "none";
            return section;
        };

        const renderResult = () => {
            const data = getDataFromStorage();
            content.innerHTML = ''; // 清空内容

            content.appendChild(makeInventorySection("📦 库存数据", data.inventory));
            content.appendChild(makecontractsOutgoingSection("📦 出库合同", data.contractsOutgoing));
            content.appendChild(makeContractsIncomingSection("📦 入库合同", data.contractsIncoming));
            content.appendChild(makeMarketSection("📦 市场订单", data.market));
        };

        function makeInventorySection(label, items) {
            const containerDiv = document.createElement("div");
            if (items.length === 0) {
                const msg = document.createElement("div");
                msg.textContent = "暂无数据。";
                msg.style.padding = "5px 10px";
                containerDiv.appendChild(msg);
                return createToggleSection(label, containerDiv, false);
            }

            const groupedByKind = {};
            items.forEach(item => {
                if (!groupedByKind[item.kind]) groupedByKind[item.kind] = [];
                groupedByKind[item.kind].push(item);
            });

            for (const kind in groupedByKind) {
                const kindName = KIND_NAMES[kind] || `种类 ${kind}`;
                const kindContent = document.createElement("div");
                kindContent.style.paddingLeft = "12px";

                const groupedByQuality = {};
                groupedByKind[kind].forEach(item => {
                    if (!groupedByQuality[item.quality]) groupedByQuality[item.quality] = [];
                    groupedByQuality[item.quality].push(item);
                });

                for (const quality in groupedByQuality) {
                    const qualityContent = document.createElement("div");
                    qualityContent.style.paddingLeft = "16px";

                    const headerRow = document.createElement('div');
                    headerRow.style.fontWeight = 'bold';
                    headerRow.style.display = 'flex';
                    headerRow.style.gap = '16px';
                    headerRow.style.padding = '2px 0';
                    headerRow.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div><div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div><div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">单位成本</div>`;
                    qualityContent.appendChild(headerRow);

                    const allDecayArrays = groupedByQuality[quality].flatMap(i => i.futureDecayArray || i.result || []);

                    if (allDecayArrays.length === 0) {
                        const row = document.createElement("div");
                        row.style.display = "flex";
                        row.style.gap = "16px";
                        row.style.padding = "1px 0";
                        row.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">已全部衰减</div>
                            <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</div>
                            <div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">∞</div>
                        `;
                        qualityContent.appendChild(row);
                    } else {
                        allDecayArrays.forEach(({ amount, time, unitCost }) => {
                            const row = document.createElement("div");
                            row.style.display = "flex";
                            row.style.gap = "16px";
                            row.style.padding = "1px 0";
                            row.innerHTML = `
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                <div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${unitCost === Infinity
                                    ? '∞'
                                    : (typeof unitCost === 'number' ? unitCost.toFixed(3) : '∞')
                                }</div>
                            `;
                            qualityContent.appendChild(row);
                        });
                    }

                    kindContent.appendChild(createToggleSection(`品质 ${quality}`, qualityContent, false));
                }

                containerDiv.appendChild(createToggleSection(kindName, kindContent, true));
            }

            return createToggleSection(label, containerDiv, true);
        }

        function makecontractsOutgoingSection(label, contractsData) {
            const container = document.createElement("div");

            if (!contractsData || Object.keys(contractsData).length === 0) {
                const msg = document.createElement("div");
                msg.textContent = "暂无数据。";
                msg.style.padding = "5px 10px";
                container.appendChild(msg);
                return createToggleSection(label, container, false);
            }

            for (const kind in contractsData) {
                const kindName = KIND_NAMES[kind] || `种类 ${kind}`;
                const kindContent = document.createElement("div");
                kindContent.style.paddingLeft = "12px";

                for (const buyer in contractsData[kind]) {
                    const buyerContent = document.createElement("div");
                    buyerContent.style.paddingLeft = "16px";

                    const sortedContracts = contractsData[kind][buyer].slice().sort((a, b) => {
                        return Date.parse(a.datetime) - Date.parse(b.datetime);
                    });

                    sortedContracts.forEach((contract, idx) => {
                        const contractContent = document.createElement("div");
                        contractContent.style.paddingLeft = "16px";
                        contractContent.style.marginBottom = "4px";

                        const headerRow = document.createElement('div');
                        headerRow.style.fontWeight = 'bold';
                        headerRow.style.display = 'flex';
                        headerRow.style.gap = '12px';
                        headerRow.style.padding = '2px 0';
                        headerRow.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div>
                            <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div>
                        `;
                        contractContent.appendChild(headerRow);

                        if (!contract.result || contract.result.length === 0) {
                            const row = document.createElement("div");
                            row.textContent = "已全部衰减";
                            row.style.padding = "2px 0 2px 10px";
                            contractContent.appendChild(row);
                        } else {
                            contract.result.forEach(({ amount, time }) => {
                                const row = document.createElement("div");
                                row.style.display = "flex";
                                row.style.gap = "12px";
                                row.style.padding = "1px 0";
                                row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                `;
                                contractContent.appendChild(row);
                            });
                        }

                        buyerContent.appendChild(createToggleSection(
                            `品质 Q${contract.quality}｜数量 ${contract.quantity}｜单价 $${contract.price}｜发出 ${new Date(contract.datetime).toLocaleString(undefined, {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}`,
                            contractContent,
                            false
                        ));
                    });

                    kindContent.appendChild(createToggleSection(`买方公司 ${buyer}`, buyerContent, true));
                }

                container.appendChild(createToggleSection(kindName, kindContent, true));
            }

            return createToggleSection(label, container, true);
        }

        function makeContractsIncomingSection(label, contractsData) {
            const container = document.createElement("div");

            if (!contractsData || Object.keys(contractsData).length === 0) {
                const msg = document.createElement("div");
                msg.textContent = "暂无数据。";
                msg.style.padding = "5px 10px";
                container.appendChild(msg);
                return createToggleSection(label, container, false);
            }

            for (const kind in contractsData) {
                const kindName = KIND_NAMES[kind] || `种类 ${kind}`;
                const kindContent = document.createElement("div");
                kindContent.style.paddingLeft = "12px";

                for (const seller in contractsData[kind]) {
                    const sellerContent = document.createElement("div");
                    sellerContent.style.paddingLeft = "16px";

                    const sortedContracts = contractsData[kind][seller].slice().sort((a, b) => {
                        return Date.parse(a.datetime) - Date.parse(b.datetime);
                    });

                    sortedContracts.forEach((contract, idx) => {
                        const contractContent = document.createElement("div");
                        contractContent.style.paddingLeft = "16px";
                        contractContent.style.marginBottom = "4px";

                        const headerRow = document.createElement('div');
                        headerRow.style.fontWeight = 'bold';
                        headerRow.style.display = 'flex';
                        headerRow.style.gap = '12px';
                        headerRow.style.padding = '2px 0';
                        headerRow.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div>
                            <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div>
                        `;
                        contractContent.appendChild(headerRow);

                        if (!contract.result || contract.result.length === 0) {
                            const row = document.createElement("div");
                            row.textContent = "已全部衰减";
                            row.style.padding = "2px 0 2px 10px";
                            contractContent.appendChild(row);
                        } else {
                            contract.result.forEach(({ amount, time }) => {
                                const row = document.createElement("div");
                                row.style.display = "flex";
                                row.style.gap = "12px";
                                row.style.padding = "1px 0";
                                row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                `;
                                contractContent.appendChild(row);
                            });
                        }

                        sellerContent.appendChild(createToggleSection(
                            `品质 Q${contract.quality}｜数量 ${contract.quantity}｜单价 $${contract.price}｜发出 ${new Date(contract.datetime).toLocaleString(undefined, {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}`,
                            contractContent,
                            false
                        ));
                    });

                    kindContent.appendChild(createToggleSection(`卖方公司 ${seller}`, sellerContent, true));
                }

                container.appendChild(createToggleSection(kindName, kindContent, true));
            }

            return createToggleSection(label, container, true);
        }

        function makeMarketSection(label, items) {
            const containerDiv = document.createElement("div");
            if (items.length === 0) {
                const msg = document.createElement("div");
                msg.textContent = "暂无数据。";
                msg.style.padding = "5px 10px";
                containerDiv.appendChild(msg);
                return createToggleSection(label, containerDiv, false);
            }

            const groupedByKind = {};
            items.forEach(item => {
                if (!groupedByKind[item.kind]) groupedByKind[item.kind] = [];
                groupedByKind[item.kind].push(item);
            });

            for (const kind in groupedByKind) {
                const kindName = KIND_NAMES[kind] || `种类 ${kind}`;
                const kindContent = document.createElement("div");
                kindContent.style.paddingLeft = "12px";

                const groupedByQuality = {};
                groupedByKind[kind].forEach(item => {
                    if (!groupedByQuality[item.quality]) groupedByQuality[item.quality] = [];
                    groupedByQuality[item.quality].push(item);
                });

                for (const quality in groupedByQuality) {
                    const qualityContent = document.createElement("div");
                    qualityContent.style.paddingLeft = "16px";

                    const groupedByPrice = {};
                    groupedByQuality[quality].forEach(item => {
                        if (!groupedByPrice[item.price]) groupedByPrice[item.price] = [];
                        groupedByPrice[item.price].push(item);
                    });

                    for (const price in groupedByPrice) {
                        const priceContent = document.createElement("div");
                        priceContent.style.paddingLeft = "16px";

                        const headerRow = document.createElement('div');
                        headerRow.style.fontWeight = 'bold';
                        headerRow.style.display = 'flex';
                        headerRow.style.gap = '16px';
                        headerRow.style.padding = '2px 0';
                        headerRow.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div><div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div>`;
                        priceContent.appendChild(headerRow);

                        const allDecayArrays = groupedByPrice[price].flatMap(i => i.result || []);

                        if (allDecayArrays.length === 0) {
                            const row = document.createElement("div");
                            row.style.display = "flex";
                            row.style.gap = "16px";
                            row.style.padding = "1px 0";
                            row.innerHTML = `
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">已全部衰减</div>
                                <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</div>
                            `;
                            priceContent.appendChild(row);
                        } else {
                            allDecayArrays.forEach(({ amount, time }) => {
                                const row = document.createElement("div");
                                row.style.display = "flex";
                                row.style.gap = "16px";
                                row.style.padding = "1px 0";
                                row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                `;
                                priceContent.appendChild(row);
                            });
                        }

                        qualityContent.appendChild(createToggleSection(`单价 $${price}`, priceContent, false));
                    }

                    kindContent.appendChild(createToggleSection(`品质 ${quality}`, qualityContent, false));
                }

                containerDiv.appendChild(createToggleSection(kindName, kindContent, true));
            }

            return createToggleSection(label, containerDiv, true);
        }

        const init = () => {
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
            let resizer;
            const d12 = DM();

            container = document.createElement("div");
            container.id = 'decayDataPanel';
            container.style.cssText = `
                position: fixed;
                left: ${isMobile ? '5vw' : 'calc(100% - 510px)'};
                top: ${isMobile ? '20px' : 'calc(100vh - 60px - 300px)'};
                width: ${isMobile ? '80vw' : '500px'};
                height: ${isMobile ? '50vh' : '350px'};
                max-height: 80%;
                overflow: hidden;
                background: ${d12 ? '#222' : '#fff'};
                color: ${d12 ? 'white' : '#333'};
                padding: 10px;
                z-index: 9998;
                border-radius: 6px;
                font-size: clamp(12px, 1.5vw, 16px);
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                user-select: none;
                display: flex;
                flex-direction: column;
            `;

            // 标题栏：拖动区域
            header = document.createElement('div');
            const headerTitle = document.createElement('span');
            headerTitle.textContent = '未来衰减量 ▾';
            header.appendChild(headerTitle);

            // 折叠逻辑
            let isCollapsed = false;
            let lastKnownHeight = isMobile ? '50vh' : '350px';
            header.addEventListener('click', (e) => {
                if (e.target === calcBtn || e.target === closeBtn) return;

                isCollapsed = !isCollapsed;

                if (isCollapsed) {
                    content.style.display = 'none';
                    container.style.height = `${header.offsetHeight + 2}px`;
                    if (resizer) resizer.style.display = 'none';
                } else {
                    content.style.display = 'block';
                    container.style.height = lastKnownHeight;
                    if (resizer) resizer.style.display = 'block';
                    content.style.height = `calc(100% - ${header.offsetHeight}px)`;
                }

                headerTitle.textContent = isCollapsed ? '未来衰减量 ▸' : '未来衰减量 ▾';
            });
            header.style.cssText = `
                background: ${d12 ? '#444' : '#e0e0e0'};
                padding: 8px 10px;
                font-weight: bold;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                flex-shrink: 0;
                position: relative;
                color: ${d12 ? 'white' : '#333'};
                ${isMobile ? '' : 'cursor: move;'}
            `;

            const calcBtn = document.createElement('button');
            calcBtn.textContent = '🔄';
            calcBtn.title = '重新计算资源剩余量';
            calcBtn.style.cssText = `
                float: right;
                margin-right: 6px;
                background: transparent;
                border: none;
                color: ${d12 ? 'white' : '#333'};
                font-size: 16px;
                cursor: pointer;
                user-select: none;
            `;
            calcBtn.onclick = async () => {
                calcBtn.disabled = true;
                calcBtn.textContent = '⏳';
                try {
                    await window.calculateAll();
                    DecayResultViewer.show();
                } catch (e) {
                    console.error("资源计算失败", e);
                } finally {
                    calcBtn.disabled = false;
                    calcBtn.textContent = '🔄';
                }
            };
            header.appendChild(calcBtn);

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.title = '关闭面板';
            closeBtn.style.cssText = `
                position: absolute;
                right: 8px;
                top: 6px;
                background: transparent;
                border: none;
                color: ${d12 ? 'white' : '#333'};
                font-size: 16px;
                cursor: pointer;
                user-select: none;
            `;
            closeBtn.onclick = () => { container.style.display = 'none'; };
            header.appendChild(closeBtn);

            content = document.createElement('div');
            content.style.cssText = `
                flex: 1 1 auto;
                overflow: auto;
                padding: 10px;
            `;

            container.appendChild(header);
            container.appendChild(content);
            document.body.appendChild(container);

            renderResult();

            if (!isMobile) {
                let isDragging = false, startX, startY, startLeft, startTop;

                header.addEventListener('mousedown', (e) => {
                    if (e.target === closeBtn) return;
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    const rect = container.getBoundingClientRect();
                    startLeft = rect.left;
                    startTop = rect.top;
                    e.preventDefault();
                });

                window.addEventListener('mouseup', () => {
                    isDragging = false;
                });

                window.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    let newLeft = startLeft + (e.clientX - startX);
                    let newTop = startTop + (e.clientY - startY);

                    newLeft = Math.min(Math.max(newLeft, 0), window.innerWidth - container.offsetWidth);
                    newTop = Math.min(Math.max(newTop, 0), window.innerHeight - container.offsetHeight);

                    container.style.left = newLeft + 'px';
                    container.style.top = newTop + 'px';
                    container.style.bottom = 'auto';
                });

                resizer = document.createElement('div');
                resizer.style.cssText = `
                    width: 14px;
                    height: 14px;
                    background: transparent;
                    position: absolute;
                    right: 2px;
                    bottom: 2px;
                    cursor: se-resize;
                    user-select: none;
                    z-index: 9998;
                `;
                container.appendChild(resizer);

                let isResizing = false;
                let startWidth, startHeight, startPageX, startPageY;

                resizer.addEventListener('mousedown', (e) => {
                    isResizing = true;
                    startWidth = container.offsetWidth;
                    startHeight = container.offsetHeight;
                    startPageX = e.pageX;
                    startPageY = e.pageY;
                    e.preventDefault();
                    e.stopPropagation();
                });

                window.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;
                    let newWidth = startWidth + (e.pageX - startPageX);
                    let newHeight = startHeight + (e.pageY - startPageY);

                    newWidth = Math.max(newWidth, 250);
                    newHeight = Math.max(newHeight, 150);

                    newWidth = Math.min(newWidth, window.innerWidth - container.getBoundingClientRect().left);
                    newHeight = Math.min(newHeight, window.innerHeight - container.getBoundingClientRect().top);

                    container.style.width = newWidth + 'px';
                    container.style.height = newHeight + 'px';
                    content.style.height = `calc(100% - ${header.offsetHeight}px)`;
                });

                window.addEventListener('mouseup', () => {
                    if (isResizing) {
                        lastKnownHeight = container.style.height;
                        isResizing = false;
                    }
                });
            }
            if (isMobile) {
                let isDragging = false, startX, startY, startLeft, startTop;

                header.addEventListener('touchstart', (e) => {
                    if (e.target === closeBtn) return;
                    const touch = e.touches[0];
                    isDragging = true;
                    startX = touch.clientX;
                    startY = touch.clientY;
                    const rect = container.getBoundingClientRect();
                    startLeft = rect.left;
                    startTop = rect.top;
                }, { passive: true });

                window.addEventListener('touchend', () => {
                    isDragging = false;
                });

                window.addEventListener('touchmove', (e) => {
                    if (!isDragging) return;
                    const touch = e.touches[0];
                    let newLeft = startLeft + (touch.clientX - startX);
                    let newTop = startTop + (touch.clientY - startY);

                    newLeft = Math.min(Math.max(newLeft, 0), window.innerWidth - container.offsetWidth);
                    newTop = Math.min(Math.max(newTop, 0), window.innerHeight - container.offsetHeight);

                    container.style.left = newLeft + 'px';
                    container.style.top = newTop + 'px';
                    container.style.bottom = 'auto';
                }, { passive: true });
            }
        };

        window.addEventListener('warehouse-updated', () => {
            if (container && container.style.display !== 'none') {
                renderResult();
            }
        });

        window.addEventListener('marketOrders-updated', () => {
            if (container && container.style.display !== 'none') {
                renderResult();
            }
        });

        window.addEventListener('contractsOutgoing-updated', () => {
            if (container && container.style.display !== 'none') {
                renderResult();
            }
        });

        window.addEventListener('contractsIncoming-updated', () => {
            if (container && container.style.display !== 'none') {
                renderResult();
            }
        });

        return {
            show() {
                if (!container) init();
                else container.style.display = "flex";
                renderResult();
            },
            hide() {
                if (container) container.style.display = "none";
            },
            toggle() {
                if (!container || container.style.display === "none") this.show();
                else this.hide();
            }
        };
    })();

    // ======================
    // 模块14：显示挖人培训历史记录
    // ======================
    // 模块14：高管培训提醒与解析 (已抽离至 src/features/executiveTrainingModule.js)

    // ======================
    // 模块15：前任高管详细信息展示
    // ======================
    // 模块15：前任高管详细信息展示 (已抽离至 src/features/formerExecutivesModule.js)

    // ======================
    // 模块17：COO收益计算
    // ======================
    (function () {
        // 建筑 kind → 基本时薪映射（严格区分大小写）
        const BASE_WAGES = {
            '0': 759, '1': 448.5, '2': 379.5, '3': 0, '4': 0, '5': 0,
            '6': 241.5, '7': 586.5, '8': 724.5, '9': 759,
            'A': 345, 'a': 552, 'b': 414, 'B': 586.5, 'C': 172.5,
            'c': 414, 'D': 621, 'd': 172.5, 'E': 414, 'e': 414,
            'F': 138, 'f': 448.5, 'G': 138, 'g': 345, 'H': 310.5,
            'h': 586.5, 'I': 241.5, 'i': 379.5, 'j': 448.5, 'k': 379.5,
            'L': 379.5, 'l': 517.5, 'M': 276, 'm': 655.5, 'n': 0,
            'O': 517.5, 'o': 379.5, 'P': 103.5, 'p': 448.5, 'q': 517.5,
            'Q': 276, 'R': 483, 'r': 586.5, 'S': 310.5, 's': 586.5,
            'T': 138, 't': 207, 'u': 241.5, 'v': 79.35, 'W': 345,
            'x': 483, 'Y': 414, 'y': 0, 'z': 241.5
        };

        function getBuildingsData() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return [];
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return [];
                const data = JSON.parse(raw);
                return data.buildings || [];
            } catch (e) {
                return [];
            }
        }

        function getSRCData() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return null;
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        }

        // 计算当前所有建筑运行24小时的管理费
        function calcTotalAdminFee(buildings, SRC) {
            if (!buildings || buildings.length === 0 || !SRC) return 0;
            const adminOverhead = SRC.administration || 1;
            if (adminOverhead <= 1) return 0;
            let total = 0;
            for (const b of buildings) {
                const baseWage = BASE_WAGES[b.kind];
                if (baseWage === undefined || baseWage === 0) continue;
                // 机器人：robotsSpecialization 为数字则表示安装了机器人，减少3%管理费即 *0.97
                const robotMultiplier = (typeof b.robotsSpecialization === 'number') ? 0.97 : 1;
                total += baseWage * b.size * 24 * robotMultiplier * (adminOverhead - 1);
            }
            return total;
        }

        function showCOOCalcModal() {
            // 清理旧弹窗
            const existing = document.getElementById('sc-coo-calc-overlay');
            if (existing) existing.remove();

            const buildings = getBuildingsData();
            const SRC = getSRCData();

            if (!buildings || buildings.length === 0) {
                alert('未找到建筑数据，请先在游戏中打开任意页面以触发建筑数据捕获，或手动更新领域数据。');
                return;
            }
            if (!SRC) {
                alert('未找到领域数据，请先更新领域数据（左下角按钮）。');
                return;
            }

            const totalFee = calcTotalAdminFee(buildings, SRC);
            const defaultCOO = SRC.adminBonus || 0;

            const d17 = DM();
            const bg = d17 ? '#1e1e1e' : '#fff';
            const fg = d17 ? '#efefef' : '#333';
            const fg2 = d17 ? '#ccc' : '#555';
            const border = d17 ? '#555' : '#ccc';
            const inputBg = d17 ? '#333' : '#f5f5f5';
            const inputFg = d17 ? '#efefef' : '#333';
            const accentBg = d17 ? '#1a3a5c' : '#e3f2fd';
            const accentBorder = d17 ? '#2a5a8c' : '#bbdefb';
            const resultBg = d17 ? '#1a3a1a' : '#e8f5e9';
            const resultBorder = d17 ? '#2a5a2a' : '#c8e6c9';

            // 锁定背景滚动
            const origOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            const overlay = document.createElement('div');
            overlay.id = 'sc-coo-calc-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.5); z-index: 99999;
                display: flex; justify-content: center; align-items: center;
                opacity: 0; transition: opacity 0.2s;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: ${bg}; color: ${fg}; border-radius: 12px;
                width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
                padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                font-family: sans-serif; transform: scale(0.95);
                transition: transform 0.2s;
            `;

            modal.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ${border}; padding-bottom:12px; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:18px;">💰COO收益计算</h3>
                    <button id="sc-coo-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d17 ? '#aaa' : '#999'}; line-height:1;">&times;</button>
                </div>

                <div style="background:${accentBg}; border:1px solid ${accentBorder}; border-radius:8px; padding:12px; margin-bottom:16px;">
                    <div style="font-size:13px; color:${fg2}; margin-bottom:4px;">当前地图上所有建筑运行24小时的管理费</div>
                    <div id="sc-coo-total-fee" style="font-size:24px; font-weight:bold; color:#2196F3;">$${totalFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style="font-size:11px; color:${d17 ? '#888' : '#999'}; margin-top:4px;">管理费用: ${(((SRC.administration || 1) - 1) * 100).toFixed(1)}% | 建筑数: ${buildings.length}</div>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="font-size:14px; font-weight:bold; display:block; margin-bottom:6px;">COO有效点数</label>
                    <input id="sc-coo-input" type="number" min="0" step="1" value="${defaultCOO}"
                        style="width:100%; padding:10px; border:1px solid ${border}; border-radius:6px;
                        background:${inputBg}; color:${inputFg}; font-size:16px; box-sizing:border-box;">
                </div>

                <div style="background:${resultBg}; border:1px solid ${resultBorder}; border-radius:8px; padding:12px;">
                    <div style="font-size:13px; color:${fg2}; margin-bottom:4px;">COO节省的管理费</div>
                    <div id="sc-coo-saved-fee" style="font-size:24px; font-weight:bold; color:#4CAF50;">$0.00</div>
                    <div style="font-size:13px; color:${fg2}; margin-top:8px; margin-bottom:4px;">每日实际管理费</div>
                    <div id="sc-coo-remain-fee" style="font-size:24px; font-weight:bold; color:#FF9800;">$0.00</div>
                </div>

                <div style="margin-top:16px; font-size:11px; color:${d17 ? '#888' : '#999'}; text-align:center;">
                    计算公式：某建筑管理费 = 一级基本工资*等级*24h*机器人*管理费用 | COO节省的管理费 = 建筑管理费总和 * COO有效点数%
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // 动画入场
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            // 更新结果函数
            const updateResult = () => {
                const cooPoints = parseFloat(document.getElementById('sc-coo-input')?.value) || 0;
                const savedFee = totalFee * (cooPoints / 100);
                const remainFee = totalFee - savedFee;
                const savedEl = document.getElementById('sc-coo-saved-fee');
                const remainEl = document.getElementById('sc-coo-remain-fee');
                if (savedEl) savedEl.textContent = '$' + savedFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                if (remainEl) remainEl.textContent = '$' + remainFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            // 绑定输入事件
            document.getElementById('sc-coo-input').addEventListener('input', updateResult);
            updateResult(); // 初始计算

            // 关闭逻辑
            const closeModal = () => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    overlay.remove();
                    document.body.style.overflow = origOverflow;
                    document.removeEventListener('keydown', handleEsc);
                }, 200);
            };

            overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
            document.getElementById('sc-coo-close').onclick = closeModal;
            const handleEsc = (e) => { if (e.key === 'Escape') closeModal(); };
            document.addEventListener('keydown', handleEsc);
        }

        // --- 注入按钮到高管页面 ---
        function injectCOOButton() {
            // 查找目标容器
            const h3 = document.querySelector('.css-6zujxw h3');
            if (!h3) return;
            // 防止重复注入
            if (document.getElementById('sc-coo-calc-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'sc-coo-calc-btn';
            btn.textContent = 'COO收益计算';
            btn.style.cssText = `
                margin-left: 12px; padding: 4px 12px; background: #2196F3; color: white;
                border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                font-weight: bold; vertical-align: middle; transition: all 0.2s;
            `;
            btn.onmouseenter = () => btn.style.backgroundColor = '#1976d2';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2196F3';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showCOOCalcModal();
            };

            h3.appendChild(btn);
        }

        // --- 页面监听与初始化（MutationObserver，与模块16一致） ---
        function isExecPage() {
            return /\/headquarters\/executives\/?$/.test(location.href);
        }

        const observer = new MutationObserver(() => {
            if (isExecPage()) injectCOOButton();
        });

        function init() {
            if (typeof window.isPageModuleEnabled === 'function' && !window.isPageModuleEnabled('cooProfit')) return;
            observer.observe(document.body, { childList: true, subtree: true });
            if (isExecPage()) injectCOOButton();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // ======================
    // 模块18：出库合同MP-?%
    // ======================
    // 模块18：出库合同/市场 MP% 计算与快捷按钮注入 (已抽离至 src/features/outgoingContractMPHandler.js)


    // ======================
    // 模块21：地图空闲建筑高亮
    // ======================
    // 模块21：地图空闲建筑高亮 (已抽离至 src/features/landscapeIdleBuildingHighlight.js)
    // 模块22：PA任务答案辅助 (已抽离至 src/features/paQuestAnswers.js)
    // ======================
    // 模块23：Snipboard图片预览
    // ======================
    (function () {
        'use strict';

        var MODULE_KEY = 'snipboardPreview';

        function isEnabled() {
            return window.isPageModuleEnabled ? window.isPageModuleEnabled(MODULE_KEY) : true;
        }

        // 动态注入样式，只在小屏幕媒体查询下生效以优化小屏幕布局，大屏幕保持原样
        function injectStyles() {
            var styleId = 'sc-snipboard-preview-style';
            var existingStyle = document.getElementById(styleId);
            var isDark = typeof DM === 'function' ? DM() : false;
            var styleText = `
                .sc-snipboard-preview-img {
                    display: block !important;
                    max-width: 180px !important;
                    max-height: 180px !important;
                    width: 100% !important;
                    height: auto !important;
                    object-fit: cover !important;
                    box-sizing: border-box !important;
                    border-radius: 4px;
                    border: 1px solid ${isDark ? '#444' : '#ddd'} !important;
                    box-shadow: ${isDark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.15)'} !important;
                    margin-top: 8px !important;
                }
            `;
            if (existingStyle) {
                existingStyle.textContent = styleText;
            } else {
                var style = document.createElement('style');
                style.id = styleId;
                style.textContent = styleText;
                document.head.appendChild(style);
            }
        }

        // 查找聊天容器（与模块20相同逻辑）
        function findChatContainers() {
            var byClass = document.querySelectorAll('div.css-xo2rg1.e1llepen2');
            if (byClass.length > 0) return byClass;
            return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
        }

        // 判断链接是否为图片URL
        function isImageUrl(href) {
            return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(href);
        }

        // 处理单个链接
        function processLink(link) {
            var href = link.getAttribute('href');
            if (!href) return;

            // 只处理 snipboard.io 链接
            if (!href.includes('snipboard.io')) return;

            // 避免重复处理
            if (link.getAttribute('data-snipboard-processed') === '1') return;

            var imgUrl = href;
            // 确保使用 https 协议，消除浏览器的混合内容（Mixed Content）警告
            if (imgUrl.indexOf('http://') === 0) {
                imgUrl = imgUrl.replace('http://', 'https://');
            }
            // 如果URL不以图片格式结尾，添加 .jpg（snipboard默认）
            if (!isImageUrl(imgUrl)) {
                imgUrl = imgUrl.replace(/\/?$/, '.jpg');
            }

            link.setAttribute('data-snipboard-processed', '1');

            var img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'sc-snipboard-preview-img';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.height = 'auto';
            img.setAttribute('data-sc-original-src', imgUrl);
            img.addEventListener('click', function (e) {
                e.stopPropagation();
                showLightbox(imgUrl);
            });

            // 在链接后面插入图片
            link.parentNode.insertBefore(img, link.nextSibling);
        }

        // 显示图片放大灯箱
        function showLightbox(url) {
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;cursor:pointer;overflow:hidden;';

            var closeBtn = document.createElement('span');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = 'position:fixed;top:16px;right:24px;font-size:36px;color:#fff;cursor:pointer;z-index:100000;line-height:1;font-family:sans-serif;user-select:none;';
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeLightbox();
            });

            function closeLightbox() {
                overlay.style.opacity = '0';
                setTimeout(function () { overlay.remove(); }, 200);
                document.removeEventListener('keydown', onKeyDown);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') closeLightbox();
            }

            overlay.addEventListener('click', closeLightbox);
            document.addEventListener('keydown', onKeyDown);

            var viewport = document.createElement('div');
            viewport.style.cssText = 'width:90vw;height:90vh;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:default;';

            var img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'max-width:100%;max-height:100%;border-radius:4px;box-shadow:0 0 20px rgba(0,0,0,0.5);cursor:zoom-in;touch-action:none;transition:opacity 0.2s,transform 0.12s ease-out;user-select:none;-webkit-user-drag:none;';
            img.style.opacity = '0';
            img.addEventListener('load', function () { img.style.opacity = '1'; });

            var scale = 1;
            var offsetX = 0;
            var offsetY = 0;
            var dragStart = null;
            var activePointers = new Map();
            var pinchStart = null;
            var lastTouchTap = null;

            function clampOffsets() {
                var maxX = Math.max(0, (img.clientWidth * scale - viewport.clientWidth) / 2);
                var maxY = Math.max(0, (img.clientHeight * scale - viewport.clientHeight) / 2);
                offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
                offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
            }

            function updateTransform() {
                if (scale === 1) {
                    offsetX = 0;
                    offsetY = 0;
                } else {
                    clampOffsets();
                }
                img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
                img.style.cursor = scale > 1 ? (dragStart ? 'grabbing' : 'grab') : 'zoom-in';
            }

            function setScale(nextScale) {
                scale = Math.max(1, Math.min(3, nextScale));
                updateTransform();
            }

            viewport.addEventListener('wheel', function (e) {
                if (e.target !== img) return;
                e.preventDefault();
                setScale(scale + (e.deltaY < 0 ? 0.25 : -0.25));
            }, { passive: false });

            viewport.addEventListener('pointerdown', function (e) {
                activePointers.set(e.pointerId, {
                    x: e.clientX,
                    y: e.clientY,
                    startedOnImage: e.target === img
                });
                viewport.setPointerCapture(e.pointerId);

                if (e.pointerType === 'mouse' && e.button !== 0) return;

                if (activePointers.size === 2) {
                    var points = Array.from(activePointers.values());
                    lastTouchTap = null;
                    pinchStart = {
                        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
                        scale: scale
                    };
                    if (!points[0].startedOnImage || !points[1].startedOnImage) {
                        pinchStart = null;
                    }
                    dragStart = null;
                    updateTransform();
                    return;
                }

                if (scale <= 1 || !e.target || e.target !== img) return;
                dragStart = { x: e.clientX, y: e.clientY, offsetX: offsetX, offsetY: offsetY };
                updateTransform();
            });

            viewport.addEventListener('pointermove', function (e) {
                var pointer = activePointers.get(e.pointerId);
                if (!pointer) return;
                activePointers.set(e.pointerId, {
                    x: e.clientX,
                    y: e.clientY,
                    startedOnImage: pointer.startedOnImage
                });

                if (pinchStart && activePointers.size === 2) {
                    var points = Array.from(activePointers.values());
                    var distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
                    if (pinchStart.distance > 0) {
                        setScale(pinchStart.scale * distance / pinchStart.distance);
                    }
                    return;
                }

                if (!dragStart) return;
                offsetX = dragStart.offsetX + e.clientX - dragStart.x;
                offsetY = dragStart.offsetY + e.clientY - dragStart.y;
                updateTransform();
            });

            viewport.addEventListener('pointerup', function (e) {
                var wasDragging = dragStart && (Math.abs(e.clientX - dragStart.x) > 8 || Math.abs(e.clientY - dragStart.y) > 8);
                var wasPinching = pinchStart !== null;
                var pointer = activePointers.get(e.pointerId);
                var startedOnImage = pointer && pointer.startedOnImage;
                dragStart = null;
                activePointers.delete(e.pointerId);
                if (activePointers.size < 2) pinchStart = null;
                updateTransform();

                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (wasDragging || wasPinching) {
                    lastTouchTap = null;
                    return;
                }
                if (!startedOnImage) {
                    closeLightbox();
                    return;
                }

                if (e.pointerType === 'mouse') {
                    setScale(scale > 1 ? 1 : 2);
                } else if (e.pointerType === 'touch') {
                    var now = Date.now();
                    if (lastTouchTap && now - lastTouchTap < 300) {
                        setScale(scale > 1 ? 1 : 2);
                        lastTouchTap = null;
                    } else {
                        lastTouchTap = now;
                    }
                }
            });

            viewport.addEventListener('pointercancel', function (e) {
                dragStart = null;
                activePointers.delete(e.pointerId);
                if (activePointers.size < 2) pinchStart = null;
                lastTouchTap = null;
                updateTransform();
            });

            viewport.addEventListener('click', function (e) { e.stopPropagation(); });

            overlay.appendChild(closeBtn);
            viewport.appendChild(img);
            overlay.appendChild(viewport);
            document.body.appendChild(overlay);
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s';
            requestAnimationFrame(function () { overlay.style.opacity = '1'; });
        }

        // 扫描容器中的 snipboard 链接
        function scanContainer(container) {
            if (!isEnabled()) return;
            var links = container.querySelectorAll('a[href*="snipboard.io"]');
            for (var i = 0; i < links.length; i++) {
                processLink(links[i]);
            }
        }

        // 扫描所有聊天容器
        function scanAll() {
            if (!isEnabled()) return;
            var containers = findChatContainers();
            for (var i = 0; i < containers.length; i++) {
                scanContainer(containers[i]);
            }
        }

        // 初始化
        var observer = null;
        var initAttempted = false;

        function init() {
            if (initAttempted) return;
            initAttempted = true;

            if (!isEnabled()) return;

            // 注入或更新样式配置
            injectStyles();

            // 扫描现有内容
            scanAll();

            // 监听变化
            if (observer) observer.disconnect();

            observer = new MutationObserver(function (mutations) {
                if (!isEnabled()) return;
                for (var mi = 0; mi < mutations.length; mi++) {
                    var m = mutations[mi];
                    for (var ni = 0; ni < m.addedNodes.length; ni++) {
                        var n = m.addedNodes[ni];
                        if (n.nodeType === 1) {
                            // 查找新增节点中的 snipboard 链接
                            var links = n.querySelectorAll ? n.querySelectorAll('a[href*="snipboard.io"]') : [];
                            for (var li = 0; li < links.length; li++) {
                                processLink(links[li]);
                            }
                            // 如果新增节点本身是链接
                            if (n.tagName === 'A' && n.href && n.href.indexOf('snipboard.io') !== -1) {
                                processLink(n);
                            }
                        }
                    }
                }
            });

            // 观察聊天容器
            var containers = findChatContainers();
            for (var i = 0; i < containers.length; i++) {
                observer.observe(containers[i], { childList: true, subtree: true });
            }
        }

        // SPA 导航监听
        var lastUrl = location.href;
        new MutationObserver(function () {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                initAttempted = false;
                if (observer) { observer.disconnect(); observer = null; }
                setTimeout(init, 300);
            }
        }).observe(document, { subtree: true, childList: true });

        // 延迟启动
        setTimeout(init, 500);

        return { init };
    })();

    // ======================
    // 模块24：聊天输入框自动扩大
    // ======================
    (function () {
        'use strict';

        var MODULE_KEY = 'chatInputExpander';

        function isEnabled() {
            return typeof window.isPageModuleEnabled === 'function' ? window.isPageModuleEnabled(MODULE_KEY) : true;
        }

        // 动态注入样式，支持浅色和深色模式，且通过媒体查询实现响应式布局
        function injectStyles() {
            var styleId = 'sc-chat-input-expander-style';
            var existingStyle = document.getElementById(styleId);
            var isDark = typeof DM === 'function' ? DM() : false;

            // 读取自定义扩大高度（桌面/移动端分开存储），未设置时沿用默认值
            var desktopHeight = readCustomHeight('chatInputExpanderHeight', 130);
            var mobileHeight = readCustomHeight('chatInputExpanderHeightMobile', 90);

            // 依据深浅色模式采用不同的蓝色阴影透明度以保证视觉高级感
            var shadowColor = isDark ? 'rgba(33, 150, 243, 0.5)' : 'rgba(33, 150, 243, 0.3)';
            var styleText = `
                /* 默认过渡动画，实现平滑的高度伸缩和发光效果 */
                .sc-chat-textarea-transition {
                    transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s, border-color 0.2s !important;
                }
                .sc-chat-container-transition {
                    transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }

                /* 焦点在输入框内时的扩大状态（默认桌面端/平板） */
                .sc-chat-textarea-focused {
                    height: ${desktopHeight}px !important;
                    top: 0px !important;
                    bottom: 0px !important;
                    border-color: #2196F3 !important;
                    box-shadow: 0 0 10px ${shadowColor} !important;
                }
                /* 使输入框紧邻的前置高亮渲染 div 的高度同步拉伸，防止文本输入层级错位导致输入法定位失灵被覆盖 */
                .sc-chat-wrap-focused > div {
                    height: ${desktopHeight}px !important;
                    min-height: ${desktopHeight}px !important;
                }
                .sc-chat-input-group-focused {
                    height: ${desktopHeight}px !important;
                }
                /* 发送按钮容器高度扩大，并利用 vertical-align 靠底对齐，保持原有 table-cell 布局不被破坏 */
                .sc-chat-btn-focused {
                    height: ${desktopHeight}px !important;
                    vertical-align: bottom !important;
                }
                .sc-chat-outer-focused {
                    height: ${desktopHeight + 8}px !important;
                }

                /* 移动端/小屏幕适配：防止弹出的虚拟键盘和过大输入框遮挡全部屏幕 */
                @media (max-width: 767px) {
                    .sc-chat-textarea-focused {
                        height: ${mobileHeight}px !important;
                    }
                    .sc-chat-wrap-focused > div {
                        height: ${mobileHeight}px !important;
                        min-height: ${mobileHeight}px !important;
                    }
                    .sc-chat-input-group-focused {
                        height: ${mobileHeight}px !important;
                    }
                    .sc-chat-btn-focused {
                        height: ${mobileHeight}px !important;
                    }
                    .sc-chat-outer-focused {
                        height: ${mobileHeight + 8}px !important;
                    }
                }
            `;

            if (existingStyle) {
                existingStyle.textContent = styleText;
            } else {
                var style = document.createElement('style');
                style.id = styleId;
                style.textContent = styleText;
                document.head.appendChild(style);
            }
        }

        // 读取自定义扩大高度（px），非法值回退默认，仅保留最小下限防止塌陷
        function readCustomHeight(key, fallback) {
            try {
                var cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                var value = parseInt(cfg[key], 10);
                if (!isFinite(value)) return fallback;
                return Math.max(40, value);
            } catch (e) {
                return fallback;
            }
        }

        // 识别聊天输入框（通过 DOM 结构与聊天室特有特征判定，不依赖文本内容）
        function isChatInput(el) {
            if (!el || el.tagName !== 'TEXTAREA') return false;

            // 1. 必须位于 input-group 容器中
            var inputGroup = el.closest('.input-group');
            if (!inputGroup) return false;

            // 2. 向上寻找祖先节点，直到找到包含聊天记录容器的公共祖先（不限制层数以确保 100% 兼容）
            var isInsideChat = false;
            var cur = el.parentElement;
            while (cur && cur !== document.body) {
                if (cur.classList.contains('e1llepen1') ||
                    cur.querySelector('.e1llepen2') ||
                    cur.querySelector('div[style*="column-reverse"]')) {
                    isInsideChat = true;
                    break;
                }
                cur = cur.parentElement;
            }

            // console.log('[SC-ChatInputExpander] 检测输入框焦点:', el, '判定是否为聊天框:', isInsideChat);
            return isInsideChat;
        }

        // 动态定位关联的容器节点
        function findContainers(textarea) {
            var inputGroup = textarea.closest('.input-group');
            var btnContainer = inputGroup ? inputGroup.querySelector('.input-group-btn') : null;
            var outerContainer = null;

            // 1. 向上寻找整个聊天窗的容器（参考模块23检测逻辑）
            var chatRoom = textarea.closest('.e1llepen1');
            if (!chatRoom) {
                var cur = textarea.parentElement;
                while (cur && cur !== document.body) {
                    if (cur.querySelector('.e1llepen2') || cur.querySelector('div[style*="column-reverse"]')) {
                        chatRoom = cur;
                        break;
                    }
                    cur = cur.parentElement;
                }
            }

            // 2. 输入框的最外层包装容器必然是聊天窗 chatRoom 的直接子节点
            if (chatRoom) {
                var cur = textarea.parentElement;
                while (cur && cur !== chatRoom) {
                    if (cur.parentElement === chatRoom) {
                        outerContainer = cur;
                        break;
                    }
                    cur = cur.parentElement;
                }
            }

            // 3. 兜底保护：若上述算法未定位到，则降级使用 inputGroup 往上两层
            if (!outerContainer && inputGroup) {
                outerContainer = inputGroup.parentElement;
                if (outerContainer && outerContainer.style.width === '100%') {
                    outerContainer = outerContainer.parentElement;
                }
            }

            /*
            console.log('[SC-ChatInputExpander] 定位到的容器:', {
                inputGroup: inputGroup,
                btnContainer: btnContainer,
                outerContainer: outerContainer
            });
            */

            return {
                inputGroup: inputGroup,
                btnContainer: btnContainer,
                outerContainer: outerContainer
            };
        }

        // 初始化模块
        function init() {
            if (!isEnabled()) return;
            injectStyles();
        }

        var isClickingInside = false;

        // 收缩单个输入框关联的所有容器
        function collapseContainers(textarea) {
            var containers = findContainers(textarea);
            textarea.classList.remove('sc-chat-textarea-focused');

            var parent = textarea.parentElement;
            if (parent) {
                parent.classList.remove('sc-chat-wrap-focused');
            }

            if (containers.inputGroup) {
                containers.inputGroup.classList.remove('sc-chat-input-group-focused');
            }
            if (containers.btnContainer) {
                containers.btnContainer.classList.remove('sc-chat-btn-focused');
            }
            if (containers.outerContainer) {
                containers.outerContainer.classList.remove('sc-chat-outer-focused');
            }
        }

        // 收缩所有已展开的聊天输入框
        function collapseAll() {
            var expanded = document.querySelectorAll('.sc-chat-textarea-focused');
            for (var i = 0; i < expanded.length; i++) {
                collapseContainers(expanded[i]);
            }
        }

        // 监听鼠标按下事件，判断用户点击是否在聊天输入组件内部（例如点击发送按钮），此时不能立刻失焦收缩，避免点击位移失效
        document.addEventListener('mousedown', function (e) {
            if (!isEnabled()) return;
            var target = e.target;
            if (target) {
                var inputGroup = target.closest('.input-group');
                var outerFocused = target.closest('.sc-chat-outer-focused');
                if (inputGroup || outerFocused) {
                    isClickingInside = true;
                    return;
                }
            }
            isClickingInside = false;
        });

        // 鼠标松开后延迟重置点击状态，如果此时焦点彻底移出了输入框，则在交互完成后收缩
        document.addEventListener('mouseup', function () {
            if (!isEnabled()) return;
            setTimeout(function () {
                isClickingInside = false;
                var activeEl = document.activeElement;
                if (!isChatInput(activeEl)) {
                    collapseAll();
                }
            }, 150);
        });

        // 利用全局事件代理监听焦点，避免 React 重新渲染页面导致绑定失效
        document.addEventListener('focusin', function (e) {
            if (!isEnabled()) return;
            var target = e.target;
            if (isChatInput(target)) {
                var containers = findContainers(target);

                target.classList.add('sc-chat-textarea-transition');
                target.classList.add('sc-chat-textarea-focused');

                var parent = target.parentElement;
                if (parent) {
                    parent.classList.add('sc-chat-container-transition');
                    parent.classList.add('sc-chat-wrap-focused');
                }

                if (containers.inputGroup) {
                    containers.inputGroup.classList.add('sc-chat-container-transition');
                    containers.inputGroup.classList.add('sc-chat-input-group-focused');
                }
                if (containers.btnContainer) {
                    containers.btnContainer.classList.add('sc-chat-container-transition');
                    containers.btnContainer.classList.add('sc-chat-btn-focused');
                }
                if (containers.outerContainer) {
                    containers.outerContainer.classList.add('sc-chat-container-transition');
                    containers.outerContainer.classList.add('sc-chat-outer-focused');
                }

                // 解决移动端虚拟键盘弹起时输入框可能被键盘物理覆盖遮挡的问题：平滑将输入框滚动至可视区域中上部
                setTimeout(function () {
                    if (document.activeElement === target) {
                        if (typeof target.scrollIntoViewIfNeeded === 'function') {
                            target.scrollIntoViewIfNeeded(false);
                        } else {
                            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                    }
                }, 300);
            }
        });

        document.addEventListener('focusout', function (e) {
            var target = e.target;
            if (isChatInput(target)) {
                // 如果用户当前正在点击输入区内部（如发送按钮），绝不立刻收缩以防止点击丢失
                if (isClickingInside) return;
                collapseContainers(target);
            }
        });

        // 立即初始化以注入样式
        init();

        // 供设置面板在修改自定义高度后立即重新生成样式
        window.scChatInputExpanderApplyStyles = injectStyles;
    })();

    // ======================
    // 检测更新模块
    // ======================
    function compareVersions(v1, v2) {
        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const num1 = a[i] || 0;
            const num2 = b[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }

    function showUpdateToast(version, changelog, downloadUrl) {
        const dUp = DM();
        // 1. 注入样式
        const style = document.createElement('style');
        style.textContent = `
            .sc-update-toast {
                position: fixed; top: -80px; left: 50%; transform: translateX(-50%);
                z-index: 10001; background: #2196F3; color: white;
                padding: 10px 20px; border-radius: 50px; cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                max-width: 90vw; width: max-content;
                font-family: sans-serif; box-sizing: border-box;
            }
            .sc-update-toast.show { top: 20px; }

            /* 展开后的卡片样式 */
            .sc-update-toast.expanded {
                border-radius: 12px; padding: 20px; width: 400px;
                background: ${dUp ? '#1e1e1e' : '#ffffff'}; color: ${dUp ? '#efefef' : '#333'}; cursor: default;
                border-top: 5px solid #2196F3;
            }

            .sc-update-header {
                margin: 0; font-size: 14px; font-weight: bold;
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .sc-update-toast.expanded .sc-update-header {
                color: #2196F3; font-size: 18px; justify-content: flex-start;
            }

            /* 右上角关闭按钮 */
            .sc-update-close {
                position: absolute; top: 10px; right: 12px;
                display: none; cursor: pointer; font-size: 20px; color: ${dUp ? '#aaa' : '#999'};
                line-height: 1; padding: 5px;
            }
            .sc-update-toast.expanded .sc-update-close { display: block; }
            .sc-update-close:hover { color: ${dUp ? '#ccc' : '#333'}; }

            /* 内容区域 */
            .sc-update-body {
                max-height: 0; opacity: 0; transition: all 0.3s ease; overflow: hidden;
            }
            .sc-update-toast.expanded .sc-update-body {
                max-height: 400px; opacity: 1; margin-top: 15px;
            }

            .sc-changelog-box {
                background: ${dUp ? '#2a2a2a' : '#f5f7f9'}; padding: 12px; border-radius: 6px;
                margin: 10px 0; color: ${dUp ? '#ccc' : '#555'}; font-size: 13px;
                border-left: 3px solid ${dUp ? '#555' : '#ddd'}; max-height: 150px; overflow-y: auto;
            }

            /* 底部按钮区域 */
            .sc-update-actions {
                display: flex; justify-content: space-between; align-items: center; margin-top: 20px;
            }
            .sc-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; }
            .sc-btn-primary { background: #2196F3; color: white; }
            .sc-btn-link { background: transparent; color: ${dUp ? '#aaa' : '#999'}; text-decoration: underline; padding: 8px 0; }
            .sc-btn-link:hover { color: ${dUp ? '#ccc' : '#666'}; }
        `;
        document.head.appendChild(style);

        // 2. HTML 结构
        const toast = document.createElement('div');
        toast.className = 'sc-update-toast';
        toast.innerHTML = `
            <div class="sc-update-close" id="sc-close" title="暂时关闭">&times;</div>
            <div class="sc-update-header" id="sc-title">自动计算最大时利润插件 发现新版本 v${version} (点击查看)</div>
            <div class="sc-update-body">
                <p style="margin:0; font-weight:bold;">更新日志：</p>
                <div class="sc-changelog-box">${changelog.replace(/\n/g, '<br>') || '修复已知问题，优化性能。'}</div>
                <p style="font-size: 11px; color: ${dUp ? '#aaa' : '#999'}; margin: 10px 0;">
                    提示：忽略后将不再提示此版本。
                </p>
                <div class="sc-update-actions">
                    <button class="sc-btn sc-btn-link" id="sc-ignore-forever">忽略此次更新</button>
                    <button class="sc-btn sc-btn-primary" id="sc-confirm">前往更新</button>
                </div>
            </div>
        `;
        document.body.appendChild(toast);

        // 3. 入场
        setTimeout(() => toast.classList.add('show'), 100);

        // 4. 交互逻辑

        // 点击展开
        toast.onclick = (e) => {
            if (!toast.classList.contains('expanded')) {
                toast.classList.add('expanded');
                document.getElementById('sc-title').innerHTML = `自动计算最大时利润插件 新版本：v${version}`;
            }
        };

        // 右上角关闭：仅仅是本次消失
        document.getElementById('sc-close').onclick = (e) => {
            e.stopPropagation();
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        };

        // 左下角：忽略此版本
        document.getElementById('sc-ignore-forever').onclick = (e) => {
            e.stopPropagation();
            localStorage.setItem('sc_ignored_version', version);
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        };

        // 右下角：去更新
        document.getElementById('sc-confirm').onclick = (e) => {
            e.stopPropagation();
            window.open(downloadUrl, '_blank');
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        };
    }

    function checkUpdate() {
        const scriptUrl = 'https://sc.22-7.top/scripts/autoMaxPPHPL.user.js?t=' + Date.now();
        const downloadUrl = 'https://sc.22-7.top/scripts/autoMaxPPHPL.user.js';
        // @changelog    修复因用时太短导致的工资计算误差提前中断时利润遍历问题

        fetch(scriptUrl)
            .then(res => res.text())
            .then(remoteText => {
                const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
                const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
                if (!matchVersion) return;

                latestVersion = matchVersion[1]; // 确保全局变量被更新

                const changeLog = matchChange ? matchChange[1] : '';

                // 1. 首先进行版本比较
                const isNewer = compareVersions(latestVersion, localVersion) > 0;

                // 2. 只有确实有新版本时，才将 hasNewVersion 设为 true
                if (isNewer) {
                    hasNewVersion = true; // 恢复你的原有逻辑
                    console.log(`📢 发现新版本 v${latestVersion}`);

                    // 3. 检查是否被用户手动忽略过
                    const ignoredVersion = localStorage.getItem('sc_ignored_version');
                    if (ignoredVersion && compareVersions(ignoredVersion, latestVersion) >= 0) {
                        console.log(`[Update] 用户已忽略此版本，不弹出 UI 提示`);
                        return;
                    }

                    // 4. 如果没有被忽略，则弹出 UI 提示
                    showUpdateToast(latestVersion, changeLog, downloadUrl);
                } else {
                    hasNewVersion = false;
                    console.log("✅ 当前已是最新版本");
                }
            })
            .catch(err => {
                console.error('检查更新失败', err);
                hasNewVersion = false; // 失败时默认为 false
            });
    }

    // 延迟执行，避开页面初始加载高峰
    setTimeout(checkUpdate, 3000);
})();
