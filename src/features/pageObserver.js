const ResourceMarketHandler = { init: (...args) => window.SC_Modules?.ResourceMarketHandler?.init(...args) };
const incomingContractsHandler = { init: (...args) => window.SC_Modules?.incomingContractsHandler?.init(...args) };
const outgoingContractMPHandler = { init: (...args) => window.SC_Modules?.outgoingContractMPHandler?.init(...args) };
const ExecutiveTrainingModule = { init: (...args) => window.SC_Modules?.ExecutiveTrainingModule?.init(...args) };
const FormerExecutivesModule = { forceInject: (...args) => window.SC_Modules?.FormerExecutivesModule?.forceInject(...args) };
const LandscapeIdleBuildingHighlight = { init: (...args) => window.SC_Modules?.LandscapeIdleBuildingHighlight?.init(...args) };
const RestaurantStockReminder = { init: (...args) => window.SC_Modules?.RestaurantStockReminder?.init(...args) };
    // 模块9：判断当前页面
    // ======================
    (function () {
        const PAGE_ACTIONS = {
            marketPage: { //交易所页面
                pattern: /^https:\/\/www\.simcompanies\.com(?:\/[^\/]+)?\/market\/resource\/(\d+)\/?$/,
                action: (url) => {
                    if (!isPageModuleEnabled('marketProfit')) return;

                    const match = url.match(/\/resource\/(\d+)\/?/);
                    const resourceId = match ? match[1] : null;
                    if (resourceId) {
                        // console.log('进入 market 页面，资源ID：', resourceId);
                        ResourceMarketHandler.init(resourceId);
                    }
                }
            },
            contractPage: { //合同页面
                pattern: /^https:\/\/www\.simcompanies\.com(?:\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/,
                action: (url) => {
                    if (!isPageModuleEnabled('contractProfit')) return;

                    // console.log('[合同页面识别] 已进入合同页面');
                    incomingContractsHandler.init();
                }
            },
            outgoingContractPage: { //出库合同/出售页面
                pattern: /^https:\/\/www\.simcompanies\.com(?:\/[a-z-]+)?\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/,
                action: (url) => {
                    if (!isPageModuleEnabled('outgoingMP')) return;
                    outgoingContractMPHandler.init();
                }
            },
            executivePage: { //高管挖人
                pattern: /\/executives\/([a-z0-9-]+)\/?$/,
                action: (url) => {
                    if (!isPageModuleEnabled('executiveHistory')) return;

                    const match = url.match(/\/executives\/([a-z0-9-]+)\/?$/);
                    const slotCode = match ? match[1] : null;
                    if (slotCode) {
                        // 使用 setTimeout 是为了等待 .css-1flj9lk 元素渲染出来
                        setTimeout(() => {
                            ExecutiveTrainingModule.init(slotCode);
                        }, 400);
                    }
                }
            },
            formerExecutivesPage: { //前任高管
                pattern: /\/headquarters\/executives\/?$/,
                action: (url) => {

                    if (!isPageModuleEnabled('formerExecEnhance')) return;

                    setTimeout(() => {
                        if (typeof FormerExecutivesModule.forceInject === 'function') {
                            FormerExecutivesModule.forceInject();
                        }
                    }, 500);
                }
            },
            buildingPage: { //建筑页面
                pattern: /\/b\/\d+\/?$/,
                action: () => {
                    RestaurantStockReminder.init();
                    // 多级重试：确保在 SPA 页面切换后 DOM 完全渲染时能注入按钮
                    // 单次 300ms 延迟有时不足以等待 React 渲染完成
                    const tryInit = (delay, retriesLeft) => {
                        setTimeout(() => {
                            if (!/\/b\/\d+\/?$/.test(location.href)) return;
                            if (typeof window.initAutoAmountButtons === 'function') {
                                window.initAutoAmountButtons();
                            }
                            if (typeof window.initAutoPricing === 'function') {
                                window.initAutoPricing();
                            }
                            // 检查是否成功注入了按钮，如果没有则继续重试
                            if (retriesLeft > 0) {
                                setTimeout(() => {
                                    const hasAutoAmount = document.querySelector('[data-custom-amount-added]');
                                    const hasAutoPricing = document.querySelector('[data-auto-pricing-added]');
                                    if (!hasAutoAmount && !hasAutoPricing) {
                                        tryInit(delay * 2, retriesLeft - 1);
                                    }
                                }, 200);
                            }
                        }, delay);
                    };
                    tryInit(300, 3); // 300ms → 600ms → 1200ms → 2400ms
                }
            },
            landscapePage: { //地图页面空闲建筑高亮
                pattern: /\/landscape\/?$/,
                action: () => {
                    setTimeout(() => {
                        LandscapeIdleBuildingHighlight.init();
                    }, 500);
                }
            },
        };

        function handlePage() {
            const url = location.href;
            for (const { pattern, action } of Object.values(PAGE_ACTIONS)) {
                if (pattern.test(url)) {
                    action(url);
                    return;
                }
            }
        }

        let lastUrl = '';
        const observer = new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                handlePage();
            }
        });
        observer.observe(document, { subtree: true, childList: true });

        // 延迟到所有模块初始化完成后再触发
        setTimeout(handlePage, 0);
    })();
