// ==UserScript==
// @name         自动计算最大时利润
// @namespace    https://github.com/gangbaRuby
// @version      1.32.1
// @license      AGPL-3.0
// @description  在商店计算自动计算最大时利润，在合同、交易所展示最大时利润
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://sc.22-7.top/scripts/autoMaxPPHPL.user.js
// @downloadURL  https://sc.22-7.top/scripts/autoMaxPPHPL.user.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';
    let hasNewVersion, latestVersion;
    let localVersion = GM_info.script.version;
    let SCXXCS = 0;
    let PROFIT_PER_BUILDING_LEVEL = 370;
    let RETAIL_ADJUSTMENT = {
        B: 2.28
    };

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
    // 全局工具：高管数据计算器 (支持拖拽、折叠、自适应)
    // ======================
    const ExecutiveManualCalculator = (function () {
        let academyLevel = 15;
        let isCollapsed = false; // 折叠状态

        const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;

        // --- 核心逻辑：计算 ---
        function calculate() {
            const skills = {
                o: { coo: getVal('sc-calc-o-coo'), cmo: getVal('sc-calc-o-cmo') },
                v: { coo: getVal('sc-calc-v-coo') },
                f: { coo: getVal('sc-calc-f-coo'), cmo: getVal('sc-calc-f-cmo') },
                m: { coo: getVal('sc-calc-m-coo'), cmo: getVal('sc-calc-m-cmo') },
                y: { cmo: getVal('sc-calc-y-cmo') },
                t: { coo: getVal('sc-calc-t-coo'), cmo: getVal('sc-calc-t-cmo') }
            };

            let cooApp = (academyLevel >= 5) ? skills.v.coo / 2 : 0;
            let cmoApp = (academyLevel >= 15) ? skills.y.cmo / 2 : 0;

            let adminBonus = Math.floor(skills.o.coo + cooApp + (skills.f.coo + skills.m.coo + skills.t.coo) / 4);
            if (adminBonus > 60) adminBonus = 60 + Math.floor((adminBonus - 60) / 2);
            if (adminBonus > 80) adminBonus = 80 + Math.floor((adminBonus - 80) / 2);

            let saleBonusRaw = Math.floor(skills.m.cmo + cmoApp + (skills.o.cmo + skills.f.cmo + skills.t.cmo) / 4);
            if (saleBonusRaw > 60) saleBonusRaw = 60 + Math.floor((saleBonusRaw - 60) / 2);
            if (saleBonusRaw > 80) saleBonusRaw = 80 + Math.floor((saleBonusRaw - 80) / 2);
            let saleBonus = Math.floor(saleBonusRaw / 3);

            const resAdminEl = document.getElementById('sc-res-admin');
            const resSaleEl = document.getElementById('sc-res-sale');
            if (resAdminEl) resAdminEl.textContent = adminBonus;
            if (resSaleEl) resSaleEl.textContent = saleBonus + '%';

            return { adminBonus, saleBonus };
        }

        // --- 核心逻辑：拖拽 ---
        function makeDraggable(el, handle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let isDragging = false; // 新增：标记是否正在拖拽

            handle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e.preventDefault();
                isDragging = false; // 按下时重置

                // 处理瞬移的核心：第一次点击时，将 translate 转换为绝对坐标
                if (el.style.transform !== "none") {
                    const rect = el.getBoundingClientRect();
                    el.style.left = rect.left + "px";
                    el.style.top = rect.top + "px";
                    el.style.transform = "none";
                    el.style.margin = "0";
                }

                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e.preventDefault();
                // 如果位移超过一定像素，判定为拖拽，不再触发点击
                if (Math.abs(e.clientX - pos3) > 2 || Math.abs(e.clientY - pos4) > 2) {
                    isDragging = true;
                }

                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                el.style.top = (el.offsetTop - pos2) + "px";
                el.style.left = (el.offsetLeft - pos1) + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
                // 如果刚才发生了拖拽，给 handle 加上一个临时标识，防止冒泡触发 onclick
                if (isDragging) {
                    handle.dataset.dragged = "true";
                    setTimeout(() => handle.dataset.dragged = "false", 50);
                }
            }
        }

        // --- 核心逻辑：折叠 ---
        function toggleCollapse() {
            const body = document.getElementById('sc-calc-content');
            const arrow = document.getElementById('sc-calc-arrow');
            if (!body) return;

            isCollapsed = !isCollapsed;
            body.style.display = isCollapsed ? 'none' : 'block';
            arrow.textContent = isCollapsed ? '▲' : '▼';
        }

        function show() {
            if (document.getElementById('sc-calc-modal')) return;

            const isDark = window.getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number).reduce((a, b) => a + b, 0) < 380;
            const bgColor = isDark ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)';
            const textColor = isDark ? '#efefef' : '#333';
            const borderColor = isDark ? '#555' : '#ccc';
            const inputBg = isDark ? '#222' : '#fff';

            const modal = document.createElement('div');
            modal.id = 'sc-calc-modal';
            modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: ${bgColor}; backdrop-filter: blur(10px); border: 1px solid ${borderColor}; 
            border-radius: 12px; z-index: 21000; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            width: 360px; color: ${textColor}; font-family: sans-serif; overflow: hidden;
        `;

            const inputStyle = `width: 75px; padding: 5px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${inputBg}; color: ${isDark ? '#fff' : '#000'}; outline: none;`;

            modal.innerHTML = `
            <div id="sc-calc-header" style="padding: 15px; background: #2196f3; color: white; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                <span style="font-weight: bold;">📊 高管加成计算器</span>
                <div style="display: flex; gap: 15px;">
                    <span id="sc-calc-arrow" style="cursor: pointer; padding: 0 5px;">▼</span>
                    <span id="sc-calc-close-x" style="cursor: pointer; padding: 0 5px;">&times;</span>
                </div>
            </div>
            
            <div id="sc-calc-content" style="padding: 20px;">
                <div style="margin-bottom: 15px; font-size: 13px; background: ${isDark ? '#444' : '#f0f7ff'}; padding: 10px; border-radius: 8px;">
                    <strong>学院:</strong>
                    <label style="margin-left:8px;"><input type="radio" name="sc-aca-r" value="0"> <5</label>
                    <label style="margin-left:8px;"><input type="radio" name="sc-aca-r" value="5"> ≥5</label>
                    <label style="margin-left:8px;"><input type="radio" name="sc-aca-r" value="15" checked> ≥15</label>
                </div>

                <table style="width: 100%; font-size: 13px; margin-bottom: 10px;">
                    <tr style="color: #888;"><th align="left">职位</th><th>COO</th><th>CMO</th></tr>
                    <tr height="35"><td>COO</td><td><input id="sc-calc-o-coo" type="number" style="${inputStyle}"></td><td><input id="sc-calc-o-cmo" type="number" style="${inputStyle}"></td></tr>
                    <tr height="35"><td style="color:#9c27b0">COO学</td><td><input id="sc-calc-v-coo" type="number" style="${inputStyle}"></td><td align="center">-</td></tr>
                    <tr height="35"><td>CFO</td><td><input id="sc-calc-f-coo" type="number" style="${inputStyle}"></td><td><input id="sc-calc-f-cmo" type="number" style="${inputStyle}"></td></tr>
                    <tr height="35"><td>CMO</td><td><input id="sc-calc-m-coo" type="number" style="${inputStyle}"></td><td><input id="sc-calc-m-cmo" type="number" style="${inputStyle}"></td></tr>
                    <tr height="35"><td style="color:#9c27b0">CMO学</td><td align="center">-</td><td><input id="sc-calc-y-cmo" type="number" style="${inputStyle}"></td></tr>
                    <tr height="35"><td>CTO</td><td><input id="sc-calc-t-coo" type="number" style="${inputStyle}"></td><td><input id="sc-calc-t-cmo" type="number" style="${inputStyle}"></td></tr>
                </table>

                <div style="padding: 10px; background: rgba(0,0,0,0.1); border-radius: 8px; display: flex; justify-content: space-around; margin-bottom: 15px;">
                    <div style="text-align: center;"><div style="font-size: 11px; opacity: 0.7;">管理</div><div id="sc-res-admin" style="font-size: 18px; font-weight: bold; color: #2196f3;">0</div></div>
                    <div style="text-align: center;"><div style="font-size: 11px; opacity: 0.7;">销售</div><div id="sc-res-sale" style="font-size: 18px; font-weight: bold; color: #4caf50;">0%</div></div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="sc-calc-close-btn" style="padding: 6px 12px; background: none; border: 1px solid ${borderColor}; border-radius: 4px; color: ${textColor};">取消</button>
                    <button id="sc-calc-save-btn" style="padding: 6px 15px; background: #2196f3; border: none; border-radius: 4px; color: #fff; font-weight: bold;">保存数据</button>
                </div>
            </div>
        `;

            document.body.appendChild(modal);

            // --- 事件绑定 ---
            const header = document.getElementById('sc-calc-header');
            const closeX = document.getElementById('sc-calc-close-x');
            const closeBtn = document.getElementById('sc-calc-close-btn');
            const saveBtn = document.getElementById('sc-calc-save-btn');

            // 1. 绑定拖拽
            makeDraggable(modal, header);

            // 2. 绑定折叠 (增加拖拽判断)
            header.onclick = (e) => {
                // 如果刚刚发生过拖拽，或者点击的是关闭按钮，则不触发折叠
                if (header.dataset.dragged === "true") return;
                if (e.target.id === 'sc-calc-close-x') return;
                toggleCollapse();
            };

            // 3. 关闭
            const closeAction = () => modal.remove();
            closeX.onclick = closeAction;
            closeBtn.onclick = closeAction;

            // 4. 输入与单选
            modal.querySelectorAll('input').forEach(el => {
                el.oninput = calculate;
                if (el.type === 'radio') el.onchange = (e) => {
                    academyLevel = parseInt(e.target.value);
                    // 更新学徒框状态
                    const v = document.getElementById('sc-calc-v-coo');
                    const y = document.getElementById('sc-calc-y-cmo');
                    v.disabled = academyLevel < 5; v.style.opacity = v.disabled ? '0.3' : '1';
                    y.disabled = academyLevel < 15; y.style.opacity = y.disabled ? '0.3' : '1';
                    calculate();
                };
            });

            // 5. 保存
            // 5. 保存逻辑 (带动画反馈)
            saveBtn.onclick = async () => {
                const res = calculate();
                const rId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : 0;

                // 写入本地存储
                localStorage.setItem(`R${rId}-SC-Saved-Bonuses`, JSON.stringify({
                    adminBonus: res.adminBonus,
                    saleBonus: res.saleBonus,
                    timestamp: Date.now(),
                    source: 'manual'
                }));

                // --- 优雅的 UI 反馈流程 ---

                // 1. 隐藏内容区域，仅保留标题栏
                const content = document.getElementById('sc-calc-content');
                const headerTitle = header.querySelector('span'); // 获取标题文字节点

                if (content) {
                    content.style.transition = "all 0.3s ease";
                    content.style.opacity = "0";
                    content.style.height = "0";
                    content.style.padding = "0";
                    content.style.overflow = "hidden";
                }

                // 2. 修改标题栏状态
                const originalHeaderText = headerTitle.textContent;
                header.style.transition = "background-color 0.3s ease";
                header.style.backgroundColor = "#4caf50"; // 变成绿色
                headerTitle.textContent = "✅ 数据保存成功";

                // 3. 短暂延迟后关闭整个窗口
                setTimeout(() => {
                    modal.style.transition = "all 0.3s ease";
                    modal.style.opacity = "0";
                    modal.style.transform = modal.style.transform + " scale(0.9)"; // 缩小消失

                    setTimeout(() => {
                        modal.remove();
                    }, 300);
                }, 1200); // 1.2秒展示时间
            };

            // 初始初始化状态
            const v = document.getElementById('sc-calc-v-coo');
            const y = document.getElementById('sc-calc-y-cmo');
            v.disabled = false; y.disabled = false;
            calculate();
        }

        return { show };
    })();

    // 映射表
    const resourceIdNameMap = { 1: "电力", 2: "水", 3: "苹果", 4: "橘子", 5: "葡萄", 6: "谷物", 7: "牛排", 8: "香肠", 9: "鸡蛋", 10: "原油", 11: "汽油", 12: "柴油", 13: "运输单位", 14: "矿物", 15: "铝土矿", 16: "硅材", 17: "化合物", 18: "铝材", 19: "塑料", 20: "处理器", 21: "电子元件", 22: "电池", 23: "显示屏", 24: "智能手机", 25: "平板电脑", 26: "笔记本电脑", 27: "显示器", 28: "电视机", 29: "作物研究", 30: "能源研究", 31: "采矿研究", 32: "电器研究", 33: "畜牧研究", 34: "化学研究", 35: "软件", 36: "undefined", 37: "undefined", 38: "undefined", 39: "undefined", 40: "棉花", 41: "棉布", 42: "铁矿石", 43: "钢材", 44: "沙子", 45: "玻璃", 46: "皮革", 47: "车载电脑", 48: "电动马达", 49: "豪华车内饰", 50: "基本内饰", 51: "车身", 52: "内燃机", 53: "经济电动车", 54: "豪华电动车", 55: "经济燃油车", 56: "豪华燃油车", 57: "卡车", 58: "汽车研究", 59: "时装研究", 60: "内衣", 61: "手套", 62: "裙子", 63: "高跟鞋", 64: "手袋", 65: "运动鞋", 66: "种子", 67: "圣诞爆竹", 68: "金矿石", 69: "金条", 70: "名牌手表", 71: "项链", 72: "甘蔗", 73: "乙醇", 74: "甲烷", 75: "碳纤维", 76: "碳纤复合材", 77: "机身", 78: "机翼", 79: "精密电子元件", 80: "飞行计算机", 81: "座舱", 82: "姿态控制器", 83: "火箭燃料", 84: "燃料储罐", 85: "固体燃料助推器", 86: "火箭发动机", 87: "隔热板", 88: "离子推进器", 89: "喷气发动机", 90: "亚轨道二级火箭", 91: "亚轨道火箭", 92: "轨道助推器", 93: "星际飞船", 94: "BFR", 95: "喷气客机", 96: "豪华飞机", 97: "单引擎飞机", 98: "无人机", 99: "人造卫星", 100: "航空航天研究", 101: "钢筋混凝土", 102: "砖块", 103: "水泥", 104: "黏土", 105: "石灰石", 106: "木材", 107: "钢筋", 108: "木板", 109: "窗户", 110: "工具", 111: "建筑预构件", 112: "推土机", 113: "材料研究", 114: "机器人", 115: "牛", 116: "猪", 117: "牛奶", 118: "咖啡豆", 119: "咖啡粉", 120: "蔬菜", 121: "面包", 122: "芝士", 123: "苹果派", 124: "橙汁", 125: "苹果汁", 126: "姜汁汽水", 127: "披萨", 128: "面条", 129: "汉堡包", 130: "千层面", 131: "肉丸", 132: "混合果汁", 133: "面粉", 134: "黄油", 135: "糖", 136: "可可", 137: "面团", 138: "酱汁", 139: "动物饲料", 140: "巧克力", 141: "植物油", 142: "沙拉", 143: "咖喱角", 144: "圣诞装饰品", 145: "食谱", 146: "南瓜", 147: "杰克灯笼", 148: "女巫服", 149: "南瓜汤", 150: "树", 151: "复活节兔兔", 152: "斋月糖果", 153: "巧克力冰淇淋", 154: "苹果冰淇淋", 155: "奶油鸡蛋" };

    // ======================
    // 模块1：网络请求模块
    // ======================
    const Network = (() => {
        // 通用请求方法（fetch版本）
        const makeRequest = async (url, responseType, retryCount) => {
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!res.ok) throw new Error(`HTTP错误 ${res.status}`);

                if (responseType === 'json') {
                    return await res.json();
                } else {
                    return await res.text();
                }
            } catch (err) {
                if (retryCount > 0) {
                    console.warn(`请求错误或解析失败 ${url}, 重试中... (${retryCount})`);
                    return makeRequest(url, responseType, retryCount - 1);
                } else {
                    throw new Error(`最终请求失败: ${err}`);
                }
            }
        };

        return {
            // 获取JSON数据
            requestJson: (url, retryCount = 3) => makeRequest(url, 'json', retryCount),

            // 获取原始文本
            requestRaw: (url, retryCount = 3) => makeRequest(url, 'text', retryCount)
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

        // 休闲加成，管理费
        const getCompanies_by_company = async (realmId, company) => {
            const formattedCompany = company.replace(/ /g, "-");
            const data = await Network.requestJson(
                `https://www.simcompanies.com/api/v3/companies-by-company/${realmId}/${formattedCompany}/`
            );
            return {
                recreationBonus: data.infrastructure?.recreationBonus,
                administration: data.infrastructure?.administrationOverhead,
            };
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
            const companies_by_company = await getCompanies_by_company(auth.realmId, auth.company);
            const [executives, resourcesRetailInfo, sellingSpeedMultiplier, weatherUntil] = await Promise.all([
                getExecutives(),
                getResourcesRetailInfo(auth.realmId),
                getWeather(auth.realmId)
            ]);

            // 计算高管加成
            const calculateExecutiveBonus = (executives) => {

                let academyActive = 15; // 默认值为 15
                let COO_Apprentice, CMO_Apprentice;

                try {
                    const stored = localStorage.getItem(`SimcompaniesRetailCalculation_${auth.realmId}`);
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (parsed && typeof parsed.academyActive === "number") {
                            academyActive = parsed.academyActive;
                        }
                    }
                } catch (e) {
                    console.warn("⚠️ 无法解析 SimcompaniesRetailCalculation 数据，使用默认值 15:", e);
                }

                // 整理职位 → 技能表
                const skills = executives.reduce((acc, exec) => {
                    if (exec.currentWorkHistory) {
                        acc[exec.currentWorkHistory.position] = exec.skills;
                    }
                    return acc;
                }, {});

                // 安全读取技能值，没值就返回0
                const safeSkill = (position, skillName) => skills[position]?.[skillName] || 0;

                if (academyActive >= 15) {
                    COO_Apprentice = safeSkill('v', 'coo') / 2
                    CMO_Apprentice = safeSkill('y', 'cmo') / 2
                } else if (academyActive >= 5) {
                    COO_Apprentice = safeSkill('v', 'coo') / 2
                    CMO_Apprentice = 0
                } else {
                    COO_Apprentice = 0
                    CMO_Apprentice = 0
                }

                let adminBonus = Math.floor(safeSkill('o', 'coo') +
                    COO_Apprentice +
                    (safeSkill('f', 'coo') + safeSkill('m', 'coo') + safeSkill('t', 'coo')) / 4);
                if (adminBonus > 80) {
                    adminBonus = 80 + Math.floor((adminBonus - 80) / 2);
                }
                if (adminBonus > 60) {
                    adminBonus = 60 + Math.floor((adminBonus - 60) / 2);
                }

                let saleBonus = Math.floor(safeSkill('m', 'cmo') +
                    CMO_Apprentice +
                    (safeSkill('o', 'cmo') + safeSkill('f', 'cmo') + safeSkill('t', 'cmo')) / 4);
                if (saleBonus > 80) {
                    saleBonus = 80 + Math.floor((saleBonus - 80) / 2);
                }
                if (saleBonus > 60) {
                    saleBonus = 60 + Math.floor((saleBonus - 60) / 2);
                }
                saleBonus = Math.floor(saleBonus / 3)

                return {
                    saleBonus,
                    adminBonus
                };
            };

            return {
                ...auth,
                ...companies_by_company,
                ...calculateExecutiveBonus(executives),
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
    // 模块2-1：领域数据模块的补充，处理学院升级中学徒无效的情况
    // ======================
    (function () {
        const buildings_URL = "/api/v2/companies/me/buildings/"; // 截取的接口
        const uc = "l"; // 前缀

        function saveMergedLocalStorage(key, newData) {
            try {
                const existing = JSON.parse(localStorage.getItem(key) || "{}");
                const merged = { ...existing, ...newData };
                localStorage.setItem(key, JSON.stringify(merged));
            } catch (e) {
                console.warn("⚠️ localStorage 合并写入失败，直接使用新数据", e);
                localStorage.setItem(key, JSON.stringify(newData));
            }
        }

        // 处理函数
        function processBuildings(buildings) {
            return buildings
                .filter(t => t.kind === "y" && !t.purchasedRecently)
                .reduce((acc, r) => {
                    const busy = r.busy;
                    acc.active += (!busy && !(r.position?.startsWith(uc)) ? r.size : 0);
                    acc.slots += (busy?.expanding ? r.size - 1 : r.size);
                    return acc;
                }, { active: 0, slots: 0 });
        }

        // 捕获并处理数据
        function handleData(data) {
            if (!Array.isArray(data) || data.length === 0) return;
            // console.log("📦 捕获到建筑数据:", data);
            const result = processBuildings(data);
            // console.log("⚡ active & slots 计算结果:", result);

            const realmId = getRealmIdFromLink();
            if (realmId === 0 || realmId === 1) {
                const key = `SimcompaniesRetailCalculation_${realmId}`;
                let stored = {};
                try {
                    const raw = localStorage.getItem(key);
                    if (raw) stored = JSON.parse(raw);
                } catch (e) {
                    console.warn("⚠️ 读取 localStorage 时解析失败，初始化为空对象", e);
                }

                const oldAcademyActive = stored.academyActive ?? 0; // 使用 nullish 合并更安全
                const newAcademyActive = result.active;             // 新计算值

                // 更新 localStorage 中的 academyActive
                stored.academyActive = newAcademyActive;
                localStorage.setItem(key, JSON.stringify(stored));

                // 仅当值发生变化时才触发全流程计算
                if (oldAcademyActive !== newAcademyActive) {
                    // console.log("🔔 academyActive 变化，触发高管加成重新计算");
                    if (typeof RegionData !== "undefined" && RegionData.fetchFullRegionData) {
                        RegionData.fetchFullRegionData()
                            .then(newData => {
                                // 合并回 localStorage
                                const merged = { ...stored, ...newData };
                                localStorage.setItem(key, JSON.stringify(merged));
                                // console.log("✅ 高管加成已刷新:", key);
                            })
                            .catch(err => console.error("❌ 高管加成重新计算失败:", err));
                    }
                } else {
                    // console.log("⚡ academyActive 未变化，不触发高管加成计算");
                }
            }

        }

        // Hook fetch
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            try {
                if (typeof args[0] === "string" && args[0].includes(buildings_URL)) {
                    response.clone().json().then(handleData).catch(err => console.error("❌ JSON 解析失败:", err));
                }
            } catch (e) { console.error(e); }
            return response;
        };

        // Hook XHR（备用）
        const originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, async) {
            this.addEventListener("load", function () {
                if (url && url.includes(buildings_URL) && this.responseText) {
                    try { handleData(JSON.parse(this.responseText)); }
                    catch (e) { console.error("❌ XHR JSON 解析失败:", e); }
                }
            });
            return originalXHR.apply(this, arguments);
        };

        // console.log("✅ 建筑数据捕获 & active/slots 计算 + localStorage 保存 hook 已启动");
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
                    'RETAIL_MODELING_QUALITY_WEIGHT'
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
                try {
                    if (type === 'region') {
                        // 读取现有数据并做合并，优先保留 newData 的字段，但如果 existing 有 academyLevels 且 newData 未提供，则保留 existing 的 academyLevels
                        const existingRaw = localStorage.getItem(key) || "{}";
                        const existing = JSON.parse(existingRaw);
                        const merged = { ...existing, ...data };
                        if (existing.academyLevels && !data.academyLevels) {
                            merged.academyLevels = existing.academyLevels;
                        }
                        // 若你还有其它需要强制保留的字段，可在此类似添加： merged.someField = existing.someField || data.someField;
                        localStorage.setItem(key, JSON.stringify(merged));
                    } else {
                        // constants 仍然覆盖保存
                        localStorage.setItem(key, JSON.stringify(data));
                    }
                } catch (e) {
                    console.warn("⚠️ Storage.save 合并写入失败，回退为直接写入：", e);
                    localStorage.setItem(key, JSON.stringify(data));
                }
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

                // 判定逻辑：只有明确为 false 时才关闭，其余情况（含 null）均为开启
                const isEnabled = config[key] !== false;

                btn.textContent = `${label}: ${isEnabled ? '🟢 已启用' : '🔴 已禁用'}`;
                btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            });
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

            // --- 新增：定义切换函数 ---
            const switchMenu = (isSettings) => {
                content.classList.toggle('show-settings', isSettings);
                if (isSettings) {
                    initAutoAmountToggle();
                    refreshPageActionToggles();
                }
            };

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
            const createPageActionToggle = (key, label) => {
                const btn = document.createElement('button');
                btn.className = 'SimcompaniesRetailCalculation-action-btn page-action-toggle';

                // 必须绑定这些数据，以便刷新函数能识别按钮用途
                btn.dataset.key = key;
                btn.dataset.label = label;

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
                const isEnabled = initialConfig[key] !== false;
                btn.textContent = `${label}: ${isEnabled ? '🟢 已启用' : '🔴 已禁用'}`;
                btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';

                return btn;
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

            secBtnGroup.append(
                backBtn,
                // 把原本在上面的“自定义运行时长”按钮放到这里
                (() => {
                    const btn = document.createElement('button');
                    btn.className = 'SimcompaniesRetailCalculation-action-btn';
                    btn.id = 'auto-amount-toggle-btn';
                    btn.textContent = '自定义运行时长: (等待加载)';
                    btn.style.backgroundColor = '#607D8B';
                    return btn;
                })(),
                createPageActionToggle('marketProfit', '交易所计算时利润'),
                createPageActionToggle('contractProfit', '合同计算时利润'),
                createPageActionToggle('executiveHistory', '显示高管培训记录'),
                createPageActionToggle('formerExecEnhance', '前任高管更多信息')
            );
            secondaryMenu.appendChild(secBtnGroup);

            // 插件信息区块
            const info = document.createElement('div');
            info.style.cssText = 'margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:#ccc;border-top:1px solid #555;';

            const version = GM_info?.script?.version || '未知版本';

            info.innerHTML = `
                作者：<a href="https://www.simcompanies.com/zh-cn/company/0/Rabbit-House/" target="_blank" style="color:#6cf;">Rabbit House</a> 反馈请说明问题<br>
                反馈群：798670333 <br>
                源码：<a href="https://github.com/gangbaRuby/SimCompanies-Scripts" target="_blank" style="color:#6cf;">GitHub</a> ⭐🙇<br>
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
        const togglePanel = (e) => {
            e.stopPropagation();
            const content = panelElement.querySelector('.SimcompaniesRetailCalculation-panel-content');
            const isCurrentlyVisible = content.style.display === 'block';

            content.style.display = isCurrentlyVisible ? 'none' : 'block';

            if (!isCurrentlyVisible) {
                content.classList.remove('show-settings');
                // 如果面板是打开的，刷新状态
                refreshStatus();
                // ⬇️ 修正：调用 initAutoAmountToggle 来刷新按钮状态 ⬇️
                // initAutoAmountToggle 函数现在负责检查函数是否可用并更新按钮文本
                initAutoAmountToggle();
                refreshPageActionToggles();
            }
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
            initAutoAmountToggle: initAutoAmountToggle
        };
    })();

    // 初始化界面
    PanelUI.init();

    // ======================
    // 模块5-1：自定义运行时长
    // ======================
    (function () {
        // --- 配置项 ---
        const CUSTOM_AMOUNTS_STORAGE_KEY = 'SC_AutoAmount_CustomAmounts';
        const ENABLED_STORAGE_KEY = 'SC_AutoAmount_Enabled'; // 新增：功能开关的存储键
        const DEFAULT_AMOUNTS_STRING = '10pm';
        const DEFAULT_BUTTON_CLASS = 'btn btn-secondary';

        // --- 目标元素选择器 ---
        const CARD_SELECTOR = '.col-xs-6.css-0.ewayztq2, .col-xs-6.resources.text-center'; //前者生产，后者零售
        const PROCESSED_DATA_ATTRIBUTE = 'data-custom-amount-added';

        function isAutoAmountEnabled() {
            // 默认启用。如果存储键不存在，返回 true。
            // 如果存储为 'false'，则返回 false。
            const stored = localStorage.getItem(ENABLED_STORAGE_KEY);
            if (stored === null) {
                return true; // 默认启用
            }
            return stored === 'true';
        }

        function saveAutoAmountEnabled(isEnabled) {
            localStorage.setItem(ENABLED_STORAGE_KEY, isEnabled ? 'true' : 'false');
        }

        function loadCustomAmounts() {
            const stored = localStorage.getItem(CUSTOM_AMOUNTS_STORAGE_KEY);
            if (stored !== null) {
                const normalizedStored = stored.replace(/，/g, ',');
                return normalizedStored.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            return DEFAULT_AMOUNTS_STRING.split(',').map(s => s.trim());
        }

        function saveCustomAmounts(amounts) {
            const validAmounts = amounts.map(s => String(s).trim()).filter(s => s.length > 0);
            const saveString = validAmounts.join(',');
            localStorage.setItem(CUSTOM_AMOUNTS_STORAGE_KEY, saveString);

            initAutoAmountButtons(true);
        }

        function setInput(inputNode, value, count = 3) {
            let lastValue = inputNode.value;
            inputNode.value = value;

            let event = new Event("input", { bubbles: true });
            event.simulated = true;

            if (inputNode._valueTracker) {
                inputNode._valueTracker.setValue(lastValue);
            }

            inputNode.dispatchEvent(event);

            if (count > 0) {
                return setInput(inputNode, value, --count);
            }
        }

        function showConfigModal() {
            const currentAmounts = loadCustomAmounts();
            const amountsString = currentAmounts.join(', ');
            const modalId = 'autoamount-config-modal';

            document.getElementById(modalId)?.remove();

            const modalHtml = `
                <div id="${modalId}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:5vh;box-sizing:border-box;">
                    <div style="background:#333;color:#EEE;padding:0;border-radius:6px;box-shadow:0 5px 15px rgba(0,0,0,0.5);width:90%;max-width:450px;border:1px solid #555;">
                        <div style="padding:15px;border-bottom:1px solid #555;">
                            <h4 style="margin:0;font-size:18px;font-weight:600;">设置自定义数量/时长</h4>
                        </div>
                        <div style="padding:15px;">
                            <p style="margin-top:0;margin-bottom:15px;font-size:14px;">
                                请输入自定义数量或运行时长，使用<strong style="color:#FF8888;">逗号（, 或 ，）</strong>分隔，你可以在插件菜单中禁用此功能。你可以通过输入“am”，“pm”，“hr”和“m”来快捷决定生产数量。例如: 10pm, 2hr, 30m，11:4am,5:14,字母不区分大小写，半角全角均可。
                            </p>
                            <textarea id="autoamount-config-input"
                                style="width:100%;height:80px;margin-bottom:20px;padding:8px;border:1px solid #666;border-radius:4px;box-sizing:border-box;font-size:14px;color:#EEE;background:#2C2C2C;resize:vertical;">
                            </textarea>
                            <div style="display:flex;justify-content:flex-end;gap:10px;">
                                <button id="autoamount-config-cancel" style="background-color:#555;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;transition:background-color 0.2s;">取消</button>
                                <button id="autoamount-config-save" style="background-color:#5cb85c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;transition:background-color 0.2s;">保存</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modal = document.getElementById(modalId);
            const inputElement = document.getElementById('autoamount-config-input');
            const saveButton = document.getElementById('autoamount-config-save');
            const cancelButton = document.getElementById('autoamount-config-cancel');

            inputElement.value = amountsString;

            cancelButton.addEventListener('click', () => modal.remove());
            saveButton.addEventListener('click', () => {
                const newString = inputElement.value;
                const normalizedString = newString.replace(/，/g, ',');
                const newAmounts = normalizedString.split(',').map(s => s.trim()).filter(s => s.length > 0);

                saveCustomAmounts(newAmounts);
                modal.remove();
            });

            const applyHoverStyle = (element, normalColor, hoverColor) => {
                element.addEventListener('mouseenter', () => element.style.backgroundColor = hoverColor);
                element.addEventListener('mouseleave', () => element.style.backgroundColor = normalColor);
            };
            applyHoverStyle(cancelButton, '#555555', '#444444');
            applyHoverStyle(saveButton, '#5cb85c', '#4cae4c');
        }

        function initAutoAmountButtons(forceReload = false) {
            if (!isAutoAmountEnabled()) {
                // 如果功能被禁用，确保所有已添加的按钮被移除
                document.querySelectorAll(`.autoamount-custom-btn`).forEach(btn => btn.remove());
                document.querySelectorAll(`[${PROCESSED_DATA_ATTRIBUTE}]`).forEach(card => {
                    card.removeAttribute(PROCESSED_DATA_ATTRIBUTE);
                });
                // 退出，不添加新按钮
                return;
            }

            if (forceReload) {
                document.querySelectorAll(`.autoamount-custom-btn`).forEach(btn => btn.remove());
                document.querySelectorAll(`[${PROCESSED_DATA_ATTRIBUTE}]`).forEach(card => {
                    card.removeAttribute(PROCESSED_DATA_ATTRIBUTE);
                });
            }

            const customAmounts = loadCustomAmounts();
            // 使用 requestAnimationFrame 延迟，确保 DOM 稳定后再查找元素
            // 这可以帮助在 SPA 场景中捕获元素。
            requestAnimationFrame(() => {
                const targetDivs = document.querySelectorAll(CARD_SELECTOR);

                targetDivs.forEach((card, index) => { // 添加 index 用于日志定位
                    try { // <<<<<<<<<<<<<<< TRY 开始 >>>>>>>>>>>>>>>
                        if (card.hasAttribute(PROCESSED_DATA_ATTRIBUTE)) {
                            return;
                        }

                        const input = card.querySelector('input[name="amount"], input[name="quantity"]');
                        let buttonContainer = null;
                        // 查找包含 "text-center" 类名的 div
                        buttonContainer = card.querySelector('div.text-center');

                        if (!buttonContainer) {
                            // 如果没找到，尝试查找卡片内的最后一个带有按钮的 div
                            const candidateDivs = card.querySelectorAll('div');
                            if (candidateDivs.length > 0) {
                                const lastDiv = candidateDivs[candidateDivs.length - 1];
                                if (lastDiv.querySelector('button')) {
                                    buttonContainer = lastDiv;
                                }
                            }
                        }

                        if (input && buttonContainer) {

                            const existingButton = buttonContainer.querySelector('button');
                            // 确保 existingButton 存在，否则使用默认类
                            let buttonClass = existingButton ? existingButton.className : DEFAULT_BUTTON_CLASS;

                            // A. 注入配置 (+) 按钮
                            const configButton = document.createElement('button');
                            configButton.className = `${buttonClass} autoamount-custom-btn`;
                            configButton.type = 'button';
                            configButton.role = 'button';
                            configButton.textContent = '+';

                            configButton.style.fontWeight = 'bold';
                            configButton.style.color = 'white';
                            configButton.style.backgroundColor = '#4CAF50';
                            configButton.style.textTransform = 'none';

                            configButton.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                showConfigModal();
                            });

                            buttonContainer.prepend(configButton);

                            // B. 注入自定义数量/时长按钮
                            customAmounts.slice().reverse().forEach(amount => {
                                const newButton = document.createElement('button');
                                newButton.className = `${buttonClass} autoamount-custom-btn`;
                                newButton.type = 'button';
                                newButton.role = 'button';
                                newButton.textContent = amount;
                                newButton.style.textTransform = 'none';

                                newButton.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // 使用新的计算逻辑
                                    const valueToSet = getCalculatedAmount(amount);
                                    setInput(input, valueToSet); // 传入计算后的值
                                });

                                buttonContainer.prepend(newButton);
                            });

                            // 标记已添加
                            card.setAttribute(PROCESSED_DATA_ATTRIBUTE, 'true');
                        }
                    } catch (error) { // <<<<<<<<<<<<<<< CATCH 结束 >>>>>>>>>>>>>>>
                        // 打印详细错误信息，这样即使有错误，模块 6 也能继续运行
                        console.error(`[模块5-1 错误] 处理第 ${index + 1} 张卡片时发生未捕获错误:`, error);
                        console.error("导致错误的卡片元素:", card);
                        // 注意：这里没有设置 attribute，下次 SPA 变化还会尝试处理
                    }
                });
            });
        }

        window.isAutoAmountEnabled = isAutoAmountEnabled;
        window.saveAutoAmountEnabled = saveAutoAmountEnabled;
        window.initAutoAmountButtons = initAutoAmountButtons;

        // --- 新增时间计算函数 ---
        function getCalculatedAmount(amountString) {
            const today = new Date();

            // --- 步骤 1: 预处理和归一化 ---
            // 1.1 替换全角冒号为半角冒号，以处理 '22：12'
            const normalizedString = amountString.replace(/：/g, ':');

            // 1.2 匹配模式:
            // ^(\d{1,2})  - 匹配 1-2 位数字作为小时 (Group 1)
            // :           - 匹配冒号
            // (\d{2})     - 匹配 2 位数字作为分钟 (Group 2)
            // \s* - 匹配零个或多个空格
            // (a(m)|p(m))? - 可选地匹配 am/pm (不区分大小写，使用 i 标志，Group 3/4/5 捕获 am/pm)
            // $           - 匹配行尾
            const timeMatch = normalizedString.match(/^(\d{1,2}):(\d{1,2})\s*(am|pm)?$/i);
            // 注意：这里使用了 i 标志（不区分大小写）

            if (timeMatch) {
                // timeMatch[1] = 小时 (e.g., '8', '22')
                // timeMatch[2] = 分钟 (e.g., '30', '12')
                // timeMatch[3] = am/pm 字符串 (e.g., 'am', 'PM', undefined)

                let hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                // 使用 timeMatch[3] 并转为小写，确保判断的一致性
                const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : undefined;

                // 1. 处理 AM/PM
                if (ampm === 'pm' && hours !== 12) {
                    hours += 12;
                } else if (ampm === 'am' && hours === 12) {
                    hours = 0; // 午夜 12am 是 0 小时
                }

                // 2. 构造目标时间 (今天的)
                const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);

                // 3. 计算时间差
                let timeDifferenceMs = targetTime.getTime() - today.getTime();

                // 如果目标时间在过去，则计算到明天的同一时间
                if (timeDifferenceMs < 0) {
                    // 加一天（24小时）
                    timeDifferenceMs += 24 * 60 * 60 * 1000;
                }

                // 转换为分钟，并向下取整 (Floor)，确保不会超期
                const minutesUntilTarget = Math.floor(timeDifferenceMs / (1000 * 60));

                // 返回符合游戏格式的字符串
                return `${minutesUntilTarget}m`;
            }

            // 如果不是特殊时间格式，则原样返回
            return amountString;
        }

        function observeCardsForAutoAmount() {
            let debounceTimer;
            const targetNode = document.body;

            const CHECK_SELECTORS = [
                'div[style="overflow: visible;"]',
                CARD_SELECTOR.split(',').map(s => s.trim()).join(',')
            ];

            const observer = new MutationObserver((mutationsList) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {

                    const hasRelevantChanges = mutationsList.some(mutation => {
                        return mutation.type === 'childList' &&
                            mutation.addedNodes.length > 0 &&
                            Array.from(mutation.addedNodes).some(node => {
                                return node.nodeType === 1 &&
                                    CHECK_SELECTORS.some(selector =>
                                        node.matches(selector) || node.querySelector(selector)
                                    );
                            });
                    });

                    if (hasRelevantChanges) {
                        initAutoAmountButtons(false);
                    }
                }, 100);
            });

            observer.observe(targetNode, {
                childList: true,
                subtree: true,
            });

            function ensureInputsLoaded() {
                let tries = 0;
                const maxTries = 50;
                const timer = setInterval(() => {
                    const inputs = document.querySelectorAll('input[name="amount"], input[name="quantity"]');

                    if (inputs.length > 0 || tries >= maxTries) {
                        clearInterval(timer);
                        if (inputs.length > 0) {
                            initAutoAmountButtons();
                        }
                    }
                    tries++;
                }, 100);
            }

            requestAnimationFrame(ensureInputsLoaded);
        }

        observeCardsForAutoAmount();

    })();

    // ======================
    // 模块5-2：饱和度表格
    // ======================
    const SaturationDisplay = (() => {
        let saturationTableElement = null;

        // 构建表格内容
        const createTable = (list) => {
            const table = document.createElement("table");
            table.style.cssText = "border-collapse:collapse;margin:10px 0;background:#333;color:white;font-size:13px;width:100%;";

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
            return table;
        };

        return {
            toggle(data, onClose) {
                if (saturationTableElement) {
                    saturationTableElement.remove();
                    saturationTableElement = null;
                    return;
                }

                const list = data.ResourcesRetailInfo;
                const weatherMultiplier = data.sellingSpeedMultiplier.sellingSpeedMultiplier;

                // 1. 创建容器
                saturationTableElement = document.createElement("div");
                saturationTableElement.style.cssText = `
                position:fixed; left:10px; top:50px; z-index:9998;
                background:#2c2c2c; color:#fff; padding:12px;
                border-radius:8px; max-height:400px; overflow:auto;
                box-shadow:0 4px 15px rgba(0,0,0,0.5); font-family:Arial, sans-serif;
            `;

                // 2. 创建头部信息
                const headerInfo = document.createElement("div");
                headerInfo.innerHTML = `
                <div style="margin-bottom:6px; font-size:14px; font-weight:bold; color:#f1c40f;">天气速度加成: ${weatherMultiplier}</div>
                <div style="margin-bottom:6px; font-size:13px; color:#ddd;">查询历史饱和度: <a href="https://marketsaturation.22-7.top/" target="_blank" style="color:#3498db; text-decoration:underline;">点击查看</a></div>
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

    // ======================
    // 模块5-3：PAGE_ACTIONS 专用配置管理
    // ======================
    (function () {
        const PAGE_ACTIONS_CONFIG_KEY = 'SC_PageActions_Settings';

        // 将函数定义在外部，或挂载到 window
        window.isPageModuleEnabled = (key) => {
            try {
                const stored = localStorage.getItem(PAGE_ACTIONS_CONFIG_KEY);
                if (stored === null) return true; // 默认开启
                const config = JSON.parse(stored);
                return config[key] !== false;
            } catch (e) {
                return true;
            }
        };

        window.savePageModuleEnabled = (key, isEnabled) => {
            try {
                const stored = localStorage.getItem(PAGE_ACTIONS_CONFIG_KEY) || '{}';
                const config = JSON.parse(stored);
                config[key] = isEnabled;
                localStorage.setItem(PAGE_ACTIONS_CONFIG_KEY, JSON.stringify(config));
            } catch (e) {
                console.error('保存配置失败', e);
            }
        };

    })();

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

        function showToast(message, type = 'error') {
            let toast = document.getElementById('auto-pricing-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'auto-pricing-toast';
                toast.style = `
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0,0,0,0.9);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    z-index: 10000;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    font-size: 14px;
                    pointer-events: none;
                    opacity: 0;
                    /* 解决显示不全的核心配置 */
                    max-width: 85vw;           /* 最大宽度为屏幕宽度的 85% */
                    width: max-content;        /* 内容多宽就显示多宽 */
                    min-width: 200px;          /* 设置一个最小宽度防止太窄 */
                    word-wrap: break-word;     /* 允许长单词换行 */
                    white-space: normal;       /* 允许文字自动换行 */
                    text-align: center;
                    box-sizing: border-box;
                    line-height: 1.4;
                `;
                document.body.appendChild(toast);
            }

            // 设置边框颜色区分类型
            toast.style.borderLeft = type === 'error' ? '5px solid #ff4444' : '5px solid #4CAF50';

            toast.textContent = message;
            toast.style.opacity = '1';
            toast.style.top = '25px';

            clearTimeout(window.toastTimer);
            window.toastTimer = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.top = '10px';
            }, 3500); // 增加到 3.5 秒，方便阅读换行后的文字
        }

        const workerCode = `
        self.onmessage = function(e) {
        const { lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
            v, b,
            cogs, quality, quantity, cardIndex, retryCount,
            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT} = e.data;

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

            let profit = (revenue - cogs - wagesTotal) / secondsToFinish;
            if (profit > maxProfit) {
                maxProfit = profit;
                bestPrice = currentPrice;
            } else if (maxProfit > 0 && profit < 0) { //有正利润后出现负利润提前终端循环
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

        // 发送结果，带上 calculatedWages
        self.postMessage({
            bestPrice: bestPrice,
            maxProfit: maxProfit,
            calculatedWages: calculatedWages, // <--- 新增这个
            cardIndex: cardIndex,
            retryCount: retryCount
        });

    };
    `;

        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        function triggerCalculation(comp, index, retryCount = 0) {
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
            const { cogs, quality, quantity } = comp.state;

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
                SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT
            });
        }

        // 注册 Worker 异步回调 (处理结果和校验)
        profitWorker.onmessage = (event) => {
            // 1. 接收 Worker 返回的数据 (包括计算出的预计工资 calculatedWages)
            const { bestPrice, maxProfit, calculatedWages, cardIndex, retryCount } = event.data;

            // 使用 index 查找对应的卡片
            const card = document.querySelectorAll('div[style="overflow: visible;"]')[cardIndex];
            if (!card) return;

            const priceInput = card.querySelector('input[name="price"]');
            const btn = card.querySelector(`button[data-index="${cardIndex}"]`);
            const profitDisplay = card.querySelector('.auto-profit-display');

            if (!priceInput || !btn || !profitDisplay) return;

            // 2. 重新获取 comp 实例，准备获取 size 和 wagesTotal
            const comp = findReactComponent(priceInput);
            if (!comp) return;
            const size = comp.props.size || 1; // 修正：在回调中获取 size

            // 3. 设置价格 (触发 React State 异步更新)
            setInput(priceInput, bestPrice.toFixed(2));

            // 4. 更新显示 UI
            const hourlyProfit = (maxProfit / size) * 3600;

            // 更好的显示方式，包含预计工资作为校验参考
            profitDisplay.innerHTML = `
                每级时利润: ${hourlyProfit.toFixed(2)}
            `;
            profitDisplay.style.background = '#4CAF50'; // 绿色表示成功

            btn.textContent = '最大时利润';
            btn.disabled = false;

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
                        profitDisplay.textContent = '修正数量中...';

                        // ⚠️ 这里的 triggerCalculation 必须在 initAutoPricing 外层定义
                        // 或者通过 card.doAutoCalc(updatedComp, retryCount + 1) 调用
                        if (typeof triggerCalculation === "function") {
                            triggerCalculation(updatedComp, cardIndex, retryCount + 1);
                        } else {
                            // console.error("triggerCalculation 函数未定义，请确保它在作用域内。");
                        }
                    } else {
                        profitDisplay.style.background = '#f44336'; // 最终失败变红
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

                    const btn = document.createElement('button');
                    btn.textContent = '最大时利润';
                    btn.type = 'button';
                    btn.setAttribute('data-index', index);
                    btn.style = `margin-top: 5px; background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%;`;

                    const profitDisplay = document.createElement('div');
                    profitDisplay.className = 'auto-profit-display';
                    profitDisplay.textContent = `等待计算...`;
                    profitDisplay.style = `margin-top: 5px; font-size: 14px; color: white; background: gray; padding: 4px 8px; text-align: center; border-radius: 4px;`;

                    // --- 提取核心发送逻辑 ---
                    // 这样按钮点击能用，后续重试也能用
                    const startCalc = (targetComp, retryIdx = 0) => {
                        if (localStorage.getItem('SimcompaniesConstantsData') == null) {
                            showToast("请尝试更新基本数据（左下角按钮）"); // 替换了 alert
                            return;
                        }

                        // UI反馈
                        if (retryIdx === 0) {
                            btn.textContent = '最大时利润 (计算中...)';
                            btn.disabled = true;
                        }
                        profitDisplay.textContent = retryIdx > 0 ? `修正中(${retryIdx})...` : `计算中...`;

                        const lwe = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
                        const zn = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;

                        // 重新获取最新的 state 和 props
                        const { size, acceleration, economyState, resource, salesModifierWithRecreationBonus, skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather = null } = targetComp.props;
                        const { cogs, quality, quantity } = targetComp.state;

                        const v = salesModifierWithRecreationBonus + Math.floor(skillCMO / 3);
                        const b = Ul(administrationOverhead, skillCOO);

                        profitWorker.postMessage({
                            lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
                            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
                            v, b, cogs, quality, quantity,
                            cardIndex: index,
                            retryCount: retryIdx, // 发送当前是第几次尝试
                            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT
                        });
                    };

                    btn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCalc(comp, 0); // 初始重试次数为 0
                    };

                    // 将函数引用挂载在 DOM 上，方便 onmessage 找到并调用重试
                    card.doAutoCalc = startCalc;

                    priceInput.parentNode.insertBefore(btn, priceInput.nextSibling);
                    priceInput.parentNode.insertBefore(profitDisplay, btn.nextSibling);
                    card.dataset.autoPricingAdded = 'true';
                });
            } catch (err) { }
        }

        window.initAutoPricing = initAutoPricing;

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
        let summaryDisplay = null; // 用于展示2400h模拟结果的绿色面板
        let calcTimer = null; // 用于限流

        // Worker 代码保持完全不变
        const workerCode = `
        self.onmessage = function(e) {
        const { rowId, order, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT} = e.data;
        const { price, quantity, quality, resourceId: resource } = order;
        const lwe = SCD.retailInfo;
        const zn = SCD.data;

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

        const allProfitSpans = new Set();
        let isShowingProfit = true;

        // 专门用于监听顶部输入框
        function attachInputListener() {
            const input = document.querySelector('input[name="quantity"]');

            if (input && !input.hasAttribute('data-calc-listener')) {
                input.setAttribute('data-calc-listener', 'true');

                // 1. 保留原有的手动输入监听
                input.addEventListener('input', () => {
                    requestAnimationFrame(updateGlobalSimulation);
                });

                // 2. 针对“自动填入”：使用定时器进行“脏检查”
                // 每 500ms 检查一次输入框的值是否变化
                let lastValue = input.value;
                setInterval(() => {
                    if (input.value !== lastValue) {
                        lastValue = input.value;
                        updateGlobalSimulation();
                    }
                }, 500);

                // 3. 针对游戏内的“快速按钮” (例如 Max/Half 按钮)
                // 游戏中的按钮通常在 input 的父级或兄弟级
                const parentForm = input.closest('form');
                if (parentForm) {
                    parentForm.addEventListener('click', (e) => {
                        // 如果点击了按钮，延迟一会等待值更新后执行计算
                        if (e.target.tagName === 'BUTTON') {
                            setTimeout(updateGlobalSimulation, 50);
                        }
                    });
                }
            }
        }

        // 辅助函数：将小时数转换为 "1h 20m" 或 "45m" 格式
        function formatDuration(totalHours) {
            if (!totalHours || totalHours <= 0) return "0m";
            const h = Math.floor(totalHours);
            const m = Math.round((totalHours - h) * 60);

            if (h === 0) return `${m}m`;
            if (m === 0) return `${h}h`;
            return `${h}h ${m}m`;
        }

        function debouncedUpdate() {
            if (calcTimer) cancelAnimationFrame(calcTimer);
            calcTimer = requestAnimationFrame(() => {
                updateGlobalSimulation();
            });
        }

        function updateGlobalSimulation() {
            const tbody = findValidTbody();
            if (!tbody || !summaryDisplay) return;

            // 1. 获取输入框的值
            const inputElement = document.querySelector('input[name="quantity"]');
            const userWantedQty = inputElement ? (parseFloat(inputElement.value) || 0) : 0;
            const isSimulationMode = userWantedQty > 0;

            // 2. 获取原始数据（先不筛选 >0，也不排序）
            // 我们只获取已经计算完成的行
            let rawRows = [];
            tbody.querySelectorAll('tr[data-profit-calculated]').forEach(row => {
                if (row.offsetParent !== null && row.__profitData) {
                    rawRows.push({
                        row: row,
                        profit: row.__profitData.profit, // 单位: $/s (可能是负数)
                        time: row.__profitData.time      // 单位: s
                    });
                }
            });

            // 如果连一行数据都没有，显示空状态
            if (rawRows.length === 0) {
                summaryDisplay.style.display = "none";
                return;
            }

            // ============================================
            // 核心计算分流
            // ============================================

            let avgProfitPerHour = 0;
            let totalProfitVal = 0;
            let totalTimeSeconds = 0;
            let isFull = false;     // 状态：是否满足/是否充满
            let displayTitle = "";
            let borderColor = "";
            let coveredCount = 0;   // 买了多少单

            // 用于展示的状态文本
            let statusText = "";

            if (isSimulationMode) {
                // === 模式 A：真实扫货模拟 (修正：强制 价格升序 + 品质降序) ===

                // 1. 预提取所有行的数据，并转换为数值对象
                const processedRows = rawRows.map(item => {
                    const data = extractNumbersFromAriaLabel(item.row.getAttribute('aria-label'));
                    return {
                        row: item.row,
                        profit: item.profit, // $/s
                        time: item.time,     // s
                        price: data?.price || 0,
                        quantity: data?.quantity || 0,
                        quality: data?.quality || 0
                    };
                });

                // 2. 核心：模拟游戏市场真实排序逻辑
                // 价格越低越靠前；价格相同时，品质(Q)越高越靠前
                processedRows.sort((a, b) => {
                    if (a.price !== b.price) return a.price - b.price;
                    return b.quality - a.quality;
                });

                let remainingQty = userWantedQty;
                totalProfitVal = 0;   // 重置外部定义的累加变量
                totalTimeSeconds = 0;
                coveredCount = 0;

                // 3. 按正确逻辑顺序开始扫货
                for (const item of processedRows) {
                    if (remainingQty <= 0) break;
                    if (item.quantity <= 0) continue;

                    const takeQty = Math.min(remainingQty, item.quantity);
                    const ratio = takeQty / item.quantity;

                    // 累加利润：单秒利润 * 该单据实际卖出所需的总秒数 * 购买比例
                    totalProfitVal += (item.profit * item.time) * ratio;
                    // 累加时间
                    totalTimeSeconds += item.time * ratio;

                    remainingQty -= takeQty;
                    coveredCount++;
                }

                const totalHours = totalTimeSeconds / 3600;
                avgProfitPerHour = totalHours > 0 ? (totalProfitVal / totalHours) : 0;

                // 状态判定
                isFull = remainingQty <= 0.01;

                displayTitle = `购买 ${userWantedQty.toLocaleString()} 个 - 扫货模拟`;
                borderColor = "#FFD700";

                if (isFull) {
                    statusText = "✅ 数量满足";
                } else {
                    const bought = userWantedQty - remainingQty;
                    statusText = `⚠️ 缺货 (仅买到 ${Math.floor(bought).toLocaleString()})`;
                }

                // 清除所有行的高亮（因为这是模拟模式，不需要像 B 模式那样高亮单行）
                rawRows.forEach(item => {
                    item.row.style.outline = "none";
                    item.row.style.boxShadow = "none";
                    item.row.style.backgroundColor = "";
                });
            } else {
                // === 模式 B：2400h 最优解 (原来的逻辑) ===

                // 1. 过滤掉负利润 (只找赚钱的)
                const profitableRows = rawRows.filter(r => r.profit > 0);

                if (profitableRows.length === 0) {
                    summaryDisplay.style.display = "block";
                    summaryDisplay.innerHTML = `<div style="color: #ff9800; font-size: 13px; text-align: center;">⚠️ 无正利润订单</div>`;
                    return;
                }

                // 2. 排序：利润高的在前
                profitableRows.sort((a, b) => b.profit - a.profit);

                // 3. 高亮第一名
                rawRows.forEach(item => {
                    // 先清除所有
                    item.row.style.outline = "none";
                    item.row.style.boxShadow = "none";
                    item.row.style.backgroundColor = "";
                });
                // 再高亮最佳
                const best = profitableRows[0];
                if (best) {
                    best.row.style.outline = "2px dashed #FFD700";
                    best.row.style.outlineOffset = "-2px";
                    best.row.style.boxShadow = "inset 0 0 8px rgba(255, 215, 0, 0.3)";
                    best.row.style.backgroundColor = "rgba(255, 215, 0, 0.05)";
                }

                // 4. 填满 2400h
                let remainingTime = 2400 * 3600; // 秒
                let usedTime = 0;

                for (const order of profitableRows) {
                    if (remainingTime <= 0) break;

                    const takeTime = Math.min(order.time, remainingTime);

                    totalProfitVal += (order.profit * takeTime);
                    usedTime += takeTime;
                    remainingTime -= takeTime;
                }

                totalTimeSeconds = usedTime;
                const totalHours = totalTimeSeconds / 3600;

                avgProfitPerHour = totalHours > 0 ? (totalProfitVal / totalHours) : 0;
                isFull = totalHours >= 2399.9;

                displayTitle = "100级建筑运行24H理论最优 (仅计算正利润)";
                borderColor = isFull ? "#4CAF50" : "#ff9800"; // 绿或橙

                // 格式化时间字符串
                const timeStr = formatDuration(totalHours);
                statusText = isFull ? "✅ 货源充足" : `⚠️ 仅覆盖 ${timeStr}`;
            }

            // 5. 渲染 UI
            const avgStr = avgProfitPerHour.toFixed(2);
            const totalProfitK = (totalProfitVal / 1000).toFixed(1);
            const durationStr = formatDuration(totalTimeSeconds / 3600);

            const renderUI = () => {
                summaryDisplay.style.display = "block";
                summaryDisplay.style.borderLeft = `4px solid ${borderColor}`;

                summaryDisplay.innerHTML = `
                    <div style="font-family: sans-serif; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 6px;">
                            <span style="color: #aaa; font-size: 12px;">${displayTitle}</span>
                            <span style="font-size: 20px; font-weight: bold; color: ${borderColor};">$${avgStr}<span style="font-size:12px; font-weight:normal;">/h</span></span>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;">
                            <div style="background: ${isFull ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 152, 0, 0.2)'};
                                        color: ${isFull ? '#81c784' : '#ffb74d'};
                                        padding: 2px 6px; border-radius: 4px;">
                                ${statusText}
                            </div>

                            <div style="background: #333; color: #ccc; padding: 2px 6px; border-radius: 4px;">
                                💰 总利: $${totalProfitK}k
                            </div>

                            <div style="background: #333; color: #ccc; padding: 2px 6px; border-radius: 4px;">
                                ⏱️ 用时: ${durationStr}
                            </div>
                        </div>
                    </div>`;
            };
            renderUI();
        }

        // 主回调处理
        profitWorker.onmessage = function (e) {
            const { rowId, maxProfit, selltime } = e.data;
            const row = pendingRows.get(rowId);
            if (!row) return;
            pendingRows.delete(rowId);

            // --- 核心改动：把数值作为对象属性直接挂载到 DOM 元素上 ---
            row.__profitData = { profit: maxProfit, time: selltime };

            const hours = Math.floor(selltime / 3600);
            const minutes = Math.ceil((selltime % 3600) / 60);
            const timeStr = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
            const profitStr = (maxProfit * 3600).toFixed(2);

            if (!row.querySelector('td.auto-profit-info')) {
                const td = document.createElement('td');
                td.classList.add('auto-profit-info');
                const span = document.createElement('span');
                span.style.cssText = `display: inline-block; min-width: 60px; font-size: 14px; color: white; background: #555; padding: 4px 8px; border-radius: 2px;`;

                // 存储显示文案到 dataset 方便切换按钮使用
                span.dataset.p = `时利润：${profitStr}`;
                span.dataset.t = `用时：${timeStr}`;
                span.textContent = isShowingProfit ? span.dataset.p : span.dataset.t;

                td.appendChild(span);
                row.appendChild(td);
                allProfitSpans.add(span);
            }

            attachInputListener();
            // 每次新数据回来，立刻重算 2400h 模拟
            updateGlobalSimulation();
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
            let match;
            const regexEN = /^market order, price \$?([\d,.]+), quantity ([\d,.]+), quality (\d+), offered by company/i;
            const regexSC = /^由.*公司提供的市场订单：价格\$?([\d,.]+)，数量([\d,.]+)，质量(\d+)/;
            const regexTC = /^由.*公司提供的市場訂單：價格\$?([\d,.]+)，數量([\d,.]+)，品質(\d+)/;

            if (match = label.match(regexEN)) {
                return { price: parseFloat(match[1].replace(/,/g, '')), quantity: parseFloat(match[2].replace(/,/g, '')), quality: parseInt(match[3]) };
            } else if (match = label.match(regexSC)) {
                return { price: parseFloat(match[1].replace(/,/g, '')), quantity: parseFloat(match[2].replace(/,/g, '')), quality: parseInt(match[3]) };
            } else if (match = label.match(regexTC)) {
                return { price: parseFloat(match[1].replace(/,/g, '')), quantity: parseFloat(match[2].replace(/,/g, '')), quality: parseInt(match[3]) };
            }
            return null;
        }

        function extractRealmIdOnce(tbody) {
            if (currentRealmId) return;
            const row = tbody.querySelector('tr');
            const link = row?.querySelector('a[href*="/company/"]');
            const match = link?.getAttribute('href')?.match(/\/company\/(\d+)\//);
            if (match) {
                currentRealmId = match[1];
            }
        }

        async function processNewRows(tbody) {
            // 此时已确定 currentIsRetail 为 true，直接获取数据即可
            const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
            if (!SCD_raw) return;
            const SCD = JSON.parse(SCD_raw);
            const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${currentRealmId}`));
            if (!SRC) return;

            // 扫描还未处理过的行
            const rows = Array.from(tbody.querySelectorAll('tr'))
                .filter(r => !r.hasAttribute('data-profit-calculated'));

            rows.forEach(row => {
                const data = extractNumbersFromAriaLabel(row.getAttribute('aria-label'));
                if (!data) return;

                const rowId = rowIdCounter++;
                pendingRows.set(rowId, row);
                row.setAttribute('data-profit-calculated', '1');
                profitWorker.postMessage({ rowId, order: { resourceId: currentResourceId, ...data }, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT });
            });

            // 即使没有新行增加，也要重算模拟结果
            updateGlobalSimulation();
        }

        return {
            init(resourceId) {
                currentResourceId = resourceId;
                currentRealmId = null;
                let globalObserver = null;
                let tableObserver = null;

                // --- 核心优化 1: 启动即判断零售属性 ---
                let currentIsRetail = false;
                const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
                if (SCD_raw) {
                    const SCD = JSON.parse(SCD_raw);
                    currentIsRetail = Object.values(SCD.data.SALES).some(l => l.includes(parseInt(currentResourceId)));
                }

                // 如果不是零售商品，直接退出，不设置任何监听，不注入任何 UI
                if (!currentIsRetail) {
                    if (summaryDisplay) summaryDisplay.style.display = "none";
                    return;
                }

                const tryInit = () => {
                    const tbody = findValidTbody();
                    const form = document.querySelector('form');

                    // 1. 基础检查
                    if (!tbody || !form) return;

                    // 2. 防止重复注入
                    if (form.hasAttribute('data-market-calc-initialized')) return;

                    // 3. 提取 Realm ID
                    extractRealmIdOnce(tbody);

                    // 4. 插入 UI 元素
                    const parentDiv = form.parentElement;
                    const container = parentDiv?.parentElement?.parentElement;

                    if (container && !container.querySelector('[data-custom-notice]')) {
                        // 创建提示文案
                        const infoText = document.createElement('div');
                        infoText.textContent = '高管，学院，周期的不及时更新可能导致计算误差，左下菜单可手动更新。所有展示内容均为1级建筑。';
                        infoText.style.cssText = "font-size: 11px; color: #888; margin-bottom: 4px;";
                        infoText.dataset.customNotice = 'true';

                        // 创建汇总面板
                        summaryDisplay = document.createElement('div');
                        summaryDisplay.style.cssText = "background: #222; padding: 12px; border-radius: 4px; margin-bottom: 10px; border-left: 4px solid #4CAF50; display: none; min-height: 40px;";

                        container.appendChild(infoText);
                        container.insertBefore(summaryDisplay, infoText);

                        // // 创建切换按钮
                        // const toggleButton = document.createElement('button');
                        // toggleButton.type = 'button';
                        // toggleButton.textContent = '切换至：用时';
                        // toggleButton.className = "btn btn-primary";
                        // toggleButton.style.marginLeft = "10px";

                        // const lastDiv = form.querySelector('.css-1491xfy > div:last-child');
                        // if (lastDiv) {
                        //     lastDiv.insertAdjacentElement('afterend', toggleButton);
                        // }

                        // toggleButton.addEventListener('click', () => {
                        //     isShowingProfit = !isShowingProfit;
                        //     document.querySelectorAll('.auto-profit-info span').forEach(span => {
                        //         const { p, t } = span.dataset;
                        //         if (p && t) span.textContent = isShowingProfit ? p : t;
                        //     });
                        //     toggleButton.textContent = isShowingProfit ? '用时' : '时利润';
                        // });

                        // 标记已完成注入
                        form.setAttribute('data-market-calc-initialized', 'true');
                    }

                    // 5. 初始执行：此时确认为零售，直接处理
                    processNewRows(tbody);

                    // 6. 开启表格行监听
                    if (tableObserver) tableObserver.disconnect();
                    tableObserver = new MutationObserver(() => {
                        requestAnimationFrame(() => processNewRows(tbody));
                    });
                    tableObserver.observe(tbody, { childList: true });

                    // 7. 初始化成功，停止全局 document 监听
                    if (globalObserver) {
                        globalObserver.disconnect();
                        globalObserver = null;
                    }
                };

                // --- 核心优化 2: 仅在零售模式下启动监听 ---
                tryInit();

                globalObserver = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.addedNodes.length) {
                            tryInit();
                            break;
                        }
                    }
                });
                globalObserver.observe(document.body, { childList: true, subtree: true });
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
            const { cardId, order, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT} = e.data;
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
                SRC,
                SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT
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

            // 使用文本强制匹配，如果合同不计算，应当查看翻译平台文本是否发生改变
            const regexEN = /^incoming contract,\s*([\d,]+).*?quality\s+(\d+),\s*at\s*\$([\d,.]+)\s+per unit,\s*total price\s*\$([\d,.]+)/i;
            const regexSC = /^来自.*?的入库合同，([\d,]+)单位的Q(\d+).*?，价格为\$([\d,.]+)每单位，总价\$([\d,.]+)/;
            const regexTC = /^來自.*?的入庫合同，([\d,]+)單位的Q(\d+).*?，價格為\$([\d,.]+)每單位，總價\$([\d,.]+)/;

            let match;
            if (match = label.match(regexEN)) {
                result.quantity = parseInt(match[1].replace(/,/g, ''));
                result.quality = parseInt(match[2]);
                result.unitPrice = parseFloat(match[3].replace(/,/g, ''));
                result.totalPrice = parseFloat(match[4].replace(/,/g, ''));
            } else if (match = label.match(regexSC)) {
                result.quantity = parseInt(match[1].replace(/,/g, ''));
                result.quality = parseInt(match[2]);
                result.unitPrice = parseFloat(match[3].replace(/,/g, ''));
                result.totalPrice = parseFloat(match[4].replace(/,/g, ''));
            } else if (match = label.match(regexTC)) {
                result.quantity = parseInt(match[1].replace(/,/g, ''));
                result.quality = parseInt(match[2]);
                result.unitPrice = parseFloat(match[3].replace(/,/g, ''));
                result.totalPrice = parseFloat(match[4].replace(/,/g, ''));
            } else {
                console.warn('[合同卡片] aria-label 格式不匹配:', label);
            }

            const img = card.querySelector('img[src^="/static/images/resources/"]');
            if (img) {
                result.imageSrc = img.getAttribute('src');
                result.resourcePath = result.imageSrc
                    .replace(/^\/static\//, '')
                    .replace(/\.[0-9a-f]{6,}\.(png|jpg|jpeg|gif|svg)$/, '.$1');

                const constants = JSON.parse(localStorage.getItem('SimcompaniesConstantsData') || '{}');
                const resources = Object.values(constants?.constantsResources || {});
                const matched = resources.find(r => r.image === result.resourcePath);
                if (matched) result.dbLetter = matched.dbLetter;
            }
            // console.log(result)
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
                tip.textContent = '高管，学院，周期的不及时更新可能导致计算误差，左下菜单可手动更新。';
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
                    if (!isPageModuleEnabled('marketProfit')) return;

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
                    if (!isPageModuleEnabled('contractProfit')) return;

                    console.log('[合同页面识别] 已进入合同页面');
                    incomingContractsHandler.init();
                }
            },
            executivePage: {
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
            formerExecutivesPage: {
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
            buildingPage: {
                pattern: /\/b\/\d+\/?$/,
                action: () => {
                    setTimeout(() => {
                        // 检查全局函数是否存在，避免报错
                        if (typeof window.initAutoAmountButtons === 'function') {
                            window.initAutoAmountButtons();
                        }
                        if (typeof window.initAutoPricing === 'function') {
                            window.initAutoPricing();
                        }
                    }, 300);
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

        handlePage();
    })();

    // ======================
    // 模块10：自动或定时更新数据 SimcompaniesConstantsData SimcompaniesRetailCalculation超过一小时就更新
    // 只在打开新标签页和切换领域是才会判断时间更新 更新数据无锁
    // ======================
    // 使用 MutationObserver 监听 DOM 变化并提取 realmId

    // 提取 realmId 的函数
    function getRealmIdFromLink() {
        let method1Result = null; // 图片法提取结果
        let method2Result = null; // 链接法提取结果 (原逻辑)

        // --- 方法 1：从特定的 Realm Logo 图片提取 ---
        const realmLogoImg = document.querySelector('img[alt$="realm logo"]');
        if (realmLogoImg) {
            const src = realmLogoImg.src;
            if (src.includes('Magnates')) {
                method1Result = 0;
            } else if (src.includes('Entrepeneurs')) {
                method1Result = 1;
            }
        }

        // --- 方法 2：从链接提取 (你的原逻辑) ---
        const link = document.querySelector('a[href*="/company/"]');
        if (link) {
            const match = link.href.match(/\/company\/(\d+)\//);
            if (match) {
                method2Result = parseInt(match[1], 10);
            }
        }

        // --- 逻辑判断与返回 ---

        // 情况 A：两个方法都成功拿到了数据，进行一致性校验
        if (method1Result !== null && method2Result !== null) {
            if (method1Result !== method2Result) {
                console.warn(
                    `[Realm检测冲突] 两个方法获取的 realmId 不一致：\n` +
                    `第一个方法(图片法)结果: ${method1Result}\n` +
                    `第二个方法(链接法)结果: ${method2Result}\n` +
                    `已返回第二个方法的结果以确保代码正常运行。`
                );
                return method2Result;
            }
            return method2Result; // 结果一致
        }

        // 情况 B：只有一个方法成功，或者两个都失败
        if (method2Result !== null) return method2Result; // 优先返回方法 2
        if (method1Result !== null) return method1Result; // 方法 2 失败但方法 1 成功

        // 情况 C：最终保底方案 —— 全部失败
        return null;
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
                const { data, inputPercent, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT} = e.data;
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
                    profitWorker.postMessage({ data, inputPercent, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT });
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
    // 模块14：显示挖人培训历史记录
    // ======================
    const ExecutiveTrainingModule = (function () {
        const OFFERS_URL = "/api/v2/companies/executives/my-offers/";
        const NOTIFICATIONS_KEYWORD = "/game-notifications/";
        const EXEC_API_REGEX = /\/api\/v4\/executives\/(\d+)\/$/;

        // --- 内部工具函数 ---
        const getScopedKey = (k) => {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            return realmId !== null ? `R${realmId}-${k}` : k;
        };

        const load = (k) => {
            const key = getScopedKey(k);
            try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
        };

        const save = (k, d) => {
            const key = getScopedKey(k);
            localStorage.setItem(key, JSON.stringify(d));
        };

        const upsert = (arr, obj, key) => {
            const i = arr.findIndex(x => x[key] === obj[key]);
            if (i === -1) arr.push(obj); else arr[i] = obj;
            return arr;
        };

        const positionMap = (p) => ({
            o: 'COO', f: 'CFO', m: 'CMO', t: 'CTO',
            v: 'COO学徒', x: 'CFO学徒', y: 'CMO学徒', z: 'CTO学徒',
            '1': '职员1', '2': '职员2', '3': '职员3', '4': '职员4', '5': '职员5'
        }[p] || p);

        const trainingNameMap = (t) => ({
            o: '管理培训', f: '会计课程', m: '沟通工作室', t: '科学界研讨会', g: '各领域课程'
        }[t] || t);

        const getCompanyLink = (realm, name) => `https://www.simcompanies.com/company/${realm}/${encodeURIComponent(name)}/`;

        function getValidTargetContainer() {
            const TARGET_BUTTON_CLASS = 'css-1r3lxky';
            const PARENT_CONTAINER_CLASS = 'css-1flj9lk';
            const btn = document.querySelector(`button.${TARGET_BUTTON_CLASS}`);
            if (btn && btn.parentElement && btn.parentElement.classList.contains(PARENT_CONTAINER_CLASS)) {
                return btn.parentElement;
            }
            return null;
        }

        // --- UI 渲染函数 ---
        function renderSkillPanel(data, isError = false) {
            const targetContainer = getValidTargetContainer();
            if (!targetContainer || document.getElementById('sc-plugin-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'sc-plugin-panel';
            const baseStyle = `margin-top: 12px; padding: 12px; border-radius: 4px; font-family: sans-serif; font-size: 14px; background-color: #f2f2f2; border: 1px solid #d1d1d1; color: #333;`;

            let contentHtml = "";
            if (isError) {
                contentHtml = `<div style="color: #856404; background-color: #fff3cd; border: 1px solid #ffeeba; padding: 8px; border-radius: 4px; font-size: 14px;">⚠️ <b>匹配失败：</b> 未在通知中找到此次挖人信息。</div>`;
            } else {
                const currentRealm = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : 0;

                // 1. 详细培训历史
                let total = { coo: 0, cfo: 0, cmo: 0, cto: 0 };
                const trainings = data.trainings || [];
                const historyHtml = trainings.map(t => {
                    total.coo += t.skillCoo || 0; total.cfo += t.skillCfo || 0;
                    total.cmo += t.skillCmo || 0; total.cto += t.skillCto || 0;
                    const details = [];
                    if (t.skillCoo) details.push(`管理+${t.skillCoo}`);
                    if (t.skillCfo) details.push(`会计+${t.skillCfo}`);
                    if (t.skillCmo) details.push(`沟通+${t.skillCmo}`);
                    if (t.skillCto) details.push(`科学+${t.skillCto}`);
                    const detailStr = details.length > 0 ? `<span style="color:#777; margin-left:4px;">(${details.join(' ')})</span>` : '';
                    const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm, t.employer.company);
                    return `<div style="padding:2px 0; border-bottom:1px dashed #eee; color:#555; font-size:14px;">在 <a href="${cUrl}" target="_blank" style="color:#2196f3; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}</div>`;
                }).join('') || '无历史培训记录';

                // 2. 从业履历
                const workHistoryHtml = data.workHistory?.map(w => {
                    const isCurrent = !w.end;
                    const cUrl = getCompanyLink(w.employer.realmId ?? currentRealm, w.employer.company);
                    const posName = positionMap(w.position);

                    return `
                    <div style="padding:4px 0; border-bottom:1px solid #eee; ${isCurrent ? 'background: #eef7ff;' : ''}">
                        <span style="color:#444; font-size:14px;">
                            ${isCurrent ? '⭐ ' : ''}在 
                            <a href="${cUrl}" target="_blank" style="color:#2196f3; text-decoration:none; font-weight:${isCurrent ? 'bold' : 'normal'};">${w.employer.company}</a> 
                            担任 <b>${w.daysActive}</b> 天的 <b>${posName}</b>
                            ${isCurrent ? ' <span style="color:#2e7d32; font-size:14px;">(当前所在职位)</span>' : ''}
                        </span>
                    </div>`;
                }).join('') || '无从业记录';

                // 3. 当前培训状态
                const currentTrainingStatus = data.currentTraining
                    ? `<b style="color:#2196f3;">${trainingNameMap(data.currentTraining.training)}</b>`
                    : `<span style="color:#999;">当前无培训</span>`;

                contentHtml = `
                <div style="font-weight:bold; border-bottom:1px solid #ccc; padding-bottom:5px; margin-bottom:8px; display:flex; justify-content:space-between;">高管解析 <span style="color:#888; font-size:14px; font-weight:normal;">高管名字: ${data.name}  ID: ${data.id}</span></div>
                
                <div style="font-size:14px; font-weight:bold; color:#666; margin-bottom:4px;">📊 目前培训技能总和 <span style="font-weight:normal; color:#888;">(已完成 ${trainings.length} 次)</span></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
                    <div style="background:#e6e6e6; padding:4px 8px; border:1px solid #ddd;">管理: <b style="color:#d32f2f;">+${total.coo}</b></div>
                    <div style="background:#e6e6e6; padding:4px 8px; border:1px solid #ddd;">会计: <b style="color:#d32f2f;">+${total.cfo}</b></div>
                    <div style="background:#e6e6e6; padding:4px 8px; border:1px solid #ddd;">沟通: <b style="color:#d32f2f;">+${total.cmo}</b></div>
                    <div style="background:#e6e6e6; padding:4px 8px; border:1px solid #ddd;">科学: <b style="color:#d32f2f;">+${total.cto}</b></div>
                </div>
                <div style="font-size:14px; margin-bottom:10px; padding-left:2px;">
                    <span style="color:#666;">进行中：</span>${currentTrainingStatus}
                </div>
    
                <div style="font-size:14px; font-weight:bold; color:#666; margin-bottom:4px;">💼 从业履历</div>
                <div style="max-height:100px; overflow-y:auto; background:#fff; border:1px solid #ddd; padding:4px; margin-bottom:10px; font-size:14px;">${workHistoryHtml}</div>
    
                <div style="font-size:14px; font-weight:bold; color:#666; margin-bottom:4px;">🎓 详细培训历史</div>
                <div style="max-height:100px; overflow-y:auto; background:#fff; border:1px solid #ddd; padding:4px; font-size:14px;">${historyHtml}</div>
    
                <div style="margin-top:10px; padding:8px; background-color:#fff5f5; border:1px solid #ffcccc; border-radius:4px; font-size:14px; color:#c62828; line-height:1.4;">
                    <b>⚠️请注意：</b><br>
                    1. 本功能为插件功能，<b>请勿在游戏内聊天室提及</b>。<br>
                    2. 若在发送通知前点开高管，则可能导致此次挖人数据不显示。<br>
                    3. 若通知内高管被他人抢先招募，<b>在点击“寻找其他候选人”后显示的数据无效</b>。
                </div>`;
            }

            panel.style = baseStyle;
            panel.innerHTML = contentHtml;
            targetContainer.after(panel);
        }

        // --- 数据处理层 ---
        function processData(url, d) {
            if (!d) return;

            // 1. 渲染高管详情
            if (EXEC_API_REGEX.test(url)) {
                if (getValidTargetContainer()) renderSkillPanel(d);
            }

            // 2. 处理 My Offers (修正 slotPosition 冲突问题)
            if (url.includes(OFFERS_URL)) {
                let s = load("SC-my-offers");
                const newOffers = d.offers || [];

                if (newOffers.length > 0) {
                    // 获取当前 API 返回的所有 slotPosition
                    const incomingSlots = newOffers.map(o => o.slotPosition);

                    // 【关键步骤】过滤掉本地存储中，那些已经出现在新数据中的 slotPosition 的旧数据
                    // 这样可以确保每个 slot 只保留最新的 id
                    s = s.filter(oldItem => !incomingSlots.includes(oldItem.slotPosition));

                    // 插入新数据
                    newOffers.forEach(o => {
                        if (o.id) {
                            s.push({ id: o.id, slotPosition: o.slotPosition });
                        }
                    });
                }
                save("SC-my-offers", s);
            }

            // 3. 处理通知数据
            if (url.includes(NOTIFICATIONS_KEYWORD)) {
                let s = load("SC-AGENCY_FOUND_EXECUTIVE");
                const list = Array.isArray(d) ? d : (d.notifications || []);

                list.filter(n => n.notificationKind === "AGENCY_FOUND_EXECUTIVE").forEach(n => {
                    // 这里的 upsert 是对的，因为 offerId 是唯一的
                    s = upsert(s, { executiveId: n.executiveId, offerId: n.offerId }, "offerId");
                });

                // 可选优化：清理过期的通知数据，避免本地存储无限增长
                if (s.length > 100) s = s.slice(-100);

                save("SC-AGENCY_FOUND_EXECUTIVE", s);
            }
        }

        // --- 拦截部分保持不变 ---
        const _fetch = window.fetch;
        window.fetch = async function (...args) {
            const res = await _fetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : (args[0].url || "");
            res.clone().text().then(text => { try { processData(url, JSON.parse(text)); } catch (e) { } });
            return res;
        };
        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, url) {
            this.addEventListener("load", () => { try { processData(url, JSON.parse(this.responseText)); } catch (e) { } });
            return _open.apply(this, arguments);
        };

        return {
            init: function (slotCode) {
                const m = { "coo": "o", "cfo": "f", "cmo": "m", "cto": "t", "coo-apprentice": "v", "cfo-apprentice": "x", "cmo-apprentice": "y", "cto-apprentice": "z", "g1": "1", "g2": "2", "g3": "3", "g4": "4", "g5": "5" };
                const internalSlot = m[slotCode];
                if (!internalSlot) return;
                const offers = load("SC-my-offers");
                const found = load("SC-AGENCY_FOUND_EXECUTIVE");
                const o = offers.find(x => x.slotPosition === internalSlot);
                if (o) {
                    const f = found.find(x => x.offerId === o.id);
                    if (f) { _fetch(`/api/v4/executives/${f.executiveId}/`).then(r => r.json()).then(renderSkillPanel); }
                    else { renderSkillPanel(null, true); }
                } else { renderSkillPanel(null, true); }
            }
        };
    })();

    // ======================
    // 模块15：前任高管详细信息展示
    // ======================
    const FormerExecutivesModule = (function () {
        const FORMER_EXEC_API_REGEX = /\/api\/v2\/companies\/(\d+)\/former-executives\//;
        const EXEC_DETAIL_API = (id) => `/api/v4/executives/${id}/`;

        // --- 内部工具函数 ---
        const getScopedKey = (k) => {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            return realmId !== null ? `R${realmId}-${k}` : k;
        };

        const load = (k) => {
            try { return JSON.parse(localStorage.getItem(getScopedKey(k)) || "[]"); } catch { return []; }
        };

        const save = (k, d) => {
            localStorage.setItem(getScopedKey(k), JSON.stringify(d));
        };

        const positionMap = (p) => ({
            o: 'COO', f: 'CFO', m: 'CMO', t: 'CTO',
            v: 'COO学徒', x: 'CFO学徒', y: 'CMO学徒', z: 'CTO学徒',
            '1': '职员1', '2': '职员2', '3': '职员3', '4': '职员4', '5': '职员5'
        }[p] || p);

        const trainingNameMap = (t) => ({
            o: '管理培训', f: '会计课程', m: '沟通工作室', t: '科学界研讨会', g: '各领域课程'
        }[t] || t);

        const getCompanyLink = (realm, name) => `https://www.simcompanies.com/company/${realm}/${encodeURIComponent(name)}/`;

        // --- 注入动态 CSS ---
        function injectStyles() {
            if (document.getElementById('sc-module15-styles')) return;
            const style = document.createElement('style');
            style.id = 'sc-module15-styles';
            style.textContent = `
            @keyframes sc-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .sc-spinner { border: 3px solid #f3f3f3; border-top: 3px solid #2196f3; border-radius: 50%; width: 30px; height: 30px; animation: sc-spin 1s linear infinite; margin: 0 auto 10px auto; }
            .sc-modal-btn { margin-left: auto; padding: 6px 12px; background-color: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: all 0.2s; }
            .sc-modal-btn:hover { background-color: #1976d2; transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        `;
            document.head.appendChild(style);
        }

        // --- 数据处理层 ---
        function processData(url, d) {
            if (!d) return;
            if (FORMER_EXEC_API_REGEX.test(url)) {
                const executives = d.executives || [];
                if (executives.length > 0) {
                    save("SC-former-executives", executives);
                    setTimeout(injectMoreInfoButtons, 500);
                }
            }
        }

        // --- 拦截网络请求 ---
        const _fetch = window.fetch;
        window.fetch = async function (...args) {
            const res = await _fetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : (args[0].url || "");
            res.clone().text().then(text => { try { processData(url, JSON.parse(text)); } catch (e) { } });
            return res;
        };

        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, url) {
            this.addEventListener("load", () => { try { processData(url, JSON.parse(this.responseText)); } catch (e) { } });
            return _open.apply(this, arguments);
        };

        // --- UI 渲染层 (悬浮窗) ---
        function showExecutiveModal(executiveId) {
            // 清理旧弹窗
            const existingModal = document.getElementById('sc-exec-modal-overlay');
            if (existingModal) existingModal.remove();

            // 1. 锁定背景滚动
            const originalBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            // 2. 创建遮罩层
            const overlay = document.createElement('div');
            overlay.id = 'sc-exec-modal-overlay';
            overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); z-index: 99999;
            display: flex; justify-content: center; align-items: center;
            opacity: 0; transition: opacity 0.2s ease-in-out;
        `;

            // 3. 创建弹窗容器
            const modal = document.createElement('div');
            modal.style.cssText = `
            background: #fff; border-radius: 8px; width: 450px; max-width: 90vw;
            max-height: 85vh; overflow-y: auto; padding: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); position: relative;
            font-family: sans-serif; transform: scale(0.95); transition: transform 0.2s ease-in-out;
        `;

            // 初始显示加载状态
            modal.innerHTML = `
            <div style="display:flex; justify-content:flex-end;">
                <button id="sc-modal-close-temp" style="background:none; border:none; font-size:24px; cursor:pointer; color:#999; line-height:1;">&times;</button>
            </div>
            <div style="text-align:center; padding: 30px 20px; color:#666;">
                <div class="sc-spinner"></div>
                <div>正在调取高管档案...</div>
            </div>
        `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // 触发动画
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            // --- 统一关闭逻辑 ---
            const closeModal = () => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    overlay.remove();
                    document.body.style.overflow = originalBodyOverflow; // 恢复背景滚动
                    document.removeEventListener('keydown', handleEsc);  // 移除按键监听
                }, 200);
            };

            // 事件监听：点击遮罩层关闭
            overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
            // 事件监听：临时关闭按钮
            document.getElementById('sc-modal-close-temp').onclick = closeModal;
            // 事件监听：Esc键关闭
            const handleEsc = (e) => { if (e.key === 'Escape') closeModal(); };
            document.addEventListener('keydown', handleEsc);

            // 4. 发起按需数据请求
            fetch(EXEC_DETAIL_API(executiveId))
                .then(res => res.json())
                .then(data => {
                    const currentRealm = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : 0;
                    const trainings = data.trainings || [];
                    let total = { coo: 0, cfo: 0, cmo: 0, cto: 0 };

                    const historyHtml = trainings.map(t => {
                        total.coo += t.skillCoo || 0; total.cfo += t.skillCfo || 0;
                        total.cmo += t.skillCmo || 0; total.cto += t.skillCto || 0;
                        const details = [];
                        if (t.skillCoo) details.push(`管理+${t.skillCoo}`);
                        if (t.skillCfo) details.push(`会计+${t.skillCfo}`);
                        if (t.skillCmo) details.push(`沟通+${t.skillCmo}`);
                        if (t.skillCto) details.push(`科学+${t.skillCto}`);
                        const detailStr = details.length > 0 ? `<span style="color:#777; margin-left:4px;">(${details.join(' ')})</span>` : '';
                        const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm, t.employer.company);
                        return `<div style="padding:6px 0; border-bottom:1px dashed #eee; color:#555; font-size:14px;">在 <a href="${cUrl}" target="_blank" style="color:#2196f3; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}</div>`;
                    }).join('') || '<div style="color:#999; text-align:center; padding:10px;">无历史培训记录</div>';

                    const workHistoryHtml = data.workHistory?.map(w => {
                        const isCurrent = !w.end;
                        const cUrl = getCompanyLink(w.employer.realmId ?? currentRealm, w.employer.company);
                        const posName = positionMap(w.position);
                        return `
                    <div style="padding:8px 0; border-bottom:1px solid #eee; ${isCurrent ? 'background: #eef7ff; padding-left:5px; border-left:3px solid #2196f3;' : ''}">
                        <span style="color:#444; font-size:14px;">
                            ${isCurrent ? '⭐ ' : ''}在 
                            <a href="${cUrl}" target="_blank" style="color:#2196f3; text-decoration:none; font-weight:${isCurrent ? 'bold' : 'normal'};">${w.employer.company}</a> 
                            担任 <b>${w.daysActive}</b> 天的 <b>${posName}</b>
                            ${isCurrent ? ' <span style="color:#2e7d32; font-size:13px;">(当前所在职位)</span>' : ''}
                        </span>
                    </div>`;
                    }).join('') || '<div style="color:#999; text-align:center; padding:10px;">无从业记录</div>';

                    const currentTrainingStatus = data.currentTraining
                        ? `<b style="color:#2196f3;">${trainingNameMap(data.currentTraining.training)}</b>`
                        : `<span style="color:#999;">当前无培训</span>`;

                    // 替换弹窗内容为真实数据
                    modal.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #eee; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0 0 4px 0; font-size:18px; color:#333;">${data.name}</h3>
                            <div style="color:#888; font-size:12px;">高管ID: ${data.id}</div>
                        </div>
                        <button id="sc-modal-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:#999; line-height:1; padding:0 0 5px 10px;">&times;</button>
                    </div>
                    
                    <div style="font-size:14px; font-weight:bold; color:#555; margin-bottom:8px;">📊 培训技能总计 <span style="font-weight:normal; color:#888; font-size:12px;">(完成 ${trainings.length} 次)</span></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                        <div style="background:#f8f9fa; padding:8px 12px; border-radius:6px; border:1px solid #e9ecef; display:flex; justify-content:space-between;">
                            <span style="color:#666;">管理:</span> <b style="color:#d32f2f;">+${total.coo}</b>
                        </div>
                        <div style="background:#f8f9fa; padding:8px 12px; border-radius:6px; border:1px solid #e9ecef; display:flex; justify-content:space-between;">
                            <span style="color:#666;">会计:</span> <b style="color:#d32f2f;">+${total.cfo}</b>
                        </div>
                        <div style="background:#f8f9fa; padding:8px 12px; border-radius:6px; border:1px solid #e9ecef; display:flex; justify-content:space-between;">
                            <span style="color:#666;">沟通:</span> <b style="color:#d32f2f;">+${total.cmo}</b>
                        </div>
                        <div style="background:#f8f9fa; padding:8px 12px; border-radius:6px; border:1px solid #e9ecef; display:flex; justify-content:space-between;">
                            <span style="color:#666;">科学:</span> <b style="color:#d32f2f;">+${total.cto}</b>
                        </div>
                    </div>
                    <div style="font-size:14px; margin-bottom:20px; background:#eef7ff; padding:8px 12px; border-radius:6px; border:1px solid #cce5ff;">
                        <span style="color:#666;">进行中：</span>${currentTrainingStatus}
                    </div>

                    <div style="font-size:14px; font-weight:bold; color:#555; margin-bottom:8px;">💼 从业履历</div>
                    <div style="max-height:160px; overflow-y:auto; background:#fff; border:1px solid #eee; border-radius:6px; padding:0 12px; margin-bottom:20px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">${workHistoryHtml}</div>

                    <div style="font-size:14px; font-weight:bold; color:#555; margin-bottom:8px;">🎓 详细培训历史</div>
                    <div style="max-height:160px; overflow-y:auto; background:#fff; border:1px solid #eee; border-radius:6px; padding:0 12px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">${historyHtml}</div>
                `;

                    // 重新绑定真实数据的关闭按钮
                    document.getElementById('sc-modal-close').onclick = closeModal;
                })
                .catch(() => {
                    modal.innerHTML = `
                    <div style="display:flex; justify-content:flex-end;">
                        <button id="sc-modal-close-err" style="background:none; border:none; font-size:24px; cursor:pointer; color:#999; line-height:1;">&times;</button>
                    </div>
                    <div style="text-align:center; padding: 30px 20px;">
                        <div style="color:#d32f2f; font-size:40px; margin-bottom:10px;">⚠️</div>
                        <div style="color:#d32f2f; font-weight:bold; margin-bottom:15px;">档案调取失败</div>
                        <div style="color:#666; font-size:14px;">网络可能开小差了，请稍后重试。</div>
                    </div>
                `;
                    document.getElementById('sc-modal-close-err').onclick = closeModal;
                });
        }

        // --- DOM 注入逻辑 ---
        function injectMoreInfoButtons() {
            if (!isPageModuleEnabled('formerExecEnhance')) return;
            const headers = Array.from(document.querySelectorAll('h3'));
            const targetHeader = headers.find(h => h.textContent.includes('前任公司高管'));

            if (!targetHeader || !targetHeader.parentElement) return;

            const container = targetHeader.parentElement;
            const rows = container.querySelectorAll('.css-19er0v9');
            const storedExecs = load("SC-former-executives");

            if (storedExecs.length === 0) return;

            rows.forEach(row => {
                if (row.dataset.scInjected) return;

                const infoDiv = row.children[1];
                if (!infoDiv) return;

                const nameElement = infoDiv.children[0];
                if (!nameElement) return;

                const nameText = nameElement.textContent || "";
                const nameMatch = nameText.match(/(.+?)\s*\(\d+岁\)/) || nameText.match(/(.+?)\s*\(\d+/);
                const execName = nameMatch ? nameMatch[1].trim() : nameText.trim();

                const execData = storedExecs.find(e => e.name === execName);

                if (execData) {
                    row.style.display = 'flex';
                    row.style.alignItems = 'center';

                    const btn = document.createElement('button');
                    btn.className = 'sc-modal-btn';
                    btn.textContent = "详细";

                    btn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showExecutiveModal(execData.id);
                    };

                    row.appendChild(btn);
                    row.dataset.scInjected = "true";
                }
            });
        }

        // --- 页面监听器 (SPA 适配) ---
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldCheck = true;
                    break;
                }
            }
            if (shouldCheck) {
                clearTimeout(window._scInjectTimer);
                window._scInjectTimer = setTimeout(injectMoreInfoButtons, 300);
            }
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                injectStyles();
                observer.observe(document.body, { childList: true, subtree: true });
            });
        } else {
            injectStyles();
            observer.observe(document.body, { childList: true, subtree: true });
        }

        return { forceInject: injectMoreInfoButtons };
    })();

    // ======================
    // 模块16：手动保存高管与环境数据 (常开版)
    // ======================
    // ======================
    // 模块16：手动同步高管与环境数据
    // ======================
    const ExecutiveDataSaverModule = (function () {

        // --- 内部工具函数 ---
        const getScopedKey = (k) => {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            return realmId !== null ? `R${realmId}-${k}` : k;
        };

        const save = (k, d) => {
            localStorage.setItem(getScopedKey(k), JSON.stringify(d));
        };

        // --- 核心保存逻辑 ---
        async function performManualSave() {
            const currentRealmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (currentRealmId === null) return;

            const btn = document.getElementById('sc-save-exec-btn');
            const originalText = btn ? btn.textContent : "保存当前高管数据";

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = "⏳ 正在同步...";
                }

                // 1. 直接复用你现有的 handleUpdate('region') 逻辑
                // 如果 handleUpdate 在全局可用，直接调用。如果不可用，则直接运行其内部的 action
                if (typeof handleUpdate === 'function') {
                    await handleUpdate('region');
                } else {
                    // 如果 handleUpdate 作用域不可直接访问，则直接执行底层 API
                    await RegionData.getCurrentRealmId();
                    const result = await RegionData.fetchFullRegionData();
                    if (result && typeof Storage !== 'undefined') {
                        Storage.save('region', result);
                    }
                }

                // 2. 提取 SRC 加成数据 (此时 RegionData 已完成 fetch，本地缓存已更新)
                const srcKey = `SimcompaniesRetailCalculation_${currentRealmId}`;
                const srcRaw = localStorage.getItem(srcKey);

                if (srcRaw) {
                    const SRC = JSON.parse(srcRaw);
                    const dataToSave = {
                        adminBonus: SRC.adminBonus || 0,
                        saleBonus: SRC.saleBonus || 0,
                        timestamp: Date.now()
                    };

                    // 3. 存储关键加成
                    save("SC-Saved-Bonuses", dataToSave);

                    // 4. 成功反馈
                    if (btn) {
                        btn.textContent = "✅ 已同步";
                        btn.style.backgroundColor = "#2e7d32";
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.textContent = originalText;
                            btn.style.backgroundColor = "#2196f3";
                        }, 2000);
                    }
                }
            } catch (e) {
                console.error("模块16: 同步失败", e);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "❌ 失败";
                    btn.style.backgroundColor = "#d32f2f";
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.backgroundColor = "#2196f3";
                    }, 2000);
                }
            }
        }

        // --- UI 注入逻辑 ---
        function injectSaveButton() {
            const container = document.querySelector('.css-1wne25x');
            if (!container) return;

            const targetHeader = container.querySelector('h3');
            if (!targetHeader || targetHeader.querySelector('#sc-custom-exec-btn')) return;

            // 按钮通用样式
            const baseStyle = `
                margin-left: 10px; padding: 4px 10px; color: white; border: none; 
                border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; 
                vertical-align: middle; transition: all 0.2s;
            `;

            // 按钮 1: 原有的同步按钮
            const btnSync = document.createElement('button');
            btnSync.id = 'sc-save-exec-btn';
            btnSync.textContent = "同步高管数据";
            btnSync.style.cssText = baseStyle + "background-color: #2196f3;";
            btnSync.onclick = (e) => { e.preventDefault(); performManualSave(); };

            // 按钮 2: 新增的自定义按钮
            const btnCustom = document.createElement('button');
            btnCustom.id = 'sc-custom-exec-btn';
            btnCustom.textContent = "自定义高管数据";
            btnCustom.style.cssText = baseStyle + "background-color: #673ab7;"; // 紫色区分
            btnCustom.onclick = (e) => {
                e.preventDefault();
                ExecutiveManualCalculator.show();
            };

            targetHeader.appendChild(btnSync);
            targetHeader.appendChild(btnCustom);
        }

        // --- 监听与初始化 ---
        const observer = new MutationObserver(() => injectSaveButton());

        function init() {
            // 常开模式，不设开关判断
            observer.observe(document.body, { childList: true, subtree: true });
            injectSaveButton();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }

        return { forceInject: injectSaveButton };
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
        toast.className = 'sc-update-toast';
        toast.innerHTML = `
            <div class="sc-update-close" id="sc-close" title="暂时关闭">&times;</div>
            <div class="sc-update-header" id="sc-title">自动计算最大时利润插件 发现新版本 v${version} (点击查看)</div>
            <div class="sc-update-body">
                <p style="margin:0; font-weight:bold;">更新日志：</p>
                <div class="sc-changelog-box">${changelog.replace(/\n/g, '<br>') || '修复已知问题，优化性能。'}</div>
                <p style="font-size: 11px; color: #999; margin: 10px 0;">
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
        // @changelog    增加前任高管详细信息查看，尝试解决进入商店时不显示按钮的问题

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
