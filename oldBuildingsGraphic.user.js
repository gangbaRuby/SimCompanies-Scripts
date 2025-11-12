// ==UserScript==
// @name         SC背景图案替换+换回旧建筑图案
// @namespace    https://github.com/gangbaRuby
// @version      1.5.0
// @license      AGPL-3.0
// @description  SC背景图案替换+换回旧建筑图案
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.user.js
// @downloadURL  https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.user.js
// ==/UserScript==

(function () {
    'use strict';
    let hasNewVersion, latestVersion;
    let localVersion = GM_info.script.version;

    // ======= 配置说明 =======
    // 左边为新图案，右边为旧图案。可通过注释实现单独控制某建筑使用新图案。
    // ======= 配置说明 =======
    const IMG_MAP = {
        // 农场（01对应1级，02对应2级，03对应3级，04对应6级）
        "farm_tier01.png": "plantation-lvl1.png",
        "farm_tier02.png": "plantation-lvl2.png",
        "farm_tier03.png": "plantation-lvl2.png",
        "farm_tier04.png": "plantation-lvl3.png",
        // 水库（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "water_reservoir_tier01.png": "reservoir-lvl1.png",
        "water_reservoir_tier02.png": "reservoir-lvl1.png",
        "water_reservoir_tier03.png": "reservoir-lvl1.png",
        "water_reservoir_tier04.png": "reservoir-lvl2.png",
        "water_reservoir_tier05.png": "reservoir-lvl2.png",
        "water_reservoir_tier06.png": "reservoir-lvl2.png",
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
        // 生鲜商店（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "grocery_store_idle_tier01": "grocery2-lvl1.png",
        "grocery_store_idle_tier02": "grocery2-lvl1.png",
        "grocery_store_idle_tier03": "grocery2-lvl2.png",
        "grocery_store_idle_tier04": "grocery2-lvl2.png",
        "grocery_store_idle_tier05": "grocery2-lvl3.png",
        "grocery_store_idle_tier06": "grocery2-lvl3.png",
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
        // 机库（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "hangar_tier01.png": "horizontal-integration-lvl1.png",
        "hangar_tier02.png": "horizontal-integration-lvl1.png",
        "hangar_tier03.png": "horizontal-integration-lvl2.png",
        "hangar_tier04.png": "horizontal-integration-lvl2.png",
        "hangar_tier05.png": "horizontal-integration-lvl3.png",
        "hangar_tier06.png": "horizontal-integration-lvl3.png",
        // 推进器工厂（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "propulsion_factory_tier01.png": "propulsion-2-lvl1.png",
        "propulsion_factory_tier02.png": "propulsion-2-lvl1.png",
        "propulsion_factory_tier03.png": "propulsion-2-lvl2.png",
        "propulsion_factory_tier04.png": "propulsion-2-lvl2.png",
        "propulsion_factory_tier05.png": "propulsion-2-lvl3.png",
        "propulsion_factory_tier06.png": "propulsion-2-lvl3.png",
        // 航空航天厂（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "aerospace_factory_tier01.png": "aerospace-2-lvl1.png",
        "aerospace_factory_tier02.png": "aerospace-2-lvl1.png",
        "aerospace_factory_tier03.png": "aerospace-2-lvl2.png",
        "aerospace_factory_tier04.png": "aerospace-2-lvl2.png",
        "aerospace_factory_tier05.png": "aerospace-2-lvl3.png",
        "aerospace_factory_tier06.png": "aerospace-2-lvl3.png",
        // 航空电子器件厂（01对应1级，02对应2级，03对应3级，04对应6级,05对应10级，06对应15级）
        "aerospace_electronics_tier01.png": "aero-electronics-2-lvl1.png",
        "aerospace_electronics_tier02.png": "aero-electronics-2-lvl1.png",
        "aerospace_electronics_tier03.png": "aero-electronics-2-lvl2.png",
        "aerospace_electronics_tier04.png": "aero-electronics-2-lvl2.png",
        "aerospace_electronics_tier05.png": "aero-electronics-2-lvl3.png",
        "aerospace_electronics_tier06.png": "aero-electronics-2-lvl3.png",
        // 森林苗圃（01对应1级，02对应2级，03对应3级，04对应6级）
        "forrest_nursery_tier01_back.png": "shed-lvl1.png",
        "forrest_nursery_tier02_back.png": "shed-lvl1.png",
        "forrest_nursery_tier03_back.png": "shed-lvl2.png",
        "forrest_nursery_tier04_back.png": "shed-lvl3.png",
        // 时装研究中心（01对应1级，03对应3级)
        "fashion-research-lvl1.png": "fashion-research-lvl1.png",
        "fashion-research-lvl3.png": "fashion-research-lvl3.png",
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
        // ... (省略其他总部配置)
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
    const CACHE_KEY_REPLACEMENT = 'SC_REPLACEMENT_CACHE'; // 新增的替换图片缓存 Key

    // ===== 图片管理 (IndexedDB 版本) =====
    // 注意：这里的 ImageManager 代码已非常完善，它管理着图片索引和分块的缓存。
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

        // 新增的辅助函数：获取当前图片索引版本号
        getImgIndexVersion() {
            return this.index?.version || 0;
        },

        async init() {
            if (this.index) return;

            // ... (ImageManager.init 的核心逻辑，保持不变) ...
            // 1️⃣ 获取远程 img_index.json
            let remoteIndex = null;
            try {
                const res = await fetch(BASE_URL + 'img_index.json');
                remoteIndex = await res.json();
            } catch (e) {
                console.error('[图片管理] 获取远程索引失败', e);
                remoteIndex = { version: 0, map: {} };
            }

            // 2️⃣ 获取本地索引
            let localIndex = null;
            try {
                const cached = await this.getFromDB('SC_IMG_INDEX');
                localIndex = cached ? JSON.parse(cached) : null;
            } catch { localIndex = null; }

            // 3️⃣ 判断是否需要更新
            const needUpdate = !localIndex || localIndex.version !== remoteIndex.version;

            if (needUpdate) {
                console.log('[图片管理] 索引版本不同或首次初始化，开始刷新所有分块');

                // 清空 IndexedDB
                try {
                    const db = await this.openDB();
                    const tx = db.transaction('images', 'readwrite');
                    tx.objectStore('images').clear();
                    await new Promise(res => tx.oncomplete = res);
                } catch (e) { console.warn('[图片管理] 清空 IndexedDB 失败', e); }

                // 保存最新索引
                await this.setToDB('SC_IMG_INDEX', JSON.stringify(remoteIndex));
            }

            this.index = remoteIndex;

            // 4️⃣ 加载所有分块
            const parts = Object.values(remoteIndex.map);
            const maxPart = Math.max(...parts.map(k => parseInt(k.match(/\d+$/)[0])));

            for (let i = 1; i <= maxPart; i++) {
                const partKey = `SC_IMG_PART_${i}`;
                let json = null;

                if (!needUpdate) {
                    // 尝试从 IndexedDB 读取
                    try {
                        const cachedPart = await this.getFromDB(partKey);
                        if (cachedPart) json = JSON.parse(cachedPart);
                    } catch { json = null; }
                }

                // 缓存不存在或需要更新 → 从远程拉取
                if (!json) {
                    try {
                        const fileName = `img_part_${i}.json`;
                        const res = await fetch(BASE_URL + fileName);
                        json = await res.json();
                        try { await this.setToDB(partKey, JSON.stringify(json)); } catch (e) {
                            console.warn(`[图片管理] 保存分块 ${partKey} 失败`, e);
                        }
                    } catch (e) {
                        console.error(`[图片管理] 获取分块 ${partKey} 失败`, e);
                        json = {};
                    }
                }

                this.loadedParts.set(partKey, json);
            }

            // console.log('[图片管理] 分块加载完成');
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
    // ===================================


    // ===== 背景替换 (主题) =====
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

    // ===================================
    // [新] CSS 背景替换逻辑 (带缓存)
    // ===================================

    // 1. 创建一个同步的、预加载的缓存
    const newImgCache = new Map();

    /**
     * [优化] 使用 IndexedDB 获取或创建 Base64 缓存
     */
    async function getOrCreateReplacementCache() {
        // 确保 ImageManager 已经初始化，这样我们才能获取版本号和使用 DB
        await ImageManager.init();

        const CURRENT_IMG_VERSION = ImageManager.getImgIndexVersion();
        console.log(`[图片替换] 正在检查替换图片缓存... 当前图片索引版本: ${CURRENT_IMG_VERSION}`);

        // 1. 从 IndexedDB 尝试读取缓存
        let cachedData = null;
        try {
            const cached = await ImageManager.getFromDB(CACHE_KEY_REPLACEMENT);
            if (cached) cachedData = JSON.parse(cached);
        } catch { }

        if (cachedData && cachedData.version === CURRENT_IMG_VERSION) {
            // 1A. 缓存命中：版本匹配，直接加载到内存 Map
            console.log('[图片替换] 缓存命中。正在从 IDB 加载替换数据...');
            for (const [key, base64] of Object.entries(cachedData.data)) {
                newImgCache.set(key, base64);
            }
        } else {
            // 1B. 缓存失效/缺失：版本不匹配，或第一次运行，需要重新预加载
            if (cachedData) {
                console.log(`[图片替换] 缓存失效。缓存版本: ${cachedData.version}`);
            } else {
                console.log('[图片替换] 缓存缺失。正在重新生成替换数据...');
            }

            const newCacheData = {};
            const promises = [];

            // 2. 执行原始的异步预加载逻辑
            for (const newName in IMG_MAP) {
                const oldName = IMG_MAP[newName];
                if (oldName) {
                    promises.push(
                        ImageManager.getImage(oldName).then(base64 => {
                            if (base64) {
                                // 存入内存 Map (newImgCache)
                                newImgCache.set(newName, base64);
                                // 存入新的缓存数据对象 (用于 IndexedDB 存储)
                                newCacheData[newName] = base64;
                            }
                        })
                    );
                }
            }

            await Promise.all(promises);

            // 3. 将新数据和版本号存入 IndexedDB
            const cacheToStore = {
                version: CURRENT_IMG_VERSION,
                data: newCacheData
            };
            try {
                await ImageManager.setToDB(CACHE_KEY_REPLACEMENT, JSON.stringify(cacheToStore));
                console.log(`[图片替换] ${newImgCache.size} 张旧版图片已重新生成并存入缓存!`);
            } catch (e) {
                console.error('[图片替换] 缓存替换数据失败:', e);
            }
        }

        // 无论从缓存加载还是重新生成，最后都执行 CSS 扫描
        replaceCssBackgrounds();
    }


    // ===================================
    // [修正 V4] CSS 规则扫描、Base64 替换与动画移除
    // ===================================

    const OVERLAY_KEYWORDS = [
        //'construction_overlay', // 去掉注释可以关闭起重机显示，保留是因为新UI无法直接看出是否为建造或升级中 
        // 森林苗圃前景
        'forrest_nursery_tier01_front',
        'forrest_nursery_tier02_front',
        'forrest_nursery_tier03_front',
        'forrest_nursery_tier04_front',
        // ... 确保这里包含了所有要移除的关键词 ...
    ];

    /**
     * 辅助函数：根据索引列表移除多值属性中的条目
     * @param {string} originalValue - 原始的多值CSS属性字符串 (e.g., "10px, 20px, 30px")
     * @param {number[]} indicesToRemove - 要移除的索引列表
     * @returns {string} - 清理后的新属性值
     */
    function removeCssEntries(originalValue, indicesToRemove) {
        if (!originalValue) return '';
        // 使用逗号作为分隔符，同时处理可能存在的空格
        const parts = originalValue.split(',').map(s => s.trim());

        // 降序排序，确保移除索引时不会影响后续索引
        indicesToRemove.sort((a, b) => b - a);

        for (const index of indicesToRemove) {
            if (index >= 0 && index < parts.length) {
                parts.splice(index, 1);
            }
        }
        return parts.join(', ');
    }


    /**
     * [修正 V4] CSS 规则扫描、Base64 替换与动画移除
     */
    function replaceCssBackgrounds() {
        const hasReplacementImgs = newImgCache.size > 0;

        for (const sheet of document.styleSheets) {
            try {
                const rules = sheet.cssRules || sheet.rules;
                if (!rules) continue;

                for (const rule of rules) {
                    if (rule.style && rule.style.backgroundImage) {
                        const style = rule.style;
                        const originalBgImage = style.backgroundImage;

                        if (originalBgImage.includes('data:image')) continue;

                        let newBgImage = originalBgImage;
                        const indicesToRemove = new Set(); // 存储要移除的背景图索引
                        let hasReplacedBase64 = false;
                        let hasChanged = false;

                        // 1. 解析原始 background-image 列表
                        // 使用正则匹配所有 url(...)，并保留完整的 URL 字符串用于索引
                        const urlMatches = [...originalBgImage.matchAll(/url\([\"']?([^)]+)[\"']?\)/g)];

                        // --- A. 动画/覆盖层移除逻辑 (找到需要移除的索引) ---
                        urlMatches.forEach((match, index) => {
                            const urlContent = match[1]; // 完整的 URL 路径
                            for (const keyword of OVERLAY_KEYWORDS) {
                                if (urlContent.includes(keyword)) {
                                    indicesToRemove.add(index);
                                    hasChanged = true;
                                    break;
                                }
                            }
                        });

                        // --- B. Base64 替换逻辑 (替换 URL 字符串) ---
                        if (hasReplacementImgs) {
                            for (const [baseName, base64] of newImgCache.entries()) {
                                const baseNameNoExt = baseName.replace('.png', '');

                                // 查找并替换 URL (这里只需要替换 newBgImage 字符串，不需要索引)
                                // 修正后的正则：确保只匹配 BaseName 且不包含已移除的关键词（可选但安全）
                                if (newBgImage.includes(baseNameNoExt)) {
                                    const urlPattern = new RegExp(`url\\([\"']?[^)]*${baseNameNoExt}[^)]*[\"']?\\)`, 'g');
                                    const replacementUrl = `url("${base64}")`;

                                    if (urlPattern.test(newBgImage)) {
                                        newBgImage = newBgImage.replace(urlPattern, replacementUrl);
                                        hasReplacedBase64 = true;
                                        hasChanged = true;
                                    }
                                }
                            }
                        }

                        // --- C. 应用修正后的样式 ---
                        if (hasChanged) {
                            const indicesArray = Array.from(indicesToRemove);

                            // 移除动画对应的条目
                            if (indicesArray.length > 0) {
                                // 移除 background-image 的条目 (通过 BaseName 移除比通过索引更安全)
                                for (const index of indicesArray) {
                                    const urlMatch = urlMatches[index][0]; // 完整的 url(...) 字符串
                                    // 模式：匹配 URL 及其后面跟着的逗号和空格 (如果是中间或开头的条目)
                                    const patternAfter = new RegExp(urlMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,?\\s*', 'g');
                                    newBgImage = newBgImage.replace(patternAfter, '');
                                }

                                // 清理 background-image 字符串的逗号和空格
                                newBgImage = newBgImage.trim().replace(/^,/, '').trim();
                                newBgImage = newBgImage.replace(/,$/, '').trim();

                                // 关键步骤：同步移除其他多值属性的对应条目
                                style.setProperty('background-size', removeCssEntries(style.backgroundSize, indicesArray), 'important');
                                style.setProperty('background-position', removeCssEntries(style.backgroundPosition, indicesArray), 'important');
                                style.setProperty('background-repeat', removeCssEntries(style.backgroundRepeat, indicesArray), 'important');
                            }

                            // 最终应用 background-image
                            if (newBgImage === '' || newBgImage === 'none') {
                                style.setProperty('background-image', 'none', 'important');
                            } else {
                                style.setProperty('background-image', newBgImage, 'important');
                            }
                        }
                    }
                }
            } catch (e) {
                if (e.name !== 'SecurityError') {
                    console.warn('[图片替换] 扫描CSS时出错:', sheet.href, e.message);
                }
            }
        }
    }
    // ===================================
    // [新] CSS 背景替换逻辑 (结束)
    // ===================================

    // ** 启动替换图片的缓存和预加载 **
    getOrCreateReplacementCache().catch(err => {
        console.error('[图片替换] 启动失败:', err);
    });


    // ===== <img> 替换 (保持不变) =====
    async function replaceImgElement(img) {
        if (!img.src) return;
        if (img.dataset.scReplaced) return; // 已替换

        const fileName = img.src.split('/').pop();

        for (const baseName in IMG_MAP) {
            const baseNoExt = baseName.replace('.png', '');
            if (
                fileName === baseName || // 完全匹配
                fileName.startsWith(baseNoExt + '.') // 支持 factory_tier01.xxx.png
            ) {
                const newName = IMG_MAP[baseName];
                if (newName === '') {
                    img.src = '';
                    img.dataset.scReplaced = '1';
                } else {
                    // ImageManager.getImage 内部已处理了缓存逻辑
                    const base64 = await ImageManager.getImage(newName);

                    if (base64) {
                        img.src = base64;
                        console.log(`${fileName}已被替换`)
                        img.dataset.scReplaced = '1';
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

    /**
     * [修正版 V3] 扫描并替换或移除 Div 的 background-image
     */
    function replaceDivBackground(div) {
        const style = div.style;
        // 检查是否是行内样式，并且不是已经替换过的 Base64
        if (!style || !style.backgroundImage || style.backgroundImage.includes('data:image')) return;

        const originalBgImage = style.backgroundImage;
        let newBgImage = originalBgImage;
        let hasRemoved = false;

        // 遍历关键词
        for (const keyword of OVERLAY_KEYWORDS) {
            if (newBgImage.includes(keyword)) {
                hasRemoved = true;

                // 构造一个超级健壮的正则表达式来匹配并移除该 url(...) 条目
                // 模式解释：
                // (?:,\s*)? 匹配 URL 前面可选的逗号和空格
                // url\\([\"']?[^)]*${keyword}[^)]*[\"']?\\) 匹配包含关键词的 URL 本身
                // (?:,\s*)? 匹配 URL 后面可选的逗号和空格

                // 为了安全替换，我们使用两次替换：先匹配 URL 及其后面的逗号，再匹配 URL 及其前面的逗号。
                // 但最简单的方式是替换 URL 本身，然后清理残留的逗号。

                // 模式：匹配 URL 及其后面跟着的逗号和空格 (如果是中间或开头的条目)
                const patternAfter = new RegExp(`url\\([\"']?[^)]*${keyword}[^)]*[\"']?\\)\\s*,?\\s*`, 'g');
                newBgImage = newBgImage.replace(patternAfter, '');
            }
        }

        if (hasRemoved) {
            // 1. 清理字符串开头可能残留的逗号和空格
            newBgImage = newBgImage.trim().replace(/^,/, '').trim();

            // 2. 清理字符串末尾可能残留的逗号和空格
            newBgImage = newBgImage.replace(/,$/, '').trim();

            // 3. 如果清理后字符串为空，则替换为 'none'
            if (newBgImage === '') {
                style.setProperty('background-image', 'none', 'important'); // 使用 setProperty 和 !important
                // console.log('[背景替换] 覆盖层全部移除，设置为 none');
            }
            // 4. 否则，应用清理后的多图背景
            else {
                style.setProperty('background-image', newBgImage, 'important');
                // console.log('[背景替换] 移除覆盖层，保留剩余背景:', newBgImage.substring(0, 50) + '...');
            }
        }
    }

    // 扫描已有 <div> 节点 (保持不变)
    function replaceAllDivs(root = document) {
        const divs = root.querySelectorAll('div[style*="background-image"]'); // 优化：只查询有行内背景图的 div
        for (const div of divs) replaceDivBackground(div);
    }

    // ===================================
    // [修正 V3] 扫描 <div> 并隐藏指定背景 (结束)
    // ===================================

    // ===== 初始执行 =====
    replaceAllImgs();
    replaceAllDivs();


    // ===== MutationObserver：监听新增节点和属性变化 (保持不变) =====
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
        // [新] 定期重新扫描 CSS 规则
        replaceCssBackgrounds();

        // 保留这些，它们可能对其他图标有用
        replaceAllImgs();
        replaceAllDivs();
    }, 1500); // 1.5秒的间隔是合理的

    // ===== 监听 URL 变化（处理 SPA 内导航）(保持不变) =====
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;

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



    // ===== Hook fetch/XHR 拦截 theme (保持不变) =====
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
    // 检测更新 (保持不变)
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
        const scriptUrl = 'https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.user.js?t=' + Date.now();
        const downloadUrl = 'https://simcompanies-scripts.pages.dev/oldBuildingsGraphic.user.js';
        // @changelog  更改为根据css替换图片，追加森林苗圃前后景替换，尚未更新树木替换，保留起重机以判断建筑状态

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
                    if (confirm(`SC背景图案替换+换回旧建筑图案插件检测到新版本 v${latestVersion}，是否前往更新？\n\nv${latestVersion} ${changeLog}\n\n关于版本号说明 1.X.Y ，X为增添新功能或修复不可用，Y为细节修改不影响功能，如不需更新可将Y或其它位置修改为较大值。`)) {
                        window.open(downloadUrl, '_blank');
                    }
                    hasNewVersion = true;
                } else {
                    hasNewVersion = false;
                }
            })
            .catch(err => {
                console.warn('检查更新失败：', err);
            });
    }

    setTimeout(checkUpdate, 3000);


})();