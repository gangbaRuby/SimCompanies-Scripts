// ==UserScript==
// @name         交易所价格计算
// @namespace    http://tampermonkey.net/
// @version      2025-01-17
// @description  交易所价格计算
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
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
            console.log(resourcesRetailInfo);
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
                        console.log('周期：' + index + '， 内容：' + jsonData);

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

        // 样式注入
        const injectStyles = () => {
            const style = document.createElement('style');
            style.textContent = `
                .mini-panel {
                    position: fixed;
                    left: 10px;
                    bottom: 10px;
                    z-index: 9999;
                    font-family: Arial, sans-serif;
                }
                .trigger-btn {
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
                .panel-content {
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
                .data-row {
                    margin: 6px 0;
                    font-size: 13px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .region-label {
                    color: #BDBDBD;
                    min-width: 70px;
                }
                .region-status {
                    font-family: monospace;
                    margin-left: 10px;
                    text-align: right;
                    flex-grow: 1;
                }
                .btn-group {
                    margin-top: 8px;
                    display: grid;
                    gap: 6px;
                }
                .action-btn {
                    background: #2196F3;
                    border: none;
                    color: white;
                    padding: 6px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    white-space: nowrap;
                }
                .action-btn:disabled {
                    background: #607D8B;
                    cursor: not-allowed;
                }
                .no-data { color: #f44336; }
                .has-data { color: #4CAF50; }
            `;
            document.head.appendChild(style);
        };

        // 创建界面元素
        const createPanel = () => {
            const panel = document.createElement('div');
            panel.className = 'mini-panel';

            // 触发器按钮
            const trigger = document.createElement('button');
            trigger.className = 'trigger-btn';
            trigger.textContent = '≡';
            trigger.addEventListener('click', togglePanel);

            // 内容面板
            const content = document.createElement('div');
            content.className = 'panel-content';

            // 状态显示行
            const createStatusRow = (type) => {
                const row = document.createElement('div');
                row.className = 'data-row';

                const label = document.createElement('span');
                label.className = 'region-label';
                // 使用映射后的显示名称
                label.textContent = `${typeDisplayNames[type]}数据：`;

                const status = document.createElement('span');
                status.className = 'region-status';
                statusElements[type] = status;

                row.append(label, status);
                return row;
            };

            // 操作按钮
            const createActionButton = (text, type) => {
                const btn = document.createElement('button');
                btn.className = 'action-btn';
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
            btnGroup.className = 'btn-group';
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
            const content = panelElement.querySelector('.panel-content');
            content.style.display = content.style.display === 'block' ? 'none' : 'block';
            refreshStatus();
        };

        // 刷新状态显示
        const refreshStatus = () => {
            ['r1', 'r2', 'constants'].forEach(type => {
                const { text, className } = Storage.getFormattedStatus(type);
                statusElements[type].textContent = text;
                statusElements[type].className = `region-status ${className}`;
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
                statusElements[type === 'region' ? 'r1' : 'constants'].className = 'region-status no-data';
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
                        panelElement.querySelector('.panel-content').style.display = 'none';
                    }
                });

                // 初始状态刷新
                refreshStatus();
            }
        };
    })();

    // 初始化界面
    PanelUI.init();


})();


