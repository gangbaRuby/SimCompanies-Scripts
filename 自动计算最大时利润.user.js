// ==UserScript==
// @name         自动计算最大时利润
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  自动计算最大时利润
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://hub.sctools.top/gangbaRuby/SimCompanies-Scripts/raw/refs/heads/main/%E8%87%AA%E5%8A%A8%E8%AE%A1%E7%AE%97%E6%9C%80%E5%A4%A7%E6%97%B6%E5%88%A9%E6%B6%A6.user.js
// @downloadURL  https://hub.sctools.top/gangbaRuby/SimCompanies-Scripts/raw/refs/heads/main/%E8%87%AA%E5%8A%A8%E8%AE%A1%E7%AE%97%E6%9C%80%E5%A4%A7%E6%97%B6%E5%88%A9%E6%B6%A6.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // ======================
    // 计算用到的函数
    // ======================
    let GLOBAL_REALM_ID = null;
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
    // 模块2：领域数据模块
    // ======================

    const RegionData = (() => {
        // 公司信息
        const getAuthInfo = async () => {
            const data = await Network.requestJson('https://www.simcompanies.com/api/v3/companies/auth-data/');
            return {
                realmId: data.authCompany?.realmId,
                company: data.authCompany?.company,
                salesModifier: data.authCompany?.salesModifier,
                economyState: data.temporals?.economyState,
                acceleration: data.levelInfo?.acceleration?.multiplier
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
                (!exec.strikeUntil || new Date(exec.strikeUntil) < new Date()) &&
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


        // 完整领域数据获取
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

                const safeSkill = (position, skillName) => skills[position]?.[skillName] || 0;

                return {
                    saleBonus: Math.floor((
                        safeSkill('cmo', 'cmo') +
                        Math.floor((
                            safeSkill('coo', 'cmo') +
                            safeSkill('cfo', 'cmo') +
                            safeSkill('cto', 'cmo')
                        ) / 4)
                    ) / 3),
                    adminBonus:
                        safeSkill('coo', 'coo') +
                        Math.floor((
                            safeSkill('cfo', 'coo') +
                            safeSkill('cmo', 'coo') +
                            safeSkill('cto', 'coo')
                        ) / 4)
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

                // 提取变量值（支持数字 / 布尔 / 对象）
                const extractValue = (variableName) => {
                    const varRegex = new RegExp(
                        variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*([^,;\\n\\r]+)'
                    );
                    const match = rawContent.match(varRegex);
                    if (!match) {
                        console.warn(`变量未找到: ${variableName}`);
                        return null;
                    }

                    try {
                        const value = match[1].trim();
                        if (value.startsWith('{')) {
                            const objectRegex = new RegExp(
                                variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(\\{[^}]*\\})'
                            );
                            const matchAgain = rawContent.match(objectRegex);
                            if (matchAgain) {
                                return JSON.parse(matchAgain[1]
                                    .replace(/([{,]\s*|\{\s*)([^\s":,{}]+)(?=\s*:)/g, '$1"$2"')
                                    .replace(/:(\s*)\.(\d+)/g, ':$10.$2')
                                );
                            }
                        }
                        return JSON.parse(value.replace(/^\.(\d+)/, '0.$1'));
                    } catch {
                        return match[1].trim();
                    }
                };

                // 遍历 targetKeys，从 rawContent 中提取变量名并解析值
                targetKeys.forEach(key => {
                    const keyMatch = rawContent.match(
                        new RegExp(`\\b${key}\\s*:\\s*([\\w$]+)`, 'm')
                    );

                    if (keyMatch) {
                        const varName = keyMatch[1];
                        data[key] = extractValue(varName);
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

                //提取物品基本数据
                const extractMntFromRaw = (str) => {
                    const assignPattern = /(\w+)\s*=\s*{/g;
                    let match;

                    while ((match = assignPattern.exec(rawContent)) !== null) {
                        const startIndex = match.index + match[0].indexOf('{');
                        let braceCount = 1;
                        let endIndex = startIndex + 1;

                        while (braceCount > 0 && endIndex < rawContent.length) {
                            const char = rawContent[endIndex];
                            if (char === '{') braceCount++;
                            else if (char === '}') braceCount--;
                            endIndex++;
                        }

                        if (braceCount === 0) {
                            const objectString = rawContent.slice(startIndex, endIndex);
                            try {
                                const obj = eval('(' + objectString + ')');
                                if (
                                    obj[1] && obj[1].dbLetter !== undefined &&
                                    obj[150] && obj[150].producedFrom &&
                                    obj[150].image?.includes("tree.png")
                                ) {
                                    return obj;
                                }
                            } catch (e) { }
                        }
                    }

                    return null;
                }
                const constantsResources = JSON.parse(JSON.stringify(extractMntFromRaw(rawContent)));

                return {
                    data: data,
                    buildingsSalaryModifier: buildingsSalaryModifier,
                    retailInfo: retailInfo,
                    constantsResources: constantsResources,
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
                        className: parsedData
                            ? 'SimcompaniesRetailCalculation-has-data'
                            : 'SimcompaniesRetailCalculation-no-data'
                    };
                } catch (error) {
                    return {
                        text: '数据损坏',
                        className: 'SimcompaniesRetailCalculation-no-data'
                    };
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

        // 饱和度表格功能
        let saturationTableElement = null;

        const showSaturationTable = () => {
            if (saturationTableElement) {
                saturationTableElement.remove();
                saturationTableElement = null;
                return;
            }

            const realmId = getRealmIdFromLink();
            if (realmId === null) {
                alert("未识别到 realmId！");
                return;
            }

            const dataStr = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
            if (!dataStr) {
                alert(`没有找到领域 ${realmId} 数据，请先更新！`);
                return;
            }
            const data = JSON.parse(dataStr);
            const list = data.ResourcesRetailInfo;

            // 映射表
            const resourceIdNameMap = {
                1: "电力",
                2: "水",
                3: "苹果",
                4: "橘子",
                5: "葡萄",
                6: "谷物",
                7: "牛排",
                8: "香肠",
                9: "鸡蛋",
                10: "原油",
                11: "汽油",
                12: "柴油",
                13: "运输单位",
                14: "矿物",
                15: "铝土矿",
                16: "硅材",
                17: "化合物",
                18: "铝材",
                19: "塑料",
                20: "处理器",
                21: "电子元件",
                22: "电池",
                23: "显示屏",
                24: "智能手机",
                25: "平板电脑",
                26: "笔记本电脑",
                27: "显示器",
                28: "电视机",
                29: "作物研究",
                30: "能源研究",
                31: "采矿研究",
                32: "电器研究",
                33: "畜牧研究",
                34: "化学研究",
                35: "软件",
                36: "undefined",
                37: "undefined",
                38: "undefined",
                39: "undefined",
                40: "棉花",
                41: "棉布",
                42: "铁矿石",
                43: "钢材",
                44: "沙子",
                45: "玻璃",
                46: "皮革",
                47: "车载电脑",
                48: "电动马达",
                49: "豪华车内饰",
                50: "基本内饰",
                51: "车身",
                52: "内燃机",
                53: "经济电动车",
                54: "豪华电动车",
                55: "经济燃油车",
                56: "豪华燃油车",
                57: "卡车",
                58: "汽车研究",
                59: "时装研究",
                60: "内衣",
                61: "手套",
                62: "裙子",
                63: "高跟鞋",
                64: "手袋",
                65: "运动鞋",
                66: "种子",
                67: "圣诞爆竹",
                68: "金矿石",
                69: "金条",
                70: "名牌手表",
                71: "项链",
                72: "甘蔗",
                73: "乙醇",
                74: "甲烷",
                75: "碳纤维",
                76: "碳纤复合材",
                77: "机身",
                78: "机翼",
                79: "精密电子元件",
                80: "飞行计算机",
                81: "座舱",
                82: "姿态控制器",
                83: "火箭燃料",
                84: "燃料储罐",
                85: "固体燃料助推器",
                86: "火箭发动机",
                87: "隔热板",
                88: "离子推进器",
                89: "喷气发动机",
                90: "亚轨道二级火箭",
                91: "亚轨道火箭",
                92: "轨道助推器",
                93: "星际飞船",
                94: "BFR",
                95: "喷气客机",
                96: "豪华飞机",
                97: "单引擎飞机",
                98: "无人机",
                99: "人造卫星",
                100: "航空航天研究",
                101: "钢筋混凝土",
                102: "砖块",
                103: "水泥",
                104: "黏土",
                105: "石灰石",
                106: "木材",
                107: "钢筋",
                108: "木板",
                109: "窗户",
                110: "工具",
                111: "建筑预构件",
                112: "推土机",
                113: "材料研究",
                114: "机器人",
                115: "牛",
                116: "猪",
                117: "牛奶",
                118: "咖啡豆",
                119: "咖啡粉",
                120: "蔬菜",
                121: "面包",
                122: "芝士",
                123: "苹果派",
                124: "橙汁",
                125: "苹果汁",
                126: "姜汁汽水",
                127: "披萨",
                128: "面条",
                129: "汉堡包",
                130: "千层面",
                131: "肉丸",
                132: "混合果汁",
                133: "面粉",
                134: "黄油",
                135: "糖",
                136: "可可",
                137: "面团",
                138: "酱汁",
                139: "动物饲料",
                140: "巧克力",
                141: "植物油",
                142: "沙拉",
                143: "咖喱角",
                144: "圣诞装饰品",
                145: "食谱",
                146: "南瓜",
                147: "杰克灯笼",
                148: "女巫服",
                149: "南瓜汤",
                150: "树",
                151: "复活节兔兔",
                152: "斋月糖果"
            };

            // 表格
            const table = document.createElement("table");
            table.style.cssText = "border-collapse:collapse;margin:10px 0;background:#333;color:white;font-size:13px;";
            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            ["物品", "质量", "饱和度"].forEach(text => {
                const th = document.createElement("th");
                th.textContent = text;
                th.style.cssText = "border:1px solid #666;padding:4px 8px;";
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
                    td.style.cssText = "border:1px solid #666;padding:4px 8px;text-align:center;";
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);

            // 容器
            saturationTableElement = document.createElement("div");
            saturationTableElement.style.cssText = "position:fixed;left:10px;top:50px;z-index:9999;background:#222;padding:6px;border-radius:4px;max-height:400px;overflow:auto;";
            saturationTableElement.appendChild(table);

            // 关闭按钮
            const closeBtn = document.createElement("button");
            closeBtn.textContent = "关闭";
            closeBtn.style.cssText = "margin-top:6px;padding:4px 8px;background:#c00;color:white;border:none;border-radius:3px;cursor:pointer;";
            closeBtn.onclick = () => {
                saturationTableElement.remove();
                saturationTableElement = null;
            };
            saturationTableElement.appendChild(closeBtn);

            document.body.appendChild(saturationTableElement);
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
                createActionButton('更新领域数据', 'region'),
                createActionButton('更新基本数据', 'constants'),
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';
                    btn.textContent = '当前领域饱和度表';
                    btn.onclick = showSaturationTable;
                    return btn;
                })()
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
                button.textContent = type === 'region' ? '更新领域数据' : '更新基本数据';
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

                        // 直接从comp.props赋值
                        size = comp.props.size;
                        acceleration = comp.props.acceleration;
                        economyState = comp.props.economyState;
                        resource = comp.props.resource;
                        salesModifierWithRecreationBonus = comp.props.salesModifierWithRecreationBonus;
                        skillCMO = comp.props.skillCMO;
                        skillCOO = comp.props.skillCOO;
                        saturation = comp.props.saturation;
                        administrationOverhead = comp.props.administrationOverhead;
                        wages = comp.props.wages;
                        buildingKind = comp.props.buildingKind;
                        forceQuality = comp.props.forceQuality;

                        // 直接从comp.state赋值
                        cogs = comp.state.cogs;
                        quality = comp.state.quality;
                        quantity = comp.state.quantity;

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

                        // 先移除旧的 maxProfit 显示（避免重复）
                        const oldProfit = card.querySelector('.auto-profit-display');
                        if (oldProfit) oldProfit.remove();

                        // 创建新的 maxProfit 显示元素
                        const profitDisplay = document.createElement('div');
                        profitDisplay.className = 'auto-profit-display';
                        profitDisplay.textContent = `每级时利润: ${((maxProfit / size) * 3600).toFixed(2)}`;
                        profitDisplay.style = `
                            margin-top: 5px;
                            font-size: 14px;
                            color: white;
                            background: gray;
                            padding: 4px 8px;
                            text-align: center;
                        `;

                        // 插入按钮下方
                        btn.parentNode.insertBefore(profitDisplay, btn.nextSibling);

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
            // 防抖计时器
            let debounceTimer;

            // 目标容器 - 改为更具体的容器选择器（如果能确定的话）
            const targetNode = document.body; // 或者更具体的容器如 '#shop-container'

            // 优化后的观察器配置
            const observer = new MutationObserver((mutationsList) => {
                // 使用防抖避免频繁触发
                clearTimeout(debounceTimer);
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

            // 初始执行（使用requestAnimationFrame确保DOM已加载）
            requestAnimationFrame(() => {
                initAutoPricing();
            });
        }

        observeCardsForAutoPricing();
    })();

    // ======================
    // 模块7：交易所计算时利润 使用SimcompaniesRetailCalculation_{realmId} SimcompaniesConstantsData
    // ======================
    const ResourceMarketHandler = (function () {
        let currentResourceId = null;
        let currentRealmId = null;
        let rowIdCounter = 0;
        const pendingRows = new Map(); // rowId -> <tr> element

        // Create worker blob: calculations move into worker's onmessage
        const workerCode = `
        self.onmessage = function(e) {
        const { rowId, order, SCD, SRC } = e.data;
        const { price, quantity, quality, resourceId: resource } = order;
        // bring constants into worker scope
        const lwe = SCD.retailInfo;
        const zn = SCD.data;

        // Utility functions defined inside to use local lwe and zn
        const Ul = (overhead, skillCOO) => {
            const r = overhead || 1;
            return r - (r - 1) * skillCOO / 100;
        };
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
            const g = zn.RETAIL_ADJUSTMENT[e] ?? 1;
            const s = Math.min(Math.max(2 - n, 0), 2),
                  l = s / 2 + 0.5,
                  c = r / 12;
            const d = zn.PROFIT_PER_BUILDING_LEVEL *
                (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                g *
                (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                (t.modeledStoreWages ?? 0);
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

        // Initial debug log

        // profit calculation loop
        let currentPrice = price,
            maxProfit = -Infinity,
            size = 1,
            acceleration = SRC.acceleration,
            economyState = SRC.economyState,
            salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus,
            skillCMO = SRC.saleBonus,
            skillCOO = SRC.adminBonus;

        // compute saturation locally
        const saturation = (() => {
            const list = SRC.ResourcesRetailInfo;
            const m = list.find(item =>
                item.dbLetter === parseInt(resource) &&
                (parseInt(resource) !== 150 || item.quality === quality)
            );
            return m?.saturation;
        })();

        const administrationOverhead = SRC.administration;
        const buildingKind = Object.entries(zn.SALES).find(([k, ids]) =>
            ids.includes(parseInt(resource))
        )?.[0];
        const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
        const averageSalary = zn.AVERAGE_SALARY;
        const wages = averageSalary * salaryModifier;
        const forceQuality = (parseInt(resource) === 150) ? quality : undefined;

        const v = salesModifierWithRecreationBonus + skillCMO;
        const b = Ul(administrationOverhead, skillCOO);

        while (currentPrice > 0) {
            const modeledData = wv(economyState, resource, forceQuality ?? null);
            const w = zL(
                buildingKind,
                modeledData,
                quantity,
                v,
                currentPrice,
                forceQuality === void 0 ? quality : 0,
                saturation,
                acceleration,
                size
            );
            const revenue = currentPrice * quantity;
            const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
            const secondsToFinish = w;
            const profit = (!secondsToFinish || secondsToFinish <= 0)
                ? NaN
                : (revenue - price * quantity - wagesTotal) / secondsToFinish;

            if (!secondsToFinish || secondsToFinish <= 0) break;
            if (profit > maxProfit) {
                maxProfit = profit;
            } else if (maxProfit > 0 && profit < 0) {
                break;
            }
            // price increment
            if (currentPrice < 8) {
                currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
            } else if (currentPrice < 2001) {
                currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
            } else {
                currentPrice = Math.round(currentPrice + 1);
            }

        }

        self.postMessage({ rowId, maxProfit });
    };
    `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        profitWorker.onmessage = function (e) {
            const { rowId, maxProfit } = e.data;
            const row = pendingRows.get(rowId);
            if (!row) return;
            pendingRows.delete(rowId);
            if (!row.querySelector('td.auto-profit-info')) {
                const td = document.createElement('td');
                td.classList.add('auto-profit-info');
                const span = document.createElement('span');
                span.textContent = `时利润：${(maxProfit * 3600).toFixed(2)}`;
                span.style.cssText = 'font-size:14px;color:white;background:gray;padding:4px 8px';
                td.appendChild(span);
                row.appendChild(td);
            }
        };

        function findValidTbody() {
            return [...document.querySelectorAll('tbody')].find(tbody => {
                const firstRow = tbody.querySelector('tr');
                return firstRow &&
                    firstRow.children.length >= 4 &&
                    firstRow.querySelector('td > div > div > a[href*="/company/"]');
            });
        }

        function extractNumbersFromAriaLabel(label) {
            const cleanedLabel = label.replace(/,/g, ''); // 去除千位分隔符
            const nums = cleanedLabel.match(/[\d.]+/g);
            if (!nums || nums.length < 3) return null;
            const lastThree = nums.slice(-3).map(x => Number(x));
            const [price, quantity, quality] = lastThree;
            if ([price, quantity, quality].some(n => isNaN(n))) return null;
            return { price, quantity, quality };
        }


        function extractRealmIdOnce(tbody) {
            if (currentRealmId) return;
            const row = tbody.querySelector('tr');
            const link = row?.querySelector('a[href*="/company/"]');
            const match = link?.getAttribute('href')?.match(/\/company\/(\d+)\//);
            if (match) {
                currentRealmId = match[1];
                // console.log('领域ID：', currentRealmId);
            }
        }

        function formatSeconds(seconds) {
            const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
            const s = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${h}:${m}:${s}`;
        }

        async function processNewRows(tbody) {
            const salesMap = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data.SALES;
            const rows = Array.from(tbody.querySelectorAll('tr'))
                .filter(r => !r.querySelector('td.auto-profit-info') && !r.hasAttribute('data-profit-calculated'));
            rows.forEach(row => {
                const ariaData = extractNumbersFromAriaLabel(row.getAttribute('aria-label') || '');
                if (!ariaData) return;
                // 过滤非零售商品
                const isRetail = Object.values(salesMap).some(list => list.includes(parseInt(currentResourceId)));
                if (!isRetail) return;
                const order = { resourceId: currentResourceId, realmId: currentRealmId, ...ariaData };
                const SCD = JSON.parse(localStorage.getItem("SimcompaniesConstantsData"));
                const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${order.realmId}`));
                if (!SCD || !SRC) return;
                if (rowIdCounter > 99999) rowIdCounter = 0;
                const rowId = rowIdCounter++;
                pendingRows.set(rowId, row);
                row.setAttribute('data-profit-calculated', '1'); // 防止重复处理
                profitWorker.postMessage({ rowId, order, SCD, SRC });
            });
        }

        return {
            init(resourceId) {
                currentResourceId = resourceId;
                currentRealmId = null;
                let observer;
                function tryInit() {
                    const tbody = findValidTbody();
                    if (!tbody) return;
                    if (observer) observer.disconnect();

                    // 👉 插入到form中
                    const form = document.querySelector('form');
                    if (form) {
                        const parentDiv = form.parentElement; // form 的直接父级 <div>
                        const container = parentDiv?.parentElement?.parentElement; // css-rnlot4 的容器

                        if (container && !container.querySelector('[data-custom-notice]')) {
                            const infoText = document.createElement('div');
                            infoText.textContent = '高管若变动，时利润会有误差，点左下更新。';
                            infoText.dataset.customNotice = 'true'; // 避免重复添加
                            container.appendChild(infoText); // 插入在 form 所在 div 的后面
                        }
                    }

                    const initPromise = (() => {
                        // console.log('[Check] currentResourceId:', currentResourceId, typeof currentResourceId);
                        if (!localStorage.getItem("SimcompaniesConstantsData") || !localStorage.getItem(`SimcompaniesRetailCalculation_${GLOBAL_REALM_ID}`)) {
                            return constantsData.initialize()
                                .then(data => {
                                    Storage.save('constants', data);
                                    extractRealmIdOnce(tbody);

                                    const salesMap = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data.SALES;
                                    const isRetail = Object.values(salesMap).some(list => list.includes(parseInt(currentResourceId)));
                                    if (!isRetail) return Promise.resolve();  // 如果不是零售商品，跳过处理

                                    if (!localStorage.getItem(`SimcompaniesRetailCalculation_${GLOBAL_REALM_ID}`)) {
                                        return RegionData.fetchFullRegionData();
                                    } else {
                                        return processNewRows(tbody);  // 只有零售商品才处理新行
                                    }
                                })
                                .then(regionData => {
                                    if (regionData) {
                                        Storage.save('region', regionData);
                                        console.log('[RegionAutoUpdater] 领域数据已更新');
                                    }
                                    // 不管是否获取了领域数据，都继续处理新行
                                    return processNewRows(tbody);
                                })
                                .catch(err => {
                                    console.error("基本数据初始化或领域数据更新失败", err);
                                });

                        } else {
                            extractRealmIdOnce(tbody);
                            const salesMap = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data.SALES;
                            const isRetail = Object.values(salesMap).some(list => list.includes(parseInt(currentResourceId)));
                            if (!isRetail) return Promise.resolve();  // 如果不是零售商品，跳过处理
                            return processNewRows(tbody);  // 只有零售商品才处理新行
                        }
                    })();


                    initPromise
                        .then(() => {
                            // 不需要重复调用 extract 和 process，如果上面处理过了
                        })
                        .catch(console.error);

                    const rowObserver = new MutationObserver(() => processNewRows(tbody));
                    rowObserver.observe(tbody, { childList: true, subtree: true });
                }
                tryInit();
                observer = new MutationObserver(tryInit);
                observer.observe(document, { childList: true, subtree: true });
            }
        };
    })();

    // ======================
    // 模块8：合同计算时利润 使用SimcompaniesRetailCalculation_{realmId} SimcompaniesConstantsData
    // ======================
    const incomingContractsHandler = (function () {
        let cardIdCounter = 0;
        const pendingCards = new Map(); // cardId -> DOM element

        // Worker 代码
        const workerCode = `
        self.onmessage = function(e) {
            const { cardId, order, SCD, SRC } = e.data;
            const { price, quantity, quality, resourceId: resource } = order;
            const lwe = SCD.retailInfo;
            const zn = SCD.data;
            const Ul = (overhead, skillCOO) => overhead - (overhead - 1) * skillCOO / 100;
            const wv = (e, t, r) => r === null ? lwe[e][t] : lwe[e][t].quality[r];
            const Upt = (e, t, r, n) => t + (e + n) / r;
            const Hpt = (e, t, r, n, a) => {
                const o = (n + e) / ((t - a) * (t - a));
                return e - (r - t) * (r - t) * o;
            };
            const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
            const Bpt = (e, t, r, n, a, o) => {
                const g = zn.RETAIL_ADJUSTMENT[e] ?? 1;
                const s = Math.min(Math.max(2 - n, 0), 2),
                      l = s / 2 + 0.5,
                      c = r / 12;
                const d = zn.PROFIT_PER_BUILDING_LEVEL *
                    (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                    g *
                    (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                    (t.modeledStoreWages ?? 0);
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
    
            let currentPrice = price,
                maxProfit = -Infinity,
                size = 1,
                acceleration = SRC.acceleration,
                economyState = SRC.economyState,
                salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus,
                skillCMO = SRC.saleBonus,
                skillCOO = SRC.adminBonus;
    
            const saturation = (() => {
                const list = SRC.ResourcesRetailInfo;
                const m = list.find(item =>
                    item.dbLetter === parseInt(resource) &&
                    (parseInt(resource) !== 150 || item.quality === quality)
                );
                return m?.saturation;
            })();
    
            const administrationOverhead = SRC.administration;
            const buildingKind = Object.entries(zn.SALES).find(([k, ids]) =>
                ids.includes(parseInt(resource))
            )?.[0];
            const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
            const averageSalary = zn.AVERAGE_SALARY;
            const wages = averageSalary * salaryModifier;
            const forceQuality = (parseInt(resource) === 150) ? quality : undefined;
    
            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = Ul(administrationOverhead, skillCOO);
    
            while (currentPrice > 0) {
                const modeledData = wv(economyState, resource, forceQuality ?? null);
                const w = zL(
                    buildingKind,
                    modeledData,
                    quantity,
                    v,
                    currentPrice,
                    forceQuality === void 0 ? quality : 0,
                    saturation,
                    acceleration,
                    size
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                const secondsToFinish = w;
                const profit = (!secondsToFinish || secondsToFinish <= 0)
                    ? NaN
                    : (revenue - price * quantity - wagesTotal) / secondsToFinish;
    
                if (!secondsToFinish || secondsToFinish <= 0) break;
                if (profit > maxProfit) {
                    maxProfit = profit;
                } else if (maxProfit > 0 && profit < 0) {
                    break;
                }

                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }
    
            self.postMessage({ cardId, maxProfit });
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
        profitWorker.onmessage = function (e) {
            const { cardId, maxProfit } = e.data;
            const card = pendingCards.get(cardId);
            if (!card) return;
            pendingCards.delete(cardId);
            injectHourlyProfit(card, maxProfit * 3600);
        };

        function init() {
            console.log('[合同页面处理] 初始化合同页面处理逻辑');

            const checkPageLoaded = setInterval(() => {
                const isOnTargetPage = /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);

                if (!isOnTargetPage) {
                    console.log('[合同页面处理] 用户已离开页面，停止轮询');
                    clearInterval(checkPageLoaded);
                    removeWarningNotice(); // 🔄 页面离开时清理提示
                    return;
                }

                const contractCards = document.querySelectorAll('div[tabindex="0"]');
                if (contractCards.length > 0) {
                    console.log('[合同页面处理] 合同卡片已加载');
                    clearInterval(checkPageLoaded);
                    insertWarningNotice(); // ✅ 卡片加载后插入提示
                    contractCards.forEach(handleCard);
                    startMutationObserver();
                } else {
                    console.log('[合同页面处理] 等待合同卡片加载...');
                }
            }, 500);
        }

        function startMutationObserver() {
            const targetNode = document.querySelectorAll('.row')[1];
            if (!targetNode) {
                console.error('[合同页面处理] 未找到目标容器');
                return;
            }

            const observer = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        const contractCards = document.querySelectorAll('div[tabindex="0"]');
                        contractCards.forEach(handleCard);
                    }
                }
            });

            observer.observe(targetNode, { childList: true, subtree: true });
        }

        function getRealmIdFromLink() {
            const link = document.querySelector('a[href*="/company/"]'); // 选择第一个符合条件的 <a> 标签
            if (link) {
                const match = link.href.match(/\/company\/(\d+)\//); // 提取 href 中的 realmId
                return match ? parseInt(match[1], 10) : null; // 如果匹配到 realmId，返回
            }
            return null; // 如果没有找到符合条件的链接，返回 null
        }

        function handleCard(card) {
            // ✅ 提前返回条件改成：
            if (card.hasAttribute('data-found') && !card.hasAttribute('data-retry')) return;

            const data = parseContractCard(card);
            if (!data || !data.dbLetter) return;

            const realmId = getRealmIdFromLink();
            const constantsKey = 'SimcompaniesConstantsData';
            const regionKey = `SimcompaniesRetailCalculation_${realmId}`;

            if (!localStorage.getItem(constantsKey) || !localStorage.getItem(regionKey)) {
                console.log('[合同卡片] 缺少数据，尝试初始化...');
                card.setAttribute('data-retry', 'true'); // 👈 表明后续还要再处理
                constantsData.initialize()
                    .then(data => {
                        Storage.save('constants', data);
                        return RegionData.fetchFullRegionData();
                    })
                    .then(regionData => {
                        Storage.save('region', regionData);
                        console.log('[合同卡片] 数据初始化完成，重新处理卡片');
                        handleCard(card); // ✅ 数据准备好再重试
                    })
                    .catch(err => {
                        console.error('[合同卡片] 数据初始化失败:', err);
                    });
                return;
            }

            card.setAttribute('data-found', 'true'); // ✅ 仅在数据准备好后设置
            card.removeAttribute('data-retry');

            const SCD = JSON.parse(localStorage.getItem(constantsKey));
            const SRC = JSON.parse(localStorage.getItem(regionKey));

            const isRetail = Object.values(SCD.data.SALES).some(arr =>
                arr.includes(parseInt(data.dbLetter))
            );
            if (!isRetail) {
                console.log(`[合同卡片] 非零售商品，跳过处理: dbLetter=${data.dbLetter}`);
                return;
            }

            const cardId = cardIdCounter++;
            pendingCards.set(cardId, card);

            profitWorker.postMessage({
                cardId,
                order: {
                    resourceId: data.dbLetter,
                    price: data.unitPrice,
                    quantity: data.quantity,
                    quality: data.quality
                },
                SCD,
                SRC
            });
        }

        function parseContractCard(card) {
            const result = {
                quantity: null,
                quality: null,
                unitPrice: null,
                totalPrice: null,
                imageSrc: null,
                resourcePath: null,
                dbLetter: null,
            };

            const label = card.getAttribute('aria-label') || '';
            const numberMatches = [...label.matchAll(/[\d,]+(?:\.\d+)?/g)];
            const qMatch = label.match(/Q(\d+)/);

            if (numberMatches.length >= 3 && qMatch) {
                result.totalPrice = parseFloat(numberMatches[numberMatches.length - 1][0].replace(/,/g, ''));
                result.unitPrice = parseFloat(numberMatches[numberMatches.length - 2][0].replace(/,/g, ''));
                result.quantity = parseInt(numberMatches[numberMatches.length - 4][0].replace(/,/g, ''));
                result.quality = parseInt(qMatch[1]);
            } else {
                console.warn('[合同卡片] aria-label 数字匹配失败:', label);
            }

            const img = card.querySelector('img[src^="/static/images/resources/"]');
            if (img) {
                result.imageSrc = img.getAttribute('src');
                result.resourcePath = result.imageSrc.replace(/^\/static\//, '');

                const constants = JSON.parse(localStorage.getItem('SimcompaniesConstantsData') || '{}');
                const resources = Object.values(constants?.constantsResources || {});
                const matched = resources.find(r => r.image === result.resourcePath);
                if (matched) result.dbLetter = matched.dbLetter;
            }

            return result;
        }

        function injectHourlyProfit(card, profitValue) {
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));

            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                priceBox.nextSibling.textContent?.includes('时利润')) return;

            const profitDisplay = document.createElement('b');
            profitDisplay.textContent = ` 时利润：${profitValue.toFixed(2)}`;
            profitDisplay.style.marginLeft = '8px';
            priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
        }

        function insertWarningNotice() {
            if (document.querySelector('[data-warning-text]')) return;

            const cards = document.querySelectorAll('div[tabindex="0"]');

            cards.forEach(card => {
                let parent = card.parentElement;
                if (!parent) return;

                let grandParent = parent.parentElement;
                if (!grandParent || grandParent.querySelector('[data-warning-text]')) return;

                const insertTarget = grandParent.firstElementChild;
                if (!insertTarget || insertTarget === parent) return;

                const tip = document.createElement('div');
                tip.textContent = '高管若变动，时利润会有误差，点左下更新。';
                tip.dataset.warningText = 'true';

                insertTarget.appendChild(tip);
            });
        }

        function removeWarningNotice() {
            const oldNotice = document.querySelector('[data-warning-text]');
            if (oldNotice) oldNotice.remove();
        }

        return { init };
    })();

    // ======================
    // 模块9：判断当前页面
    // ======================
    (function () {
        const PAGE_ACTIONS = {
            marketPage: {
                pattern: /^https:\/\/www\.simcompanies\.com\/[^\/]+\/market\/resource\/(\d+)\/?$/,
                action: (url) => {
                    const match = url.match(/\/resource\/(\d+)\/?/);
                    const resourceId = match ? match[1] : null;
                    if (resourceId) {
                        // console.log('进入 market 页面，资源ID：', resourceId);
                        ResourceMarketHandler.init(resourceId);
                    }
                }
            },
            contractPage: {
                pattern: /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/,
                action: (url) => {
                    console.log('[合同页面识别] 已进入合同页面');
                    incomingContractsHandler.init();
                }
            }
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

        handlePage();
    })();


    // ======================
    // 模块10：自动或定时更新数据 SimcompaniesConstantsData SimcompaniesRetailCalculation超过一小时就更新
    // 只在打开新标签页和切换领域是才会判断时间更新 更新数据无锁
    // ======================

    // 使用 MutationObserver 监听 DOM 变化并提取 realmId
    const observer = new MutationObserver(() => {
        const realmId = getRealmIdFromLink();
        if (realmId !== null) {
            console.log('[RegionAutoUpdater] 获取到 realmId:', realmId);
            // 停止监听，因为已经找到了 realmId
            observer.disconnect();

            // 存到全局变量里
            GLOBAL_REALM_ID = realmId;

            // 首先执行 ConstantsAutoUpdater 的检查和更新
            ConstantsAutoUpdater.checkAndUpdate();

            // 然后执行 RegionAutoUpdater 的检查和更新
            RegionAutoUpdater.checkAndUpdate(realmId);
        }
    });

    // 提取 realmId 的函数
    function getRealmIdFromLink() {
        const link = document.querySelector('a[href*="/company/"]'); // 选择第一个符合条件的 <a> 标签
        if (link) {
            const match = link.href.match(/\/company\/(\d+)\//); // 提取 href 中的 realmId
            return match ? parseInt(match[1], 10) : null; // 如果匹配到 realmId，返回
        }
        return null; // 如果没有找到符合条件的链接，返回 null
    }

    // ConstantsAutoUpdater 用于更新常量数据
    const ConstantsAutoUpdater = (() => {
        const STORAGE_KEY = 'SimcompaniesConstantsData';
        const ONE_HOUR = 60 * 60 * 1000;

        const needsUpdate = () => {
            const dataStr = localStorage.getItem(STORAGE_KEY);
            if (!dataStr) return true;

            try {
                const data = JSON.parse(dataStr);
                const lastTime = new Date(data.timestamp).getTime();
                const now = Date.now();
                return now - lastTime > ONE_HOUR;
            } catch (e) {
                return true;
            }
        };

        const update = async () => {
            try {
                const data = await constantsData.initialize();
                Storage.save('constants', data);
                console.log('[ConstantsAutoUpdater] 基本数据已更新');
            } catch (err) {
                console.error('[ConstantsAutoUpdater] 基本数据更新失败', err);
            }
        };

        const checkAndUpdate = () => {
            if (needsUpdate()) {
                console.log('[ConstantsAutoUpdater] 开始更新基本数据...');
                update();
            } else {
                console.log('[ConstantsAutoUpdater] 基本数据是最新的');
            }
        };

        return { checkAndUpdate };
    })();

    // RegionAutoUpdater 用于更新领域数据
    const RegionAutoUpdater = (() => {
        const getStorageKey = realmId => `SimcompaniesRetailCalculation_${realmId}`;
        const ONE_HOUR = 60 * 60 * 1000;

        const needsUpdate = (realmId) => {
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            const dataStr = localStorage.getItem(key);
            if (!dataStr) return true;

            try {
                const data = JSON.parse(dataStr);
                const lastTime = new Date(data.timestamp).getTime();
                const now = Date.now();

                const ONE_HOUR = 60 * 60 * 1000;
                if (now - lastTime > ONE_HOUR) return true;

                // 当前北京时间
                const nowInBeijing = new Date(now + 8 * 60 * 60 * 1000);

                // 早上 7:45 的北京时间戳 7:30开始更新饱和度 保险起见7:45更新 也是保证新的一天的第一次更新
                const todayBeijing = new Date(nowInBeijing.toISOString().slice(0, 10)); // 北京当天 0点
                const morning745 = new Date(todayBeijing.getTime() + 7 * 60 * 60 * 1000 + 45 * 60 * 1000).getTime();

                // 早上 22:01 的北京时间戳 高管获得经验的更新
                const todayBeijing1 = new Date(nowInBeijing.toISOString().slice(0, 10)); // 北京当天 0点
                const executives2201 = new Date(todayBeijing1.getTime() + 22 * 60 * 60 * 1000 + 1 * 60 * 1000).getTime();

                // 本周五 23:01 的北京时间戳
                const currentWeekday = nowInBeijing.getUTCDay(); // 周日是 0
                const daysUntilFriday = (5 - currentWeekday + 7) % 7;
                const fridayDate = new Date(todayBeijing.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
                const friday2301 = new Date(fridayDate.getTime() + 23 * 60 * 60 * 1000 + 1 * 60 * 1000).getTime();

                const lastTimeInBeijing = lastTime + 8 * 60 * 60 * 1000;

                // 触发早上 7:45 的更新
                if (now >= morning745 && lastTimeInBeijing < morning745) {
                    return true;
                }

                // 触发晚上 22:01 的更新
                if (now >= executives2201 && lastTimeInBeijing < executives2201) {
                    return true;
                }

                // 触发周五 23:01 的更新
                if (now >= friday2301 && lastTimeInBeijing < friday2301) {
                    return true;
                }

                return false;
            } catch (e) {
                return true;
            }
        };


        const update = async (realmId) => {
            try {
                let data;
                data = await RegionData.fetchFullRegionData();
                Storage.save('region', data);
                console.log(`[RegionAutoUpdater] 领域数据（${realmId}）已更新`);
            } catch (err) {
                console.error(`[RegionAutoUpdater] 领域数据（${realmId}）更新失败`, err);
            }
        };

        const checkAndUpdate = (realmId) => {
            if (realmId === null) {
                console.warn('[RegionAutoUpdater] 页面上无法识别 realmId');
                return;
            }

            if (needsUpdate(realmId)) {
                console.log(`[RegionAutoUpdater] 开始更新领域数据（${realmId}）...`);
                update(realmId);
            } else {
                console.log(`[RegionAutoUpdater] 领域数据（${realmId}）是最新的`);
            }
        };

        return { checkAndUpdate };
    })();

    // 监听页面加载完成后执行，但不再在 onload 直接提取 realmId
    window.onload = () => {
        // 开始监听 DOM 变化，直到提取到 realmId
        observer.observe(document.body, { childList: true, subtree: true });
    };

})();
