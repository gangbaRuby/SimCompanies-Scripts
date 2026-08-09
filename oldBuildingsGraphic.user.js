// ==UserScript==
// @name         SC背景图案替换+换回旧建筑图案
// @namespace    https://github.com/gangbaRuby
// @version      3.0.0
// @license      AGPL-3.0
// @description  SC背景图案替换+换回旧建筑图案
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js
// @downloadURL  https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';
    let hasNewVersion, latestVersion;
    let localVersion = GM_info.script.version;

    // ==========================================
    // 1. 全局配置与常量
    // ==========================================
    const CONSTANTS = {
        CDN_BASE: 'https://scimg.22-7.top/images/',
        STATIC_ROOT: 'https://www.simcompanies.com/static/',
        STORAGE_KEY: 'SC_SKIN_SETTINGS',
        THEME_KEY: 'SC_USER_THEME',
        FIRST_RUN_KEY: 'SC_SKIN_FIRST_RUN_DONE'
    };

    // 需要移除的遮挡物关键词
    const OVERLAY_KEYWORDS = [
        'forrest_nursery_tier01_front',
        'forrest_nursery_tier02_front',
        'forrest_nursery_tier03_front',
        'forrest_nursery_tier04_front',
    ];

    // DEFAULT_PATH_MAP 已移除，改用远程配置中的 pathMap

    // DEFAULT_UI_MANIFEST 已移除，改用远程配置中的 uiManifest

    // 声明为 let，允许被外部配置覆盖
    let PATH_MAP = {}; // 由远程配置填充
    let UI_MANIFEST = {}; // 由远程配置填充
    let HQ_CONFIG = {}; // 由远程配置中的 hqSettings 填充

    // ==========================================
    // HQ 主题管理：将配置中的 HQ 数据注入管理面板
    // ==========================================
    const HQManager = {
        injectManifest() {
            if (Object.keys(this.getHqRows()).length > 0) return;
            if (!HQ_CONFIG || !Array.isArray(HQ_CONFIG.themes) || HQ_CONFIG.themes.length === 0) {
                delete UI_MANIFEST['HQ 总部'];
                return;
            }
            const rows = {};
            const presetList = HQ_CONFIG.themes.map(theme => ({
                name: theme.name,
                url: theme.url || `${CONSTANTS.CDN_BASE}${theme.path.replace(/^images\//, '')}`,
                legacy: !!theme.legacy
            }));
            for (const theme of HQ_CONFIG.themes) {
                if (theme.legacy) continue;
                const key = theme.key || theme.path.split('/').pop();
                rows[key] = { name: theme.name, presets: presetList.slice() };
                PATH_MAP[key] = theme.path;
            }
            UI_MANIFEST['HQ 总部'] = { 'HQ 皮肤': { 'HQ 主题': rows } };
            console.log(`[SC-Skin] HQ 配置已注入，共 ${HQ_CONFIG.themes.length} 个主题`);
        },

        getHqRows() {
            return (UI_MANIFEST && UI_MANIFEST['HQ 总部']
                && UI_MANIFEST['HQ 总部']['HQ 皮肤']
                && UI_MANIFEST['HQ 总部']['HQ 皮肤']['HQ 主题']) || {};
        },

        getSourceThemes() {
            const rows = this.getHqRows();
            return Object.entries(rows).map(([key, meta]) => ({
                key,
                name: meta.name,
                path: PATH_MAP[key] || `images/${key}`,
                presets: meta.presets || []
            }));
        },

        getTargetThemes() {
            const map = new Map();
            for (const source of this.getSourceThemes()) {
                for (const preset of source.presets) {
                    const path = this.toLogicalPath(preset.url);
                    if (path && !map.has(path)) {
                        map.set(path, {
                            name: preset.name,
                            url: preset.url,
                            path,
                            legacy: !!preset.legacy
                        });
                    }
                }
            }
            return [...map.values()];
        },

        isHqKey(key) {
            return this.getSourceThemes().some(theme => theme.key === key);
        },

        applyHqChange() {
            clearTimeout(this._reloadTimer);
            this._reloadTimer = setTimeout(() => location.reload(), 300);
        },

        getFallbackTierKey(level) {
            if (typeof level !== 'number' || !isFinite(level)) return null;
            const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 18, 21, 25, 29, 34, 39, 45, 52, 60];
            let index = 0;
            for (let i = 0; i < levels.length; i++) {
                if (level >= levels[i]) index = i;
                else break;
            }
            return `hq_tier${String(index + 1).padStart(2, '0')}.png`;
        },

        isLegacyTargetPath(targetPath) {
            if (!targetPath) return false;
            return this.getTargetThemes().some(theme => theme.legacy && theme.path === targetPath);
        },

        toLogicalPath(targetUrl) {
            if (!targetUrl) return null;
            let path = targetUrl.split('?')[0];
            if (path.startsWith(CONSTANTS.CDN_BASE)) return 'images/' + path.slice(CONSTANTS.CDN_BASE.length);
            if (path.startsWith(CONSTANTS.STATIC_ROOT)) return path.slice(CONSTANTS.STATIC_ROOT.length);
            return null;
        },

        getReplacementForHqImage(hqImage, level) {
            const sources = this.getSourceThemes();
            const getEnabledTarget = (key) => {
                const cfg = Settings.data[key];
                if (!cfg || !cfg.enabled || !cfg.target) return null;
                const target = this.toLogicalPath(cfg.target);
                return target && !this.isLegacyTargetPath(target) ? target : null;
            };

            let fileName = null;
            let fallbackKey = null;
            if (typeof hqImage === 'string' && hqImage) {
                fileName = hqImage.split('/').pop().toLowerCase().replace(/\.(png|svg)$/, '');
            } else if (typeof hqImage === 'string' && hqImage === '') {
                fallbackKey = this.getFallbackTierKey(level);
                if (!fallbackKey) {
                    for (const theme of sources) {
                        const target = getEnabledTarget(theme.key);
                        if (target) return target;
                    }
                    return null;
                }
                fileName = fallbackKey.toLowerCase().replace(/\.png$/, '');
            } else {
                return null;
            }
            for (const theme of sources) {
                const baseKey = theme.key.toLowerCase().replace(/\.(png|svg)$/, '');
                if (fileName === baseKey) {
                    const target = getEnabledTarget(theme.key);
                    if (target) return target;
                }
            }
            if (fallbackKey) {
                for (const theme of sources) {
                    const target = getEnabledTarget(theme.key);
                    if (target) return target;
                }
            }
            return null;
        },

        getImageFallback(originalUrl) {
            if (typeof originalUrl !== 'string' || !originalUrl) return null;
            const fileName = originalUrl.split('/').pop().split('?')[0].toLowerCase()
                .replace(/\.(png|svg)$/, '')
                .replace(/\.[a-f0-9]+$/, '');
            const sources = this.getSourceThemes();
            for (const theme of sources) {
                const cfg = Settings.data[theme.key];
                if (!cfg || !cfg.enabled || !cfg.target) continue;
                const targetPath = this.toLogicalPath(cfg.target);
                if (!targetPath) continue;
                const targetFile = targetPath.split('/').pop().toLowerCase().replace(/\.(png|svg)$/, '');
                if (targetFile === fileName) return cfg.target;
            }
            return null;
        }
    };

    // ==========================================
    // 新增：远程配置与数据管理器
    // ==========================================
    const ConfigManager = {
        LOCAL_CACHE_KEY: 'SC_SKIN_REMOTE_CONFIG',
        currentVersion: 0, // 当前运行的版本号

        init() {
            // 1. 启动时瞬间读取本地缓存，不阻塞页面加载
            try {
                const cache = localStorage.getItem(this.LOCAL_CACHE_KEY);
                if (cache) {
                    const parsed = JSON.parse(cache);
                    if (parsed.uiManifest && parsed.pathMap) {
                        UI_MANIFEST = parsed.uiManifest;
                        PATH_MAP = parsed.pathMap;
                        HQ_CONFIG = parsed.hqSettings || {};
                        HQManager.injectManifest();
                        this.currentVersion = parsed.version || 0;
                        console.log(`[SC-Skin] 已加载本地配置缓存，当前数据版本: ${this.currentVersion}`);
                    }
                }
            } catch (e) {
                console.warn('[SC-Skin] 读取缓存配置失败，使用默认内置配置', e);
            }

            // 2. 启动后，在后台静默检查是否有新版本
            this.checkAutoUpdate();
        },

        async checkAutoUpdate() {
            try {
                // 使用小时级的时间戳，防止死缓存
                const cacheBuster = Math.floor(Date.now());
                const url = `https://sc.22-7.top/scripts/oldBuildingsGraphicConfig.json?t=${cacheBuster}`;

                const response = await fetch(url);
                if (!response.ok) return;

                const remoteData = await response.json();
                const remoteVersion = remoteData.version || 0;

                if (remoteVersion > this.currentVersion) {
                    console.log(`[SC-Skin] ⬇️ 发现新版图库数据 (v${remoteVersion})，执行热替换...`);

                    // 保存到本地缓存
                    localStorage.setItem(this.LOCAL_CACHE_KEY, JSON.stringify(remoteData));

                    // 动态更新内存中的数据
                    UI_MANIFEST = remoteData.uiManifest;
                    PATH_MAP = remoteData.pathMap;
                    HQ_CONFIG = remoteData.hqSettings || {};
                    HQManager.injectManifest();
                    this.currentVersion = remoteVersion;

                    // ==========================================
                    // 🔥 核心：热替换 (Hot Reload) 逻辑
                    // ==========================================
                    // 1. 仅刷新 key 列表，不清除用户设置
                    Settings.refreshKeys();

                    // 2. 清理已失效的用户设置（原图已不存在的项）
                    Settings.cleanup();

                    // 3. 如果设置面板当前已经存在于页面上，强制刷新它的 UI
                    if (typeof SCobgUIManager !== 'undefined' && SCobgUIManager.panel) {
                        SCobgUIManager.renderSidebar(); // 重新生成左侧树形菜单

                        const content = SCobgUIManager.panel.querySelector('.scobg-content');
                        if (content) {
                            // 清空右侧详情区，提示用户重新点击，避免旧菜单绑定旧数据的报错
                            content.innerHTML = `
                                <div class="scobg-content-empty">
                                    <span style="font-size:40px;">🔄</span>
                                    <span>图库已实时更新，请在侧边栏重新选择分类</span>
                                </div>`;
                        }
                    }

                    // 4. 触发全局扫描器，瞬间替换游戏地图和背景上的图片！
                    if (typeof Scheduler !== 'undefined') {
                        Scheduler.scanAll();
                    }
                    // ==========================================

                }
            } catch (err) {
                console.error('[SC-Skin] 后台更新数据失败:', err);
            }
        },

    };

    // ==========================================
    // 2. Settings 模块 (数据管理中心)
    // ==========================================
    const Settings = {
        data: {}, // 存储用户的自定义设置 { "power_plant_tier01.png": { enabled: true, target: "url" } }
        allKeys: [], // 存储所有在 UI_MANIFEST 中定义的图片 key
        _keyMap: null, // 缓存：baseKey.toLowerCase() -> key
        _presetMap: null, // 缓存：预设文件名 -> key，用于匹配游戏当前已带季节后缀的图片

        /** 从 localStorage 加载用户设置（不刷新 key 列表） */
        load() {
            try {
                const localRaw = localStorage.getItem(CONSTANTS.STORAGE_KEY);
                if (localRaw) {
                    this.data = JSON.parse(localRaw);
                } else {
                    this.data = {};
                }
            } catch (e) {
                console.error('[SC-Skin] 加载配置失败，将使用默认配置:', e);
                this.data = {};
            }
        },

        /** 从 UI_MANIFEST 重新提取所有图片 key */
        refreshKeys() {
            this.allKeys = [];
            this._presetMap = new Map();
            const normalizeBase = (filename) => filename.toLowerCase().replace(/\.(png|svg)$/, '').replace(/\.[a-f0-9]+$/, '');
            const traverse = (obj) => {
                for (let k in obj) {
                    const value = obj[k];
                    if (k.endsWith('.png') || k.endsWith('.svg')) {
                        this.allKeys.push(k);
                    }
                    if (value && typeof value === 'object') {
                        if (Array.isArray(value.presets)) {
                            for (const preset of value.presets) {
                                if (preset && preset.url) {
                                    const presetBase = normalizeBase(preset.url.split('/').pop().split('?')[0]);
                                    if (presetBase && !this._presetMap.has(presetBase)) {
                                        this._presetMap.set(presetBase, k);
                                    }
                                }
                            }
                        } else {
                            traverse(value);
                        }
                    }
                }
            };
            traverse(UI_MANIFEST);
            // 重建快速查找 Map
            this._keyMap = new Map();
            for (const key of this.allKeys) {
                const baseKey = key.replace(/\.(png|svg)$/, '').toLowerCase();
                this._keyMap.set(baseKey, key);
            }
        },

        /** 完整初始化 = 加载设置 + 刷新 key 列表 + 清理过期项 */
        init() {
            this.load();
            this.refreshKeys();
            // 仅当远端配置已就绪时才清理（避免误删用户数据）
            if (this.allKeys.length > 0) this.cleanup();
            console.log('[SC-Skin] 配置已加载');
        },

        /** 清理 settings 中已不再存在于 UI_MANIFEST 的过期 key */
        cleanup() {
            if (this.allKeys.length === 0) {
                console.warn('[SC-Skin] 跳过清理：当前 key 列表为空，远端配置尚未就绪');
                return;
            }
            const validKeys = new Set(this.allKeys);
            let changed = false;
            for (const key of Object.keys(this.data)) {
                if (!validKeys.has(key)) {
                    delete this.data[key];
                    changed = true;
                }
            }
            if (changed) {
                this.save();
                console.log('[SC-Skin] 已清理过期设置项');
            }
        },

        save() {
            localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(this.data));
        },

        /**
         * 核心：通过原文件名获取新 CDN URL
         * 1. 先用精确文件名匹配
         * 2. 若未命中则降级为模糊匹配（包容 "-dmg" 等后缀变体）
         * @param {string} originalUrl - 原始图片 URL
         * @returns {string|null} - 替换后的 URL 或 null
         */
        getReplacementUrl(originalUrl) {
            if (!originalUrl) return null;
            const fullFileName = originalUrl.split('/').pop().split('?')[0].toLowerCase();
            const fileNameNoExt = fullFileName.replace(/\.(png|svg)$/, '');

            // 1. 精确匹配
            const exactKey = this._keyMap && this._keyMap.get(fileNameNoExt);
            if (exactKey) {
                const cfg = this.data[exactKey];
                if (cfg && cfg.enabled && cfg.target) return cfg.target;
            }

            // 2. 模糊匹配（应对文件名有额外后缀如 -dmg 的情况）
            for (const key of this.allKeys) {
                const baseKey = key.replace(/\.(png|svg)$/, '').toLowerCase();
                if (fullFileName.includes(baseKey)) {
                    const cfg = this.data[key];
                    if (cfg && cfg.enabled && cfg.target) return cfg.target;
                }
            }

            // 3. 预设匹配：游戏当前图片可能已带季节后缀（如 concrete-summer-0000）
            if (this._presetMap) {
                const presetBase = fullFileName.replace(/\.(png|svg)$/, '').replace(/\.[a-f0-9]+$/, '');
                const presetKey = this._presetMap.get(presetBase);
                if (presetKey) {
                    const cfg = this.data[presetKey];
                    if (cfg && cfg.enabled && cfg.target) return cfg.target;
                }
            }
            return null;
        }
    };
    Settings.init();


    // ==========================================
    // 3. 样式管理 (主题背景)
    // ==========================================
    const StyleManager = {
        init() {
            const style = document.createElement('style');
            style.id = 'sc-skin-global-style';
            style.textContent = `
                /* 只有当变量 --sc-custom-bg 有值且不是 initial 时，才强制应用 */
                #page.has-custom-bg, 
                #page.has-custom-bg::before, 
                #page.has-custom-bg::after { 
                    background-image: var(--sc-custom-bg) !important; 
                }
                
                /* 详情页强制清除背景的逻辑保留 */
                body.is-building-detail #page, 
                body.is-building-detail #page::before, 
                body.is-building-detail #page::after {
                    background-image: none !important;
                }
            `;
            document.head.appendChild(style);
            this.updateTheme();
        },

        updateTheme() {
            const pageEl = document.getElementById('page');
            if (!pageEl) return;

            // 1. 详情页判定
            const isDetail = /\/landscape\/buildings\/\d+\/?$/.test(location.pathname);
            document.body.classList.toggle('is-building-detail', isDetail);
            if (isDetail) return;

            // 2. 根据当前模式确定 manifest 中的 key
            const currentTheme = localStorage.getItem(CONSTANTS.THEME_KEY) || 'Light';
            const bgKey = currentTheme === 'Dark' ? 'background-dark.png' : 'background.png';

            // 3. 【核心修改】：像普通图片一样去询问 Settings
            // getReplacementUrl 内部会检查：allKeys 是否包含此 key，以及用户是否启用了它
            const newUrl = Settings.getReplacementUrl(bgKey);

            if (newUrl) {
                // 只有 manifest 里配置了且用户开启了，才应用
                document.documentElement.style.setProperty('--sc-custom-bg', `url("${newUrl}")`);
                pageEl.classList.add('has-custom-bg');
            } else {
                // 否则，彻底移除自定义样式，让游戏回归原始背景
                document.documentElement.style.removeProperty('--sc-custom-bg');
                pageEl.classList.remove('has-custom-bg');
            }
        }
    };


    // ==========================================
    // 4. 源头接管：在图片 URL 赋值时直接替换
    // ==========================================
    const UrlReplacer = {
        installed: false,
        imageStates: new WeakMap(), // img -> { original, replacement }
        backgroundStates: new WeakMap(), // CSSStyleDeclaration -> { original, mapped }
        stylesheetRuleStates: new WeakMap(), // CSSRule -> { originalCssText, mappedCssText }

        mapUrl(url, element) {
            if (typeof url !== 'string' || !url || url.startsWith('data:') || url.startsWith('blob:')) return url;

            if (element) {
                try {
                    if (element.closest('#scobg-panel') || (element.classList && element.classList.contains('scobg-ui-img'))) return url;
                } catch (e) { /* 忽略非 Element 对象 */ }

                const state = this.imageStates.get(element);
                if (state && state.replacement === url) return url;

                const replacement = Settings.getReplacementUrl(url) || HQManager.getImageFallback(url);
                if (replacement && replacement !== url) {
                    this.imageStates.set(element, { original: url, replacement });
                    return replacement;
                }
                this.imageStates.delete(element);
                return url;
            }

            const replacement = Settings.getReplacementUrl(url) || HQManager.getImageFallback(url);
            return replacement && replacement !== url ? replacement : url;
        },

        mapCss(value) {
            if (typeof value !== 'string' || !value) return value;
            const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
            return value.replace(urlPattern, (whole, quote, url) => {
                if (url.startsWith('data:') || url.startsWith('blob:')) return whole;
                const replacement = Settings.getReplacementUrl(url);
                return replacement ? `url("${replacement}")` : whole;
            });
        },

        mapBackground(value, declaration) {
            const state = declaration ? this.backgroundStates.get(declaration) : null;
            if (state && state.mapped === value) return value;
            const mapped = this.mapCss(value);
            if (mapped !== value && declaration) {
                this.backgroundStates.set(declaration, { original: value, mapped });
            } else if (declaration && state) {
                this.backgroundStates.delete(declaration);
            }
            return mapped;
        },

        applyToElement(img) {
            if (!img || !img.src) return;
            const state = this.imageStates.get(img);
            if (state && state.replacement === img.src) {
                const replacement = Settings.getReplacementUrl(state.original);
                if (replacement && replacement !== state.original && replacement !== state.replacement) {
                    img.src = replacement;
                    this.imageStates.set(img, { original: state.original, replacement });
                } else if (!replacement) {
                    img.src = state.original;
                    this.imageStates.delete(img);
                }
                return;
            }
            const mapped = this.mapUrl(img.src, img);
            if (mapped !== img.src) img.src = mapped;
        },

        applyToElementStyle(el) {
            if (!el || !el.style) return;
            const declaration = el.style;
            const current = declaration.backgroundImage;
            if (!current) return;
            const state = this.backgroundStates.get(declaration);
            if (state && state.mapped === current) {
                const mapped = this.mapCss(state.original);
                if (mapped !== state.original && mapped !== state.mapped) {
                    declaration.backgroundImage = mapped;
                    this.backgroundStates.set(declaration, { original: state.original, mapped });
                } else if (mapped === state.original) {
                    declaration.backgroundImage = state.original;
                    this.backgroundStates.delete(declaration);
                }
                return;
            }
            const mapped = this.mapCss(current);
            if (mapped !== current) {
                declaration.backgroundImage = mapped;
                if (!this.backgroundStates.has(declaration)) {
                    this.backgroundStates.set(declaration, { original: current, mapped });
                }
            }
        },

        applyToStylesheets() {
            for (const sheet of document.styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;
                    for (let i = 0; i < rules.length; i++) {
                        const rule = rules[i];
                        if (!rule.style || !rule.style.backgroundImage) continue;
                        const state = this.stylesheetRuleStates.get(rule);
                        const originalText = state ? state.originalCssText : rule.cssText;
                        const mappedText = this.mapCss(originalText);
                        if (state) {
                            if (mappedText !== state.originalCssText && mappedText !== state.mappedCssText) {
                                if (this.replaceRule(sheet, i, mappedText)) {
                                    this.stylesheetRuleStates.set(rules[i], { originalCssText: state.originalCssText, mappedCssText: mappedText });
                                }
                            } else if (mappedText === state.originalCssText && rule.cssText !== state.originalCssText) {
                                if (this.replaceRule(sheet, i, state.originalCssText)) {
                                    this.stylesheetRuleStates.delete(rules[i]);
                                }
                            }
                        } else if (mappedText !== rule.cssText) {
                            if (this.replaceRule(sheet, i, mappedText)) {
                                this.stylesheetRuleStates.set(rules[i], { originalCssText: rule.cssText, mappedCssText: mappedText });
                            }
                        }
                    }
                } catch (e) { /* 忽略跨域样式表 */ }
            }
        },

        replaceRule(sheet, index, text) {
            try {
                sheet.deleteRule(index);
                sheet.insertRule(text, index);
                return true;
            } catch (e) {
                return false;
            }
        },

        install() {
            if (this.installed) return;
            this.installed = true;
            const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            if (W.__scSkinUrlReplacerInstalled) return;
            try { W.__scSkinUrlReplacerInstalled = true; } catch (e) { /* 非关键 */ }
            const self = this;

            const patch = (label, apply) => {
                try {
                    apply();
                } catch (e) {
                    console.warn(`[SC-Skin] ${label} 安装失败`, e);
                }
            };

            patch('img src 接管', () => {
                const originalSetAttribute = W.Element.prototype.setAttribute;
                W.Element.prototype.setAttribute = function (name, value) {
                    if (name === 'src' && typeof value === 'string') {
                        try {
                            value = self.mapUrl(value, this);
                        } catch (e) { /* 保持原值 */ }
                    }
                    return originalSetAttribute.call(this, name, value);
                };

                const srcDescriptor = Object.getOwnPropertyDescriptor(W.HTMLImageElement.prototype, 'src');
                if (srcDescriptor && srcDescriptor.configurable) {
                    Object.defineProperty(W.HTMLImageElement.prototype, 'src', {
                        configurable: true,
                        enumerable: srcDescriptor.enumerable,
                        get() {
                            return srcDescriptor.get.call(this);
                        },
                        set(value) {
                            try {
                                value = self.mapUrl(value, this);
                            } catch (e) { /* 保持原值 */ }
                            srcDescriptor.set.call(this, value);
                        }
                    });
                }
            });

            patch('CSS 背景接管', () => {
                const originalSetProperty = W.CSSStyleDeclaration.prototype.setProperty;
                W.CSSStyleDeclaration.prototype.setProperty = function (propertyName, value, priority) {
                    const lower = String(propertyName).toLowerCase();
                    if ((lower === 'background-image' || lower === 'background') && typeof value === 'string') {
                        try {
                            value = self.mapBackground(value, this);
                        } catch (e) { /* 保持原值 */ }
                    }
                    return originalSetProperty.call(this, propertyName, value, priority);
                };

                const bgDescriptor = Object.getOwnPropertyDescriptor(W.CSSStyleDeclaration.prototype, 'backgroundImage');
                if (bgDescriptor && bgDescriptor.configurable) {
                    Object.defineProperty(W.CSSStyleDeclaration.prototype, 'backgroundImage', {
                        configurable: true,
                        enumerable: bgDescriptor.enumerable,
                        get() {
                            return bgDescriptor.get.call(this);
                        },
                        set(value) {
                            try {
                                value = self.mapBackground(value, this);
                            } catch (e) { /* 保持原值 */ }
                            bgDescriptor.set.call(this, value);
                        }
                    });
                }
            });

            patch('样式表规则接管', () => {
                const originalInsertRule = W.CSSStyleSheet.prototype.insertRule;
                W.CSSStyleSheet.prototype.insertRule = function (rule, index) {
                    let originalText = typeof rule === 'string' ? rule : null;
                    if (originalText) {
                        try {
                            const mappedText = self.mapCss(originalText);
                            if (mappedText !== originalText) {
                                rule = mappedText;
                            }
                        } catch (e) { /* 保持原规则 */ }
                    }
                    const result = originalInsertRule.call(this, rule, index);
                    if (originalText && result !== undefined && result >= 0) {
                        const inserted = this.cssRules && this.cssRules[result];
                        if (inserted) {
                            self.stylesheetRuleStates.set(inserted, {
                                originalCssText: originalText,
                                mappedCssText: rule
                            });
                        }
                    }
                    return result;
                };
            });

            console.log('[SC-Skin] 图片 URL 源头接管已安装');
        }
    };


    // ==========================================
    // 5. SCobgUIManager (来自 oldBuildingsGraphic1)
    // ==========================================
    const SCobgUIManager = {
        panel: null,
        overlay: null,
        searchQuery: '',
        showModifiedOnly: false,
        showEnabledOnly: false,
        currentSelection: null,
        lastAppliedSet: null,
        lastAppliedSetGroup: null,

        init() {
            if (document.getElementById('scobg-panel')) return;
            HQManager.injectManifest();
            this.injectCSS();
            this.createPanel();
            this.registerTampermonkeyMenu();

            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            win.SCobg_TogglePanel = () => this.togglePanel();
        },

        registerTampermonkeyMenu() {
            if (typeof GM_registerMenuCommand !== 'undefined') {
                GM_registerMenuCommand("🎨 皮肤管理面板", () => this.togglePanel());
            }
        },

        togglePanel() {
            if (!this.panel) return;
            const isVisible = this.panel.style.display === 'flex';
            if (isVisible) {
                this.panel.style.display = 'none';
                this.hideOverlay();
            } else {
                this.panel.style.display = 'flex';
                this.showOverlay();
            }
            document.body.style.overflow = isVisible ? '' : 'hidden';
        },

        showOverlay() {
            if (window.innerWidth > 640) return; // 仅移动端显示遮罩
            if (!this.overlay) {
                this.overlay = document.createElement('div');
                this.overlay.id = 'scobg-overlay';
                this.overlay.style.cssText = `
                    position: fixed; inset: 0; z-index: 99999;
                    background: rgba(0,0,0,0.5);
                `;
                this.overlay.onclick = () => this.togglePanel();
            }
            if (!document.getElementById('scobg-overlay')) {
                document.body.appendChild(this.overlay);
            }
        },

        hideOverlay() {
            const overlay = document.getElementById('scobg-overlay');
            if (overlay) overlay.remove();
        },

        injectCSS() {
            const style = document.createElement('style');
            style.id = 'scobg-ui-style';
            style.textContent = `
                /* 全局盒模型重置 */
                #scobg-panel, #scobg-panel * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    
                #scobg-panel { 
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    width: 95vw; max-width: 850px; height: 85vh; max-height: 650px;
                    background: #1a1e26; border: 1px solid #444; z-index: 100000; 
                    color: #fff; display: none; flex-direction: column; 
                    border-radius: 12px; font-family: -apple-system, system-ui, sans-serif; 
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8); overflow: hidden; 
                }
    
                /* 头部样式 */
                .scobg-header { 
                    padding: 0 15px; height: 50px; flex-shrink: 0;
                    border-bottom: 1px solid #2a2f3a; display: flex; 
                    justify-content: space-between; align-items: center; 
                    background: #21262e; 
                }
                .scobg-header-title { 
                    font-size:15px; font-weight:bold; letter-spacing:0.5px; 
                    white-space: nowrap; flex-shrink: 0;
                }
                .scobg-header-actions { 
                    display:flex; gap:8px; align-items:center; flex-shrink: 0;
                }
    
                /* 主体响应式布局 */
                .scobg-body { display: flex; flex: 1; overflow: hidden; }
    
                /* 侧边栏：PC宽，手机窄 */
                .scobg-sidebar { 
                    width: 240px; background: #14171d; border-right: 1px solid #2a2f3a; 
                    overflow-y: auto; flex-shrink: 0;
                }
    
                /* 内容区 */
                .scobg-content { flex: 1; overflow-y: auto; background: #1a1e26; position: relative; }
                .scobg-content-empty {
                    height:100%; display:flex; align-items:center; justify-content:center; 
                    color:#555; flex-direction:column; gap:10px; text-align:center; padding:20px;
                }
    
                /* 树形菜单细节 */
                .scobg-tree-item { 
                    cursor: pointer; padding: 12px 15px; color: #aaa; 
                    font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.02);
                    display: flex; align-items: center; user-select: none;
                }
                .scobg-l1 { font-weight: bold; background: #1c2129; color: #eee; }
                .scobg-l2 { padding-left: 25px; font-size: 13px; background: #11151a; }
                .scobg-l3 { padding-left: 45px; font-size: 13px; }
                .scobg-l3.active { color: #2196f3; background: rgba(33,150,243,0.1); border-left: 4px solid #2196f3; }
                
                .scobg-sub-container { display: none; }
                .scobg-sub-container.show { display: block; }
                .scobg-arrow { font-size: 10px; margin-right: 10px; transition: 0.2s; opacity: 0.5; }
    
                /* 皮肤项卡片 */
                .scobg-grid { padding: 12px; }
                .scobg-row { 
                    background: #252a35; padding: 15px; margin-bottom: 12px; 
                    border-radius: 8px; border: 1px solid #333; 
                    display: flex; align-items: center; justify-content: space-between; 
                    gap: 16px;
                }
                .scobg-name { font-size: 15px; font-weight: bold; margin-bottom: 6px; color: #fff; }
                .scobg-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888; cursor: pointer; }
                .scobg-check input { width: 18px; height: 18px; cursor: pointer; }
    
                /* 图片预览区 */
                .scobg-imgs { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
                .scobg-ui-img { 
                    width: 90px; height: 60px; object-fit: contain; 
                    background: #000; border: 1px solid #444; border-radius: 6px; 
                }
                .scobg-ui-img.click { border-color: #555; cursor: pointer; }
    
                /* 响应式弹窗菜单 */
                .scobg-menu { 
                    position: fixed; background: #2c323d; border: 1px solid #555; 
                    border-radius: 12px; z-index: 100001; padding: 12px; 
                    width: 90vw; max-width: 320px; box-sizing: border-box;
                    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; 
                    max-height: 75vh; overflow-y: auto;
                    box-shadow: 0 15px 50px rgba(0,0,0,0.7);
                }
                .scobg-menu-item { text-align: center; cursor: pointer; }
                .scobg-menu-item img { width: 100%; height: 50px; object-fit: contain; background: #000; border-radius: 4px; }
                .scobg-menu-item span { font-size: 11px; color: #bbb; display: block; margin-top: 5px; }
                .scobg-menu-foot { grid-column: span 2; position: sticky; bottom: -12px; background: #2c323d; z-index: 1; padding: 10px 0 0; }
    
                .scobg-btn-blue { background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
                .scobg-btn-sm { padding: 5px 10px; font-size: 12px; }

                /* 搜索与筛选工具栏 */
                .scobg-toolbar {
                    position: sticky; top: 0; z-index: 5;
                    padding: 10px; border-bottom: 1px solid #2a2f3a;
                    background: #10131a; flex-shrink: 0;
                }
                .scobg-search {
                    width: 100%; padding: 8px 10px; border-radius: 6px;
                    border: 1px solid #444; background: #0c0f14; color: #fff;
                    font-size: 13px; outline: none;
                }
                .scobg-search::placeholder { color: #666; }
                .scobg-filters { display: flex; gap: 12px; margin-top: 8px; font-size: 12px; color: #aaa; }
                .scobg-filter { display: flex; align-items: center; gap: 5px; cursor: pointer; }
                .scobg-filter input { width: 16px; height: 16px; accent-color: #2196f3; }
                .scobg-count { margin-top: 8px; font-size: 11px; color: #777; }
                .scobg-tree-empty { padding: 16px 12px; color: #666; font-size: 12px; text-align: center; }

                /* 已修改/启用标记 */
                .scobg-badge {
                    display: inline-block; margin-left: 8px; padding: 2px 6px;
                    border-radius: 4px; font-size: 10px; font-weight: bold; vertical-align: middle;
                }
                .scobg-badge-modified { background: #e67e22; color: #fff; }
                .scobg-badge-enabled { background: #2ecc71; color: #fff; }
                .scobg-reset {
                    margin-top: 8px; padding: 3px 8px; border: 1px solid #555;
                    background: transparent; color: #aaa; border-radius: 4px;
                    font-size: 11px; cursor: pointer;
                }
                .scobg-reset:hover { color: #fff; border-color: #e67e22; }

                /* 整套替换 */
                .scobg-setbar {
                    display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
                    padding: 10px 15px; border-bottom: 1px solid #2a2f3a;
                    background: rgba(33,150,243,0.06);
                }
                .scobg-setbar-label { font-size: 12px; color: #999; }
                .scobg-set-btn {
                    padding: 5px 10px; border-radius: 14px; border: 1px solid #2196f3;
                    background: rgba(33,150,243,0.12); color: #6db8ff;
                    font-size: 12px; cursor: pointer;
                }
                .scobg-set-btn:hover { background: rgba(33,150,243,0.25); }
                .scobg-set-note { font-size: 11px; color: #2ecc71; }
    
                /* ================================ */
                /* 📱 手机端 (≤640px)                */
                /* ================================ */
                @media screen and (max-width: 640px) {
                    #scobg-panel { 
                        width: 96vw; height: 92vh; max-height: 92vh; 
                        top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        border-radius: 16px; 
                    }
    
                    /* 头部：更紧凑 */
                    .scobg-header { 
                        height: auto; min-height: 44px; 
                        flex-wrap: wrap; gap: 4px; 
                        padding: 6px 10px;
                    }
                    .scobg-header-title { font-size: 13px; }
                    .scobg-header-title a { display: none; } /* 隐藏链接节省空间 */
    
                    /* 按钮缩小 */
                    .scobg-header-actions { gap: 4px; }
                    .scobg-header-actions .scobg-btn-blue { 
                        padding: 6px 10px; font-size: 11px; 
                        min-height: 32px; /* 增大触控目标 */
                    }
                    .scobg-header-actions #scobg-close { 
                        font-size: 22px; padding: 4px 8px; 
                        min-height: 32px; display: flex; align-items: center;
                    }
    
                    .scobg-body { flex-direction: column; }
                    
                    /* 侧边栏：搜索和分类各占一定空间 */
                    .scobg-sidebar { 
                        width: 100%; min-height: 130px; height: 38%;
                        border-right: none; border-bottom: 1px solid #2a2f3a; 
                        overflow-y: auto; 
                    }
                    .scobg-content { height: 62%; overflow-y: auto; }
    
                    /* 树形菜单：增大触控区域 */
                    .scobg-tree-item { 
                        padding: 12px 12px; font-size: 13px; 
                        min-height: 44px; 
                    }
                    .scobg-l2 { padding-left: 28px; }
                    .scobg-l3 { padding-left: 48px; }
                    .scobg-l3.active { border-left-width: 3px; }
    
                    /* 行：垂直堆叠 */
                    .scobg-row { 
                        flex-direction: column; align-items: flex-start; 
                        gap: 12px; padding: 12px;
                    }
                    .scobg-info { width: 100%; }
                    .scobg-check input { width: 20px; height: 20px; }
                    .scobg-imgs { width: 100%; justify-content: space-around; }
                    .scobg-ui-img { width: 64px; height: 44px; }
    
                    /* 弹窗菜单 */
                    .scobg-menu { 
                        max-width: 300px; 
                        grid-template-columns: repeat(2, 1fr); 
                        gap: 8px; padding: 10px;
                    }
                    .scobg-menu-item { padding: 4px; }
                    .scobg-menu-item img { height: 42px; }
                    .scobg-menu-item span { font-size: 10px; }
    
                    .scobg-content-empty { font-size: 14px; }
                    .scobg-content-empty span:first-child { font-size: 32px !important; }
                }
    
                /* ================================ */
                /* 📱 小屏手机端 (≤480px)            */
                /* ================================ */
                @media screen and (max-width: 480px) {
                    /* 头部单行极简 */
                    .scobg-header { 
                        padding: 6px 8px; gap: 4px;
                        min-height: 40px;
                    }
                    .scobg-header-title { 
                        font-size: 12px; flex: 1; 
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    }
                    .scobg-header-actions .scobg-btn-blue { 
                        padding: 4px 6px; font-size: 10px; 
                        min-height: 28px; border-radius: 3px;
                    }
                    /* 默认隐藏导入/导出，由 ··· 按钮控制显示 */
                    .scobg-header-actions #scobg-import-btn,
                    .scobg-header-actions #scobg-export { 
                        display: none; 
                    }
                    /* ··· 更多按钮和帮助按钮始终可见 */
                    .scobg-header-actions #scobg-more-btn,
                    .scobg-header-actions #scobg-help-btn { 
                        display: inline-flex !important; 
                    }
    
                    /* 侧边栏占比提高，方便搜索和筛选 */
                    .scobg-sidebar { height: 42%; min-height: 150px; }
                    .scobg-content { height: 58%; }
    
                    /* 树形菜单：更紧凑 */
                    .scobg-tree-item { 
                        padding: 10px 10px; font-size: 12px; 
                        min-height: 40px;
                    }
                    .scobg-l2 { padding-left: 22px; }
                    .scobg-l3 { padding-left: 36px; }
                    .scobg-l3.active { border-left-width: 3px; }
    
                    /* 行卡片 */
                    .scobg-row { padding: 10px; gap: 10px; }
                    .scobg-grid { padding: 6px; }
                    .scobg-name { font-size: 12px; }
                    .scobg-check { font-size: 11px; }
                    .scobg-check input { width: 22px; height: 22px; }
    
                    /* 图片紧凑 */
                    .scobg-imgs { gap: 6px; }
                    .scobg-ui-img { width: 50px; height: 34px; }
    
                    /* 弹窗菜单：底部全宽 sheet */
                    .scobg-menu { 
                        width: 100vw; max-width: 100vw; 
                        grid-template-columns: repeat(3, 1fr); 
                        gap: 6px; padding: 12px;
                        border-radius: 16px 16px 0 0;
                        left: 0 !important; top: auto !important;
                        bottom: 0 !important; transform: none !important;
                        max-height: 50vh; overflow-y: auto;
                    }
                    .scobg-menu-item { padding: 6px; }
                    .scobg-menu-item img { height: 38px; }
                    .scobg-menu-item span { font-size: 10px; margin-top: 2px; }
                    .scobg-menu-foot { 
                        grid-column: span 3 !important; 
                    }
                    .scobg-menu-foot input { 
                        padding: 8px !important; font-size: 14px !important; 
                    }
    
                    .scobg-content > div:first-child { 
                        padding: 8px 10px !important; 
                    }
                    .scobg-content > div:first-child > div:first-child { 
                        font-size: 10px !important; 
                    }
                }

                /* ================================ */
                /* 📱 极限小屏 (≤360px)              */
                /* ================================ */
                @media screen and (max-width: 360px) {
                    .scobg-header { padding: 4px 6px; gap: 2px; min-height: 38px; }
                    .scobg-header-title { font-size: 11px; }
                    .scobg-header-actions { gap: 2px; }
                    .scobg-header-actions .scobg-btn-blue {
                        padding: 3px 5px; font-size: 10px; min-height: 26px;
                    }
                    .scobg-header-actions #scobg-close {
                        font-size: 18px; padding: 3px 5px; min-height: 26px;
                    }
                    .scobg-toolbar { padding: 8px; }
                    .scobg-search { padding: 7px 8px; font-size: 12px; }
                    .scobg-filters { gap: 8px; font-size: 11px; }
                    .scobg-sidebar { height: 48%; min-height: 180px; }
                    .scobg-content { height: 52%; }
                    .scobg-tree-item { padding: 8px 8px; font-size: 11px; min-height: 34px; }
                    .scobg-l2 { padding-left: 16px; }
                    .scobg-l3 { padding-left: 28px; }
                    .scobg-ui-img { width: 44px; height: 30px; }
                    .scobg-row { padding: 8px; gap: 8px; }
                    .scobg-name { font-size: 11px; }
                    .scobg-menu-item img { height: 34px; }
                    .scobg-setbar { padding: 8px; gap: 6px; }
                    .scobg-set-btn { padding: 4px 8px; font-size: 11px; }
                    .scobg-content > div:first-child { padding: 6px 8px !important; }
                }
            `;
            document.head.appendChild(style);
        },

        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'scobg-panel';
            const isSmallScreen = window.innerWidth <= 640;
            this.panel.innerHTML = `
                <div class="scobg-header">
                    <span class="scobg-header-title">SC皮肤管理 <a href="https://showscimg.22-7.top/images" target="_blank" style="margin-left:8px; font-size:13px; color:#3498db; text-decoration:underline;">SC图片一览</a></span>
                    <div class="scobg-header-actions">
                        <button id="scobg-import-btn" class="scobg-btn-blue scobg-btn-sm" style="background:#e67e22;">导入配置</button>
                        <input type="file" id="scobg-import-file" accept=".json" style="display:none;">
                        <button id="scobg-export" class="scobg-btn-blue scobg-btn-sm" style="background:#d35400;">导出配置</button>
                        <button id="scobg-save" class="scobg-btn-blue scobg-btn-sm" style="background:#2ecc71;">保存</button>
                        <button id="scobg-apply" class="scobg-btn-blue scobg-btn-sm">刷新</button>
                        <button id="scobg-help-btn" class="scobg-btn-blue scobg-btn-sm" style="background:#555;font-weight:bold;font-size:14px;">?</button>
                        <button id="scobg-more-btn" class="scobg-btn-blue scobg-btn-sm" style="display:none;background:#555;font-weight:bold;">···</button>
                        <div id="scobg-close" style="padding:5px; cursor:pointer; font-size:22px; color:#777; line-height:1;">✕</div>
                    </div>
                </div>
                <div class="scobg-body">
                    <div class="scobg-sidebar"></div>
                    <div class="scobg-content">
                        <div class="scobg-content-empty">
                            <span style="font-size:40px;">🎨</span>
                            <span>请在${isSmallScreen ? '上方' : '左侧'}选择分类</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(this.panel);

            // 绑定基础事件
            this.panel.querySelector('#scobg-close').onclick = () => this.togglePanel();
            this.panel.querySelector('#scobg-help-btn').onclick = () => { if (typeof InstructionsManager !== 'undefined') InstructionsManager.show(); };
            this.panel.querySelector('#scobg-apply').onclick = () => location.reload();
            this.panel.querySelector('#scobg-save').onclick = (e) => {
                if (typeof Settings !== 'undefined') {
                    Settings.save();
                    const btn = e.target;
                    const oldText = btn.textContent;
                    btn.textContent = '已存';
                    setTimeout(() => btn.textContent = oldText, 1500);
                }
            };

            // =====================================
            // 手机端 "···" 更多操作弹出菜单
            // =====================================
            const moreBtn = this.panel.querySelector('#scobg-more-btn');
            const importBtn = this.panel.querySelector('#scobg-import-btn');
            const exportBtn = this.panel.querySelector('#scobg-export');
            let moreOpen = false; // 用变量跟踪状态，避免 style.display 读不到 CSS 设置
            moreBtn.onclick = (e) => {
                e.stopPropagation();
                moreOpen = !moreOpen;
                importBtn.style.display = moreOpen ? 'inline-flex' : 'none';
                exportBtn.style.display = moreOpen ? 'inline-flex' : 'none';
                moreBtn.textContent = moreOpen ? '✕' : '···';
                moreBtn.style.background = moreOpen ? '#e67e22' : '#555';
            };

            // =====================================
            // 新增事件绑定：导出用户配置
            // =====================================
            this.panel.querySelector('#scobg-export').onclick = () => {
                const dataStr = JSON.stringify(Settings.data, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sc_skin_backup_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };

            // =====================================
            // 新增事件绑定：导入用户配置
            // =====================================
            const importInput = this.panel.querySelector('#scobg-import-file');
            this.panel.querySelector('#scobg-import-btn').onclick = () => importInput.click();
            importInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const importedData = JSON.parse(ev.target.result);
                        Settings.data = importedData;
                        Settings.save();
                        alert('✅ 皮肤配置导入成功！页面即将刷新。');
                        location.reload();
                    } catch (err) {
                        alert('❌ 导入失败，文件格式不正确，请确保是之前导出的 JSON 文件！');
                    }
                };
                reader.readAsText(file);
                // 清空 input，允许重复导入同一个文件
                e.target.value = '';
            };

            this.renderSidebar();
        },

        renderSidebar() {
            const sidebar = this.panel.querySelector('.scobg-sidebar');
            if (!sidebar || typeof UI_MANIFEST === 'undefined') return;
            this.currentSelection = null;
            sidebar.innerHTML = `
                <div class="scobg-toolbar">
                    <input id="scobg-search" class="scobg-search" type="search" placeholder="搜索名称或文件名">
                    <div class="scobg-filters">
                        <label class="scobg-filter"><input type="checkbox" id="scobg-filter-modified"> 仅已修改</label>
                        <label class="scobg-filter"><input type="checkbox" id="scobg-filter-enabled"> 仅已启用</label>
                    </div>
                    <div class="scobg-count" id="scobg-count"></div>
                </div>
                <div class="scobg-tree"></div>
            `;

            const searchInput = sidebar.querySelector('#scobg-search');
            searchInput.value = this.searchQuery;
            searchInput.oninput = () => {
                this.searchQuery = searchInput.value;
                this.renderTree();
                this.refreshCurrentContent();
            };

            const modifiedFilter = sidebar.querySelector('#scobg-filter-modified');
            modifiedFilter.checked = this.showModifiedOnly;
            modifiedFilter.onchange = () => {
                this.showModifiedOnly = modifiedFilter.checked;
                this.renderTree();
                this.refreshCurrentContent();
            };

            const enabledFilter = sidebar.querySelector('#scobg-filter-enabled');
            enabledFilter.checked = this.showEnabledOnly;
            enabledFilter.onchange = () => {
                this.showEnabledOnly = enabledFilter.checked;
                this.renderTree();
                this.refreshCurrentContent();
            };

            this.renderTree();
        },

        renderTree() {
            const tree = this.panel.querySelector('.scobg-tree');
            if (!tree) return;
            tree.innerHTML = '';
            let visibleCount = 0;

            for (const [l1Name, l1Data] of Object.entries(UI_MANIFEST)) {
                const l1El = this.createTreeItem(l1Name, 'scobg-l1');
                const l1Container = document.createElement('div');
                l1Container.className = 'scobg-sub-container';
                l1El.onclick = () => this.toggleTree(l1El, l1Container);
                let l1HasVisible = false;

                for (const [l2Name, l2Data] of Object.entries(l1Data)) {
                    const l2El = this.createTreeItem(l2Name, 'scobg-l2');
                    const l2Container = document.createElement('div');
                    l2Container.className = 'scobg-sub-container';
                    l2El.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleTree(l2El, l2Container);
                    };
                    let l2HasVisible = false;

                    for (const [l3Name, l3Items] of Object.entries(l2Data)) {
                        const filteredItems = this.filterItems(l3Items, l1Name, l2Name, l3Name);
                        const keys = Object.keys(filteredItems);
                        if (!keys.length) continue;

                        const l3El = document.createElement('div');
                        l3El.className = 'scobg-tree-item scobg-l3';
                        l3El.textContent = `${l3Name} (${keys.length})`;
                        l3El.onclick = (e) => {
                            e.stopPropagation();
                            tree.querySelectorAll('.scobg-l3').forEach(el => el.classList.remove('active'));
                            l3El.classList.add('active');
                            this.renderContent(l1Name, l2Name, l3Name, l3Items);
                            if (window.innerWidth <= 640) {
                                this.panel.querySelector('.scobg-content').scrollIntoView({ behavior: 'smooth' });
                            }
                        };
                        l2Container.appendChild(l3El);
                        l2HasVisible = true;
                        visibleCount += keys.length;
                    }

                    if (l2HasVisible) {
                        l1Container.appendChild(l2El);
                        l1Container.appendChild(l2Container);
                        l1HasVisible = true;
                    }
                }

                if (l1HasVisible) {
                    tree.appendChild(l1El);
                    tree.appendChild(l1Container);
                }
            }

            if (!tree.children.length) {
                const empty = document.createElement('div');
                empty.className = 'scobg-tree-empty';
                empty.textContent = '没有匹配的皮肤项';
                tree.appendChild(empty);
            } else if (this.searchQuery || this.showModifiedOnly || this.showEnabledOnly) {
                tree.querySelectorAll('.scobg-sub-container').forEach(el => el.classList.add('show'));
            }

            this.updateCount(visibleCount);
        },

        filterItems(items, l1, l2, l3) {
            const q = this.searchQuery.trim().toLowerCase();
            const groupMatch = !q || l1.toLowerCase().includes(q) || l2.toLowerCase().includes(q) || l3.toLowerCase().includes(q);
            const out = {};
            const isHq = l1 === 'HQ 总部';
            for (const [key, meta] of Object.entries(items)) {
                if (!/\.(png|svg|jpg|jpeg|webp|gif)$/i.test(key)) continue;
                if (!isHq && this.showModifiedOnly && !Object.prototype.hasOwnProperty.call(Settings.data, key)) continue;
                if (!isHq && this.showEnabledOnly && !(Settings.data[key] && Settings.data[key].enabled)) continue;
                if (q && !groupMatch && !meta.name.toLowerCase().includes(q) && !key.toLowerCase().includes(q)) continue;
                out[key] = meta;
            }
            return out;
        },

        updateCount(visibleCount) {
            const countEl = this.panel.querySelector('#scobg-count');
            if (!countEl) return;
            const total = (typeof Settings !== 'undefined' && Settings.allKeys) ? Settings.allKeys.length : 0;
            const modified = (typeof Settings !== 'undefined' && Settings.allKeys)
                ? Settings.allKeys.filter(key => Object.prototype.hasOwnProperty.call(Settings.data, key)).length
                : 0;
            countEl.textContent = `已修改 ${modified} / 全部 ${total}` + (visibleCount != null ? ` · 显示 ${visibleCount}` : '');
        },

        refreshCurrentContent() {
            if (this.currentSelection) {
                this.renderContent(this.currentSelection.l1, this.currentSelection.l2, this.currentSelection.l3, this.currentSelection.items);
            }
        },

        createTreeItem(text, className) {
            const div = document.createElement('div');
            div.className = `scobg-tree-item ${className}`;
            div.innerHTML = `<span class="scobg-arrow">▶</span> ${text}`;
            return div;
        },

        toggleTree(el, container) {
            const isShow = container.classList.toggle('show');
            const arrow = el.querySelector('.scobg-arrow');
            if (arrow) arrow.style.transform = isShow ? 'rotate(90deg)' : 'rotate(0deg)';
        },

        renderContent(l1, l2, l3, items) {
            this.currentSelection = { l1, l2, l3, items };
            const content = this.panel.querySelector('.scobg-content');
            const filteredItems = this.filterItems(items, l1, l2, l3);
            if (!Object.keys(filteredItems).length) {
                content.innerHTML = `
                    <div class="scobg-content-empty">
                        <span>没有匹配的皮肤项</span>
                    </div>`;
                return;
            }
            const showSetOptions = l1 === '背景和环境' && l2 === '季节性';
            const setOptions = showSetOptions ? this.getSetOptions(items) : [];
            const setbarHtml = showSetOptions ? `
                <div class="scobg-setbar">
                    <span class="scobg-setbar-label">整套替换</span>
                    ${setOptions.map(name => `<button class="scobg-set-btn" data-set="${name}">${name}</button>`).join('')}
                    <button class="scobg-set-btn" data-set="__reset__">整套还原</button>
                    ${this.lastAppliedSet && this.lastAppliedSetGroup === `${l1}|${l2}|${l3}` ? `<span class="scobg-set-note">已应用：${this.lastAppliedSet}</span>` : ''}
                </div>` : '';
            content.innerHTML = `
                <div style="padding:15px; border-bottom:1px solid #333; position:sticky; top:0; background:rgba(26,30,38,0.95); z-index:10; backdrop-filter:blur(4px);">
                    <div style="font-size:11px; color:#666; margin-bottom:2px;">${l1} > ${l2}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="font-size:17px; font-weight:bold;">${l3}</div>
                        ${l1 === 'HQ 总部' ? '<span style="font-size:10px; color:#f5a623; border:1px solid #f5a623; border-radius:4px; padding:2px 6px; text-align:right;">旧版 HQ 无法正确渲染，不推荐使用</span>' : ''}
                    </div>
                </div>
                ${setbarHtml}
                <div class="scobg-grid"></div>
            `;
            const grid = content.querySelector('.scobg-grid');
            for (const [key, meta] of Object.entries(filteredItems)) {
                this.renderRow(grid, key, meta, () => this.renderContent(l1, l2, l3, items));
            }
            content.querySelectorAll('.scobg-set-btn').forEach(btn => {
                btn.onclick = () => {
                    if (btn.dataset.set === '__reset__') {
                        this.resetSet(l1, l2, l3, items);
                    } else {
                        this.applySet(l1, l2, l3, items, btn.dataset.set);
                    }
                };
            });
        },

        getSetOptions(items) {
            const counts = {};
            for (const meta of Object.values(items)) {
                for (const preset of meta.presets || []) {
                    counts[preset.name] = (counts[preset.name] || 0) + 1;
                }
            }
            const total = Object.keys(items).length;
            return Object.entries(counts)
                .filter(([, count]) => count === total)
                .map(([name]) => name);
        },

        applySet(l1, l2, l3, items, setName) {
            if (typeof Settings === 'undefined') return;
            let applied = 0;
            for (const [key, meta] of Object.entries(items)) {
                const preset = (meta.presets || []).find(p => p.name === setName);
                if (!preset) continue;
                Settings.data[key] = { target: preset.url, enabled: true };
                applied++;
            }
            Settings.save();
            this.lastAppliedSet = setName;
            this.lastAppliedSetGroup = `${l1}|${l2}|${l3}`;
            if (l1 === 'HQ 总部' || Object.keys(items).some(key => HQManager.isHqKey(key))) {
                HQManager.applyHqChange();
            }
            this.renderContent(l1, l2, l3, items);
            this.renderTree();
            if (typeof Scheduler !== 'undefined') Scheduler.scanAll();
            if (typeof StyleManager !== 'undefined') StyleManager.updateTheme();
        },

        resetSet(l1, l2, l3, items) {
            if (typeof Settings === 'undefined') return;
            for (const key of Object.keys(items)) {
                delete Settings.data[key];
            }
            Settings.save();
            this.lastAppliedSet = null;
            this.lastAppliedSetGroup = null;
            this.renderContent(l1, l2, l3, items);
            this.renderTree();
            if (typeof Scheduler !== 'undefined') Scheduler.scanAll();
            if (typeof StyleManager !== 'undefined') StyleManager.updateTheme();
        },

        renderRow(container, key, meta, refresh) {
            const hasSettings = typeof Settings !== 'undefined';
            const isModified = hasSettings && Object.prototype.hasOwnProperty.call(Settings.data, key);
            const cfg = (hasSettings && Settings.data[key]) || { enabled: false, target: "" };
            const relPath = (typeof PATH_MAP !== 'undefined' && PATH_MAP[key]) || `images/${key}`;
            const originalUrl = `${(typeof CONSTANTS !== 'undefined' ? CONSTANTS.STATIC_ROOT : '')}${relPath}`;

            const row = document.createElement('div');
            row.className = 'scobg-row';
            row.innerHTML = `
                <div class="scobg-info">
                    <div class="scobg-name">${meta.name}
                        ${isModified ? '<span class="scobg-badge scobg-badge-modified">已改</span>' : ''}
                        ${cfg.enabled ? '<span class="scobg-badge scobg-badge-enabled">启用</span>' : ''}
                    </div>
                    <label class="scobg-check">
                        <input type="checkbox" ${cfg.enabled ? 'checked' : ''}>
                        <span>使用自定义皮肤</span>
                    </label>
                    ${isModified ? '<button class="scobg-reset">恢复默认</button>' : ''}
                </div>
                <div class="scobg-imgs">
                    <div style="text-align:center"><div style="font-size:9px;color:#555;margin-bottom:2px">原图</div><img src="${originalUrl}" class="scobg-ui-img" style="opacity:0.2;filter:grayscale(1)"></div>
                    <div style="color:#333;font-size:12px">➔</div>
                    <div style="text-align:center"><div style="font-size:9px;color:#2196f3;margin-bottom:2px">当前</div><img src="${cfg.target || originalUrl}" class="scobg-ui-img click select-trigger" style="border-color:${cfg.enabled ? '#2196f3' : '#444'}"></div>
                </div>
            `;

            row.querySelector('input').onchange = (e) => this.update(key, cfg.target, e.target.checked, refresh);
            row.querySelector('.select-trigger').onclick = (e) => this.showMenu(e, meta, (url) => this.update(key, url, true, refresh));
            const resetBtn = row.querySelector('.scobg-reset');
            if (resetBtn) resetBtn.onclick = () => this.resetItem(key, refresh);
            container.appendChild(row);
        },

        resetItem(key, refresh) {
            if (typeof Settings !== 'undefined') {
                delete Settings.data[key];
                Settings.save();
            }
            if (refresh) refresh();
            if (HQManager.isHqKey(key)) HQManager.applyHqChange();
            if (typeof Scheduler !== 'undefined') Scheduler.scanAll();
            if (typeof StyleManager !== 'undefined') StyleManager.updateTheme();
        },

        showMenu(e, meta, onSelect) {
            const old = document.querySelector('.scobg-menu'); if (old) old.remove();
            const menu = document.createElement('div');
            menu.className = 'scobg-menu';

            // 响应式定位：极小屏走 CSS bottom sheet，中等屏居中，大屏跟随鼠标
            const vw = window.innerWidth;
            if (vw <= 640) {
                menu.style.left = '50%';
                menu.style.top = '50%';
                menu.style.transform = 'translate(-50%, -50%)';
            }

            if (meta.presets) {
                meta.presets.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'scobg-menu-item';
                    item.innerHTML = `<img src="${p.url}"><span>${p.name}${p.legacy ? ' <b style="color:#f5a623;font-weight:normal;font-size:10px;border:1px solid #f5a623;border-radius:3px;padding:0 3px;margin-left:4px;">旧版</b>' : ''}</span>`;
                    item.onclick = (ev) => { ev.stopPropagation(); onSelect(p.url); menu.remove(); };
                    menu.appendChild(item);
                });
            }

            const foot = document.createElement('div');
            foot.className = 'scobg-menu-foot';
            foot.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 5px; border-top: 1px solid #444; padding-top: 10px;';
            foot.innerHTML = `
                <div style="display:flex; gap:6px;">
                    <input type="text" placeholder="输入链接..." style="flex:1; width:0; background:#111; border:1px solid #555; color:#fff; padding:10px; border-radius:6px; font-size:13px; outline:none;">
                    <button class="scobg-btn-blue" style="padding:0 15px;">确定</button>
                </div>
            `;

            const input = foot.querySelector('input');
            const btn = foot.querySelector('button');
            const confirm = () => { if (input.value) { onSelect(input.value); menu.remove(); } };

            btn.onclick = (ev) => { ev.stopPropagation(); confirm(); };
            input.onclick = (ev) => ev.stopPropagation();
            input.onkeydown = (ev) => { if (ev.key === 'Enter') confirm(); };

            menu.appendChild(foot);
            document.body.appendChild(menu);

            if (vw > 640) {
                const menuWidth = menu.offsetWidth;
                const menuHeight = menu.offsetHeight;
                menu.style.left = `${Math.max(10, Math.min(e.clientX, window.innerWidth - menuWidth - 10))}px`;
                menu.style.top = `${Math.max(10, Math.min(e.clientY, window.innerHeight - menuHeight - 10))}px`;
            }

            setTimeout(() => {
                const outClick = (ev) => {
                    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', outClick); }
                };
                document.addEventListener('click', outClick);
            }, 50);
        },

        update(key, url, enabled, refresh) {
            if (typeof Settings !== 'undefined') {
                Settings.data[key] = { target: url, enabled: enabled };
                Settings.save();
            }
            if (refresh) refresh();
            if (HQManager.isHqKey(key)) HQManager.applyHqChange();
            if (typeof Scheduler !== 'undefined') Scheduler.scanAll();
            if (typeof StyleManager !== 'undefined') StyleManager.updateTheme();
        }
    };

    // ==========================================
    // 6. 触发扫描（仅用于设置变更后的即时生效/还原）
    // ==========================================
    const Scheduler = {
        scanAll() {
            document.querySelectorAll('img').forEach(img => UrlReplacer.applyToElement(img));
            document.querySelectorAll('[style*="background-image"]').forEach(el => UrlReplacer.applyToElementStyle(el));
            UrlReplacer.applyToStylesheets();
            StyleManager.updateTheme();
        },
        initialScan() {
            document.querySelectorAll('img').forEach(img => UrlReplacer.applyToElement(img));
            document.querySelectorAll('[style*="background-image"]').forEach(el => UrlReplacer.applyToElementStyle(el));
            StyleManager.updateTheme();
        }
    };


    // ==========================================
    // 7. 网络请求 Hook (监听主题变化)
    // ==========================================
    const NetworkHook = {
        init() {
            const AUTH_URL_PART = '/api/v3/companies/auth-data/';
            const handleAuthData = (data) => {
                if (data?.preferences?.theme) {
                    const newTheme = data.preferences.theme;
                    if (localStorage.getItem(CONSTANTS.THEME_KEY) !== newTheme) {
                        localStorage.setItem(CONSTANTS.THEME_KEY, newTheme);
                        StyleManager.updateTheme();
                    }
                }
            };

            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                try {
                    if (typeof args[0] === 'string' && args[0].includes(AUTH_URL_PART)) {
                        response.clone().json().then(handleAuthData).catch(() => { });
                    }
                } catch { }
                return response;
            };

            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function (method, url) {
                this.addEventListener('load', function () {
                    if (url && url.includes(AUTH_URL_PART) && this.responseText) {
                        try { handleAuthData(JSON.parse(this.responseText)); } catch { }
                    }
                });
                return originalXHR.apply(this, arguments);
            };
            console.log('[SC-Skin] 网络监听已启动');
        }
    };


    // ==========================================
    // 7.5 HQ 数据层替换：重写 API 中的 hqImage，让游戏按目标主题完整渲染
    // ==========================================
    const HQNetworkHook = {
        installed: false,

        shouldHook(url) {
            if (typeof url !== 'string' || !url || !url.includes('/api/')) return false;
            return /\/api\/v3\/companies\/(auth-data\/|[^/]+\/?$)|\/api\/v3\/companies-by-company\/|\/api\/v2\/companies\/[^/]+\/?$|\/api\/v2\/players\/unlocked-hqs\//.test(url);
        },

        rewriteValue(value) {
            let changed = false;
            const walk = (node, inheritedLevel) => {
                if (Array.isArray(node)) {
                    for (const item of node) walk(item, inheritedLevel);
                    return;
                }
                if (!node || typeof node !== 'object') return;
                const level = typeof node.level === 'number' ? node.level : inheritedLevel;
                for (const key of Object.keys(node)) {
                    if (key === 'hqImage' && typeof node[key] === 'string') {
                        const replacement = HQManager.getReplacementForHqImage(node[key], level);
                        if (replacement && replacement !== node[key]) {
                            node[key] = replacement;
                            changed = true;
                        }
                    } else if (node[key] && typeof node[key] === 'object') {
                        walk(node[key], level);
                    }
                }
            };
            walk(value, null);
            return { value, changed };
        },

        rewriteJsonText(text) {
            try {
                const data = JSON.parse(text);
                const result = this.rewriteValue(data);
                return result.changed ? JSON.stringify(result.value) : null;
            } catch (e) {
                return null;
            }
        },

        init() {
            if (this.installed) return;
            this.installed = true;
            const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const self = this;

            const originalFetch = W.fetch;
            if (typeof originalFetch === 'function') {
                W.fetch = async (...args) => {
                    const response = await originalFetch.apply(W, args);
                    try {
                        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                        if (response && response.ok && self.shouldHook(url)) {
                            const text = await response.clone().text();
                            const rewrittenText = self.rewriteJsonText(text);
                            if (rewrittenText) {
                                const headers = new Headers(response.headers);
                                headers.delete('content-length');
                                headers.delete('content-encoding');
                                return new Response(rewrittenText, {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers
                                });
                            }
                        }
                    } catch (e) { /* 保留原始响应 */ }
                    return response;
                };
            }

            const originalOpen = W.XMLHttpRequest.prototype.open;
            const originalSend = W.XMLHttpRequest.prototype.send;
            W.XMLHttpRequest.prototype.open = function (method, url) {
                this.__scSkinHqApiUrl = typeof url === 'string' ? url : '';
                return originalOpen.apply(this, arguments);
            };
            W.XMLHttpRequest.prototype.send = function (...args) {
                const xhr = this;
                const url = xhr.__scSkinHqApiUrl || '';
                if (self.shouldHook(url)) {
                    const textDesc = Object.getOwnPropertyDescriptor(W.XMLHttpRequest.prototype, 'responseText');
                    const responseDesc = Object.getOwnPropertyDescriptor(W.XMLHttpRequest.prototype, 'response');
                    try {
                        if (textDesc && textDesc.configurable) {
                            Object.defineProperty(xhr, 'responseText', {
                                configurable: true,
                                get() {
                                    let raw;
                                    try {
                                        raw = textDesc.get.call(xhr);
                                        if (raw) {
                                            const rewritten = self.rewriteJsonText(raw);
                                            if (rewritten) return rewritten;
                                        }
                                        return raw;
                                    } catch (e) {
                                        return raw;
                                    }
                                }
                            });
                        }
                        if (responseDesc && responseDesc.configurable) {
                            Object.defineProperty(xhr, 'response', {
                                configurable: true,
                                get() {
                                    let raw;
                                    try {
                                        raw = responseDesc.get.call(xhr);
                                        if (typeof raw === 'string') {
                                            const rewritten = self.rewriteJsonText(raw);
                                            return rewritten || raw;
                                        }
                                        if (raw && typeof raw === 'object') {
                                            const result = self.rewriteValue(raw);
                                            return result.changed ? result.value : raw;
                                        }
                                        return raw;
                                    } catch (e) {
                                        return raw;
                                    }
                                }
                            });
                        }
                    } catch (e) { /* 忽略无法接管的情况 */ }
                }
                return originalSend.apply(this, args);
            };

            console.log('[SC-Skin] HQ 数据层替换已启动');
        }
    };


    // ==========================================
    // 8. 版本更新检查模块
    // ==========================================
    const UPDATE_IGNORE_KEY = 'sc_oldBuildingsGraphic_ignored_version';

    const UpdateChecker = {
        init() {
            // 延迟执行，避免影响页面主要内容加载
            setTimeout(() => this.checkUpdate(), 5000);
        },

        compareVersions(v1, v2) {
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
        },

        showUpdateToast(version, changelog, downloadUrl) {
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

                /* 多个脚本同时提示时，后出现的弹窗向下错开，避免叠在一起 */
                .sc-update-toast-oldBuildingsGraphic.show ~ .sc-update-toast.show,
                .sc-update-toast.show ~ .sc-update-toast-oldBuildingsGraphic.show { top: 80px; }
                
                /* 展开后的卡片样式 */
                .sc-update-toast.expanded {
                    border-radius: 12px; padding: 20px; width: 400px;
                    background: #ffffff; color: #333; cursor: default;
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
                    display: none; cursor: pointer; font-size: 20px; color: #999;
                    line-height: 1; padding: 5px;
                }
                .sc-update-toast.expanded .sc-update-close { display: block; }
                .sc-update-close:hover { color: #333; }
    
                /* 内容区域 */
                .sc-update-body {
                    max-height: 0; opacity: 0; transition: all 0.3s ease; overflow: hidden;
                }
                .sc-update-toast.expanded .sc-update-body {
                    max-height: 400px; opacity: 1; margin-top: 15px;
                }
    
                .sc-changelog-box {
                    background: #f5f7f9; padding: 12px; border-radius: 6px;
                    margin: 10px 0; color: #555; font-size: 13px;
                    border-left: 3px solid #ddd; max-height: 150px; overflow-y: auto;
                }
    
                /* 底部按钮区域 */
                .sc-update-actions {
                    display: flex; justify-content: space-between; align-items: center; margin-top: 20px;
                }
                .sc-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; }
                .sc-btn-primary { background: #2196F3; color: white; }
                .sc-btn-link { background: transparent; color: #999; text-decoration: underline; padding: 8px 0; }
                .sc-btn-link:hover { color: #666; }
            `;
            document.head.appendChild(style);

            // 2. HTML 结构
            const toast = document.createElement('div');
            toast.className = 'sc-update-toast sc-update-toast-oldBuildingsGraphic';
            toast.innerHTML = `
                <div class="sc-update-close" id="sc-oldBuildingsGraphic-close" title="暂时关闭">&times;</div>
                <div class="sc-update-header" id="sc-oldBuildingsGraphic-title">SC图片替换插件 发现新版本 v${version} (点击查看)</div>
                <div class="sc-update-body">
                    <p style="margin:0; font-weight:bold;">更新日志：</p>
                    <div class="sc-changelog-box">${changelog.replace(/\n/g, '<br>') || '修复已知问题，优化性能。'}</div>
                    <p style="font-size: 11px; color: #999; margin: 10px 0;">
                        提示：忽略后将不再提示此版本。
                    </p>
                    <div class="sc-update-actions">
                        <button class="sc-btn sc-btn-link" id="sc-oldBuildingsGraphic-ignore-forever">忽略此次更新</button>
                        <button class="sc-btn sc-btn-primary" id="sc-oldBuildingsGraphic-confirm">前往更新</button>
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
                    toast.querySelector('#sc-oldBuildingsGraphic-title').innerHTML = `SC图片替换插件 发现新版本 v${version}`;
                }
            };

            // 右上角关闭：仅仅是本次消失
            toast.querySelector('#sc-oldBuildingsGraphic-close').onclick = (e) => {
                e.stopPropagation();
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            };

            // 左下角：忽略此版本
            toast.querySelector('#sc-oldBuildingsGraphic-ignore-forever').onclick = (e) => {
                e.stopPropagation();
                localStorage.setItem(UPDATE_IGNORE_KEY, version);
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            };

            // 右下角：去更新
            toast.querySelector('#sc-oldBuildingsGraphic-confirm').onclick = (e) => {
                e.stopPropagation();
                window.open(downloadUrl, '_blank');
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            };
        },

        async checkUpdate() {
            const scriptUrl = 'https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js?t=' + Date.now();
            const downloadUrl = 'https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js';
            // @changelog    图片替换改为 URL 赋值时源头接管，去掉全量 DOM 扫描，修复启动卡加载，移除关闭页面时的重复配置保存，皮肤面板新增搜索、已修改筛选、320px 适配与季节性整套替换，修复季节性当前主题图片匹配

            fetch(scriptUrl)
                .then(res => res.text())
                .then(remoteText => {
                    const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
                    const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
                    if (!matchVersion) return;

                    latestVersion = matchVersion[1]; // 确保全局变量被更新
                    const changeLog = matchChange ? matchChange[1] : '';

                    // 1. 首先进行版本比较
                    const isNewer = this.compareVersions(latestVersion, localVersion) > 0;

                    // 2. 只有确实有新版本时，才将 hasNewVersion 设为 true
                    if (isNewer) {
                        hasNewVersion = true; // 恢复你的原有逻辑
                        console.log(`SC图片替换插件 发现新版本 v${latestVersion}`);

                        // 3. 检查是否被用户手动忽略过
                        const ignoredVersion = localStorage.getItem(UPDATE_IGNORE_KEY);
                        if (ignoredVersion && this.compareVersions(ignoredVersion, latestVersion) >= 0) {
                            console.log(`[Update] 用户已忽略此版本，不弹出 UI 提示`);
                            return;
                        }

                        // 4. 如果没有被忽略，则弹出 UI 提示
                        this.showUpdateToast(latestVersion, changeLog, downloadUrl);
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
    };


    // ==========================================
    // 9. 使用说明与首次引导
    // ==========================================
    const InstructionsManager = {
        overlay: null,
        panel: null,

        /** 使用说明的 HTML 内容 */
        getHTML() {
            return `
                <div id="scobg-help" style="
                    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
                    width:92vw; max-width:700px; max-height:85vh; overflow-y:auto;
                    background:#1a1e26; border:1px solid #444; border-radius:12px;
                    z-index:200000; color:#fff; font-family:-apple-system,system-ui,sans-serif;
                    box-shadow:0 20px 60px rgba(0,0,0,0.9); display:none; flex-direction:column;
                ">
                    <div style="
                        padding:16px 20px; border-bottom:1px solid #2a2f3a;
                        display:flex; justify-content:space-between; align-items:center;
                        background:#21262e; border-radius:12px 12px 0 0; position:sticky; top:0;
                    ">
                        <span style="font-size:16px; font-weight:bold;">📖 使用说明</span>
                        <span id="scobg-help-close" style="
                            cursor:pointer; font-size:22px; color:#777; padding:5px; line-height:1;
                        ">✕</span>
                    </div>
                    <div style="padding:20px; font-size:14px; line-height:1.7; color:#ccc;">

                        <h3 style="color:#fff; margin:0 0 8px 0;">🎯 这是什么？</h3>
                        <p>本脚本可以替换 SimCompanies 游戏中的建筑图案、背景和资源图标，
                        让你使用旧版建筑外观或自定义皮肤。</p>

                        <h3 style="color:#fff; margin:20px 0 8px 0;">🚀 快速开始</h3>
                        <ol style="margin:0; padding-left:20px;">
                            <li>打开 SimCompanies 游戏页面</li>
                            <li>点击 Tampermonkey 菜单 → <b>🎨 皮肤管理面板</b></li>
                            <li>在左侧（手机上为上方）选择分类</li>
                            <li>勾选 "<b>使用自定义皮肤</b>" 启用替换</li>
                            <li>点击右侧预览图，选择你喜欢的皮肤图案</li>
                            <li>也可以粘贴自定义图片链接</li>
                        </ol>

                        <h3 style="color:#fff; margin:20px 0 8px 0;">🖼️ 面板功能说明</h3>
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <tr><td style="padding:6px 8px; border-bottom:1px solid #333; color:#2ecc71;">💾 保存</td><td style="padding:6px 8px; border-bottom:1px solid #333;">立即保存当前设置</td></tr>
                            <tr><td style="padding:6px 8px; border-bottom:1px solid #333; color:#2196f3;">🔄 刷新</td><td style="padding:6px 8px; border-bottom:1px solid #333;">刷新页面使新皮肤生效</td></tr>
                            <tr><td style="padding:6px 8px; border-bottom:1px solid #333; color:#e67e22;">📥 导入配置</td><td style="padding:6px 8px; border-bottom:1px solid #333;">从 JSON 文件恢复设置</td></tr>
                            <tr><td style="padding:6px 8px; border-bottom:1px solid #333; color:#d35400;">📤 导出配置</td><td style="padding:6px 8px; border-bottom:1px solid #333;">备份当前设置到 JSON 文件</td></tr>
                            <tr><td style="padding:6px 8px; border-bottom:1px solid #333;">🎨 预览图</td><td style="padding:6px 8px; border-bottom:1px solid #333;">左侧为原图，右侧点击可更换皮肤</td></tr>
                        </table>

                        <h3 style="color:#fff; margin:20px 0 8px 0;">📱 手机用户提示</h3>
                        <ul style="margin:0; padding-left:20px;">
                            <li>面板打开后，<b>上方为分类列表</b>，下方为详细设置</li>
                            <li>点击分类名称展开子分类</li>
                            <li>选择皮肤预设时弹出底部菜单</li>
                            <li>导入/导出按钮在 <b>···</b> 更多菜单中</li>
                        </ul>

                        <h3 style="color:#fff; margin:20px 0 8px 0;">🔄 自动更新</h3>
                        <p>脚本启动后会自动从服务器获取最新皮肤数据。
                        发现新版本时会有更新提示，皮肤库也会实时热替换。</p>

                        <h3 style="color:#fff; margin:20px 0 8px 0;">❓ 常见问题</h3>
                        <p><b>Q:</b> 设置后没有变化？<br>
                        <b>A:</b> 点击面板中的「刷新」按钮或手动刷新页面。</p>
                        <p><b>Q:</b> 如何恢复原始外观？<br>
                        <b>A:</b> 取消勾选 "使用自定义皮肤" 即可<u>立即恢复</u>，无需刷新页面（勾选/取消的瞬间就会自动生效）。</p>
                        <p><b>Q:</b> 自定义链接支持哪些格式？<br>
                        <b>A:</b> 任何可直接访问的图片 URL（支持 PNG / JPG / WebP / GIF 等浏览器常见格式）。</p>

                        <div style="text-align:center; margin-top:24px; padding-top:16px; border-top:1px solid #333; color:#555; font-size:12px;">
                            SC背景图案替换插件 v${localVersion}
                        </div>
                    </div>
                </div>
            `;
        },

        show() {
            if (!this.panel) {
                this.panel = document.createElement('div');
                this.panel.innerHTML = this.getHTML();
                document.body.appendChild(this.panel);

                // 遮罩
                this.overlay = document.createElement('div');
                this.overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:199999; display:none;';
                this.overlay.onclick = () => this.hide();
                document.body.appendChild(this.overlay);

                document.getElementById('scobg-help-close').onclick = () => this.hide();
            }

            const helpPanel = document.getElementById('scobg-help');
            if (helpPanel) {
                helpPanel.style.display = 'flex';
                this.overlay.style.display = 'block';
            }
        },

        hide() {
            const helpPanel = document.getElementById('scobg-help');
            if (helpPanel) helpPanel.style.display = 'none';
            if (this.overlay) this.overlay.style.display = 'none';
        },

        /** 首次运行检查，返回 true 表示首次运行 */
        checkFirstRun() {
            const done = localStorage.getItem(CONSTANTS.FIRST_RUN_KEY);
            if (!done) {
                localStorage.setItem(CONSTANTS.FIRST_RUN_KEY, '1');
                return true;
            }
            return false;
        }
    };


    // ==========================================
    // 10. 启动 & 全局暴露
    // ==========================================
    function onDomReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function main() {
        try {
            UrlReplacer.install(); // 1. 先接管 URL 赋值，游戏脚本运行前生效
        } catch (e) {
            console.warn('[SC-Skin] URL 接管安装失败', e);
        }
        ConfigManager.init(); // 2. 先读取本地缓存的最新的 UI_MANIFEST (如果有)
        Settings.init();      // 3. 初始化用户个人设置 (这步会遍历 UI_MANIFEST)
        try {
            HQNetworkHook.init(); // 3.5 尽早接管 API，让 auth-data 加载时就能改写 hqImage
        } catch (e) {
            console.warn('[SC-Skin] HQ 数据层替换启动失败', e);
        }
        UpdateChecker.init();

        // 注册 Tampermonkey 菜单（使用说明），不依赖 DOM，可立即注册
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('📖 使用说明', () => InstructionsManager.show());
        }

        onDomReady(() => {
            StyleManager.init();
            SCobgUIManager.init();
            try {
                NetworkHook.init();
            } catch (e) {
                console.warn('[SC-Skin] 网络监听启动失败', e);
            }

            // 首次运行自动弹出使用说明
            if (InstructionsManager.checkFirstRun()) {
                setTimeout(() => InstructionsManager.show(), 1500);
            }

            // 暴露到全局，方便调试
            window.SC_Instructions = InstructionsManager;

            // 兜底扫描一次；常规替换由 UrlReplacer 在赋值时完成
            Scheduler.initialScan();

        });

        window.SC_Skin_Manager = {
            settings: Settings,
            config: ConfigManager, // 暴露给外部调试
            forceRescan: () => Scheduler.scanAll()
        };
    }
    main();

})();
