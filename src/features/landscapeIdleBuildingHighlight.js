import { getRealmIdFromLink } from '../core/storage.js';

    const LandscapeIdleBuildingHighlight = (function () {
        const EXCLUDED_KINDS = ['n', 'y', '3', '4', '5'];

        // 获取当前领域的建筑数据
        function getBuildingsData() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return null;
            try {
                const raw = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
                if (!raw) return null;
                const data = JSON.parse(raw);
                return data.buildings || null;
            } catch (e) {
                return null;
            }
        }

        function processBuildings() {
            // 离开景观页面则停止
            if (!/\/landscape\/?$/.test(location.href)) return;
            // 检查功能开关
            if (typeof window.isPageModuleEnabled === 'function' && !window.isPageModuleEnabled('landscapeHighlight')) {
                return;
            }

            const excludedKinds = EXCLUDED_KINDS;
            const buildingsData = getBuildingsData();
            const links = document.querySelectorAll('a[href*="/b/"]');
            if (links.length === 0) {
                setTimeout(processBuildings, 1000);
                return;
            }

            links.forEach((link, index) => {
                let buildingKind = null;
                let kindSource = '';

                // 1. 尝试从 class 中提取 test-building-X（支持字母数字）
                const classMatch = link.className.match(/test-building-([A-Za-z0-9])/);
                if (classMatch) {
                    buildingKind = classMatch[1];
                    kindSource = 'class';
                } else {
                    // 2. 从 href 提取建筑 ID，到 buildingsData 中查找 kind
                    const hrefMatch = link.href.match(/\/b\/(\d+)\/?/);
                    if (hrefMatch && buildingsData) {
                        const buildingId = parseInt(hrefMatch[1], 10);
                        const bData = buildingsData.find(b => b.id === buildingId);
                        if (bData) {
                            buildingKind = bData.kind;
                            kindSource = 'data';
                        }
                    }
                }

                if (!buildingKind) {
                    return;
                }

                // 检查是否在排除列表中（严格区分大小写）
                const isExcluded = excludedKinds.includes(buildingKind);
                if (isExcluded) return;

                // 查找包含 "lvl 数字" 文本的 span（只在 a 标签自身内部搜索，避免误判其他建筑）
                const lvlSpan = Array.from(link.querySelectorAll('span')).find(span => /lvl\s+\d+/i.test(span.textContent));
                if (lvlSpan) {
                    const spanParent = lvlSpan.parentElement;
                    if (spanParent) {
                        Array.from(spanParent.children).forEach(child => {
                            if (child.tagName === 'SPAN') {
                                child.dataset.scLandscapeHighlight = 'true';
                                child.style.backgroundColor = '#FFEB3B';
                                child.style.color = '#333';
                                child.style.padding = '1px 4px';
                                child.style.borderRadius = '3px';
                                child.style.fontWeight = 'bold';
                            }
                        });
                    }
                } else {

                }
            });
        }

        // 清除已有的高亮
        function clearHighlights() {
            document.querySelectorAll('[data-sc-landscape-highlight]').forEach(el => {
                el.style.backgroundColor = '';
                el.style.color = '';
                el.style.padding = '';
                el.style.borderRadius = '';
                el.style.fontWeight = '';
                delete el.dataset.scLandscapeHighlight;
            });
        }

        function init() {
            if (!/\/landscape\/?$/.test(location.href)) return;
            // 延迟处理等待 DOM 就绪
            setTimeout(processBuildings, 500);
        }

        return { init };
    })();

    // ======================

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.LandscapeIdleBuildingHighlight = LandscapeIdleBuildingHighlight;