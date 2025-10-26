// ==UserScript==
// @name         SC背景图案替换+换回旧建筑图案
// @namespace    https://github.com/gangbaRuby
// @version      1.0.0
// @license      AGPL-3.0
// @description  在商店计算自动计算最大时利润，在合同、交易所展示最大时利润
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.js
// @downloadURL  https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.js
// ==/UserScript==

(function () {
    'use strict';

    // ======= 配置说明 =======
    // 左边为新图案，右边为旧图案。可通过注释实现单独控制某建筑使用新图案。
    // ======= 配置说明 =======
    const IMG_MAP = {
        // 农场（01对应1级，02对应2级，03对应3级，04对应6级）
        "farm_tier01.png": "plantation-lvl1.png",
        "farm_tier02.png": "plantation-lvl2.png",
        "farm_tier03.png": "plantation-lvl2.png",
        "farm_tier04.png": "plantation-lvl3.png",
        // 水库（01对应1级，02对应2级，03对应3级，04对应6级）
        "water_reservoir_tier01.png": "reservoir-lvl1.png",
        "water_reservoir_tier02.png": "reservoir-lvl1.png",
        "water_reservoir_tier03.png": "reservoir-lvl1.png",
        "water_reservoir_tier04.png": "reservoir-lvl2.png",
        // 电厂（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "power_plant_tier01.png": "powerplant-lvl1.png",
        "power_plant_tier02.png": "powerplant-lvl1.png",
        "power_plant_tier03.png": "powerplant-lvl1.png",
        "power_plant_tier04.png": "powerplant-lvl2.png",
        "power_plant_tier05.png": "powerplant-lvl2.png",
        "power_plant_tier06.png": "powerplant-lvl2.png",
        // 油井（01对应1级，02对应2级，03对应3级，04对应6级）
        "oil_rig_tier01.png": "oilrig-lvl1.png",
        "oil_rig_tier02.png": "oilrig-lvl1.png",
        "oil_rig_tier03.png": "oilrig-lvl1.png",
        "oil_rig_tier04.png": "oilrig-lvl2.png",
        // 炼油厂（01对应1级，02对应2级，03对应3级，04对应6级）
        "refinery_tier01.png": "refinery-lvl1.png",
        "refinery_tier02.png": "refinery-lvl1.png",
        "refinery_tier03.png": "refinery-lvl1.png",
        "refinery_tier04.png": "refinery-lvl2.png",
        // 运输站（01对应1级，02对应2级，03对应3级，04对应6级）
        "shipping_depot_tier01.png": "shipping-lvl1.png",
        "shipping_depot_tier02.png": "shipping-lvl1.png",
        "shipping_depot_tier03.png": "shipping-lvl1.png",
        "shipping_depot_tier04.png": "shipping-lvl2.png",
        // 生鲜商店（01对应1级，02对应2级，03对应3级，04对应6级）
        "grocery_store_idle_tier01": "grocery2-lvl1.png",
        "grocery_store_idle_tier02": "grocery2-lvl2.png",
        "grocery_store_idle_tier03": "grocery2-lvl2.png",
        "grocery_store_idle_tier04": "grocery2-lvl3.png",
        // 加油站（01对应1级，02对应2级，03对应3级，04对应6级）
        "gas_station_tier01.png": "gasstation-lvl1.png",
        "gas_station_tier02.png": "gasstation-lvl1.png",
        "gas_station_tier03.png": "gasstation-lvl1.png",
        "gas_station_tier04.png": "gasstation-lvl2.png",
        // 牧场（01对应1级，02对应2级，03对应3级，04对应6级）
        "ranch_tier01.png": "farm-lvl1.png",
        "ranch_tier02.png": "farm-lvl1.png",
        "ranch_tier03.png": "farm-lvl1.png",
        "ranch_tier04.png": "farm-lvl2.png",
        // 矿井（01对应1级，02对应2级，03对应3级，04对应6级）
        "mine_tier01.png": "mine-lvl1.png",
        "mine_tier02.png": "mine-lvl1.png",
        "mine_tier03.png": "mine-lvl1.png",
        "mine_tier04.png": "mine-lvl1.png",
        // 材料加工厂（01对应1级，02对应2级，03对应3级，04对应6级）
        "factory_tier01.png": "factory-lvl1.png",
        "factory_tier02.png": "factory-lvl1.png",
        "factory_tier03.png": "factory-lvl1.png",
        "factory_tier04.png": "factory-lvl1.png",
        // 大楼（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "sales_offices_tier01.png": "sales-offices-2-lvl1.png",
        "sales_offices_tier02.png": "sales-offices-2-lvl1.png",
        "sales_offices_tier03.png": "sales-offices-2-lvl2.png",
        "sales_offices_tier04.png": "sales-offices-2-lvl2.png",
        "sales_offices_tier05.png": "sales-offices-2-lvl3.png",
        "sales_offices_tier06.png": "sales-offices-2-lvl3.png",
        // 采石场（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "quarry_tier01.png": "quarry-lvl1.png",
        "quarry_tier02.png": "quarry-lvl2.png",
        "quarry_tier03.png": "quarry-lvl2.png",
        "quarry_tier04.png": "quarry-lvl3.png",
        "quarry_tier05.png": "quarry-lvl3.png",
        "quarry_tier06.png": "quarry-lvl4.png",
        // 饮料工厂（01对应1级，02对应2级，03对应3级，04对应6级）
        "beverage_factory_tier01.png": "beverage-factory-lvl1.png",
        "beverage_factory_tier02.png": "beverage-factory-lvl1.png",
        "beverage_factory_tier03.png": "beverage-factory-lvl2.png",
        "beverage_factory_tier04.png": "beverage-factory-lvl3.png",
        // 万圣节主题
        "concrete-halloween-0000.png": "concrete-0000.png",
        "concrete-halloween-0001.png": "concrete-0001.png",
        "concrete-halloween-0010.png": "concrete-0010.png",
        "concrete-halloween-0011.png": "concrete-0011.png",
        "concrete-halloween-0100.png": "concrete-0100.png",
        "concrete-halloween-0110.png": "concrete-0110.png",
        "concrete-halloween-1000.png": "concrete-1000.png",
        "concrete-halloween-1001.png": "concrete-1001.png",
        "concrete-halloween-1100.png": "concrete-1100.png",
        "concrete-halloween-1111.png": "concrete-1111.png",
        // 起重机
        "construction_overlay_04_back.png": "",
        "construction_overlay_04_front.png": "",
        "construction_overlay_04_front_crane_arm.png": "",
        "construction_overlay_05_back.png": "",
        "construction_overlay_05_front.png": "",
        "construction_overlay_05_front_crane_arm.png": "",
        "construction_overlay_06_back.png": "",
        "construction_overlay_06_front.png": "",
        "construction_overlay_06_front_crane_arm.png": "",
        // 交易所
        "exchange_tier01.png": "exchange.png",
        "exchange_tier02.png": "exchange.png",
        "exchange_tier03.png": "exchange.png",
        "exchange_tier04.png": "exchange.png",
        "exchange_tier05.png": "exchange.png",
        "exchange_tier06.png": "exchange.png",
        "exchange_tier07.png": "exchange.png",
        "exchange_tier08.png": "exchange.png",
        "exchange_tier09.png": "exchange.png",
        "exchange_tier10.png": "exchange.png",
        "exchange_tier11.png": "exchange.png",
        "exchange_tier12.png": "exchange.png",
        "exchange_tier13.png": "exchange.png",
        "exchange_tier14.png": "exchange.png",
        "exchange_tier15.png": "exchange.png",
        "exchange_tier16.png": "exchange.png",
        "exchange_tier17.png": "exchange.png",
        "exchange_tier18.png": "exchange.png",
        // 默认总部(目前有问题)
        // "hq_tier01.png": "hq-lvl1.png",
        // "hq_tier02.png": "hq-lvl2.png",
        // "hq_tier03.png": "hq-lvl3.png",
        // "hq_tier04.png": "hq-lvl4.png",
        // "hq_tier05.png": "hq-lvl5.png",
        // "hq_tier06.png": "hq-lvl6.png",
        // "hq_tier07.png": "hq-lvl7.png",
        // "hq_tier08.png": "hq-lvl8.png",
        // "hq_tier09.png": "hq-lvl9.png",
        // "hq_tier10.png": "hq-lvl10.png",
        // "hq_tier11.png": "hq-lvl10.png",
        // "hq_tier12.png": "hq-lvl11.png",
        // "hq_tier13.png": "hq-lvl12.png",
        // "hq_tier14.png": "hq-lvl14.png",
        // "hq_tier15.png": "hq-lvl15.png",
        // "hq_tier16.png": "hq-lvl-high.png",
        // "hq_tier17.png": "hq-lvl-high.png",
        // "hq_tier18.png": "hq-lvl-high.png",
        // "hq_tier19.png": "hq-lvl-high.png",
        // "hq_tier20.png": "hq-lvl-high.png",
        // "hq_tier21.png": "hq-lvl-high.png",
        // "hq_tier22.png": "hq-lvl-high.png",
        // "hq_contract_lorry_blue_white.png": "truck2.png", // 货车大小存在问题
        // 待解锁地块
        "residential_02.png": "residential21.png",
        "forrest_02.png": "residential31.png",
        "forrest_03.png": "residential4.png",
        "residential_01.png": "residential11.png",
        "park_01.png": "park.png",
        "construction_slot_01.png": "empty.png",
        "construction_slot_02.png": "empty2.png",
        "forrest_04.png": "trees.png",
        "town_square_01.png": "plaza.png",
    };
    const BASE_URL = 'https://simcompanies-scripts.pages.dev/image_cache/';
    const AUTH_URL = '/api/v3/companies/auth-data/';
    const THEME_KEY = 'SC_USER_THEME';
    const PART_KEYS = Array.from({ length: 14 }, (_, i) => `SC_IMG_PART_${i + 1}`);

    // ===== 图片管理 (IndexedDB 版本) =====
    const ImageManager = {
        index: null,
        loadedParts: new Map(),
        db: null,

        async openDB() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('SCImagesDB', 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('images')) {
                        db.createObjectStore('images');
                    }
                };
                request.onsuccess = () => { this.db = request.result; resolve(this.db); };
                request.onerror = () => reject(request.error);
            });
        },

        async getFromDB(key) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('images', 'readonly');
                const req = tx.objectStore('images').get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        },

        async setToDB(key, value) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('images', 'readwrite');
                const req = tx.objectStore('images').put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        },

        async init() {
            if (this.index) return;

            // 1️⃣ 先加载索引
            const cachedIndex = await this.getFromDB('SC_IMG_INDEX');
            if (cachedIndex) {
                this.index = JSON.parse(cachedIndex);
                // console.log('[图片管理] 从 IndexedDB 加载索引', this.index);
            } else {
                // console.log('[图片管理] 正在获取 img_index.json...');
                try {
                    const res = await fetch(BASE_URL + 'img_index.json');
                    this.index = await res.json();
                    await this.setToDB('SC_IMG_INDEX', JSON.stringify(this.index));
                    // console.log('[图片管理] 获取到索引', this.index);
                } catch (e) {
                    console.error('[图片管理] 获取索引失败', e);
                    this.index = { map: {} };
                }
            }

            // 2️⃣ 加载所有分块
            for (const partKey of PART_KEYS) {
                let json = null;
                const cachedPart = await this.getFromDB(partKey);
                if (cachedPart) {
                    try {
                        json = JSON.parse(cachedPart);
                        // console.log(`[图片管理] 分块 ${partKey} 从 IndexedDB 加载`);
                    } catch { }
                }

                if (!json) {
                    try {
                        const fileName = partKey.replace(/^SC_/, '').toLowerCase() + '.json';
                        // console.log(`[图片管理] 正在获取分块 ${partKey}...`);
                        const res = await fetch(BASE_URL + fileName);
                        json = await res.json();
                        try { await this.setToDB(partKey, JSON.stringify(json)); } catch (e) { console.warn(`[图片管理] IndexedDB 保存 ${partKey} 失败`, e); }
                        // console.log(`[图片管理] 获取分块 ${partKey} 成功`);
                    } catch (e) {
                        console.error(`[图片管理] 获取分块 ${partKey} 失败`, e);
                        json = {};
                    }
                }

                this.loadedParts.set(partKey, json);
            }
        },

        async getImage(name) {
            await this.init();

            const partKey = this.index?.map?.[name];
            if (partKey && this.loadedParts.has(partKey)) {
                const partData = this.loadedParts.get(partKey);
                if (partData[name]) return partData[name];
            }

            for (const [key, partData] of this.loadedParts.entries()) {
                if (partData[name]) return partData[name];
            }

            console.warn(`[图片管理] ${name} 在任何分块中都未找到`);
            return null;
        }
    };

    // ===== 背景替换 =====
    function injectCss(base64) {
        const styleId = 'gm-bg-replace-style';
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            (document.head || document.documentElement).appendChild(style);
        }

        // 检查是否是 /landscape/buildings/数字/ 页面
        const isBuildingDetail = /\/landscape\/buildings\/\d+\/?$/.test(location.pathname);

        // 如果是建筑详情页：保持原样（不加背景图）
        if (isBuildingDetail) {
            style.textContent = `
      #page, #page::before, #page::after {
        background-image: none !important;
        background-color: inherit !important;
      }`;
            // console.log('[主题] 检测到建筑详情页，保持默认背景');
        }
        // 否则正常替换背景
        else {
            style.textContent = `
      #page, #page::before, #page::after {
        background-image: url("${base64}") !important;
      }`;
        }
    }

    async function applyThemeFromData(data) {
        const theme = data?.preferences?.theme || 'Light';
        const cachedTheme = localStorage.getItem(THEME_KEY);
        if (cachedTheme === theme) return;
        localStorage.setItem(THEME_KEY, theme);

        const imgName = theme === 'Dark' ? 'background-dark.png' : 'background.png';
        const base64 = await ImageManager.getImage(imgName);
        if (base64) {
            // console.log(`[主题] 应用 ${theme} 主题，使用图片 ${imgName}`);
            injectCss(base64);
        } else console.warn(`[主题] 获取图片 ${imgName} 失败`);
    }

    (async () => {
        const cachedTheme = localStorage.getItem(THEME_KEY);
        if (cachedTheme) {
            const imgName = cachedTheme === 'Dark' ? 'background-dark.png' : 'background.png';
            const base64 = await ImageManager.getImage(imgName);
            if (base64) injectCss(base64);
        }
    })();

    // ===== <img> 替换 =====
    async function replaceImgElement(img) {
        if (!img.src) return;
        if (img.dataset.scReplaced) return; // 已替换

        for (const baseName in IMG_MAP) {
            // 匹配 baseName + 可选 _tierN + .任意哈希.png
            const regex = new RegExp(`${baseName.replace('.png', '')}(\\.[a-f0-9]+)?\\.png$`);
            if (img.src.match(regex)) {
                const newName = IMG_MAP[baseName];

                if (newName === '') {  // 空字符串表示不显示
                    img.src = '';
                    img.dataset.scReplaced = '1';
                    // console.log(`[图片替换] ${baseName} 已替换为空`);
                } else {
                    const base64 = await ImageManager.getImage(newName);
                    if (base64) {
                        img.src = base64;
                        img.dataset.scReplaced = '1';
                        // console.log(`[图片替换] 已成功将 ${baseName} 替换为 Base64`);
                    } else {
                        console.warn(`[图片替换] 获取 ${newName} 的 Base64 失败`);
                    }
                }

                break;
            }
        }
    }


    async function replaceAllImgs(root = document) {
        const imgs = root.querySelectorAll('img');
        for (const img of imgs) replaceImgElement(img);
    }

    replaceAllImgs();

    // ===== 扫描 <div> 并隐藏指定背景 =====
    function replaceDivBackground(div) {
        const style = div.style;
        if (!style || !style.backgroundImage) return;

        // 判断是否是动画背景，这里示例只隐藏 construction_overlay
        if (style.backgroundImage.includes('construction_overlay')) {
            style.backgroundImage = 'none';
            // console.log('[背景替换] 动画背景已隐藏');
        }
    }

    // 扫描已有 <div> 节点
    function replaceAllDivs(root = document) {
        const divs = root.querySelectorAll('div');
        for (const div of divs) replaceDivBackground(div);
    }

    // ===== MutationObserver：监听新增节点和属性变化 =====
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;

                if (node.tagName === 'IMG') replaceImgElement(node);
                else replaceAllImgs(node);

                if (node.tagName === 'DIV') replaceDivBackground(node);
                else replaceAllDivs(node);
            }

            // 属性变化监听（针对动画样式）
            if (m.type === 'attributes' && m.target.tagName === 'DIV' && m.attributeName === 'style') {
                replaceDivBackground(m.target);
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style']
    });

    // 定时扫描，确保动画节点和延迟加载元素也被捕获
    setInterval(() => {
        replaceAllImgs();
        replaceAllDivs();
    }, 1500);

    // ===== 监听 URL 变化（处理 SPA 内导航）=====
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // console.log('[主题] URL 变化 → 重新应用背景');

            // 重新获取主题设置并应用
            const cachedTheme = localStorage.getItem(THEME_KEY);
            if (cachedTheme) {
                const imgName = cachedTheme === 'Dark' ? 'background-dark.png' : 'background.png';
                ImageManager.getImage(imgName).then(base64 => {
                    if (base64) injectCss(base64);
                });
            }
        }
    });
    urlObserver.observe(document, { childList: true, subtree: true });



    // ===== Hook fetch/XHR 拦截 theme =====
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        try {
            if (typeof args[0] === 'string' && args[0].includes(AUTH_URL)) {
                response.clone().json().then(applyThemeFromData).catch(() => { });
            }
        } catch { }
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url, async) {
        this.addEventListener('load', function () {
            if (url && url.includes(AUTH_URL) && this.responseText) {
                try { applyThemeFromData(JSON.parse(this.responseText)); } catch { }
            }
        });
        return originalXHR.apply(this, arguments);
    };


    // ======================
    // 检测更新
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

    function checkUpdate() {
        const scriptUrl = 'https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.js?t=' + Date.now();
        const downloadUrl = 'https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.js';
        // @changelog    SC背景图案替换+换回旧建筑图案

        fetch(scriptUrl)
            .then(res => {
                if (!res.ok) throw new Error('获取失败');
                return res.text();
            })
            .then(remoteText => {
                const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
                const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
                if (!matchVersion) return;

                latestVersion = matchVersion[1];
                const changeLog = matchChange ? matchChange[1] : '';

                if (compareVersions(latestVersion, localVersion) > 0) {
                    // console.log(`📢 检测到新版本 v${latestVersion}`);
                    if (confirm(`SC背景图案替换+换回旧建筑图案插件检测到新版本 v${latestVersion}，是否前往更新？\n\nv${latestVersion} ${changeLog}\n\n关于版本号说明 1.X.Y ，X为增添新功能或修复不可用，Y为细节修改不影响功能，如不需更新可将Y或其它位置修改为较大值。`)) {
                        window.open(downloadUrl, '_blank');
                    }
                    hasNewVersion = true;
                } else {
                    // console.log("✅ 当前已是最新版本");
                    hasNewVersion = false;
                }
            })
            .catch(err => {
                console.warn('检查更新失败：', err);
            });
    }

    setTimeout(checkUpdate, 3000);


})();