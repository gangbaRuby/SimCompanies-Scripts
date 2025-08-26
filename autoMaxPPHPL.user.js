// ==UserScript==
// @name         自动计算最大时利润
// @namespace    https://github.com/gangbaRuby
// @version      1.16.0
// @license      AGPL-3.0
// @description  在商店计算自动计算最大时利润，在合同、交易所展示最大时利润
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://simcompanies-scripts.pages.dev/autoMaxPPHPL.user.js
// @downloadURL  https://simcompanies-scripts.pages.dev/autoMaxPPHPL.user.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

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
        const g = zn.RETAIL_ADJUSTMENT[e] ?? 1;
        const s = Math.min(Math.max(2 - n, 0), 2), l = Math.max(0.6, s / 2 + 0.5), c = r / 12;
        const d = zn.PROFIT_PER_BUILDING_LEVEL * (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) * g * (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) + (t.modeledStoreWages ?? 0);
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
        152: "斋月糖果",
        153: "巧克力冰淇淋",
        154: "苹果冰淇淋"
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
                companyId: data.authCompany?.companyId,
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
            const response = await Network.requestJson('https://www.simcompanies.com/api/v3/companies/me/executives/');
            const data = response.executives;
            const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

            // 定义职位代码映射
            const targetPositions = ['o', 'f', 'm', 't', 'v', 'y'];

            return data.filter(exec =>
                exec.currentWorkHistory &&
                targetPositions.includes(exec.currentWorkHistory.position) &&
                (!exec.strikeUntil || new Date(exec.strikeUntil) < new Date()) &&
                new Date(exec.currentWorkHistory.start) < threeHoursAgo &&
                !exec.currentTraining
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

        // 天气
        const getWeather = async (realmId) => {
            try {
                const data = await Network.requestJson(`https://www.simcompanies.com/api/v2/weather/${realmId}/`);
                return {
                    Until: data.until,
                    sellingSpeedMultiplier: data.sellingSpeedMultiplier
                };
            } catch (e) {
                console.warn(`[Weather] Failed to fetch weather for realm ${realmId}:`, e);
                return {
                    Until: null,
                    sellingSpeedMultiplier: null
                };
            }
        };

        // 完整领域数据获取
        const fetchFullRegionData = async () => {
            const auth = await getAuthInfo();
            const [recreation, executives, administration, resourcesRetailInfo, sellingSpeedMultiplier, weatherUntil] = await Promise.all([
                getRecreationBonus(auth.realmId, auth.company),
                getExecutives(),
                getAdministrationCost(),
                getResourcesRetailInfo(auth.realmId),
                getWeather(auth.realmId)
            ]);

            // 计算高管加成
            const calculateExecutiveBonus = (executives) => {
                // 整理职位 → 技能表
                const skills = executives.reduce((acc, exec) => {
                    if (exec.currentWorkHistory) {
                        acc[exec.currentWorkHistory.position] = exec.skills;
                    }
                    return acc;
                }, {});

                // 安全读取技能值，没值就返回0
                const safeSkill = (position, skillName) => skills[position]?.[skillName] || 0;

                let saleBonus = Math.floor((
                    safeSkill('m', 'cmo') +
                    Math.floor(safeSkill('y', 'cmo') / 2) +
                    Math.floor((
                        safeSkill('o', 'cmo') +
                        safeSkill('f', 'cmo') +
                        safeSkill('t', 'cmo')
                    ) / 4)
                ) / 3);

                if (saleBonus > 80) {
                    saleBonus = 80 + Math.floor((saleBonus - 80) / 2);
                }
                if (saleBonus > 60) {
                    saleBonus = 60 + Math.floor((saleBonus - 60) / 2);
                }


                let adminBonus =
                    safeSkill('o', 'coo') +
                    Math.floor(safeSkill('v', 'coo') / 2) +
                    Math.floor((
                        safeSkill('f', 'coo') +
                        safeSkill('m', 'coo') +
                        safeSkill('t', 'coo')
                    ) / 4);

                if (adminBonus > 80) {
                    adminBonus = 80 + Math.floor((adminBonus - 80) / 2);
                }
                if (adminBonus > 60) {
                    adminBonus = 60 + Math.floor((adminBonus - 60) / 2);
                }

                return {
                    saleBonus,
                    adminBonus
                };
            };

            return {
                ...auth,
                recreationBonus: recreation,
                ...calculateExecutiveBonus(executives),
                administration,
                ResourcesRetailInfo: resourcesRetailInfo,
                sellingSpeedMultiplier,
                weatherUntil,
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
                    const escapedVar = variableName.replace('$', '\\$');
                    const varRegex = new RegExp(`[,{\\s]${escapedVar}\\s*=\\s*([^,;\\n\\r]+)`);
                    const match = rawContent.match(varRegex);
                    if (!match) {
                        console.warn(`变量未找到: ${variableName}`);
                        return null;
                    }

                    try {
                        const value = match[1].trim();
                        if (value.startsWith('{')) {
                            const objectRegex = new RegExp(`[,{\\s]${escapedVar}\\s*=\\s*(\\{[^}]*\\})`);
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

                        // 如果是 SALES，删掉 B 和 r 即删除大楼和餐馆此类非传统零售
                        if (key === 'SALES' && data[key]) {
                            delete data[key]['B'];
                            delete data[key]['r'];
                        }
                    } else {
                        console.warn(`${key} 未找到`);
                    }
                });

                // 提取建筑工资系数
                function extractSalaryModifiers(str) {
                    const result = {};

                    // ✅ 处理第一种格式：多个变量赋值
                    const varAssignRegex = /(\w+)\s*=\s*{/g;
                    let match;

                    while ((match = varAssignRegex.exec(str)) !== null) {
                        const startIndex = varAssignRegex.lastIndex - 1;
                        let braceCount = 1;
                        let currentIndex = startIndex + 1;

                        while (braceCount > 0 && currentIndex < str.length) {
                            if (str[currentIndex] === '{') braceCount++;
                            else if (str[currentIndex] === '}') braceCount--;
                            currentIndex++;
                        }

                        if (braceCount === 0) {
                            const objText = str.slice(startIndex, currentIndex);
                            const dbLetterMatch = objText.match(/dbLetter\s*:\s*"(\w+)"/);
                            const salaryMatch = objText.match(/salaryModifier\s*:\s*([.\d]+)/);

                            if (dbLetterMatch && salaryMatch) {
                                const dbLetter = dbLetterMatch[1];
                                const salary = parseFloat(salaryMatch[1]);
                                result[dbLetter] = salary;
                            }
                        }
                    }

                    // ✅ 处理第二种格式：对象字面量内部嵌套对象（带数字键）
                    const objectEntryRegex = /\d+\s*:\s*{[\s\S]*?}/g;
                    const entries = str.match(objectEntryRegex) || [];

                    for (const entry of entries) {
                        const dbLetterMatch = entry.match(/dbLetter\s*:\s*"(\w+)"/);
                        const salaryMatch = entry.match(/salaryModifier\s*:\s*([.\d]+)/);

                        if (dbLetterMatch && salaryMatch) {
                            const dbLetter = dbLetterMatch[1];
                            const salary = parseFloat(salaryMatch[1]);
                            result[dbLetter] = salary;
                        }
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
                bottom: 55px;
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
            saturationTableElement.style.cssText = `
                position:fixed;
                left:10px;
                top:50px;
                z-index:9998;
                background:#2c2c2c;
                color:#fff;
                padding:12px;
                border-radius:8px;
                max-height:400px;
                overflow:auto;
                box-shadow:0 4px 15px rgba(0,0,0,0.5);
                font-family:Arial, sans-serif;
            `;

            // 关闭按钮
            const closeBtn = document.createElement("button");
            closeBtn.textContent = "×";
            closeBtn.style.cssText = `
                position:absolute;
                top:6px;
                right:6px;
                background:#e74c3c;
                color:white;
                border:none;
                border-radius:50%;
                width:24px;
                height:24px;
                font-size:16px;
                cursor:pointer;
                line-height:24px;
                text-align:center;
                padding:0;
                transition: background 0.2s;
            `;
            closeBtn.onmouseover = () => closeBtn.style.background = "#ff6666";
            closeBtn.onmouseout = () => closeBtn.style.background = "#e74c3c";
            closeBtn.onclick = () => {
                saturationTableElement.remove();
                saturationTableElement = null;
            };
            saturationTableElement.appendChild(closeBtn);

            // 表格
            table.style.background = "#333";
            table.style.color = "#fff";
            saturationTableElement.appendChild(table);

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
                createActionButton('计算剩余量', 'calculateDecay'),
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';
                    btn.textContent = '当前领域饱和度表';
                    btn.onclick = showSaturationTable;
                    return btn;
                })(),
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';
                    btn.textContent = 'MP-?%';
                    btn.dataset.actionType = 'mpShow';
                    return btn;
                })()
            );
            content.appendChild(btnGroup);

            // 插件信息区块
            const info = document.createElement('div');
            info.style.cssText = 'margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:#ccc;border-top:1px solid #555;';

            const version = GM_info?.script?.version || '未知版本';

            info.innerHTML = `
                作者：<a href="https://www.simcompanies.com/zh-cn/company/0/Rabbit-House/" target="_blank" style="color:#6cf;">Rabbit House</a> 反馈请说明问题<br>
                源码：<a href="https://github.com/gangbaRuby/SimCompanies-Scripts" target="_blank" style="color:#6cf;">GitHub</a> ⭐🙇<br>
                版本：${version} 
            `;

            content.appendChild(info);
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
                    titleEl.textContent = `MP-?% - 点合同时利润降序，点公司跳转私信`;
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

                box = document.createElement('div');
                box.id = 'mp-floating-box';
                box.style.cssText = `
                position: fixed;
                left: 25px;
                top: 50px;
                width: min(450px, 90vw);
                max-height: 70vh;
                background: #222;
                color: #eee;
                padding: 12px;
                border-radius: 6px;
                box-shadow: 0 0 15px rgba(0,0,0,0.7);
                z-index: 9998;
                overflow: hidden;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                white-space: normal;
                word-break: break-word;
                user-select: none;
                display: flex;
                flex-direction: column;
              `;
                // header
                const header = document.createElement('div');
                header.style.cssText = `
                cursor: move;
                padding: 6px 10px;
                background: #111;
                border-radius: 6px 6px 0 0;
                font-weight: bold;
                user-select: none;
                display: flex;
                align-items: center;
                justify-content: space-between;
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
                color: #aaa;
                user-select: none;
                margin-left: 10px;
              `;
                closeBtn.onmouseenter = () => (closeBtn.style.color = '#fff');
                closeBtn.onmouseleave = () => (closeBtn.style.color = '#aaa');
                closeBtn.onclick = () => (box.style.display = 'none');
                header.appendChild(closeBtn);
                box.appendChild(header);

                // 输入区
                const inputWrapper = document.createElement('div');
                inputWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 10px 0; color: #eee; font-weight: bold;';

                inputWrapper.innerHTML = `
                <span style="flex: 0 0 auto;">MP-</span>
                <input id="mp-percent-input" type="number" min="0" step="0.1" value="${inputPercent}" style="background: #2c3e50; color: #fff; width: 40px;">
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
                  color: #eee;
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
                        width: 50px;
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
                        data = JSON.parse(raw);
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
            const button = panelElement.querySelector(`[data-action-type="${type}"]`);
            if (type === 'mpShow') {
                MpPanel.showPanel();
                return;
            }
            if (type === 'calculateDecay') {
                button.disabled = true;
                button.textContent = '计算中...';

                const wasOpen = document.getElementById('decayDataPanel')?.style.display !== 'none';

                try {
                    await window.calculateAll(); // 先执行计算
                } catch (e) {
                    console.error('计算失败', e);
                } finally {
                    if (wasOpen) {
                        DecayResultViewer.show(); // 如果原本是打开的，就刷新
                    } else {
                        DecayResultViewer.toggle(); // 原本关闭，执行 toggle 打开
                    }
                    button.disabled = false;
                    button.textContent = '计算剩余量';
                }
                return;
            }
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


                            w = zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, currentPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size, resource.retailSeason === "Summer" ? comp.props.weather : void 0);

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
                        currentWagesTotal = Math.ceil(zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, bestPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size, resource.retailSeason === "Summer" ? comp.props.weather : void 0) * wages * acceleration * b / 60 / 60);
                        // console.log(`currentWagesTotal:${currentWagesTotal}, comp.state.wagesTotal: ${comp.state.wagesTotal}`)
                        if (currentWagesTotal !== comp.state.wagesTotal) {
                            alert("计算利润与显示利润不相符，请先输入数量或请尝试更新基本数据（左下角按钮）");
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
                  l = Math.max(0.6, s / 2 + 0.5),
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
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / size;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
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
        const resourceDetail = SCD.constantsResources[parseInt(resource)]

        const v = salesModifierWithRecreationBonus + skillCMO;
        const b = Ul(administrationOverhead, skillCOO);
        let selltime;

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
                size,
                resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0
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
                selltime = secondsToFinish;
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

        self.postMessage({ rowId, maxProfit, selltime});
    };
    `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        // 全局状态与注册器（放最上面，只运行一次）
        const allProfitSpans = new Set();
        let isShowingProfit = true;

        setInterval(() => {
            isShowingProfit = !isShowingProfit;
            for (const span of allProfitSpans) {
                const { profitText, timeText } = span.dataset;
                span.textContent = isShowingProfit ? profitText : timeText;
            }
        }, 3000);

        // 主回调处理
        profitWorker.onmessage = function (e) {
            const { rowId, maxProfit, selltime } = e.data;
            const hours = Math.floor(selltime / 3600);
            const minutes = Math.ceil((selltime % 3600) / 60);
            const timeStr = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
            const profit = (maxProfit * 3600).toFixed(2);
            const row = pendingRows.get(rowId);
            if (!row) return;
            pendingRows.delete(rowId);

            if (!row.querySelector('td.auto-profit-info')) {
                const td = document.createElement('td');
                td.classList.add('auto-profit-info');

                const span = document.createElement('span');
                const isMobile = window.innerWidth <= 600;

                const profitText = `时利润：${Math.round(profit)}`;
                const timeText = `用时：${timeStr}`;
                const fullText = `时利润：${profit} 用时：${timeStr}`;

                span.textContent = isMobile ? (isShowingProfit ? profitText : timeText) : fullText;

                span.style.cssText = `
                display: inline-block;
                min-width: 60px;
                font-size: 16px;
                color: white;
                background: gray;
                padding: 4px 8px;
                line-height: 1.2;
                box-sizing: border-box;
            `.trim();

                td.appendChild(span);
                row.appendChild(td);

                if (isMobile) {
                    span.dataset.profitText = profitText;
                    span.dataset.timeText = timeText;
                    allProfitSpans.add(span);
                }
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
            if (!label || typeof label !== 'string') return null;

            let nums = [];
            let lastThree = [];

            // 中文直接用原逻辑
            if (/由.*公司提供/.test(label)) {
                const cleanedLabel = label.replace(/,/g, '');
                nums = cleanedLabel.match(/[\d.]+/g);
                if (!nums || nums.length < 3) return null;
                lastThree = nums.slice(-3).map(x => Number(x));
            }
            // 英文处理
            else if (/market order/i.test(label)) {
                // 提取公司名位置
                const companyMatch = label.match(/offered by company\s+([^\.,，]*)/i);
                const companyStart = companyMatch ? companyMatch.index : label.length;
                // 只取公司名前的文本进行数字匹配，避免公司名里的点或数字干扰
                const textToParse = label.slice(0, companyStart).replace(/,/g, '');
                nums = textToParse.match(/[\d.]+/g);
                if (!nums || nums.length < 3) return null;
                lastThree = nums.slice(-3).map(x => Number(x));
            }

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
                            infoText.textContent = '高管、周期变动，会影响计算，记得更新，所有展示内容均为1级建筑。';
                            infoText.dataset.customNotice = 'true'; // 避免重复添加
                            container.appendChild(infoText); // 插入在 form 所在 div 的后面
                        }
                    }

                    const initPromise = (() => {
                        extractRealmIdOnce(tbody);

                        const salesMap = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data.SALES;
                        const isRetail = Object.values(salesMap).some(list => list.includes(parseInt(currentResourceId)));
                        if (!isRetail) return Promise.resolve();  // 如果不是零售商品，跳过处理

                        return processNewRows(tbody);  // 是零售商品就处理新行
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
                      l = Math.max(0.6, s / 2 + 0.5),
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
            const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                if (u <= 0) return NaN;
                const d = u / acc / size;
                let p = d - d * salesModifier / 100;
                return weather && (p /= weather.sellingSpeedMultiplier), p
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
            const resourceDetail = SCD.constantsResources[parseInt(resource)]

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
                    size,
                    resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0
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
            // console.log('[合同页面处理] 初始化合同页面处理逻辑');

            const checkPageLoaded = setInterval(() => {
                const isOnTargetPage = /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);

                if (!isOnTargetPage) {
                    // console.log('[合同页面处理] 用户已离开页面，停止轮询');
                    clearInterval(checkPageLoaded);
                    removeWarningNotice(); // 🔄 页面离开时清理提示
                    return;
                }

                const contractCards = document.querySelectorAll('div[tabindex="0"]');
                if (contractCards.length > 0) {
                    // console.log('[合同页面处理] 合同卡片已加载');
                    clearInterval(checkPageLoaded);
                    insertWarningNotice(); // ✅ 卡片加载后插入提示
                    contractCards.forEach(handleCard);
                    startMutationObserver();
                } else {
                    // console.log('[合同页面处理] 等待合同卡片加载...');
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
            console.log(card)
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

            if (/quality/i.test(label)) { // 英文处理
                const quantityMatch = label.match(/(\d+)\s+[A-Za-z ]+quality/i);
                const qualityMatch = label.match(/quality\s*(\d+)/i);
                const unitPriceMatch = label.match(/at\s+\$([\d,.]+)\s+per unit/i);
                const totalPriceMatch = label.match(/total price\s+\$([\d,.]+)/i);

                if (quantityMatch) result.quantity = parseInt(quantityMatch[1].replace(/,/g, ''));
                if (qualityMatch) result.quality = parseInt(qualityMatch[1]);
                if (unitPriceMatch) result.unitPrice = parseFloat(unitPriceMatch[1].replace(/,/g, ''));
                if (totalPriceMatch) result.totalPrice = parseFloat(totalPriceMatch[1].replace(/,/g, ''));
            } else {
                // 中文原逻辑保留
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
                pattern: /^https:\/\/www\.simcompanies\.com(?:\/[^\/]+)?\/market\/resource\/(\d+)\/?$/,
                action: (url) => {
                    const match = url.match(/\/resource\/(\d+)\/?/);
                    const resourceId = match ? match[1] : null;
                    if (resourceId) {
                        console.log('进入 market 页面，资源ID：', resourceId);
                        ResourceMarketHandler.init(resourceId);
                    }
                }
            },
            contractPage: {
                pattern: /^https:\/\/www\.simcompanies\.com(?:\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/,
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
        const ONE_HOUR = 60 * 60 * 1000;

        const needsUpdate = (realmId) => {
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            const dataStr = localStorage.getItem(key);
            if (!dataStr) return true;

            try {
                const data = JSON.parse(dataStr);
                const lastTime = new Date(data.timestamp).getTime();
                const weatherUntil = new Date(data.sellingSpeedMultiplier.weatherUntil).getTime();
                const now = Date.now();

                const ONE_HOUR = 60 * 60 * 1000;
                if (now - lastTime > ONE_HOUR) return true; //大于1小时
                if (now > weatherUntil) return true; //天气过期

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

    // 首先执行 ConstantsAutoUpdater 的检查和更新
    ConstantsAutoUpdater.checkAndUpdate();

    // 然后执行 RegionAutoUpdater 的检查和更新
    RegionAutoUpdater.checkAndUpdate(0);
    RegionAutoUpdater.checkAndUpdate(1);

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
            const section = document.createElement("div");
            section.style.marginBottom = '8px';

            const header = document.createElement("div");
            header.textContent = (isOpen ? '▼ ' : '▶ ') + title;
            header.style.cssText = "cursor:pointer;font-weight:bold;padding:6px;background:#444;border-radius:4px;user-select:none;";
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
                    headerRow.innerHTML = `<div style="width:100px">剩余量</div><div style="width:130px">达成时间</div><div style="width:80px">单位成本</div>`;
                    qualityContent.appendChild(headerRow);

                    const allDecayArrays = groupedByQuality[quality].flatMap(i => i.futureDecayArray || i.result || []);

                    if (allDecayArrays.length === 0) {
                        const row = document.createElement("div");
                        row.style.display = "flex";
                        row.style.gap = "16px";
                        row.style.padding = "1px 0";
                        row.innerHTML = `
                            <div style="width:100px">已全部衰减</div>
                            <div style="width:130px">-</div>
                            <div style="width:80px">∞</div>
                        `;
                        qualityContent.appendChild(row);
                    } else {
                        allDecayArrays.forEach(({ amount, time, unitCost }) => {
                            const row = document.createElement("div");
                            row.style.display = "flex";
                            row.style.gap = "16px";
                            row.style.padding = "1px 0";
                            row.innerHTML = `
                                <div style="width:100px">${amount}</div>
                                <div style="width:130px">${time}</div>
                                <div style="width:80px">${unitCost === Infinity
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
                            <div style="width:100px">剩余量</div>
                            <div style="width:150px">达成时间</div>
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
                                    <div style="width:100px">${amount}</div>
                                    <div style="width:150px">${time}</div>
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
                            <div style="width:100px">剩余量</div>
                            <div style="width:150px">达成时间</div>
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
                                    <div style="width:100px">${amount}</div>
                                    <div style="width:150px">${time}</div>
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
                        headerRow.innerHTML = `<div style="width:100px">剩余量</div><div style="width:130px">达成时间</div>`;
                        priceContent.appendChild(headerRow);

                        const allDecayArrays = groupedByPrice[price].flatMap(i => i.result || []);

                        if (allDecayArrays.length === 0) {
                            const row = document.createElement("div");
                            row.style.display = "flex";
                            row.style.gap = "16px";
                            row.style.padding = "1px 0";
                            row.innerHTML = `
                                <div style="width:100px">已全部衰减</div>
                                <div style="width:130px">-</div>
                            `;
                            priceContent.appendChild(row);
                        } else {
                            allDecayArrays.forEach(({ amount, time }) => {
                                const row = document.createElement("div");
                                row.style.display = "flex";
                                row.style.gap = "16px";
                                row.style.padding = "1px 0";
                                row.innerHTML = `
                                    <div style="width:100px">${amount}</div>
                                    <div style="width:130px">${time}</div>
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
                background: #222;
                color: white;
                padding: 10px;
                z-index: 9998;
                border-radius: 6px;
                font-size: clamp(12px, 1.5vw, 16px);
                box-shadow: 0 0 10px #000;
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
                background: #444;
                padding: 8px 10px;
                font-weight: bold;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                flex-shrink: 0;
                position: relative;
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
                color: white;
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
                color: white;
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
    // 模块13：计算MP-?%
    // ======================
    (function () {
        let cachedRetailIds = null;

        function getRetailIds() {
            if (cachedRetailIds) return cachedRetailIds;
            const SCDStr = localStorage.getItem("SimcompaniesConstantsData");
            if (!SCDStr) return new Set();
            try {
                const SCD = JSON.parse(SCDStr);
                if (!SCD.data || !SCD.data.SALES) return new Set();
                const sales = SCD.data.SALES;
                const retailIds = new Set();
                Object.keys(sales).forEach(key => {
                    const arr = sales[key];
                    if (Array.isArray(arr)) arr.forEach(id => retailIds.add(id));
                });
                cachedRetailIds = retailIds;
                return retailIds;
            } catch {
                return new Set();
            }
        }

        function isRetailId(id) {
            const retailIds = getRetailIds();
            return retailIds.has(id);
        }

        // 1. 创建Worker的函数，返回一个对象包含postMessage方法等
        function createProfitWorker() {
            const workerCode = `
            self.onmessage = function(e) {
                const { data, inputPercent, SCD, SRC } = e.data;
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
                          l = Math.max(0.6, s / 2 + 0.5),
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
                const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                    const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                    if (u <= 0) return NaN;
                    const d = u / acc / size;
                    let p = d - d * salesModifier / 100;
                    return weather && (p /= weather.sellingSpeedMultiplier), p
                };
        
                // Initial debug log
                const results = data.map(order => {
                    // profit calculation loop
                    let currentPrice = inputPercent < 0 ? order.price + inputPercent : order.price * (1 - inputPercent/100),
                        cost = currentPrice,
                        quantity = order.quantity,
                        maxProfit = -Infinity,
                        size = 1,
                        acceleration = SRC.acceleration,
                        economyState = SRC.economyState,
                        salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus,
                        skillCMO = SRC.saleBonus,
                        skillCOO = SRC.adminBonus;
        
                    if(order.kind === 153 || order.kind === 154){
                        quantity = Math.floor(order.quantity * Math.pow(1 - 0.05, (Math.round((Math.abs(Date.now() - Date.parse(order.datetimeDecayUpdated))) / (1000 * 60) / 4) * 4 / 60)))
                    }

                    // compute saturation locally
                    const saturation = (() => {
                        const list = SRC.ResourcesRetailInfo;
                        const m = list.find(item =>
                            item.dbLetter === parseInt(order.kind) &&
                            (parseInt(order.kind) !== 150 || item.quality === order.quality)
                        );
                        return m?.saturation;
                    })();
        
                    const administrationOverhead = SRC.administration;
                    const buildingKind = Object.entries(zn.SALES).find(([k, ids]) =>
                        ids.includes(parseInt(order.kind))
                    )?.[0];
                    const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
                    const averageSalary = zn.AVERAGE_SALARY;
                    const wages = averageSalary * salaryModifier;
                    const forceQuality = (parseInt(order.kind) === 150) ? order.quality : undefined;
                    const resourceDetail = SCD.constantsResources[parseInt(order.kind)]
        
                    const v = salesModifierWithRecreationBonus + skillCMO;
                    const b = Ul(administrationOverhead, skillCOO);
                    let selltime;
        
                    while (currentPrice > 0) {
                        const modeledData = wv(economyState, order.kind, forceQuality ?? null);
                        const w = zL(
                            buildingKind,
                            modeledData,
                            quantity,
                            v,
                            currentPrice,
                            forceQuality === void 0 ? order.quality : 0,
                            saturation,
                            acceleration,
                            size,
                            resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0
                        );
                        const revenue = currentPrice * quantity;
                        const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                        const secondsToFinish = w;
                        const profit = (!secondsToFinish || secondsToFinish <= 0)
                            ? NaN
                            : (revenue - cost * quantity - wagesTotal) / secondsToFinish;
        
                        if (!secondsToFinish || secondsToFinish <= 0) break;
                        if (profit > maxProfit) {
                            maxProfit = profit;
                            selltime = secondsToFinish;
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

                    // 返回每个订单的计算结果
                    return {
                        seller: order.seller?.company || "",
                        marketPrice: order.price,
                        quality: order.quality,
                        saleAmout: quantity,            
                        contractPrice: cost,
                        contractMaxProfit: (maxProfit * 3600).toFixed(2)
                    };
                });
                self.postMessage(results);
            };
            `;
            const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
            return worker;
        }

        // 2. 实例化 Worker 并暴露接口，方便 MpPanel 调用
        const profitWorker = createProfitWorker();

        window.MarketInterceptor = {
            profitWorker,
            calculateProfit(inputPercent, data, realmId) {
                const SCD = JSON.parse(localStorage.getItem("SimcompaniesConstantsData"));
                const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));

                return new Promise((resolve) => {
                    profitWorker.onmessage = (e) => {
                        resolve(e.data);
                    };
                    profitWorker.postMessage({ data, inputPercent, SCD, SRC });
                });
            }
        };

        // 3. processMarketData 
        function processMarketData(json, realm, id) {
            if (!Array.isArray(json)) return;
            localStorage.setItem(`market_${realm}_${id}`, JSON.stringify(json));
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = args[0];
            const match = typeof url === 'string' && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)\/?($|\?)/);
            if (match) {
                const realm = parseInt(match[1], 10);
                const id = parseInt(match[2], 10);
                if (!isRetailId(id)) return originalFetch(...args);

                const response = await originalFetch(...args);
                response.clone().json().then(json => {
                    processMarketData(json, realm, id);
                }).catch(() => { });
                return response;
            }
            return originalFetch(...args);
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._isTargetMarketRequest = false;
            try {
                const match = typeof url === 'string' && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)(\/|$|\?)/);
                if (match) {
                    const realm = parseInt(match[1], 10);
                    const id = parseInt(match[2], 10);
                    if (isRetailId(id)) {
                        this._isTargetMarketRequest = true;
                        this._realm = realm;
                        this._id = id;
                        this.addEventListener('readystatechange', () => {
                            if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                                try {
                                    const json = JSON.parse(this.responseText);
                                    processMarketData(json, this._realm, this._id);
                                } catch { }
                            }
                        }, false);
                    }
                }
            } catch { }
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            return originalSend.call(this, ...args);
        };
    })();


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
        const localVersion = GM_info.script.version;
        const scriptUrl = 'https://simcompanies-scripts.pages.dev/autoMaxPPHPL.user.js?t=' + Date.now();
        const downloadUrl = 'https://simcompanies-scripts.pages.dev/autoMaxPPHPL.user.js';
        // @changelog    同步26号公式更新"l = Math.max(.6, s / 2 + .5)"

        fetch(scriptUrl)
            .then(res => {
                if (!res.ok) throw new Error('获取失败');
                return res.text();
            })
            .then(remoteText => {
                const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
                const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
                if (!matchVersion) return;

                const latestVersion = matchVersion[1];
                const changeLog = matchChange ? matchChange[1] : '';

                if (compareVersions(latestVersion, localVersion) > 0) {
                    console.log(`📢 检测到新版本 v${latestVersion}`);
                    if (confirm(`自动计算最大时利润插件检测到新版本 v${latestVersion}，是否前往更新？\n\nv${latestVersion} ${changeLog}\n\n关于版本号说明 1.X.Y ，X为增添新功能或修复不可用，Y为细节修改不影响功能，如不需更新可将Y或其它位置修改为较大值。`)) {
                        window.open(downloadUrl, '_blank');
                    }
                } else {
                    console.log("✅ 当前已是最新版本");
                }
            })
            .catch(err => {
                console.warn('检查更新失败：', err);
            });
    }

    setTimeout(checkUpdate, 3000);
})();
