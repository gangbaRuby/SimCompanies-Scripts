// ==UserScript==
// @name         自动计算最大时利润
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动计算最大时利润
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://cdn.jsdelivr.net/gh/gangbaRuby/SimCompanies-Scripts@main/%E8%87%AA%E5%8A%A8%E8%AE%A1%E7%AE%97%E6%9C%80%E5%A4%A7%E6%97%B6%E5%88%A9%E6%B6%A6.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/gangbaRuby/SimCompanies-Scripts@main/%E8%87%AA%E5%8A%A8%E8%AE%A1%E7%AE%97%E6%9C%80%E5%A4%A7%E6%97%B6%E5%88%A9%E6%B6%A6.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // ======================
    // 模块1：网络请求模块
    // ======================
    const Network = (() => {
        // 通用请求方法
        const makeRequest = (method, url, responseType, retryCount) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: method,
                    url: url,
                    headers: { 'Content-Type': 'application/json' },
                    onload: res => {
                        try {
                            resolve(
                                responseType === 'json'
                                    ? JSON.parse(res.responseText)
                                    : res.responseText
                            );
                        } catch (err) {
                            if (retryCount > 0) {
                                console.warn(`解析错误 ${url}, 重试中... (${retryCount})`);
                                makeRequest(method, url, responseType, retryCount - 1)
                                    .then(resolve)
                                    .catch(reject);
                            } else {
                                reject(`最终解析失败: ${err}`);
                            }
                        }
                    },
                    onerror: err => {
                        if (retryCount > 0) {
                            console.warn(`请求错误 ${url}, 重试中... (${retryCount})`);
                            makeRequest(method, url, responseType, retryCount - 1)
                                .then(resolve)
                                .catch(reject);
                        } else {
                            reject(`最终请求失败: ${err}`);
                        }
                    }
                });
            });
        };

        return {
            // 获取JSON数据（原有功能）
            requestJson: (url, retryCount = 3) =>
                makeRequest('GET', url, 'json', retryCount),

            // 新增：获取原始文本（新功能）
            requestRaw: (url, retryCount = 3) =>
                makeRequest('GET', url, 'text', retryCount)
        };
    })();

    // ======================
    // 模块2：区域数据模块
    // ======================

    const RegionData = (() => {
        // 公司信息
        const getAuthInfo = async () => {
            const data = await Network.requestJson('https://www.simcompanies.com/api/v3/companies/auth-data/');
            return {
                realmId: data.authCompany?.realmId,
                company: data.authCompany?.company,
                salesModifier: data.authCompany?.salesModifier,
                economyState: data.temporals?.economyState
            };
        };

        // 休闲加成
        const getRecreationBonus = async (realmId, company) => {
            const formattedCompany = company.replace(/ /g, "-");
            const data = await Network.requestJson(
                `https://www.simcompanies.com/api/v3/companies-by-company/${realmId}/${formattedCompany}/`
            );
            return data.infrastructure?.recreationBonus;
        };

        // 高管技能
        const getExecutives = async () => {
            const data = await Network.requestJson('https://www.simcompanies.com/api/v2/companies/me/executives/');
            const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

            return data.filter(exec =>
                ['coo', 'cfo', 'cmo', 'cto'].includes(exec.position) &&
                !exec.currentTraining &&
                new Date(exec.start) < threeHoursAgo
            );
        };

        // 管理费
        const getAdministrationCost = async () => {
            return Network.requestJson('https://www.simcompanies.com/api/v2/companies/me/administration-overhead/');
        };

        // 饱和度
        const getResourcesRetailInfo = async (realmId) => {
            const data = await Network.requestJson(
                `https://www.simcompanies.com/api/v4/${realmId}/resources-retail-info/`
            );
            const resourcesRetailInfo = [];

            // 遍历每个数据项并将对应的数据组合在一起
            data.forEach(item => {
                resourcesRetailInfo.push({
                    quality: item.quality,
                    dbLetter: item.dbLetter,
                    averagePrice: item.averagePrice,
                    saturation: item.saturation
                });
            });
            // console.log(resourcesRetailInfo);
            return resourcesRetailInfo;
        }


        // 完整区域数据获取
        const fetchFullRegionData = async () => {
            const auth = await getAuthInfo();
            const [recreation, executives, administration, resourcesRetailInfo] = await Promise.all([
                getRecreationBonus(auth.realmId, auth.company),
                getExecutives(),
                getAdministrationCost(),
                getResourcesRetailInfo(auth.realmId)
            ]);

            // 计算高管加成
            const calculateExecutiveBonus = (executives) => {
                const skills = executives.reduce((acc, exec) => {
                    acc[exec.position] = exec.skills;
                    return acc;
                }, {});

                return {
                    saleBonus: Math.floor((skills.cmo.cmo + Math.floor(
                        (skills.coo.cmo + skills.cfo.cmo + skills.cto.cmo) / 4
                    )) / 3),
                    adminBonus: skills.coo.coo + Math.floor(
                        (skills.cfo.coo + skills.cmo.coo + skills.cto.coo) / 4
                    )
                };
            };

            return {
                ...auth,
                recreationBonus: recreation,
                ...calculateExecutiveBonus(executives),
                administration,
                ResourcesRetailInfo: resourcesRetailInfo,
                timestamp: new Date().toISOString()
            };
        };

        return {
            fetchFullRegionData,
            getCurrentRealmId: async () => (await getAuthInfo()).realmId
        };
    })();

    // ======================
    // 模块3：基本数据模块
    // ======================
    const constantsData = (() => {
        // 私有变量存储处理后的内容
        let _processedData = null;

        // 获取并处理数据的逻辑
        const init = async () => {
            try {
                const scriptTag = document.querySelector(
                    'script[type="module"][crossorigin][src^="https://www.simcompanies.com/static/bundle/assets/index-"][src$=".js"]'
                );
                if (!scriptTag) throw new Error('未找到基本数据文件');

                // 获取原始内容
                const rawContent = await Network.requestRaw(scriptTag.src);

                // 空数据
                const data = {};

                // 需要提取core的数据键列表
                const targetKeys = [
                    'AVERAGE_SALARY',
                    'SALES',
                    'PROFIT_PER_BUILDING_LEVEL',
                    'RETAIL_MODELING_QUALITY_WEIGHT',
                    'RETAIL_ADJUSTMENT'
                ];

                // 根据键值找赋值
                const extractValue = (variableName) => {
                    // 严格匹配变量声明（防止误匹配注释等内容）
                    const varRegex = new RegExp(
                        '\\b' + variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*([^,]+),'
                    );

                    const match = rawContent.match(varRegex);
                    if (!match) {
                        console.warn(`变量未找到: ${variableName}`);
                        return null;
                    }

                    // 尝试解析值（支持数字/布尔/对象等类型）
                    try {

                        if (match[1].trim().startsWith('{')) {
                            // 增强对象匹配正则（关键修改点）
                            const objectRegex = new RegExp(
                                '\\b' + variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(\\{[^}]*\\})'
                            );

                            const matchAgain = rawContent.match(objectRegex);
                            // console.log(matchAgain[1])
                            if (matchAgain) {
                                return JSON.parse(matchAgain[1]
                                    .replace(/([{,]\s*|\{\s*)([^\s":,{}]+)(?=\s*:)/g, '$1"$2"')
                                    .replace(/:(\s*)\.(\d+)/g, ':$10.$2'));
                            }
                        }
                        // console.log(match[1])
                        return JSON.parse(match[1]
                            .replace(/^\.(\d+)/, '0.$1'));
                    } catch {
                        return match[1].trim(); // 保留原始字符串
                    }
                };


                // 循环处理每个键提取键值
                targetKeys.forEach(key => {
                    const keyMatch = rawContent.match(
                        new RegExp(`\\b${key}\\s*:\\s*([\\w$]+)\\b`)
                    );

                    if (keyMatch) {
                        const varName = keyMatch[1];
                        data[key] = extractValue(varName);
                        // console.log(`${key} 解析结果:`, data[key]);
                    } else {
                        console.warn(`${key} 未找到`);
                    }
                });

                // 提取建筑工资系数
                const extractSalaryModifiers = (str) => {
                    const regex = /{[^}]*?dbLetter:\s*"(\w+)"[^}]*?salaryModifier:\s*([-\d.]+)/g;
                    const result = {};

                    for (const match of str.matchAll(regex)) {
                        const letter = match[1];
                        const salary = parseFloat(match[2]);
                        result[letter] = salary;
                    }

                    return result;
                }
                const buildingsSalaryModifier = extractSalaryModifiers(rawContent);


                // 提取物品不同周期的基本参数
                const extractJSONData = (str) => {
                    // 匹配形如 "0: JSON.parse('...')" 或者 "0: JSON.parse(...)" 形式
                    const regex = /(\d+):\s*JSON\.parse\((['"])(.*?)\2\)/g;
                    const retailInfo = {};

                    // 使用 matchAll 进行全局匹配
                    for (const match of str.matchAll(regex)) {
                        const index = match[1];          // 捕获数字索引（0、1、2）
                        const jsonData = match[3];       // 获取 JSON.parse() 中的内容
                        // console.log('周期：' + index + '， 内容：' + jsonData);

                        try {
                            // 直接解析 JSON 内容
                            const parsedData = JSON.parse(jsonData);
                            // 将解析结果存入 retailInfo
                            retailInfo[index] = parsedData;
                        } catch (error) {
                            console.error("JSON 解析错误：", error, "数据：", jsonData);
                        }
                    }

                    return retailInfo;
                }
                const retailInfo = extractJSONData(rawContent);

                console.groupEnd();

                return {
                    data: data,
                    buildingsSalaryModifier: buildingsSalaryModifier,
                    retailInfo: retailInfo,
                    timestamp: new Date().toISOString()
                };

            } catch (error) {
                console.error('初始化失败:', error);
                throw error;
            }
        };

        // 返回可访问处理结果的接口
        return {
            initialize: init,
            getData: () => _processedData
        };
    })();


    // ======================
    // 模块4：数据存储模块
    // ======================
    const Storage = (() => {
        const KEYS = {
            region: realmId => `SimcompaniesRetailCalculation_${realmId}`,
            constants: 'SimcompaniesConstantsData'
        };

        const formatTime = (isoString) => {
            if (!isoString) return '无数据';
            const d = new Date(isoString);
            return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        };

        return {
            save: (type, data) => {
                const key = type === 'region' ? KEYS.region(data.realmId) : KEYS.constants;
                localStorage.setItem(key, JSON.stringify(data));
            },

            getFormattedStatus: (type) => {
                try {
                    let data;
                    switch (type) {
                        case 'r1':
                            data = localStorage.getItem(KEYS.region(0));
                            break;
                        case 'r2':
                            data = localStorage.getItem(KEYS.region(1));
                            break;
                        case 'constants':
                            data = localStorage.getItem(KEYS.constants);
                            break;
                    }

                    const parsedData = data ? JSON.parse(data) : null;
                    return {
                        text: parsedData ? formatTime(parsedData.timestamp) : '无数据',
                        className: parsedData ? 'has-data' : 'no-data'
                    };
                } catch (error) {
                    return { text: '数据损坏', className: 'no-data' };
                }
            }
        };
    })();

    // ======================
    // 模块5：界面模块
    // ======================
    const PanelUI = (() => {
        let panelElement = null;
        const statusElements = {};

        const typeDisplayNames = {
            r1: 'R1',
            r2: 'R2',
            constants: '基本'
        };

        // 插入样式
        const injectStyles = () => {
            const style = document.createElement('style');
            style.textContent = `
            .SimcompaniesRetailCalculation-mini-panel {
                position: fixed;
                left: 10px;
                bottom: 10px;
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
            }
            .SimcompaniesRetailCalculation-panel-content {
                display: none;
                position: absolute;
                bottom: 40px;
                left: 0;
                background: rgba(40,40,40,0.95);
                border-radius: 4px;
                padding: 8px;
                min-width: 260px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .SimcompaniesRetailCalculation-data-row {
                margin: 6px 0;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .SimcompaniesRetailCalculation-region-label {
                color: #BDBDBD;
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
        `;
            document.head.appendChild(style);
        };

        // 创建界面元素
        const createPanel = () => {
            const panel = document.createElement('div');
            panel.className = 'SimcompaniesRetailCalculation-mini-panel';

            // 触发器按钮
            const trigger = document.createElement('button');
            trigger.className = 'SimcompaniesRetailCalculation-trigger-btn';
            trigger.textContent = '≡';
            trigger.addEventListener('click', togglePanel);

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

            // 操作按钮
            const createActionButton = (text, type) => {
                const btn = document.createElement('button');
                btn.className = 'SimcompaniesRetailCalculation-action-btn';
                btn.textContent = text;
                btn.dataset.actionType = type;
                return btn;
            };

            content.append(
                createStatusRow('r1'),
                createStatusRow('r2'),
                createStatusRow('constants')
            );

            const btnGroup = document.createElement('div');
            btnGroup.className = 'SimcompaniesRetailCalculation-btn-group';
            btnGroup.append(
                createActionButton('更新区域数据', 'region'),
                createActionButton('更新基本数据', 'constants')
            );
            content.appendChild(btnGroup);

            panel.append(trigger, content);
            return panel;
        };

        // 切换面板可见性
        const togglePanel = (e) => {
            e.stopPropagation();
            const content = panelElement.querySelector('.SimcompaniesRetailCalculation-panel-content');
            content.style.display = content.style.display === 'block' ? 'none' : 'block';
            refreshStatus();
        };

        // 刷新状态显示
        const refreshStatus = () => {
            ['r1', 'r2', 'constants'].forEach(type => {
                const { text, className } = Storage.getFormattedStatus(type);
                statusElements[type].textContent = text;
                statusElements[type].className = `SimcompaniesRetailCalculation-region-status ${className}`;
            });
        };

        // 处理数据更新
        const handleUpdate = async (type) => {
            const button = panelElement.querySelector(`[data-action-type="${type}"]`);
            try {
                button.disabled = true;
                button.textContent = '更新中...';

                let data;
                if (type === 'region') {
                    const realmId = await RegionData.getCurrentRealmId();
                    data = await RegionData.fetchFullRegionData();
                    Storage.save('region', data);
                } else {
                    data = await constantsData.initialize();
                    Storage.save('constants', data);
                }

                refreshStatus();
            } catch (error) {
                console.error(`${type}更新失败:`, error);
                statusElements[type === 'region' ? 'r1' : 'constants'].textContent = '更新失败';
                statusElements[type === 'region' ? 'r1' : 'constants'].className = 'SimcompaniesRetailCalculation-region-status SimcompaniesRetailCalculation-no-data';
            } finally {
                button.disabled = false;
                button.textContent = type === 'region' ? '更新区域数据' : '更新基本数据';
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
            }
        };
    })();

    // 初始化界面
    PanelUI.init();

    // ======================
    // 模块6：商店内的最大时利润 本模块只使用了SimcompaniesConstantsData
    // ======================

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

    // 计算函数
    let zn, lwe;
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
        const g = zn.RETAIL_ADJUSTMENT[e] ?? 1;
        const s = Math.min(Math.max(2 - n, 0), 2), l = s / 2 + 0.5, c = r / 12;
        const d = zn.PROFIT_PER_BUILDING_LEVEL * (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) * g * (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) + (t.modeledStoreWages ?? 0);
        // console.log(`t.buildingLevelsNeededPerUnitPerHour:${t.buildingLevelsNeededPerUnitPerHour}, t.modeledUnitsSoldAnHour:${t.modeledUnitsSoldAnHour}, t.modeledStoreWages:${t.modeledStoreWages} , s:${s} , c:${c}, g:${g}`)
        const h = t.modeledUnitsSoldAnHour * l;
        const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
        const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
        return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
    };
    const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size) => {
        const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
        if (u <= 0) return NaN;
        const d = u / acc / size;
        return d - d * salesModifier / 100;
    };

    // 主功能
    function initAutoPricing() {
        try {
            const input = document.querySelector('input[name="price"]');
            if (!input) {
                // console.warn("[AutoPricing] Price input not found!");
                return;
            }

            const reactInstance = findReactComponent(input);
            if (!reactInstance) {
                console.warn("[AutoPricing] React component not found!", Object.keys(input));
                return;
            }
            const cards = document.querySelectorAll('div[style="overflow: visible;"]');

            cards.forEach(card => {
                if (card.dataset.autoPricingAdded) return;

                const priceInput = card.querySelector('input[name="price"]');
                if (!priceInput) return;

                const comp = findReactComponent(priceInput);
                if (!comp) return;

                const btn = document.createElement('button');
                btn.textContent = '最大时利润';
                btn.type = 'button';
                btn.style = `
                margin-top: 5px;
                background: #2196F3;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                width: 100%;
            `;

                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (localStorage.getItem('SimcompaniesConstantsData') == null) {
                        alert("请尝试更新基本数据（左下角按钮）");
                        return;
                    }
                    lwe = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
                    zn = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;
                    const {
                        size, acceleration, economyState, resource,
                        salesModifierWithRecreationBonus, skillCMO, skillCOO,
                        saturation, administrationOverhead, wages,
                        buildingKind, forceQuality
                    } = comp.props;
                    const { cogs, quality, quantity } = comp.state

                    // console.log(`size:${size}, acceleration:${acceleration}, economyState：${economyState},
                    // resource：${resource},salesModifierWithRecreationBonus:${salesModifierWithRecreationBonus},
                    // skillCMO：${skillCMO}, skillCOO:${skillCOO},
                    // saturation:${saturation}, administrationOverhead:${administrationOverhead}, wages:${wages},
                    // buildingKind:${buildingKind}, forceQuality:${forceQuality}，cogs:${cogs}, quality:${quality}, quantity:${quantity}`)
                    // console.log(`zn.PROFIT_PER_BUILDING_LEVEL: ${zn.PROFIT_PER_BUILDING_LEVEL}`)

                    let currentPrice = Math.floor(cogs / quantity) || 1;
                    let bestPrice = currentPrice;
                    let maxProfit = -Infinity;
                    let _, v, b, w, revenue, wagesTotal, secondsToFinish, currentWagesTotal = 0;
                    // console.log(`currentPrice：${currentPrice}, bestPrice：${bestPrice}， maxProfit：${maxProfit}`)

                    // setInput(input, currentPrice.toFixed(2));

                    // 以下两个不受currentPrice影响 可不参与循环
                    v = salesModifierWithRecreationBonus + Math.floor(skillCMO / 3);
                    b = Ul(administrationOverhead, skillCOO);

                    while (currentPrice > 0) {


                        w = zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, currentPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size);

                        // console.log(`v:${v}, b:${b}, w:${w}`)

                        revenue = currentPrice * quantity;
                        wagesTotal = Math.ceil(w * wages * acceleration * b / 60 / 60);
                        secondsToFinish = w;

                        // console.log(`revenue:${revenue}, wagesTotal:${wagesTotal}, secondsToFinish:${secondsToFinish}`)
                        if (!secondsToFinish || secondsToFinish <= 0) break;

                        let profit = (revenue - cogs - wagesTotal) / secondsToFinish;
                        if (profit > maxProfit) {
                            maxProfit = profit;
                            bestPrice = currentPrice;
                        } else if (maxProfit > 0 && profit < 0) { //有正利润后出现负利润提前终端循环
                            break;
                        }
                        // console.log(`当前定价：${bestPrice}, 当前最大秒利润：${maxProfit}`)
                        if (currentPrice < 8) {
                            currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                        } else if (currentPrice < 2001) {
                            currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                        } else {
                            currentPrice = Math.round(currentPrice + 1);
                        }
                    }

                    setInput(priceInput, bestPrice.toFixed(2));


                    // 校验用 如果误差大则提示用户尝试更新数据
                    currentWagesTotal = Math.ceil(zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, bestPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size) * wages * acceleration * b / 60 / 60);
                    // console.log(`currentWagesTotal:${currentWagesTotal}, comp.state.wagesTotal: ${comp.state.wagesTotal}`)
                    if (currentWagesTotal !== comp.state.wagesTotal) {
                        alert("先输入数量或请尝试更新基本数据（左下角按钮）");
                    }

                };

                priceInput.parentNode.insertBefore(btn, priceInput.nextSibling);
                card.dataset.autoPricingAdded = 'true';
            });
        } catch (err) {
            // console.error("[AutoPricing] Critical error:", err);
        }
    }

    // 启动观察器，只在商品卡片变化时运行自动定价逻辑
    function observeCardsForAutoPricing() {
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    initAutoPricing();
                    break;
                }
            }
        });

        // 监听整个页面 body 的变化
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 页面初始加载时执行一次
        initAutoPricing();
    }

    observeCardsForAutoPricing();
})();


