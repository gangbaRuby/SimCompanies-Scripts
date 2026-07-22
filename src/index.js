import { state } from './core/state.js';
import { isDarkMode, DM, theme, showToast } from './utils/ui.js';
(function () {
    'use strict';
    let hasNewVersion = false;
    let latestVersion = null;
    let { localVersion, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;



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
    // 全局按钮：高管自定义数据
    // ======================
    const executiveCustomButton = (function () {
        let boardroomState = {
            'o': null, 'f': null, 'm': null, 't': null,
            'v': null, 'x': null, 'y': null, 'z': null,
            '1': null, '2': null, '3': null, '4': null, '5': null
        };

        let draggedSlotId = null;
        let selectedSlotId = null;

        // Map executives array from Sim Companies API to boardroomState
        function mapExecutivesToState(execList) {
            // Reset slots
            Object.keys(boardroomState).forEach(k => boardroomState[k] = null);

            let staffIdx = 1;
            execList.forEach(exec => {
                const pos = exec.currentWorkHistory?.position;
                const posStr = pos ? String(pos) : null;
                const emp = {
                    name: exec.name || '未命名',
                    skills: {
                        coo: exec.skills?.coo || 0,
                        cfo: exec.skills?.cfo || 0,
                        cmo: exec.skills?.cmo || 0,
                        cto: exec.skills?.cto || 0
                    }
                };
                if (posStr && boardroomState.hasOwnProperty(posStr)) {
                    boardroomState[posStr] = emp;
                } else {
                    while (staffIdx <= 5 && boardroomState[String(staffIdx)] !== null) {
                        staffIdx++;
                    }
                    if (staffIdx <= 5) {
                        boardroomState[String(staffIdx)] = emp;
                        staffIdx++;
                    }
                }
            });
        }

        // Get key for localStorage
        const getScopedKey = (k) => {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            return realmId !== null ? `R${realmId}-${k}` : k;
        };

        // Load boardroomState from localStorage
        function loadSavedBoardroom() {
            const saved = localStorage.getItem(getScopedKey('SC-Saved-Boardroom'));
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed) {
                        // Merge parsed slots into boardroomState
                        Object.keys(boardroomState).forEach(k => {
                            if (parsed[k] !== undefined) {
                                boardroomState[k] = parsed[k];
                            }
                        });
                    }
                } catch (e) {
                    console.error("加载自定义董事会数据失败:", e);
                }
            }
        }

        function calculateResults() {
            const getSkill = (slotId, skillKey) => {
                return (boardroomState[slotId] && boardroomState[slotId].skills)
                    ? boardroomState[slotId].skills[skillKey]
                    : 0;
            };

            const selectedRadio = document.querySelector('input[name="sc-aca-r"]:checked');
            const academyLevel = selectedRadio ? parseInt(selectedRadio.value) : 15;

            const hasCooApp = academyLevel >= 5;
            const hasCfoApp = academyLevel >= 10;
            const hasCmoApp = academyLevel >= 15;
            const hasCtoApp = academyLevel >= 20;

            // 1. Raw Sums
            const rawCoo = Math.floor(
                getSkill('o', 'coo') +
                (hasCooApp ? getSkill('v', 'coo') / 2 : 0) +
                (getSkill('f', 'coo') + getSkill('m', 'coo') + getSkill('t', 'coo')) / 4
            );

            const rawCfo = Math.floor(
                getSkill('f', 'cfo') +
                (hasCfoApp ? getSkill('x', 'cfo') / 2 : 0) +
                (getSkill('o', 'cfo') + getSkill('m', 'cfo') + getSkill('t', 'cfo')) / 4
            );

            const rawCmo = Math.floor(
                getSkill('m', 'cmo') +
                (hasCmoApp ? getSkill('y', 'cmo') / 2 : 0) +
                (getSkill('o', 'cmo') + getSkill('f', 'cmo') + getSkill('t', 'cmo')) / 4
            );

            const rawCto = Math.floor(
                getSkill('t', 'cto') +
                (hasCtoApp ? getSkill('z', 'cto') / 2 : 0) +
                (getSkill('o', 'cto') + getSkill('f', 'cto') + getSkill('m', 'cto')) / 4
            );

            // 2. Decay Calculations
            const applyDecay = (raw) => {
                let val = raw;
                if (val > 80) val = 80 + (val - 80) / 2;
                if (val > 60) val = 60 + (val - 60) / 2;
                return Math.floor(val);
            };

            const effCoo = applyDecay(rawCoo);
            const effCfo = applyDecay(rawCfo);
            const effCmo = applyDecay(rawCmo);
            const effCto = applyDecay(rawCto);

            // 3. Retrieve local storage cache
            const rId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            let SRC = {};
            try {
                SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${rId}`)) || {};
            } catch (e) {
                console.error("加载零售计算缓存失败:", e);
            }

            // 4. Derived stats text values
            const baseAdminVal = (SRC.administration || 1) - 1;
            const baseAdminText = (baseAdminVal * 100).toFixed(2) + '%';
            const changeAdminText = effCoo === 0 ? '0.00%' : '-' + (baseAdminVal * effCoo).toFixed(2) + '%';
            const finalAdminText = (baseAdminVal * (1 - effCoo / 100) * 100).toFixed(2) + '%';

            const bankLevel = SRC.bankLevel || 0;
            const baseCfoText = '$3.0M';
            const changeCfoVal = effCfo * 0.5 * (1 + bankLevel / 10);
            const changeCfoText = '+$' + changeCfoVal.toFixed(2) + 'M';
            const finalCfoVal = 3.0 + changeCfoVal;
            const finalCfoText = '$' + finalCfoVal.toFixed(2) + 'M';

            const baseSalesVal = (SRC.salesModifier || 0) + (SRC.recreationBonus || 0);
            const baseSalesText = baseSalesVal.toFixed(1) + '%';
            const changeSalesText = '+' + Math.floor(effCmo / 3) + '%';
            const finalSalesText = (baseSalesVal + Math.floor(effCmo / 3)).toFixed(1) + '%';

            const baseRestaurantText = '+' + (baseSalesVal * 0.02).toFixed(2);
            const changeRestaurantText = '+' + (effCmo * 0.01).toFixed(3);
            const finalRestaurantText = '+' + ((baseSalesVal * 0.02) + (effCmo * 0.01)).toFixed(3);

            const basePatentText = '6.25%';
            const changePatentText = '+' + (effCto * 0.0625).toFixed(2) + '%';
            const finalPatentText = (6.25 + effCto * 0.0625).toFixed(2) + '%';

            const baseResearchText = '0.0%';
            const changeResearchText = '+' + (effCto * 2.0).toFixed(1) + '%';
            const finalResearchText = (effCto * 2.0).toFixed(1) + '%';

            // 5. Build dynamic detail explanations
            const details = {
                admin: `
                    <strong>管理费用计算详情：</strong><br>
                    1. <strong>基础管理费用</strong>：总建筑等级=工人/100，管理费用=(总建筑等级-1)/170。<br>
                    2. <strong>高管加成</strong>：COO 有效点数 <code>${effCoo}</code>（原始汇总点数 ${rawCoo}，衰减折算后为 ${effCoo}）。<br>
                    3. <strong>计算公式</strong>：每 1 点有效 COO 减少基础管理费用的 1%。<br>
                       <code>${baseAdminText} &times; ${effCoo}% = ${Math.abs(baseAdminVal * effCoo).toFixed(2)}%</code> 扣减。<br>
                    4. <strong>最终结果</strong>：<code>${baseAdminText} - ${Math.abs(baseAdminVal * effCoo).toFixed(2)}% = ${finalAdminText}</code>。
                `,
                cfo: `
                    <strong>会计费用起始点计算详情：</strong><br>
                    1. <strong>基础限额</strong>：固定值 <code>$3.0M</code>（所有公司初始免税上限均为 $3,000,000）。<br>
                    2. <strong>高管加成</strong>：CFO 有效点数 <code>${effCfo}</code>（原始汇总点数 ${rawCfo}，衰减折算后为 ${effCfo}）。<br>
                    3. <strong>银行加成</strong>：当前银行等级为 <code>${bankLevel}</code>，提供额外 <code>${(bankLevel * 10).toFixed(0)}%</code> 的 CFO 效果增幅。<br>
                    4. <strong>计算公式</strong>：<code>$3.0M + CFO 有效点数 &times; $0.5M &times; (1 + 银行等级 / 10)</code>。<br>
                       <code>$3.0M + ${effCfo} &times; $0.5M &times; (1 + ${bankLevel} / 10) = ${finalCfoText}</code>。<br>
                    5. <strong>最终结果</strong>：<code>${finalCfoText}</code>。
                `,
                salesSpeed: `
                    <strong>销售速度计算详情：</strong><br>
                    1. <strong>基础销售速度</strong>：等级加成与休闲加成之和 <code>${baseSalesText}</code>。<br>
                    2. <strong>高管加成</strong>：CMO 有效点数 <code>${effCmo}</code>（原始汇总点数 ${rawCmo}，衰减折算后为 ${effCmo}）。<br>
                    3. <strong>计算公式</strong>：每 3 点有效 CMO 增加 1% 销售速度。<br>
                       <code>Math.floor(${effCmo} / 3) = +${Math.floor(effCmo / 3)}%</code> 速度提升。<br>
                    4. <strong>最终结果</strong>：<code>${baseSalesText} + ${Math.floor(effCmo / 3)}% = ${finalSalesText}</code>。
                `,
                restaurant: `
                    <strong>餐馆评级计算详情：</strong><br>
                    1. <strong>基础评级</strong>：基础销售速度 * 0.02<br>
                    2. <strong>高管加成</strong>：CMO 有效点数 <code>${effCmo}</code>（原始汇总点数 ${rawCmo}，衰减折算后为 ${effCmo}）。<br>
                    3. <strong>计算公式</strong>：每 1 点有效 CMO 增加 0.01 餐馆评级。<br>
                       <code>${effCmo} &times; 0.01 = +${(effCmo * 0.01).toFixed(2)}</code> 评级提升。<br>
                    4. <strong>最终结果</strong>：<code>${baseRestaurantText} + ${(effCmo * 0.01).toFixed(2)} = ${finalRestaurantText}</code>。
                `,
                patent: `
                    <strong>专利转化概率计算详情：</strong><br>
                    1. <strong>基础概率</strong>：游戏固定基础转化率 <code>6.25%</code>。<br>
                    2. <strong>高管加成</strong>：CTO 有效点数 <code>${effCto}</code>（原始汇总点数 ${rawCto}，衰减折算后为 ${effCto}）。<br>
                    3. <strong>计算公式</strong>：每 1 点有效 CTO 增加 1% 的基础专利转化概率（即 6.25% 的 1% = 0.0625%）。<br>
                       <code>${effCto} &times; 0.0625% = +${(effCto * 0.0625).toFixed(2)}%</code> 概率提升。<br>
                    4. <strong>最终结果</strong>：<code>6.25% + ${(effCto * 0.0625).toFixed(2)}% = ${finalPatentText}</code>。
                `,
                research: `
                    <strong>研究生产速度提升计算详情：</strong><br>
                    1. <strong>基础速度</strong>：固定基础值 <code>0.0%</code>。<br>
                    2. <strong>高管加成</strong>：CTO 有效点数 <code>${effCto}</code>（原始汇总点数 ${rawCto}，衰减折算后为 ${effCto}）。<br>
                    3. <strong>计算公式</strong>：每 1 点有效 CTO 增加 2% 的研究类生产速度。<br>
                       <code>${effCto} &times; 2% = +${(effCto * 2.0).toFixed(1)}%</code> 速度提升。<br>
                    4. <strong>最终结果</strong>：<code>${finalResearchText}</code>。
                `
            };

            window.scCalcDetails = details;

            // Render table inside sc-calc-table-container
            const tableContainer = document.getElementById('sc-calc-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: var(--sc-fg); margin-bottom: 15px;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--sc-border); color: var(--sc-fg3); font-size: 11px;">
                                <th align="left" style="padding: 6px 2px;">项目</th>
                                <th align="right" style="padding: 6px 2px;">基础</th>
                                <th align="right" style="padding: 6px 2px;">高管加成</th>
                                <th align="right" style="padding: 6px 2px;">最终</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="sc-calc-row" data-type="admin" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">管理费用</td>
                                <td align="right" style="padding: 6px 2px;">${baseAdminText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-dangerFg);">${changeAdminText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalAdminText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="cfo" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">会计费用起始于</td>
                                <td align="right" style="padding: 6px 2px;">${baseCfoText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeCfoText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalCfoText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="salesSpeed" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">销售速度</td>
                                <td align="right" style="padding: 6px 2px;">${baseSalesText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeSalesText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalSalesText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="restaurant" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">餐馆评级</td>
                                <td align="right" style="padding: 6px 2px;">${baseRestaurantText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeRestaurantText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalRestaurantText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="patent" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">专利转化概率</td>
                                <td align="right" style="padding: 6px 2px;">${basePatentText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changePatentText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalPatentText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="research" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">研究类生产提升</td>
                                <td align="right" style="padding: 6px 2px;">${baseResearchText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeResearchText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalResearchText}</td>
                            </tr>
                        </tbody>
                    </table>
                `;

                // Re-bind row events
                const rows = tableContainer.querySelectorAll('.sc-calc-row');
                const detailBox = document.getElementById('sc-detail-box');
                const isDark = DM();
                rows.forEach(row => {
                    const type = row.dataset.type;
                    const updateDetail = () => {
                        if (window.scCalcDetails && window.scCalcDetails[type]) {
                            detailBox.innerHTML = window.scCalcDetails[type];
                            rows.forEach(r => r.style.background = 'transparent');
                            row.style.background = isDark ? 'rgba(33, 150, 243, 0.15)' : 'rgba(33, 150, 243, 0.1)';
                        }
                    };
                    row.onmouseenter = updateDetail;
                    row.onclick = updateDetail;
                });
            }

            return { adminBonus: effCoo, saleBonus: Math.floor(effCmo / 3) };
        }

        function renderBoardroom() {
            const leftContainer = document.getElementById('sc-slots-container');
            if (!leftContainer) return;

            leftContainer.innerHTML = '';

            const slotGroups = [
                {
                    title: '高管',
                    slots: [
                        { id: 'o', label: 'COO' },
                        { id: 'f', label: 'CFO' },
                        { id: 'm', label: 'CMO' },
                        { id: 't', label: 'CTO' }
                    ]
                },
                {
                    title: '学徒',
                    slots: [
                        { id: 'v', label: 'COO 学徒' },
                        { id: 'x', label: 'CFO 学徒' },
                        { id: 'y', label: 'CMO 学徒' },
                        { id: 'z', label: 'CTO 学徒' }
                    ]
                },
                {
                    title: '职员',
                    slots: [
                        { id: '1', label: '职员 1' },
                        { id: '2', label: '职员 2' },
                        { id: '3', label: '职员 3' },
                        { id: '4', label: '职员 4' },
                        { id: '5', label: '职员 5' }
                    ]
                }
            ];

            slotGroups.forEach(group => {
                const groupEl = document.createElement('div');
                groupEl.className = 'sc-slots-group';

                const titleEl = document.createElement('div');
                titleEl.className = 'sc-slots-title';
                titleEl.textContent = group.title;
                groupEl.appendChild(titleEl);

                const gridEl = document.createElement('div');
                gridEl.className = 'sc-slots-grid';

                group.slots.forEach(slot => {
                    const slotEl = document.createElement('div');
                    slotEl.dataset.slotId = slot.id;

                    slotEl.ondragover = (e) => {
                        e.preventDefault();
                    };
                    slotEl.ondragenter = (e) => {
                        e.preventDefault();
                        slotEl.classList.add('dragover');
                    };
                    slotEl.ondragleave = () => {
                        slotEl.classList.remove('dragover');
                    };
                    slotEl.ondrop = (e) => {
                        e.preventDefault();
                        slotEl.classList.remove('dragover');
                        const targetSlotId = slot.id;
                        if (draggedSlotId && draggedSlotId !== targetSlotId) {
                            const temp = boardroomState[draggedSlotId];
                            boardroomState[draggedSlotId] = boardroomState[targetSlotId];
                            boardroomState[targetSlotId] = temp;
                            renderBoardroom();
                            calculateResults();
                        }
                    };

                    slotEl.onclick = (e) => {
                        if (selectedSlotId !== null && !boardroomState[slot.id]) {
                            e.stopPropagation();
                            const temp = boardroomState[selectedSlotId];
                            boardroomState[selectedSlotId] = boardroomState[slot.id];
                            boardroomState[slot.id] = temp;
                            selectedSlotId = null;
                            renderBoardroom();
                            calculateResults();
                        }
                    };

                    const emp = boardroomState[slot.id];
                    if (emp) {
                        const cardEl = document.createElement('div');
                        cardEl.className = 'sc-exec-card';
                        if (selectedSlotId === slot.id) {
                            cardEl.classList.add('selected');
                        }
                        cardEl.setAttribute('draggable', 'true');

                        cardEl.ondragstart = () => {
                            draggedSlotId = slot.id;
                            cardEl.classList.add('dragged');
                        };
                        cardEl.ondragend = () => {
                            draggedSlotId = null;
                            cardEl.classList.remove('dragged');
                        };

                        cardEl.onclick = (e) => {
                            if (e.target.tagName === 'INPUT') return;
                            e.stopPropagation();
                            if (selectedSlotId === null) {
                                selectedSlotId = slot.id;
                                cardEl.classList.add('selected');
                            } else if (selectedSlotId === slot.id) {
                                selectedSlotId = null;
                                cardEl.classList.remove('selected');
                            } else {
                                const temp = boardroomState[selectedSlotId];
                                boardroomState[selectedSlotId] = boardroomState[slot.id];
                                boardroomState[slot.id] = temp;
                                selectedSlotId = null;
                                renderBoardroom();
                                calculateResults();
                            }
                        };

                        const roleEl = document.createElement('div');
                        roleEl.style.cssText = `font-size: 9px; color: var(--sc-fg3); text-align: center; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;`;
                        roleEl.textContent = `${slot.label}`;
                        cardEl.appendChild(roleEl);

                        const nameEl = document.createElement('div');
                        nameEl.className = 'sc-card-name';
                        nameEl.textContent = emp.name;
                        cardEl.appendChild(nameEl);

                        const skillsGrid = document.createElement('div');
                        skillsGrid.className = 'sc-card-skills';

                        const skillNames = [
                            { key: 'coo', label: 'COO', color: '#2196F3' },
                            { key: 'cfo', label: 'CFO', color: '#ff9800' },
                            { key: 'cmo', label: 'CMO', color: '#e91e63' },
                            { key: 'cto', label: 'CTO', color: '#9c27b0' }
                        ];

                        skillNames.forEach(sk => {
                            const row = document.createElement('div');
                            row.className = 'sc-card-skill-row';

                            const label = document.createElement('span');
                            label.className = 'sc-card-skill-label';
                            label.style.color = sk.color;
                            label.textContent = sk.label;

                            const input = document.createElement('input');
                            input.type = 'number';
                            input.className = 'sc-card-skill-input';
                            input.min = '0';
                            input.step = '1';
                            input.value = emp.skills[sk.key];

                            input.onfocus = () => cardEl.setAttribute('draggable', 'false');
                            input.onblur = () => cardEl.setAttribute('draggable', 'true');

                            input.onchange = () => {
                                let val = parseInt(input.value) || 0;
                                if (val < 0) val = 0;
                                input.value = val;
                                emp.skills[sk.key] = val;
                                calculateResults();
                            };

                            row.appendChild(label);
                            row.appendChild(input);
                            skillsGrid.appendChild(row);
                        });

                        cardEl.appendChild(skillsGrid);
                        slotEl.appendChild(cardEl);
                    } else {
                        const emptyEl = document.createElement('div');
                        emptyEl.className = 'sc-exec-card-empty';
                        emptyEl.textContent = `空 ${slot.label} 席`;
                        slotEl.appendChild(emptyEl);
                    }

                    gridEl.appendChild(slotEl);
                });

                groupEl.appendChild(gridEl);
                leftContainer.appendChild(groupEl);
            });
        }

        function injectStyles() {
            if (document.getElementById('sc-boardroom-styles')) return;
            const style = document.createElement('style');
            style.id = 'sc-boardroom-styles';
            style.textContent = `
                .sc-boardroom-layout {
                    display: flex;
                    flex-direction: row;
                    width: 100%;
                    height: 100%;
                }
                .sc-boardroom-left {
                    flex: 7;
                    display: flex;
                    flex-direction: column;
                    padding: 20px;
                    overflow-y: auto;
                    border-right: 1px solid var(--sc-border);
                }
                .sc-boardroom-right {
                    flex: 3;
                    padding: 20px;
                    background: var(--sc-panel-right-bg);
                    display: flex;
                    flex-direction: column;
                    overflow-y: auto;
                }
                @media (max-width: 768px) {
                    .sc-boardroom-layout {
                        flex-direction: column;
                        overflow-y: auto;
                    }
                    .sc-boardroom-left {
                        flex: none;
                        border-right: none;
                        border-bottom: 1px solid var(--sc-border);
                    }
                    .sc-boardroom-right {
                        flex: none;
                    }
                }
                
                /* Card grid layouts */
                .sc-slots-group {
                    margin-bottom: 20px;
                }
                .sc-slots-title {
                    font-size: 14px;
                    font-weight: bold;
                    color: var(--sc-fg2);
                    margin-bottom: 10px;
                    border-left: 3px solid #2196F3;
                    padding-left: 8px;
                }
                .sc-slots-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 12px;
                }
                
                /* Card Styles */
                .sc-exec-card {
                    background: var(--sc-card-bg);
                    border: 1px solid var(--sc-border);
                    border-radius: 8px;
                    padding: 10px;
                    cursor: move;
                    user-select: none;
                    position: relative;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .sc-exec-card:hover {
                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                }
                .sc-exec-card.dragged {
                    opacity: 0.4;
                }
                .sc-exec-card-empty {
                    border: 2px dashed var(--sc-card-empty-border);
                    background: var(--sc-card-empty-bg);
                    border-radius: 8px;
                    height: 110px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--sc-fg3);
                    font-size: 12px;
                    text-align: center;
                    padding: 10px;
                    box-sizing: border-box;
                }
                .sc-exec-card-empty.dragover {
                    border-color: #2196F3;
                    background: rgba(33, 150, 243, 0.1);
                    color: #2196F3;
                }
                
                /* Card input styling */
                .sc-card-name {
                    font-weight: bold;
                    font-size: 13px;
                    margin-bottom: 8px;
                    text-align: center;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: var(--sc-fg);
                }
                .sc-card-skills {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }
                .sc-card-skill-row {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    font-size: 11px;
                }
                .sc-card-skill-label {
                    font-weight: bold;
                    width: 25px;
                    font-size: 11px;
                }
                .sc-card-skill-input {
                    width: 100%;
                    padding: 2px 4px;
                    border: 1px solid var(--sc-border);
                    border-radius: 3px;
                    background: var(--sc-input-bg);
                    color: var(--sc-input-fg);
                    font-size: 11px;
                    box-sizing: border-box;
                    text-align: center;
                }
                .sc-card-skill-input::-webkit-outer-spin-button,
                .sc-card-skill-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .sc-card-skill-input {
                    -moz-appearance: textfield;
                }
                
                .sc-exec-card.selected {
                    border-color: #2196F3;
                    box-shadow: 0 0 10px rgba(33, 150, 243, 0.5);
                    background: var(--sc-card-bg-selected);
                }
                
                @media (max-width: 576px) {
                    .sc-boardroom-left {
                        padding: 10px;
                    }
                    .sc-slots-group {
                        margin-bottom: 12px;
                    }
                    .sc-slots-title {
                        font-size: 12px;
                        margin-bottom: 6px;
                    }
                    .sc-slots-grid {
                        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                        gap: 8px;
                    }
                    .sc-exec-card {
                        padding: 8px;
                    }
                    .sc-exec-card-empty {
                        height: 96px;
                        font-size: 11px;
                        padding: 6px;
                    }
                    .sc-card-name {
                        font-size: 12px;
                        margin-bottom: 4px;
                    }
                    .sc-card-skills {
                        gap: 4px;
                    }
                    .sc-card-skill-label {
                        width: 20px;
                        font-size: 10px;
                    }
                    .sc-card-skill-input {
                        padding: 1px 2px;
                        font-size: 10px;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        function show() {
            if (document.getElementById('sc-calc-modal')) return;

            injectStyles();
            loadSavedBoardroom();

            const modal = document.createElement('div');
            modal.id = 'sc-calc-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.5); z-index: 21000;
                display: flex; justify-content: center; align-items: center;
            `;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                background: var(--sc-bg); border: 1px solid var(--sc-border);
                border-radius: 12px; z-index: 21001; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                width: min(1000px, 95vw); height: min(800px, 90vh);
                color: var(--sc-fg); font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;
            `;

            wrapper.innerHTML = `
                <div id="sc-calc-header" style="padding: 10px 20px; background: #2196F3; color: white; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: bold; font-size: 14px;">
                    <span>自定义高管数据</span>
                    <span id="sc-calc-close-x" style="cursor: pointer; padding: 0 5px; font-weight: normal; font-size: 20px;">&times;</span>
                </div>

                <div class="sc-boardroom-layout">
                    <!-- Left slots panel -->
                    <div class="sc-boardroom-left">
                        <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                            <button id="sc-boardroom-save-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">保存</button>
                            <button id="sc-boardroom-fetch-btn" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">获取当前最新高管数据</button>
                        </div>
                        <div style="font-size: 11px; color: var(--sc-fg3); margin-bottom: 15px;">* 拖拽高管卡片，或点击两个高管卡片进行切换。</div>
                        <div id="sc-slots-container"></div>
                    </div>

                    <!-- Right result panel -->
                    <div id="sc-right-panel-container" class="sc-boardroom-right"></div>
                </div>
            `;

            modal.appendChild(wrapper);
            document.body.appendChild(modal);

            const updateThemeVars = () => {
                const isDark = DM();
                modal.style.setProperty('--sc-bg', theme.bg);
                modal.style.setProperty('--sc-fg', theme.fg);
                modal.style.setProperty('--sc-fg2', theme.fg2);
                modal.style.setProperty('--sc-fg3', theme.fg3);
                modal.style.setProperty('--sc-border', theme.border);
                modal.style.setProperty('--sc-border2', theme.border2);
                modal.style.setProperty('--sc-card-bg', isDark ? '#2c2c2c' : '#ffffff');
                modal.style.setProperty('--sc-card-empty-border', isDark ? '#444' : '#ccc');
                modal.style.setProperty('--sc-card-empty-bg', isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)');
                modal.style.setProperty('--sc-input-bg', theme.inputBg);
                modal.style.setProperty('--sc-input-fg', theme.inputFg);
                modal.style.setProperty('--sc-panel-right-bg', isDark ? '#151515' : '#f5f5f5');
                modal.style.setProperty('--sc-aca-bg', isDark ? '#2c2c2c' : '#f0f7ff');
                modal.style.setProperty('--sc-detail-bg', isDark ? '#222' : '#fff');
                modal.style.setProperty('--sc-card-bg-selected', isDark ? '#1a2a3a' : '#e3f2fd');
                modal.style.setProperty('--sc-dangerFg', theme.dangerFg);
                modal.style.setProperty('--sc-successFg', theme.successFg);
            };

            // Init theme vars
            updateThemeVars();

            // Observe body class/style changes to adapt dynamically
            const observer = new MutationObserver(() => {
                updateThemeVars();
                calculateResults();
                renderBoardroom();
            });
            observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

            const closeX = document.getElementById('sc-calc-close-x');
            closeX.onclick = () => {
                observer.disconnect();
                modal.remove();
            };

            const btnSave = document.getElementById('sc-boardroom-save-btn');
            const btnFetch = document.getElementById('sc-boardroom-fetch-btn');

            btnSave.onclick = (e) => {
                e.preventDefault();
                const res = calculateResults();
                const rId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;

                localStorage.setItem(`R${rId}-SC-Saved-Bonuses`, JSON.stringify({
                    adminBonus: res.adminBonus,
                    saleBonus: res.saleBonus,
                    timestamp: Date.now(),
                    source: 'manual'
                }));

                localStorage.setItem(`R${rId}-SC-Saved-Boardroom`, JSON.stringify(boardroomState));

                showToast("数据保存成功", "success");
            };

            btnFetch.onclick = async (e) => {
                e.preventDefault();
                const originalText = btnFetch.textContent;
                try {
                    btnFetch.textContent = '获取中...';
                    btnFetch.disabled = true;

                    const response = await Network.requestJson('https://www.simcompanies.com/api/v3/companies/me/executives/');
                    const data = response.executives;
                    if (data && data.length > 0) {
                        mapExecutivesToState(data);
                        renderBoardroom();
                        calculateResults();
                        showToast("已成功同步当前最新高管数据", "success");
                    } else {
                        showToast("未获取到高管数据", "error");
                    }
                } catch (err) {
                    console.error(err);
                    showToast("网络请求失败，请稍后重试", "error");
                } finally {
                    btnFetch.textContent = originalText;
                    btnFetch.disabled = false;
                }
            };

            const rightContainer = document.getElementById('sc-right-panel-container');
            rightContainer.innerHTML = `
                <div style="font-size: 15px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid var(--sc-border); padding-bottom: 10px; color: var(--sc-fg);">
                    高管加成模拟计算
                </div>
                
                <div style="margin-bottom: 15px; font-size: 13px; background: var(--sc-aca-bg); padding: 10px; border-radius: 8px; border: 1px solid var(--sc-border);">
                    <strong style="display: block; margin-bottom: 6px; color: var(--sc-fg); font-size: 12px;">学院总等级:</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--sc-fg); font-size: 12px;">
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="0" style="vertical-align:middle;"> 0-4</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="5" style="vertical-align:middle;"> 5-9</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="10" style="vertical-align:middle;"> 10-14</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="15" checked style="vertical-align:middle;"> 15-19</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="20" style="vertical-align:middle;"> 20+</label>
                    </div>
                </div>
                
                <!-- Calculation Table -->
                <div id="sc-calc-table-container"></div>
                
                <!-- Calculation Details Box -->
                <div id="sc-detail-box" style="padding: 10px; border: 1px solid var(--sc-border); border-radius: 8px; background: var(--sc-detail-bg); font-size: 11px; line-height: 1.5; color: var(--sc-fg3); min-height: 120px; box-sizing: border-box;">
                    💡 提示：点击或悬浮在上方任意行，可在此处查看详细计算公式。
                </div>
            `;

            rightContainer.querySelectorAll('input[name="sc-aca-r"]').forEach(radio => {
                radio.onchange = () => calculateResults();
            });

            renderBoardroom();
            calculateResults();
        }

        return { show };
    })();

    // ======================
    // 全局按钮：高管自定义开关
    // ======================
    const createGlobalCustomToggle = (key, label, nativeStyles = {}, onToggleCallback) => {
        const CONFIG_KEY = 'SC_PageActions_Settings';
        const DEFAULT_VALUE = (key === 'executiveCustomToggle' || key === 'marketMaxProfitToggle') ? false : true;
        const wrapper = document.createElement('div');

        // console.log(`[调试] 按钮 ${label} 初始化，传入样式:`, nativeStyles);

        // 初始赋值（如果此时还没抓到，这里会是空）
        if (nativeStyles.wrapperClass) {
            wrapper.className = nativeStyles.wrapperClass;
        }
        wrapper.style.marginLeft = "10px";
        wrapper.style.display = "inline-block";

        const btn = document.createElement('button');
        btn.type = 'button';
        if (nativeStyles.buttonClass) {
            btn.className = nativeStyles.buttonClass;
        }

        btn.style.cssText = `
            color: white; border: none; padding: 4px 12px; border-radius: 4px;
            cursor: pointer; font-size: 12px; font-weight: bold; outline: none;
            transition: all 0.2s;
        `;

        const refreshUI = () => {
            const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            const isEnabled = config[key] !== undefined ? config[key] : DEFAULT_VALUE;
            btn.textContent = `${label}：${isEnabled ? '开' : '关'}`;
            btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#607D8B';
        };

        btn.onclick = (e) => {
            e.preventDefault();
            const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            const currentValue = config[key] !== undefined ? config[key] : DEFAULT_VALUE;
            config[key] = !currentValue;
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            refreshUI();
            if (onToggleCallback) onToggleCallback(config[key] !== false);
        };

        refreshUI();
        wrapper.appendChild(btn);
        return { wrapper, btn };
    };

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
            const academyResult = buildings
                .filter(t => t.kind === "y" && !t.purchasedRecently)
                .reduce((acc, r) => {
                    const busy = r.busy;
                    acc.active += (!busy && !(r.position?.startsWith(uc)) ? r.size : 0);
                    acc.slots += (busy?.expanding ? r.size - 1 : r.size);
                    return acc;
                }, { active: 0, slots: 0 });

            const bankResult = buildings
                .filter(t => t.kind === "n" && !t.purchasedRecently)
                .reduce((acc, r) => {
                    const busy = r.busy;
                    acc.active += (!busy && !(r.position?.startsWith(uc)) ? r.size : 0);
                    acc.slots += (busy?.expanding ? r.size - 1 : r.size);
                    return acc;
                }, { active: 0, slots: 0 });

            return {
                active: academyResult.active,
                slots: academyResult.slots,
                bankLevel: bankResult.active
            };
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

                // --- 新增：保存指定position的建筑信息（id, kind, size, position, robotsSpecialization）供模块17等使用 ---
                const TARGET_POSITIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'B0', 'B1', 'B2', 'B3'];
                const buildings = data
                    .filter(b => TARGET_POSITIONS.includes(b.position))
                    .map(b => ({
                        id: b.id,
                        kind: b.kind,
                        size: b.size,
                        position: b.position,
                        robotsSpecialization: b.robotsSpecialization
                    }));
                stored.buildings = buildings;

                const oldAcademyActive = stored.academyActive ?? 0; // 使用 nullish 合并更安全
                const newAcademyActive = result.active;             // 新计算值

                // 更新 localStorage 中的 academyActive
                stored.academyActive = newAcademyActive;
                stored.bankLevel = result.bankLevel;
                localStorage.setItem(key, JSON.stringify(stored));

                // 仅当值发生变化时才触发全流程计算
                if (oldAcademyActive !== newAcademyActive) {
                    // console.log("🔔 academyActive 变化，触发高管加成重新计算");
                    if (typeof RegionData !== "undefined" && RegionData.fetchFullRegionData) {
                        RegionData.fetchFullRegionData()
                            .then(newData => {
                                // 合并回 localStorage（保留 buildings 不被覆盖）
                                const existingRaw = localStorage.getItem(key);
                                let existingData = {};
                                try { existingData = JSON.parse(existingRaw); } catch (e) { }
                                const merged = { ...existingData, ...newData };
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
    // 模块2-2：领域仓库数据
    // ======================
    (function () {
        const resources_URL = "/api/v3/resources/";

        function handleData(data) {
            if (!Array.isArray(data) || data.length === 0) return;
            const realmId = getRealmIdFromLink();
            if (realmId !== 0 && realmId !== 1) return;
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            try {
                const existing = JSON.parse(localStorage.getItem(key) || "{}");
                existing.warehouseResources = data;
                localStorage.setItem(key, JSON.stringify(existing));
            } catch (e) {
                console.warn("⚠️ 仓库数据写入失败", e);
                localStorage.setItem(key, JSON.stringify({ warehouseResources: data }));
            }
        }

        // Hook fetch
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            try {
                if (typeof args[0] === "string" && args[0].includes(resources_URL)) {
                    response.clone().json().then(handleData).catch(err => console.error("❌ 仓库 JSON 解析失败:", err));
                }
            } catch (e) { console.error(e); }
            return response;
        };

        // Hook XHR（备用）
        const originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, async) {
            this.addEventListener("load", function () {
                if (url && url.includes(resources_URL) && this.responseText) {
                    try { handleData(JSON.parse(this.responseText)); }
                    catch (e) { console.error("❌ 仓库 XHR JSON 解析失败:", e); }
                }
            });
            return originalXHR.apply(this, arguments);
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
        let needsPositionRecalc = true; // 页面刷新后/拖拽后首次打开面板时重新计算位置
        let intendedLeft = null;   // 用户拖拽/存储的预期 left（窗口缩放时据此贴边，不保存）
        let intendedBottom = null; // 用户拖拽/存储的预期 bottom

        const typeDisplayNames = {
            r1: 'R1',
            r2: 'R2',
            constants: '基本'
        };

        // 插入样式（使用CSS变量，在面板首次打开时由refreshPanelTheme动态更新）
        const injectStyles = () => {
            const style = document.createElement('style');
            style.id = 'sc-panel-dynamic-styles';
            style.textContent = `
            .SimcompaniesRetailCalculation-mini-panel {
                position: fixed;
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
                user-select: none;
                -webkit-user-select: none;
                line-height: 1;
            }
            .SimcompaniesRetailCalculation-panel-content {
                display: none;
                position: absolute;
                bottom: 40px;
                left: 0;
                background: var(--sc-panel-bg, rgba(40,40,40,0.95));
                border-radius: 4px;
                padding: 8px;
                min-width: min(260px, calc(100vw - 26px));
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 100px);
                overflow-y: auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                color: var(--sc-panel-fg, #efefef);
            }
            .SimcompaniesRetailCalculation-data-row {
                margin: 6px 0;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .SimcompaniesRetailCalculation-region-label {
                color: var(--sc-panel-label, #BDBDBD);
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

                // 判定逻辑：读取按钮上存储的默认值，只有明确为 false 时才关闭
                const defaultEnabled = btn.dataset.defaultEnabled !== 'false';
                const isEnabled = config[key] !== undefined ? config[key] !== false : defaultEnabled;

                btn.textContent = `${label}: ${isEnabled ? '🟢 已启用' : '🔴 已禁用'}`;
                btn.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            });
        };

        // --- 面板拖拽位置存储相关 ---
        const PANEL_POS_KEY = 'SC_PanelPosition';
        const getSavedPos = () => {
            try {
                const raw = localStorage.getItem(PANEL_POS_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) { /* ignore */ }
            return null;
        };
        const savePos = (left, bottom) => {
            try { localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left, bottom })); } catch (e) { /* ignore */ }
        };

        // 还原按钮到默认位置（油猴菜单保底操作）
        const resetPanelPosition = () => {
            localStorage.removeItem(PANEL_POS_KEY);
            intendedLeft = 10;
            intendedBottom = 55;
            if (panelElement) {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const btnW = panelElement.offsetWidth || 32;
                const btnH = panelElement.offsetHeight || 32;
                const intendedTop = vh - intendedBottom - btnH;
                const left = Math.max(0, Math.min(vw - btnW, intendedLeft));
                const top = Math.max(0, Math.min(vh - btnH, intendedTop));
                panelElement.style.left = left + 'px';
                panelElement.style.bottom = (vh - top - btnH) + 'px';
                panelElement.style.top = 'auto';
            }
        };

        // 面板展开位置自动适配视口（每次打开时调用，先重置再计算）
        const adjustPanelPosition = (contentEl) => {
            // 重置所有位置样式
            contentEl.style.top = ''; contentEl.style.bottom = '';
            contentEl.style.left = ''; contentEl.style.right = '';
            contentEl.style.maxHeight = ''; contentEl.style.maxWidth = '';
            contentEl.style.overflowY = '';
            void contentEl.offsetHeight;

            const triggerEl = panelElement.querySelector('.SimcompaniesRetailCalculation-trigger-btn');
            if (!triggerEl) return;
            const margin = 10;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const triggerRect = triggerEl.getBoundingClientRect();
            const triggerH = triggerRect.height;

            // ---- 1. 自适应面板尺寸 ----
            // 内容不能挡按钮：上方空间 = 按钮顶部到视口顶；下方空间 = 视口底到按钮底
            const availTop = triggerRect.top - margin;
            const availBottom = vh - triggerRect.bottom - margin;
            const availLeft = triggerRect.left - margin;
            const availRight = vw - triggerRect.right - margin;

            contentEl.style.maxHeight = Math.max(availTop, availBottom, 100) + 'px';
            contentEl.style.overflowY = 'auto';
            contentEl.style.maxWidth = Math.max(triggerRect.width + Math.max(availLeft, availRight), vw - margin * 2, 260) + 'px';

            // ---- 2. 垂直定位：选择空间更大的一侧，紧贴按钮 ----
            const gap = triggerH; // 内容紧贴按钮边缘
            contentEl.style.top = 'auto';
            contentEl.style.bottom = gap + 'px';
            void contentEl.offsetHeight;
            let rect = contentEl.getBoundingClientRect();
            const neededH = Math.min(rect.height, parseFloat(contentEl.style.maxHeight));

            if (rect.top < margin && availBottom >= neededH) {
                // 上方出界，下方有空间 → 向下展开
                contentEl.style.bottom = 'auto';
                contentEl.style.top = gap + 'px';
            } else if (availTop < neededH && availBottom >= neededH) {
                // 上方空间不够但下方够 → 向下展开
                contentEl.style.bottom = 'auto';
                contentEl.style.top = gap + 'px';
            } else {
                // 默认向上展开
                contentEl.style.top = 'auto';
                contentEl.style.bottom = gap + 'px';
            }

            // ---- 3. 水平定位：哪边空间大就朝哪边展开，紧贴按钮 ----
            const panelRect = panelElement.getBoundingClientRect();

            // 按钮在右半屏 → 面板向左展开（right 对齐）；按钮在左半屏 → 向右展开（left 对齐）
            const btnCenterX = triggerRect.left + triggerRect.width / 2;
            if (btnCenterX > vw / 2) {
                // 按钮偏右 → 面板向左展开，内容右边缘对齐按钮右边缘
                contentEl.style.left = 'auto';
                contentEl.style.right = (panelRect.right - triggerRect.right) + 'px';
            } else {
                // 按钮偏左 → 面板向右展开，内容左边缘对齐按钮左边缘
                contentEl.style.right = 'auto';
                contentEl.style.left = (triggerRect.left - panelRect.left) + 'px';
            }

            // ---- 4. 最终边界检查 ----
            void contentEl.offsetHeight;
            rect = contentEl.getBoundingClientRect();
            if (rect.left < margin) { contentEl.style.left = margin + 'px'; contentEl.style.right = 'auto'; }
            if (rect.right > vw - margin) { contentEl.style.right = (vw - rect.right) + 'px'; contentEl.style.left = 'auto'; }
            if (rect.top < margin) { contentEl.style.bottom = 'auto'; contentEl.style.top = margin + 'px'; }
        };

        // 创建界面元素
        const createPanel = () => {
            const panel = document.createElement('div');
            panel.className = 'SimcompaniesRetailCalculation-mini-panel';

            // 触发器按钮（可拖拽）
            const trigger = document.createElement('button');
            trigger.className = 'SimcompaniesRetailCalculation-trigger-btn';
            trigger.textContent = '≡';

            // --- 拖拽逻辑（长按1秒启动 + 鼠标 + 触摸） ---
            let dragState = null;
            let longPressTimer = null;
            const clearLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };

            const getClientPos = (e) => {
                if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
                return { x: e.clientX, y: e.clientY };
            };
            const getPanelBounds = () => {
                const w = panel.offsetWidth || 40;
                const h = panel.offsetHeight || 40;
                return { w, h };
            };
            const clampPosition = (left, top) => {
                const { w, h } = getPanelBounds();
                return {
                    left: Math.max(0, Math.min(window.innerWidth - w, left)),
                    top: Math.max(0, Math.min(window.innerHeight - h, top))
                };
            };
            const saveDragPosition = () => {
                const rect = panel.getBoundingClientRect();
                intendedLeft = Math.round(rect.left);
                intendedBottom = Math.round(window.innerHeight - rect.bottom);
                savePos(intendedLeft, intendedBottom);
            };

            // 根据预期位置 + 当前视口边界自动贴边（不保存，保留用户原始位置）
            const applyClampedPosition = () => {
                if (intendedLeft === null || !panel) return;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const btnW = panel.offsetWidth || 32;
                const btnH = panel.offsetHeight || 32;
                const intendedTop = vh - intendedBottom - btnH;
                const left = Math.max(0, Math.min(vw - btnW, intendedLeft));
                const top = Math.max(0, Math.min(vh - btnH, intendedTop));
                panel.style.left = left + 'px';
                panel.style.bottom = (vh - top - btnH) + 'px';
                panel.style.top = 'auto';
            };

            // 恢复上次拖拽位置（或默认位置），并贴边
            const savedPos = getSavedPos();
            if (savedPos) {
                intendedLeft = savedPos.left;
                intendedBottom = savedPos.bottom;
            } else {
                intendedLeft = 10;
                intendedBottom = 55;
            }
            applyClampedPosition();

            window.addEventListener('resize', applyClampedPosition);

            const onDragStart = (e) => {
                // 鼠标：只响应左键
                if (e.button !== undefined && e.button !== 0) return;
                const isTouch = !!e.touches;
                const pos = getClientPos(e);
                const rect = panel.getBoundingClientRect();
                const state = {
                    startX: pos.x, startY: pos.y,
                    origLeft: rect.left, origTop: rect.top,
                    isDragging: false,
                    readyToDrag: !isTouch // 鼠标立即生效，触摸需等长按
                };
                dragState = state;

                if (isTouch) {
                    // 触摸：长按 0.5 秒后进入拖拽模式
                    clearLongPress();
                    longPressTimer = setTimeout(() => {
                        state.readyToDrag = true;
                        longPressTimer = null;
                    }, 500);
                }
                // 不 preventDefault，让 click 事件能正常触发
            };
            const onDragMove = (e) => {
                if (!dragState) return;
                const pos = getClientPos(e);
                const dx = pos.x - dragState.startX;
                const dy = pos.y - dragState.startY;

                // 还没进入就绪状态：移动超过阈值则取消（触摸时为防止长按后误触）
                if (!dragState.readyToDrag) {
                    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                        clearLongPress();
                        dragState = null;
                    }
                    return;
                }

                // 已就绪：进入拖拽状态
                dragState.isDragging = true;
                let newLeft = dragState.origLeft + dx;
                let newTop = dragState.origTop + dy;
                const clamped = clampPosition(newLeft, newTop);
                panel.style.left = clamped.left + 'px';
                panel.style.top = clamped.top + 'px';
                panel.style.bottom = 'auto';
                if (e.cancelable) e.preventDefault();
            };
            const onDragEnd = () => {
                clearLongPress();
                if (!dragState) return;
                if (dragState.isDragging) {
                    const rect = panel.getBoundingClientRect();
                    const clamped = clampPosition(rect.left, rect.top);
                    panel.style.left = clamped.left + 'px';
                    panel.style.top = clamped.top + 'px';
                    saveDragPosition();
                    // 如果面板正展开着，拖拽后重新计算内容位置
                    if (content.style.display === 'block') {
                        setTimeout(() => adjustPanelPosition(content), 50);
                    } else {
                        // 面板关闭时拖拽了按钮，下次打开需要重新计算位置
                        needsPositionRecalc = true;
                    }
                    // 标记本次拖拽，防止 click 触发面板切换
                    trigger.dataset.dragged = 'true';
                    setTimeout(() => { trigger.dataset.dragged = 'false'; }, 100);
                }
                dragState = null;
            };

            // 鼠标事件（立即拖拽）
            trigger.addEventListener('mousedown', onDragStart);
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);

            // 触摸事件（长按1秒后拖拽）
            trigger.addEventListener('touchstart', onDragStart, { passive: true });
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);

            // 防止移动端长按弹出上下文菜单
            trigger.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            // 点击时区分拖拽和点击
            trigger.addEventListener('click', (e) => {
                if (trigger.dataset.dragged === 'true') {
                    e.stopPropagation();
                    return;
                }
                togglePanel(e);
            });

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

            // 面板位置自动适配视口（定义已移至 PanelUI 顶层作用域）
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
            const createPageActionToggle = (key, label, defaultEnabled = true) => {
                const btn = document.createElement('button');
                btn.className = 'SimcompaniesRetailCalculation-action-btn page-action-toggle';

                // 必须绑定这些数据，以便刷新函数能识别按钮用途
                btn.dataset.key = key;
                btn.dataset.label = label;
                btn.dataset.defaultEnabled = defaultEnabled ? 'true' : 'false';

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
                const isEnabled = initialConfig[key] !== undefined ? initialConfig[key] !== false : defaultEnabled;
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

            secBtnGroup.append(backBtn);
            // 分页渲染：所有开关项
            const toggleItems = [
                {
                    type: 'factory', fn: () => {
                        const b = document.createElement('button');
                        b.className = 'SimcompaniesRetailCalculation-action-btn';
                        b.id = 'auto-amount-toggle-btn';
                        const refreshState = () => {
                            try {
                                const enabled = typeof window.isAutoAmountEnabled === 'function' && window.isAutoAmountEnabled();
                                b.textContent = enabled ? '自定义运行时长: 🟢 已启用' : '自定义运行时长: 🔴 已禁用';
                                b.style.backgroundColor = enabled ? '#4CAF50' : '#f44336';
                            } catch (e) { b.textContent = '自定义运行时长: (加载中...)'; b.style.backgroundColor = '#607D8B'; }
                        };
                        refreshState();
                        b.onclick = (ev) => {
                            ev.stopPropagation();
                            if (typeof window.isAutoAmountEnabled !== 'function') return;
                            window.saveAutoAmountEnabled(!window.isAutoAmountEnabled());
                            window.initAutoAmountButtons(true);
                            refreshState();
                        };
                        return b;
                    }
                },
                { type: 'toggle', key: 'marketProfit', label: '交易所计算时利润' },
                { type: 'toggle', key: 'contractProfit', label: '合同计算时利润' },
                { type: 'toggle', key: 'executiveHistory', label: '显示高管培训记录' },
                { type: 'toggle', key: 'formerExecEnhance', label: '前任高管更多信息' },
                { type: 'toggle', key: 'outgoingMP', label: '出库合同MP-?%' },
                { type: 'toggle', key: 'autoSelectBestMarketRow', label: '交易所自动选中高亮行', defaultEnabled: false },
                { type: 'toggle', key: 'warehouseProfit', label: '仓库时利润计算' },
                { type: 'toggle', key: 'chatAccessibility', label: '聊天室色弱辅助', defaultEnabled: false },
                { type: 'toggle', key: 'landscapeHighlight', label: '地图空闲建筑高亮' },
                { type: 'toggle', key: 'paQuestAnswers', label: 'PA任务答案', defaultEnabled: true },
                { type: 'toggle', key: 'snipboardPreview', label: 'Snipboard图片预览', defaultEnabled: true },
                { type: 'toggle', key: 'chatInputExpander', label: '聊天输入框自动扩大', defaultEnabled: true },
            ];
            const ITEMS_PER_PAGE = 5;
            let currentPage = 0;
            const totalPages = Math.ceil(toggleItems.length / ITEMS_PER_PAGE);
            function renderPage(page) {
                secBtnGroup.querySelectorAll('.sc-toggle-item, .sc-page-controls').forEach(el => el.remove());
                const startIdx = page * ITEMS_PER_PAGE;
                const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, toggleItems.length);
                for (let i = startIdx; i < endIdx; i++) {
                    const item = toggleItems[i];
                    let el;
                    if (item.type === 'factory') { el = item.fn(); }
                    else { el = createPageActionToggle(item.key, item.label, item.defaultEnabled !== false); }
                    el.classList.add('sc-toggle-item');
                    secBtnGroup.appendChild(el);
                }
                const controls = document.createElement('div');
                controls.className = 'sc-page-controls';
                controls.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px;';
                const prevBtn = document.createElement('button');
                prevBtn.className = 'SimcompaniesRetailCalculation-action-btn';
                prevBtn.textContent = '◀ 上一页';
                prevBtn.style.cssText = `background:${page === 0 ? '#607D8B' : '#2196F3'};color:white;border:none;padding:4px 8px;border-radius:3px;cursor:${page === 0 ? 'not-allowed' : 'pointer'};font-size:11px;flex:1;`;
                prevBtn.disabled = page === 0;
                prevBtn.onclick = (e) => { e.stopPropagation(); if (page > 0) { currentPage = page - 1; renderPage(currentPage); } };
                const pageInfo = document.createElement('span');
                pageInfo.textContent = `${page + 1} / ${totalPages}`;
                pageInfo.style.cssText = 'font-size:12px;color:var(--sc-panel-fg,#efefef);white-space:nowrap;';
                const nextBtn = document.createElement('button');
                nextBtn.className = 'SimcompaniesRetailCalculation-action-btn';
                nextBtn.textContent = '下一页 ▶';
                nextBtn.style.cssText = `background:${page >= totalPages - 1 ? '#607D8B' : '#2196F3'};color:white;border:none;padding:4px 8px;border-radius:3px;cursor:${page >= totalPages - 1 ? 'not-allowed' : 'pointer'};font-size:11px;flex:1;`;
                nextBtn.disabled = page >= totalPages - 1;
                nextBtn.onclick = (e) => { e.stopPropagation(); if (page < totalPages - 1) { currentPage = page + 1; renderPage(currentPage); } };
                controls.appendChild(prevBtn);
                controls.appendChild(pageInfo);
                controls.appendChild(nextBtn);
                secBtnGroup.appendChild(controls);
            }
            secondaryMenu.appendChild(secBtnGroup);
            renderPage(0);

            // 插件信息区块（初始用默认暗色，首次打开面板时refreshPanelTheme更新为正确主题色）
            const info = document.createElement('div');
            info.style.cssText = `margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:#ccc;border-top:1px solid #555;`;

            const version = GM_info?.script?.version || '未知版本';

            info.innerHTML = `
                作者：<a href="https://www.simcompanies.com/zh-cn/company/0/Rabbit-House/" target="_blank" class="sc-info-link">Rabbit House</a> 反馈请说明问题<br>
                反馈群：798670333 <br>
                源码：<a href="https://github.com/gangbaRuby/SimCompanies-Scripts" target="_blank" class="sc-info-link">GitHub</a> ⭐🙇<br>
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
        let panelThemeInited = false;
        const refreshPanelTheme = () => {
            const d = DM();
            const root = document.documentElement;
            root.style.setProperty('--sc-panel-bg', d ? 'rgba(40,40,40,0.95)' : 'rgba(255,255,255,0.98)');
            root.style.setProperty('--sc-panel-fg', d ? '#efefef' : '#333');
            root.style.setProperty('--sc-panel-label', d ? '#BDBDBD' : '#666');
            // 更新信息区和链接色（首次打开面板时DM()才准确）
            const linkColor = d ? '#6cf' : '#2196F3';
            document.querySelectorAll('.sc-info-link').forEach(a => { a.style.color = linkColor; });
            const infoDiv = panelElement?.querySelector('.SimcompaniesRetailCalculation-panel-content > div:last-child');
            if (infoDiv) {
                infoDiv.style.cssText = `margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:${d ? '#ccc' : '#666'};border-top:1px solid ${d ? '#555' : '#ddd'};`;
            }
            panelThemeInited = true;
        };

        const togglePanel = (e) => {
            e.stopPropagation();
            const content = panelElement.querySelector('.SimcompaniesRetailCalculation-panel-content');
            const isCurrentlyVisible = content.style.display === 'block';

            if (isCurrentlyVisible) {
                content.style.display = 'none';
                return;
            }

            // 先显示但隐藏，计算好位置后再可见，避免闪现
            content.style.display = 'block';
            content.style.visibility = 'hidden';

            if (!panelThemeInited) refreshPanelTheme();
            content.classList.remove('show-settings');
            refreshStatus();
            initAutoAmountToggle();
            refreshPageActionToggles();

            // 自动调整展开方向（仅页面刷新后首次/拖拽后首次）
            if (needsPositionRecalc) {
                adjustPanelPosition(content);
                needsPositionRecalc = false;
            }

            // 位置计算完毕，显示面板
            content.style.visibility = 'visible';
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
                    titleEl.textContent = `MP-?% - 点合同时利润降序，点卖家跳转私信`;
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

                const dMp = DM();
                box = document.createElement('div');
                box.id = 'mp-floating-box';
                box.style.cssText = `
                position: fixed;
                left: min(25px, 5vw);
                top: 50px;
                width: min(450px, 90vw);
                max-height: 70vh;
                background: ${dMp ? '#222' : '#fff'};
                color: ${dMp ? '#eee' : '#333'};
                padding: 12px;
                border-radius: 6px;
                box-shadow: 0 0 15px rgba(0,0,0,0.3);
                z-index: 9998;
                overflow: hidden;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                white-space: normal;
                word-break: break-word;
                user-select: none;
                display: flex;
                flex-direction: column;
                border: 1px solid ${dMp ? '#444' : '#ddd'};
              `;
                // header
                const header = document.createElement('div');
                header.style.cssText = `
                cursor: move;
                padding: 6px 10px;
                background: ${dMp ? '#111' : '#f0f0f0'};
                border-radius: 6px 6px 0 0;
                font-weight: bold;
                user-select: none;
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: ${dMp ? '#eee' : '#333'};
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
                color: ${dMp ? '#aaa' : '#888'};
                user-select: none;
                margin-left: 10px;
              `;
                closeBtn.onmouseenter = () => (closeBtn.style.color = dMp ? '#fff' : '#333');
                closeBtn.onmouseleave = () => (closeBtn.style.color = dMp ? '#aaa' : '#888');
                closeBtn.onclick = () => (box.style.display = 'none');
                header.appendChild(closeBtn);
                box.appendChild(header);

                // 输入区
                const inputWrapper = document.createElement('div');
                inputWrapper.style.cssText = `display: flex; align-items: center; gap: 8px; margin: 10px 0; color: ${dMp ? '#eee' : '#333'}; font-weight: bold;`;

                inputWrapper.innerHTML = `
                <span style="flex: 0 0 auto;">MP-</span>
                <input id="mp-percent-input" type="number" min="0" step="0.1" value="${inputPercent}" style="background: ${dMp ? '#2c3e50' : '#e8f0fe'}; color: ${dMp ? '#fff' : '#333'}; width: 40px; border: 1px solid ${dMp ? '#555' : '#bbb'};">
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
                  color: ${dMp ? '#eee' : '#333'};
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
                        width: auto;
                        min-width: 50px;
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
                        const parsed = JSON.parse(raw);
                        // 新格式: { timestamp: ..., data: [...] }
                        // 旧格式: [...] (直接数组，兼容处理)
                        data = Array.isArray(parsed) ? parsed : parsed.data;
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
            initAutoAmountToggle: initAutoAmountToggle,
            resetPanelPosition: resetPanelPosition
        };
    })();

    // 初始化界面
    PanelUI.init();

    // 油猴菜单：还原按钮默认位置（保底操作）
    const registerMenu = typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : (typeof GM !== 'undefined' && GM.registerMenuCommand ? GM.registerMenuCommand.bind(GM) : null);
    if (registerMenu) {
        registerMenu('还原按钮默认位置', () => PanelUI.resetPanelPosition());
    }

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
        const CARD_SELECTOR = '.col-xs-6.css-0.ewayztq2, .col-xs-6.resources.text-center'; //前者生产，后者零售 如果自定义运行时长不显示，则需要检查css是否更改
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

            // 自适应深色/浅色模式
            const bgSum = (window.getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [])
                .map(Number).reduce((a, b) => a + b, 0);
            const isDark = bgSum < 380;
            const bg = isDark ? '#333' : '#fff';
            const fg = isDark ? '#EEE' : '#333';
            const border = isDark ? '#555' : '#ccc';
            const inputBg = isDark ? '#2C2C2C' : '#f5f5f5';
            const inputFg = isDark ? '#EEE' : '#333';
            const inputBorder = isDark ? '#666' : '#bbb';
            const codeBg = isDark ? '#444' : '#e8e8e8';
            const codeFg = isDark ? '#ffb74d' : '#c62828';
            const overlayBg = 'rgba(0,0,0,0.7)';
            const shadow = '0 5px 15px rgba(0,0,0,0.5)';
            const btnCancelBg = isDark ? '#555' : '#e0e0e0';
            const btnCancelFg = isDark ? 'white' : '#333';

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${overlayBg};z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:5vh;box-sizing:border-box;`;

            modal.innerHTML = `
                <div style="background:${bg};color:${fg};padding:0;border-radius:6px;box-shadow:${shadow};width:90%;max-width:450px;border:1px solid ${border};">
                    <div style="padding:15px;border-bottom:1px solid ${border};">
                        <h4 style="margin:0;font-size:18px;font-weight:600;">设置自定义数量/时长</h4>
                    </div>
                    <div style="padding:15px;">
                        <p style="margin-top:0;margin-bottom:15px;font-size:14px;line-height:1.6;">
                            使用<strong style="color:#FF8888;">逗号（, 或 ，）</strong>分隔，可在插件菜单中禁用此功能。支持格式：<br>
                            • 时间点：<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">10pm</code>、<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">11:30</code> → 今晚/明天该时刻的分钟数<br>
                            • 明天时刻：<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">+14:13</code>、<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">+2pm</code> → 强制明天该时刻<br>
                            • 后天时刻：<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">++14:13</code>、<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">++2pm</code> → 强制后天该时刻<br>
                            • 明天时长：<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">+11h11m</code> → 24小时 + 指定时长<br>
                            • 持续时间：<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">1d12h30m</code> → 累加为总分钟<br>
                            字母不区分大小写，半角全角均可。
                        </p>
                        <textarea id="autoamount-config-input"
                            style="width:100%;height:80px;margin-bottom:20px;padding:8px;border:1px solid ${inputBorder};border-radius:4px;box-sizing:border-box;font-size:14px;color:${inputFg};background:${inputBg};resize:vertical;"></textarea>
                        <div style="display:flex;justify-content:flex-end;gap:10px;">
                            <button id="autoamount-config-cancel" style="background-color:${btnCancelBg};color:${btnCancelFg};border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;transition:background-color 0.2s;">取消</button>
                            <button id="autoamount-config-save" style="background-color:#5cb85c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;transition:background-color 0.2s;">保存</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

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
            applyHoverStyle(cancelButton, isDark ? '#555' : '#e0e0e0', isDark ? '#444' : '#ccc');
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

            // --- 步骤 1: 全角字符归一化 ---
            let s = amountString
                .replace(/：/g, ':')
                .replace(/，/g, ',')
                // 全角大写字母 → 半角
                .replace(/[Ａ-Ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
                // 全角小写字母 → 半角
                .replace(/[ａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
                // 全角数字 → 半角
                .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
                .trim();
            const lower = s.toLowerCase();

            // --- 步骤 1.5: ++HH:MM am/pm 格式 (强制后天时刻, 如 "++14:13", "++11:30pm") ---
            const doublePlusTimeMatch = lower.match(/^\+\+(\d{1,2}):(\d{1,2})\s*(am|pm)?$/);
            if (doublePlusTimeMatch) {
                let hours = parseInt(doublePlusTimeMatch[1], 10);
                const minutes = parseInt(doublePlusTimeMatch[2], 10);
                const ampm = doublePlusTimeMatch[3];
                if (ampm === 'pm' && hours !== 12) hours += 12;
                else if (ampm === 'am' && hours === 12) hours = 0;
                // 以今天 HH:MM 为基准，强制 +48h 到后天
                const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);
                const diffMs = targetTime.getTime() - today.getTime() + 2 * 24 * 60 * 60 * 1000;
                return `${Math.floor(diffMs / 60000)}m`;
            }

            // --- 步骤 1.6: ++HH am/pm (如 "++2pm") ---
            if (lower.startsWith('++')) {
                const rest = lower.slice(2);
                const doublePlusAmpmMatch = rest.match(/^(\d{1,2})\s*(am|pm)$/);
                if (doublePlusAmpmMatch) {
                    let hours = parseInt(doublePlusAmpmMatch[1], 10);
                    const ampm = doublePlusAmpmMatch[2];
                    if (ampm === 'pm' && hours !== 12) hours += 12;
                    else if (ampm === 'am' && hours === 12) hours = 0;
                    const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, 0, 0, 0);
                    const diffMs = targetTime.getTime() - today.getTime() + 2 * 24 * 60 * 60 * 1000;
                    return `${Math.floor(diffMs / 60000)}m`;
                }
                // 不支持 ++ 持续时间格式，继续后续解析
            }

            // --- 步骤 2: +HH:MM am/pm 格式 (强制明天时刻, 如 "+14:13", "+11:30pm") ---
            const plusTimeMatch = lower.match(/^\+(\d{1,2}):(\d{1,2})\s*(am|pm)?$/);
            if (plusTimeMatch) {
                let hours = parseInt(plusTimeMatch[1], 10);
                const minutes = parseInt(plusTimeMatch[2], 10);
                const ampm = plusTimeMatch[3];
                if (ampm === 'pm' && hours !== 12) hours += 12;
                else if (ampm === 'am' && hours === 12) hours = 0;
                // 以今天 HH:MM 为基准，强制 +24h 到明天
                const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);
                const diffMs = targetTime.getTime() - today.getTime() + 24 * 60 * 60 * 1000;
                return `${Math.floor(diffMs / 60000)}m`;
            }

            // --- 步骤 2b: +HH am/pm (如 "+2pm") 或 +持续时间 (如 "+11h11m") ---
            if (lower.startsWith('+')) {
                const rest = lower.slice(1);
                // 先尝试 +HH am/pm
                const plusAmpmMatch = rest.match(/^(\d{1,2})\s*(am|pm)$/);
                if (plusAmpmMatch) {
                    let hours = parseInt(plusAmpmMatch[1], 10);
                    const ampm = plusAmpmMatch[2];
                    if (ampm === 'pm' && hours !== 12) hours += 12;
                    else if (ampm === 'am' && hours === 12) hours = 0;
                    const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, 0, 0, 0);
                    const diffMs = targetTime.getTime() - today.getTime() + 24 * 60 * 60 * 1000;
                    return `${Math.floor(diffMs / 60000)}m`;
                }
                // 再尝试 +持续时间
                const durPattern = /(\d+\.?\d*)\s*([dhm])/gi;
                let totalMinutes = 0;
                let durMatch;
                let hasDuration = false;
                while ((durMatch = durPattern.exec(rest)) !== null) {
                    hasDuration = true;
                    const val = parseFloat(durMatch[1]);
                    const unit = durMatch[2].toLowerCase();
                    if (unit === 'd') totalMinutes += val * 1440;
                    else if (unit === 'h') totalMinutes += val * 60;
                    else if (unit === 'm') totalMinutes += val;
                }
                if (hasDuration) {
                    totalMinutes += 1440; // +24h
                    return `${Math.floor(totalMinutes)}m`;
                }
            }

            // --- 步骤 3: HH:MM am/pm 格式 (时间点) ---
            const timeMatch = lower.match(/^(\d{1,2}):(\d{1,2})\s*(am|pm)?$/);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const ampm = timeMatch[3];
                if (ampm === 'pm' && hours !== 12) hours += 12;
                else if (ampm === 'am' && hours === 12) hours = 0;
                const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);
                let diffMs = targetTime.getTime() - today.getTime();
                if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
                return `${Math.floor(diffMs / 60000)}m`;
            }

            // --- 步骤 4: 独立 HH am/pm (无冒号, 如 "10pm") ---
            const standaloneAmpm = lower.match(/^(\d{1,2})\s*(am|pm)$/);
            if (standaloneAmpm) {
                let hours = parseInt(standaloneAmpm[1], 10);
                const ampm = standaloneAmpm[2];
                if (ampm === 'pm' && hours !== 12) hours += 12;
                else if (ampm === 'am' && hours === 12) hours = 0;
                const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, 0, 0, 0);
                let diffMs = targetTime.getTime() - today.getTime();
                if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
                return `${Math.floor(diffMs / 60000)}m`;
            }

            // --- 步骤 5: 持续时间格式 d/h/m (支持中英文, 如 "1d23.97h48m", "2天3小时30分") ---
            // 匹配: 数字(可含小数点) + 可选空格 + 单位(d/h/m/天/时/分/钟)
            const durPattern = /(\d+\.?\d*)\s*([dhm])/gi;
            let totalMinutes = 0;
            let durMatch;
            let hasDuration = false;
            while ((durMatch = durPattern.exec(lower)) !== null) {
                hasDuration = true;
                const val = parseFloat(durMatch[1]);
                const unit = durMatch[2].toLowerCase();
                if (unit === 'd') {
                    totalMinutes += val * 1440;            // 天 → 分钟
                } else if (unit === 'h') {
                    totalMinutes += val * 60;              // 小时 → 分钟
                } else if (unit === 'm') {
                    totalMinutes += val;                   // 分钟
                }
            }
            if (hasDuration) {
                return `${Math.floor(totalMinutes)}m`;
            }

            // --- 步骤 6: 无法识别, 原样返回 (如纯数字当作数量) ---
            return s;
        }

        function observeCardsForAutoAmount() {
            let debounceTimer;
            let lateCheckTimer; // 延迟二次检查，捕获 React 异步渲染的卡片
            const targetNode = document.body;

            const CHECK_SELECTORS = [
                'div[style="overflow: visible;"]',
                CARD_SELECTOR.split(',').map(s => s.trim()).join(',')
            ];

            const observer = new MutationObserver((mutationsList) => {
                clearTimeout(debounceTimer);
                clearTimeout(lateCheckTimer);
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
                        // 追加延迟二次检查：React 组件可能分批次渲染，
                        // 首次检查时部分卡片可能尚未挂载到 DOM
                        lateCheckTimer = setTimeout(() => {
                            initAutoAmountButtons(false);
                        }, 500);
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
            const d = DM();
            const table = document.createElement("table");
            table.style.cssText = `border-collapse:collapse;margin:10px 0;background:${d ? '#333' : '#f9f9f9'};color:${d ? 'white' : '#333'};font-size:13px;width:100%;`;

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            ["物品", "质量", "饱和度"].forEach(text => {
                const th = document.createElement("th");
                th.textContent = text;
                th.style.cssText = `border:1px solid ${d ? '#666' : '#ccc'};padding:4px 8px;`;
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
                    td.style.cssText = `border:1px solid ${d ? '#666' : '#ccc'};padding:4px 8px;text-align:center;`;
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

                const d = DM();
                const list = data.ResourcesRetailInfo;
                const weatherMultiplier = data.sellingSpeedMultiplier.sellingSpeedMultiplier;

                // 1. 创建容器
                saturationTableElement = document.createElement("div");
                saturationTableElement.style.cssText = `
                position:fixed; left:10px; top:50px; z-index:9998;
                background:${d ? '#2c2c2c' : '#fff'}; color:${d ? '#fff' : '#333'}; padding:12px;
                border-radius:8px; max-height:400px; overflow:auto;
                max-width: calc(100vw - 20px);
                box-shadow:0 4px 15px rgba(0,0,0,0.5); font-family:Arial, sans-serif;
            `;

                // 2. 创建头部信息
                const headerInfo = document.createElement("div");
                headerInfo.innerHTML = `
                <div style="margin-bottom:6px; font-size:14px; font-weight:bold; color:${d ? '#f1c40f' : '#b8860b'};">天气速度加成: ${weatherMultiplier}</div>
                <div style="margin-bottom:6px; font-size:13px; color:${d ? '#ddd' : '#666'};">查询历史饱和度: <a href="https://marketsaturation.22-7.top/" target="_blank" style="color:#3498db; text-decoration:underline;">点击查看</a></div>
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



        const workerCode = `
        self.onmessage = function(e) {
        const { lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
            v, b,
            cogs, quality, quantity, cardIndex, retryCount,
            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
            calcMode} = e.data;

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

            let profit = revenue - cogs - wagesTotal;
            if (calcMode === 'hourly') {
                profit = profit / secondsToFinish;
            }

            if (profit > maxProfit) {
                maxProfit = profit;
                bestPrice = currentPrice;
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

        // 发送结果，带上 calculatedWages, calcMode, finalTotalProfit, finalW
        self.postMessage({
            bestPrice: bestPrice,
            maxProfit: maxProfit,
            calculatedWages: calculatedWages,
            cardIndex: cardIndex,
            retryCount: retryCount,
            calcMode: calcMode,
            finalTotalProfit: (bestPrice * parseFloat(quantity)) - cogs - calculatedWages,
            finalW: finalW
        });

    };
    `;

        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        function triggerCalculation(comp, index, retryCount = 0, calcMode = 'hourly') {
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
            const { cogs: originalCogs, quality, quantity } = comp.state;

            // 读取自定义单位成本（通过 index 找到对应卡片上的输入框），仅当 >0 时覆盖 cogs
            const cardEl = document.querySelectorAll('div[style="overflow: visible;"]')[index];
            const customCostEl = cardEl?.querySelector('.custom-unit-cost-input');
            const customUnitCostVal = customCostEl ? (parseFloat(customCostEl.value) || 0) : 0;
            const cogs = customUnitCostVal > 0 ? customUnitCostVal * quantity : originalCogs;

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
                SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
                calcMode: calcMode
            });
        }

        // 注册 Worker 异步回调 (处理结果和校验)
        profitWorker.onmessage = (event) => {
            // 1. 接收 Worker 返回的数据 (包括计算出的预计工资 calculatedWages)
            const { bestPrice, maxProfit, calculatedWages, cardIndex, retryCount, calcMode, finalTotalProfit, finalW } = event.data;
            const mode = calcMode || 'hourly';

            // 使用 index 查找对应的卡片
            const card = document.querySelectorAll('div[style="overflow: visible;"]')[cardIndex];
            if (!card) return;

            const priceInput = card.querySelector('input[name="price"]');
            const btnHourly = card.querySelector('.btn-max-hourly-profit');
            const btnTotal = card.querySelector('.btn-max-total-profit');
            const profitDisplay = card.querySelector('.auto-profit-display');

            if (!priceInput || !profitDisplay) return;

            // 2. 重新获取 comp 实例，准备获取 size 和 wagesTotal
            const comp = findReactComponent(priceInput);
            if (!comp) return;
            const size = comp.props.size || 1; // 修正：在回调中获取 size

            // 3. 设置价格 (触发 React State 异步更新)
            setInput(priceInput, bestPrice.toFixed(2));

            // 4. 更新显示 UI
            const hourlyProfit = finalW > 0 ? ((finalTotalProfit / finalW) / size * 3600) : 0;

            profitDisplay.innerHTML = `
                <div>总利润: ${finalTotalProfit.toFixed(2)}</div>
                <div style="margin-top: 2px;">每级时利润: ${hourlyProfit.toFixed(2)}</div>
            `;
            profitDisplay.style.background = '#4CAF50'; // 绿色表示成功
            profitDisplay.style.color = 'white';
            profitDisplay.style.fontWeight = 'bold';

            if (btnHourly) {
                btnHourly.textContent = '最大时利润';
                btnHourly.disabled = false;
            }
            if (btnTotal) {
                btnTotal.textContent = '最大利润';
                btnTotal.disabled = false;
            }

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
                        profitDisplay.style.color = 'white';
                        profitDisplay.innerHTML = '🔄 修正数量中...';

                        // ⚠️ 优先使用 card.doAutoCalc 调用以传递 mode 参数
                        if (typeof card.doAutoCalc === "function") {
                            card.doAutoCalc(updatedComp, retryCount + 1, mode);
                        } else if (typeof triggerCalculation === "function") {
                            triggerCalculation(updatedComp, cardIndex, retryCount + 1, mode);
                        } else {
                            // console.error("triggerCalculation 函数未定义，请确保它在作用域内。");
                        }
                    } else {
                        profitDisplay.style.background = '#f44336'; // 最终失败变红
                        profitDisplay.style.color = 'white';
                        profitDisplay.innerHTML = '⚠️ 计算偏差过大';
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

                    const btnContainer = document.createElement('div');
                    btnContainer.style = `display: flex; flex-direction: column; gap: 4px; margin-top: 5px;`;

                    const btnHourly = document.createElement('button');
                    btnHourly.textContent = '最大时利润';
                    btnHourly.type = 'button';
                    btnHourly.className = 'btn-max-hourly-profit';
                    btnHourly.setAttribute('data-index', index);
                    btnHourly.style = `background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;`;

                    const btnTotal = document.createElement('button');
                    btnTotal.textContent = '最大利润';
                    btnTotal.type = 'button';
                    btnTotal.className = 'btn-max-total-profit';
                    btnTotal.setAttribute('data-index', index);
                    btnTotal.style = `background: #e91e63; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;`;

                    btnContainer.appendChild(btnHourly);
                    btnContainer.appendChild(btnTotal);

                    const d = DM();
                    const profitDisplay = document.createElement('div');
                    profitDisplay.className = 'auto-profit-display';
                    profitDisplay.textContent = `等待计算...`;
                    profitDisplay.style = `margin-top: 5px; font-size: 14px; color: ${d ? '#fff' : '#333'}; background: ${d ? '#555' : '#e0e0e0'}; padding: 4px 8px; text-align: center; border-radius: 4px;`;

                    // 自定义成本输入框
                    const customCostInput = document.createElement('input');
                    customCostInput.type = 'number';
                    customCostInput.className = 'custom-unit-cost-input';
                    customCostInput.placeholder = '假设单位成本';
                    customCostInput.min = '0';
                    customCostInput.step = '0.01';
                    customCostInput.style = `margin-top: 5px; width: 100%; padding: 4px 8px; border: 1px solid ${d ? '#555' : '#bbb'}; border-radius: 4px; background: ${d ? '#333' : '#fff'}; color: ${d ? '#fff' : '#333'}; font-size: 13px; box-sizing: border-box;`;

                    // --- 提取核心发送逻辑 ---
                    // 这样按钮点击能用，后续重试也能用
                    const startCalc = (targetComp, retryIdx = 0, mode = 'hourly') => {
                        if (localStorage.getItem('SimcompaniesConstantsData') == null) {
                            showToast("请尝试更新基本数据（左下角按钮）"); // 替换了 alert
                            return;
                        }

                        // UI反馈
                        if (retryIdx === 0) {
                            if (mode === 'hourly') {
                                btnHourly.textContent = '计算中...';
                                btnHourly.disabled = true;
                            } else {
                                btnTotal.textContent = '计算中...';
                                btnTotal.disabled = true;
                            }
                        }
                        profitDisplay.textContent = retryIdx > 0 ? `修正中(${retryIdx})...` : `计算中...`;

                        const lwe = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
                        const zn = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;

                        // 重新获取最新的 state 和 props
                        const { size, acceleration, economyState, resource, salesModifierWithRecreationBonus, skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather = null } = targetComp.props;
                        const { cogs: originalCogs, quality, quantity } = targetComp.state;

                        // 读取自定义单位成本，仅当输入 >0 时用 单位成本*数量 覆盖 cogs
                        const customUnitCost = parseFloat(customCostInput.value) || 0;
                        const cogs = customUnitCost > 0 ? customUnitCost * quantity : originalCogs;

                        const v = salesModifierWithRecreationBonus + Math.floor(skillCMO / 3);
                        const b = Ul(administrationOverhead, skillCOO);

                        profitWorker.postMessage({
                            lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
                            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
                            v, b, cogs, quality, quantity,
                            cardIndex: index,
                            retryCount: retryIdx, // 发送当前是第几次尝试
                            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
                            calcMode: mode
                        });
                    };

                    btnHourly.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCalc(comp, 0, 'hourly');
                    };

                    btnTotal.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCalc(comp, 0, 'total');
                    };

                    // 将函数引用挂载在 DOM 上，方便 onmessage 找到并调用重试
                    card.doAutoCalc = startCalc;

                    priceInput.parentNode.insertBefore(btnContainer, priceInput.nextSibling);
                    priceInput.parentNode.insertBefore(profitDisplay, btnContainer.nextSibling);
                    priceInput.parentNode.insertBefore(customCostInput, profitDisplay.nextSibling);
                    card.dataset.autoPricingAdded = 'true';
                });
            } catch (err) { }
        }

        window.initAutoPricing = initAutoPricing;

        // 启动观察器，只在商品卡片变化时运行自动定价逻辑
        function observeCardsForAutoPricing() {
            // 防抖计时器
            let debounceTimer;
            let lateCheckTimer; // 延迟二次检查，捕获 React 异步渲染的卡片

            // 目标容器 - 改为更具体的容器选择器（如果能确定的话）
            const targetNode = document.body; // 或者更具体的容器如 '#shop-container'

            // 优化后的观察器配置
            const observer = new MutationObserver((mutationsList) => {
                // 使用防抖避免频繁触发
                clearTimeout(debounceTimer);
                clearTimeout(lateCheckTimer);
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
                        // 追加延迟二次检查：React 组件可能分批次渲染，
                        // 首次检查时部分卡片可能尚未挂载到 DOM
                        lateCheckTimer = setTimeout(() => {
                            initAutoPricing();
                        }, 500);
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

        if (typeof window.isPageModuleEnabled === 'function' && window.isPageModuleEnabled('autoPricing')) {
            observeCardsForAutoPricing();
        }
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
        let _autoSelectTimer = null; // 自动选中最佳订单行的定时器
        let _pendingAutoSelect = null; // { targetQuality, startTime } 品质切换后等待API数据刷新再选中
        let _pendingAutoSelectPollTimer = null; // 等待API返回的轮询定时器
        let _globalObserver = null; // 全局 MutationObserver（跨 init 调用复用防泄漏）
        let _tableObserver = null; // 表格行变化 MutationObserver
        let _quantityCheckInterval = null; // 数量输入框脏检查定时器ID
        let _formClickHandler = null; // 表单按钮点击处理函数引用
        let _initDone = false; // 标记是否已成功初始化，避免 observer 反复执行 tryInit

        // Worker 代码 —— 批量处理版本：一次接收所有行，共享数据只传一次
        const workerCode = `
        self.onmessage = function(e) {
        const { orders, shared, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
        if (!orders || !orders.length) { self.postMessage([]); return; }

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

        // 预计算共享值（主线程已算好传入）
        const acceleration = SRC.acceleration;
        const economyState = shared.economyState;
        const v = shared.v;
        const b = shared.b;
        const wages = shared.wages;
        const buildingKind = shared.buildingKind;
        const weather = shared.weather;
        const size = 1;

        const results = [];

        for (const order of orders) {
            const { rowId, price, quantity, quality, resourceId } = order;

            // 根据 MP-?% 调整进货成本价
            let costPrice = price;
            if (shared.mpPercent != null && shared.mpPercent !== 0 && isFinite(shared.mpPercent)) {
                if (shared.mpPercent >= 0) {
                    costPrice = price * (1 - shared.mpPercent / 100);
                } else {
                    costPrice = price + shared.mpPercent;
                }
            }

            // 饱和度：资源150（树）按品质区分，其余统一
            let saturation;
            if (parseInt(resourceId) === 150 && quality !== undefined) {
                saturation = shared.saturationByQuality ? shared.saturationByQuality[quality] : shared.saturation;
            } else {
                saturation = shared.saturation;
            }

            const forceQuality = (parseInt(resourceId) === 150) ? quality : undefined;

            let currentPrice = price,
                maxProfit = -Infinity,
                selltime;

            while (currentPrice > 0) {
                const modeledData = wv(economyState, resourceId, forceQuality ?? null);
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
                    weather
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                const secondsToFinish = w;
                const profit = (!secondsToFinish || secondsToFinish <= 0)
                    ? NaN
                    : (revenue - costPrice * quantity - wagesTotal) / secondsToFinish;

                if (!secondsToFinish || secondsToFinish <= 0) break;
                if (profit > maxProfit) {
                    maxProfit = profit;
                    selltime = secondsToFinish;
                }
                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }

            results.push({ rowId, maxProfit, selltime });
        }

        self.postMessage(results);
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        const allProfitSpans = new Set();
        let isShowingProfit = true;

        // 清理定时器和监听器（切换物品时调用）
        function cleanupInputListeners() {
            if (_quantityCheckInterval) {
                clearInterval(_quantityCheckInterval);
                _quantityCheckInterval = null;
            }
            const oldInput = document.querySelector('input[name="quantity"]');
            if (oldInput) {
                oldInput.removeAttribute('data-calc-listener');
            }
            // 表单点击监听器由 init 统一管理，每次 init 会重新绑定
        }

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
                _quantityCheckInterval = setInterval(() => {
                    if (input.value !== lastValue) {
                        lastValue = input.value;
                        updateGlobalSimulation();
                    }
                }, 500);

                // 3. 针对游戏内的“快速按钮” (例如 Max/Half 按钮)
                // 游戏中的按钮通常在 input 的父级或兄弟级
                const parentForm = input.closest('form');
                if (parentForm) {
                    // 先移除旧的监听器（通过标记清理）
                    if (_formClickHandler) {
                        parentForm.removeEventListener('click', _formClickHandler);
                    }
                    _formClickHandler = (e) => {
                        // 如果点击了按钮，延迟一会等待值更新后执行计算
                        if (e.target.tagName === 'BUTTON') {
                            setTimeout(updateGlobalSimulation, 50);
                        }
                    };
                    parentForm.addEventListener('click', _formClickHandler);
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

        // 自动选中最佳利润行：先匹配品质，再点击行
        // 品质不同时切换品质，然后持续监听市场API返回，数据就绪后由 updateGlobalSimulation 完成选中
        function autoSelectBestRow(bestRow) {
            const labelData = extractNumbersFromAriaLabel(bestRow.getAttribute('aria-label'));
            if (!labelData) return;
            const targetQuality = labelData.quality;

            const qBtn = document.getElementById('quality-selection');
            if (!qBtn) return;

            const currentSpan = qBtn.querySelector('span');
            const currentQuality = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
            if (isNaN(currentQuality)) return;

            if (currentQuality !== targetQuality) {
                qBtn.click();
                setTimeout(() => {
                    const dropdownMenu = qBtn.parentElement?.querySelector('.dropdown-menu');
                    if (!dropdownMenu) return;
                    const items = dropdownMenu.querySelectorAll('li a');
                    for (const item of items) {
                        const txt = item.textContent?.trim();
                        if (txt === '全部') continue;
                        const q = parseInt(txt);
                        if (q === targetQuality) {
                            item.click();
                            // 记录切换前两个market缓存键的最新时间戳（all和非all）
                            const keys = [`market_all_${currentRealmId}_${currentResourceId}`, `market_${currentRealmId}_${currentResourceId}`];
                            let prevTs = 0;
                            for (const k of keys) {
                                try {
                                    const raw = localStorage.getItem(k);
                                    if (raw) { const p = JSON.parse(raw); if ((p.timestamp || 0) > prevTs) prevTs = p.timestamp || 0; }
                                } catch (e) { }
                            }
                            _pendingAutoSelect = { targetQuality, startTime: Date.now(), prevTs };
                            _startPendingAutoSelectPoll();
                            return;
                        }
                    }
                }, 100);
                return;
            }

            bestRow.focus();
            bestRow.click();
        }

        // 持续监听当前产品市场API是否返回（检测localStorage中两个缓存键的时间戳变化）
        // 数据就绪后直接查找最佳行并点击
        function _startPendingAutoSelectPoll() {
            if (_pendingAutoSelectPollTimer) clearTimeout(_pendingAutoSelectPollTimer);
            if (!_pendingAutoSelect) return;

            const MAX_WAIT = 20000;
            if (Date.now() - _pendingAutoSelect.startTime > MAX_WAIT) {
                _pendingAutoSelect = null;
                return;
            }

            // 检查quality-selection当前值是否已匹配目标品质
            const qBtn = document.getElementById('quality-selection');
            const currentSpan = qBtn?.querySelector('span');
            const curQ = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
            if (curQ !== _pendingAutoSelect.targetQuality) {
                _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 300);
                return;
            }

            // 检查两个缓存键是否有新数据
            const keys = [`market_all_${currentRealmId}_${currentResourceId}`, `market_${currentRealmId}_${currentResourceId}`];
            let newTs = 0;
            for (const k of keys) {
                try {
                    const raw = localStorage.getItem(k);
                    if (raw) { const p = JSON.parse(raw); if ((p.timestamp || 0) > newTs) newTs = p.timestamp || 0; }
                } catch (e) { }
            }

            if (newTs > _pendingAutoSelect.prevTs) {
                _pendingAutoSelectPollTimer = setTimeout(() => {
                    _pendingAutoSelectPollTimer = null;
                    _tryClickBestRow();
                }, 800);
                return;
            }

            _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 500);
        }

        // 在 pending 状态下，查找当前页面中利润最高的行并点击
        function _tryClickBestRow() {
            if (!_pendingAutoSelect) return;
            const tbody = findValidTbody();
            if (!tbody) return;

            let bestRow = null, bestProfit = -Infinity;
            tbody.querySelectorAll('tr[data-profit-calculated]').forEach(row => {
                if (row.offsetParent !== null && row.__profitData && row.__profitData.profit > bestProfit) {
                    bestProfit = row.__profitData.profit;
                    bestRow = row;
                }
            });

            if (bestRow) {
                const qBtn = document.getElementById('quality-selection');
                const curSpan = qBtn?.querySelector('span');
                const curQ = curSpan ? parseInt(curSpan.textContent?.trim()) : NaN;
                if (curQ === _pendingAutoSelect.targetQuality) {
                    _pendingAutoSelect = null;
                    bestRow.focus();
                    bestRow.click();
                    return;
                }
            }

            if (_pendingAutoSelect && Date.now() - _pendingAutoSelect.startTime < 20000) {
                _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 500);
            }
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
                const simContent = document.getElementById('sc-sim-content');
                if (simContent) simContent.innerHTML = `<div style="color:${DM() ? '#888' : '#777'};font-size:12px;text-align:center;padding:8px;">暂无订单数据</div>`;
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
            let bldLevel = 1;

            if (isSimulationMode) {
                // === 模式 A：真实扫货模拟 (修正：强制 价格升序 + 品质降序) ===
                const storedLevel = localStorage.getItem('sc_building_level');
                bldLevel = storedLevel !== null ? Math.max(1, parseInt(storedLevel) || 1) : 100;

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

                displayTitle = `购买${userWantedQty.toLocaleString()}个 - 扫货模拟`;
                borderColor = DM() ? "#FFC107" : "#B8860B";

                if (isFull) {
                    // statusText = "✅ 数量满足";
                } else {
                    const bought = userWantedQty - remainingQty;
                    statusText = `⚠️缺货(仅买到${Math.floor(bought).toLocaleString()})`;
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
                    const simContent = document.getElementById('sc-sim-content');
                    if (simContent) simContent.innerHTML = '<div style="color: #ff9800; font-size: 13px; text-align: center;">⚠️ 无正利润订单</div>';
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
                    const dG = DM();
                    best.row.style.outline = `2px dashed ${dG ? '#FFC107' : '#B8860B'}`;
                    best.row.style.outlineOffset = "-2px";
                    best.row.style.boxShadow = `inset 0 0 8px ${dG ? 'rgba(255, 193, 7, 0.35)' : 'rgba(184, 134, 11, 0.25)'}`;
                    best.row.style.backgroundColor = dG ? 'rgba(255, 193, 7, 0.07)' : 'rgba(184, 134, 11, 0.05)';

                    // 自动选中最佳订单行（先匹配品质，再点击行）—— 受功能开关控制（默认关闭）
                    const autoSelectEnabled = (() => {
                        try {
                            const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                            return cfg['autoSelectBestMarketRow'] === true;
                        } catch (e) { return false; }
                    })();
                    if (autoSelectEnabled) {
                        // 品质切换后有 pending 状态时：跳过正常自动选中，由轮询在数据就绪后完成
                        if (_pendingAutoSelect) {
                            // 不操作，等待 _startPendingAutoSelectPoll 检测到新数据后调用 _tryClickBestRow
                        } else {
                            clearTimeout(_autoSelectTimer);
                            _autoSelectTimer = setTimeout(() => autoSelectBestRow(best.row), 600);
                        }
                    }
                }

                // 4. 读取建筑等级和运行时长设置（等级整数≥1，时长可小数）
                const storedLevel = localStorage.getItem('sc_building_level');
                bldLevel = storedLevel !== null ? Math.max(1, parseInt(storedLevel) || 1) : 100;
                const storedHours = localStorage.getItem('sc_building_hours');
                const bldHours = storedHours !== null ? Math.max(0, parseFloat(storedHours) || 0) : 24;
                const targetSeconds = bldLevel * bldHours * 3600;
                let remainingTime = targetSeconds; // 秒
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
                isFull = totalHours >= (bldLevel * bldHours - 0.1);

                displayTitle = `${bldLevel}级建筑运行${bldHours}H正时利`;
                borderColor = isFull ? "#4CAF50" : "#ff9800"; // 绿或橙

                // // 格式化时间字符串
                // const timeStr = formatDuration(totalHours);
                // statusText = isFull ? "货源充足" : `仅覆盖 ${timeStr}`;
            }

            // 5. 渲染 UI
            const avgStr = avgProfitPerHour.toFixed(2);
            const totalProfitK = (totalProfitVal / 1000).toFixed(1);
            const durationStr = formatDuration(totalTimeSeconds / 3600);
            const bldRunHours = totalTimeSeconds / 3600 / bldLevel;
            const bldRunStr = formatDuration(bldRunHours);


            // 读取当前 MP 设置用于展示
            const mpInputEl = document.getElementById('sc-mp-input');
            const curMp = mpInputEl ? (parseFloat(mpInputEl.value) || 0) : 0;

            const renderUI = () => {
                const simContent = document.getElementById('sc-sim-content');
                if (!simContent) return;
                // summaryDisplay.style.borderLeft = `4px solid ${borderColor}`;
                const d7r = DM();
                const isNarrowR = window.innerWidth <= 576;

                // MP 标记文本
                let mpBadgeHtml = '';
                if (curMp !== 0) {
                    const mpLabel = curMp > 0 ? `MP-${curMp}%` : `MP-${Math.abs(curMp)}`;
                    mpBadgeHtml = `<div style="background: ${d7r ? '#3a2a5e' : '#ede7f6'}; color: ${d7r ? '#b39ddb' : '#5e35b1'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">${mpLabel} </div>`;
                }

                // 经济周期标记文本
                let periodBadgeHtml = '';
                const economySelectEl2 = document.getElementById('sc-economy-select');
                const economyVal = economySelectEl2 ? economySelectEl2.value : '';
                if (economyVal !== '') {
                    const periodNames = { '0': '萧条', '1': '平缓', '2': '景气' };
                    const periodName = periodNames[economyVal] || economyVal;
                    periodBadgeHtml = `<div style="background: ${d7r ? '#3a2a1e' : '#fff3cd'}; color: ${d7r ? '#f0c040' : '#856404'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">周期:${periodName}</div>`;
                }

                simContent.innerHTML = `
                    <div style="font-family: sans-serif; display: flex; flex-direction: column; gap: ${isNarrowR ? '2px' : '8px'}; font-size: ${isNarrowR ? '11px' : ''};">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${d7r ? '#444' : '#ddd'}; padding-bottom: ${isNarrowR ? '0px' : '6px'}; font-size: 14px;">
                            <span style="color: ${d7r ? '#aaa' : '#777'};">${displayTitle}<span id="sc-info-tip" title="自动更新数据有延迟，左下可手动更新&#10;显示均为1级建筑" onclick="event.stopPropagation();var ex=document.getElementById('sc-info-popup');if(ex){ex.remove();return;}var t=this;var isD=window.getComputedStyle(document.body).backgroundColor.match(/\d+/g);isD=isD&&isD.map(Number).reduce(function(a,b){return a+b},0)<380;var d=document.createElement('div');d.id='sc-info-popup';d.textContent='自动更新数据有延迟，左下可手动更新 | 显示均为1级建筑';d.style.cssText='position:absolute;top:100%;left:0;margin-top:4px;padding:5px 10px;background:'+(isD?'#333':'#fff')+';color:'+(isD?'#eee':'#333')+';border:1px solid '+(isD?'#555':'#bbb')+';border-radius:4px;font-size:11px;font-weight:normal;white-space:nowrap;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.35);';t.parentElement.style.position='relative';t.parentElement.appendChild(d);" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:5px;width:16px;height:16px;min-width:16px;font-size:10px;font-weight:bold;line-height:1;color:${d7r ? '#bbb' : '#555'};background:${d7r ? '#444' : '#e8e8e8'};border:1px solid ${d7r ? '#555' : '#bbb'};border-radius:50%;vertical-align:middle;user-select:none;flex-shrink:0;">?</span></span>
                            <span style="font-weight: bold; color: ${borderColor};">$${avgStr}<span style="font-weight:normal;">/h</span></span>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; gap: ${isNarrowR ? '2px' : '6px'};">
                            ${statusText ? `<div style="background: ${d7r ? '#333' : '#e8e8e8'}; color: ${d7r ? '#ccc' : '#555'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">${statusText}</div>` : ''}

                            <div style="background: ${d7r ? '#333' : '#e8e8e8'}; color: ${d7r ? '#ccc' : '#555'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">
                                总利: $${totalProfitK}k
                            </div>

                            <div style="background: ${d7r ? '#333' : '#e8e8e8'}; color: ${d7r ? '#ccc' : '#555'}; padding: ${isNarrowR ? '1px 4px' : '2px 6px'}; border-radius: 4px;">
                                ${bldLevel}级建筑可运行: ${bldRunStr}
                            </div>
                            ${mpBadgeHtml}${periodBadgeHtml}
                        </div>
                    </div>`;
            };
            renderUI();
        }

        // 主回调处理 —— 批量结果 + debounce 模拟更新
        let _simDebounceTimer = null;
        const scheduleSimUpdate = () => {
            if (_simDebounceTimer) clearTimeout(_simDebounceTimer);
            _simDebounceTimer = setTimeout(() => {
                _simDebounceTimer = null;
                updateGlobalSimulation();
            }, 80);
        };

        profitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { rowId, maxProfit, selltime } = item;
                const row = pendingRows.get(rowId);
                if (!row) continue;
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
                    const d7s = DM();
                    span.style.cssText = `display: inline-block; min-width: 30px; color: ${d7s ? 'white' : '#333'}; background: ${d7s ? '#555' : '#e0e0e0'}; border-radius: 2px; white-space: nowrap;`;

                    // 构建显示文案：窄屏用紧凑图标，-Infinity 显示"卖不了"
                    const isNarrow = window.innerWidth <= 576;
                    const isInfinity = !isFinite(maxProfit * 3600);
                    const profitLabel = isInfinity ? '卖不了'
                        : isNarrow ? (maxProfit >= 0 ? `💰${profitStr}` : `⚠️${profitStr}`)
                            : (maxProfit >= 0 ? `时利润:${profitStr}` : `⚠️时利润:${profitStr}`);
                    span.dataset.p = profitLabel;
                    span.dataset.t = `用时:${timeStr}`;
                    span.textContent = isShowingProfit ? span.dataset.p : span.dataset.t;

                    td.appendChild(span);
                    row.appendChild(td);

                    // 窄屏时收缩价格列宽度
                    if (window.innerWidth <= 576) {
                        const priceTd = td.previousElementSibling;
                        if (priceTd) {
                            const priceDiv = priceTd.querySelector('div');
                            if (priceDiv) priceDiv.style.minWidth = '10px';
                        }
                    }

                    allProfitSpans.add(span);
                    // 定期清理 Set 中已脱离 DOM 的 span，防止内存泄漏
                    if (allProfitSpans.size > 200) {
                        for (const s of allProfitSpans) {
                            if (!s.isConnected) allProfitSpans.delete(s);
                        }
                    }
                }
            }

            attachInputListener();
            // 批量结果回来后，debounce 一次模拟更新
            scheduleSimUpdate();
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

        // 预计算共享值（同一资源页所有行共用），避免 Worker 内重复计算
        function buildSharedContext(SCD, SRC, currentResourceId) {
            const resource = parseInt(currentResourceId);
            const zn = SCD.data;
            const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;

            // 经济周期覆盖
            const economySelectEl = document.getElementById('sc-economy-select');
            const economyState = (economySelectEl && economySelectEl.value !== '')
                ? parseInt(economySelectEl.value)
                : SRC.economyState;

            // 高管加成（支持自定义覆盖）
            let skillCMO, skillCOO;
            if (isCustomEnabled) {
                const bonusKey = `R${currentRealmId}-SC-Saved-Bonuses`;
                try {
                    const SSB = JSON.parse(localStorage.getItem(bonusKey));
                    if (SSB) {
                        skillCMO = SSB.saleBonus;
                        skillCOO = SSB.adminBonus;
                    } else {
                        skillCMO = SRC.saleBonus;
                        skillCOO = SRC.adminBonus;
                    }
                } catch { skillCMO = SRC.saleBonus; skillCOO = SRC.adminBonus; }
            } else {
                skillCMO = SRC.saleBonus;
                skillCOO = SRC.adminBonus;
            }

            const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;

            // 建筑类型 & 工资
            const buildingKind = Object.entries(zn.SALES).find(([, ids]) =>
                ids.includes(resource)
            )?.[0];
            const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
            const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);

            // 饱和度和按品质区分的饱和度（仅资源150=树需要）
            const list = SRC.ResourcesRetailInfo || [];
            let saturation, saturationByQuality;
            if (resource === 150) {
                saturationByQuality = {};
                for (const item of list) {
                    if (item.dbLetter === 150 && item.quality != null) {
                        saturationByQuality[item.quality] = item.saturation;
                    }
                }
                // 默认取 Q0
                saturation = saturationByQuality[0];
            } else {
                const m = list.find(item => item.dbLetter === resource);
                saturation = m?.saturation;
            }

            // 天气（仅夏季物品）
            const resourceDetail = SCD.constantsResources?.[resource];
            const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                ? SRC.sellingSpeedMultiplier : undefined;

            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = (() => {
                const r = SRC.administration || 1;
                return r - (r - 1) * skillCOO / 100;
            })();

            // MP-?% 输入框的值
            const mpInputEl = document.getElementById('sc-mp-input');
            const mpPercent = mpInputEl ? (parseFloat(mpInputEl.value) || 0) : 0;

            return {
                economyState, buildingKind, wages,
                saturation, saturationByQuality, weather,
                v, b, mpPercent
            };
        }

        async function processNewRows(tbody, forceReset = false) {
            if (forceReset) {
                tbody.querySelectorAll('tr[data-profit-calculated]').forEach(row => {
                    row.removeAttribute('data-profit-calculated');
                    row.__profitData = null;
                    const oldTd = row.querySelector('td.auto-profit-info');
                    if (oldTd) oldTd.remove();
                });
                allProfitSpans.clear();
                // 清理 pendingRows 中残留的条目（Worker 再回来时 rowId 已失效）
                pendingRows.clear();
            }

            const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
            if (!SCD_raw) return;
            const SCD = JSON.parse(SCD_raw);
            const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${currentRealmId}`));
            if (!SRC) return;

            // 扫描还未处理过的行，收集为订单数组
            const rows = Array.from(tbody.querySelectorAll('tr'))
                .filter(r => !r.hasAttribute('data-profit-calculated'));

            const orders = [];
            for (const row of rows) {
                const data = extractNumbersFromAriaLabel(row.getAttribute('aria-label'));
                if (!data) continue;

                const rowId = rowIdCounter++;
                pendingRows.set(rowId, row);
                row.setAttribute('data-profit-calculated', '1');
                orders.push({ rowId, price: data.price, quantity: data.quantity, quality: data.quality, resourceId: currentResourceId });
            }

            // 有订单才发送，避免空消息开销
            if (orders.length > 0) {
                const shared = buildSharedContext(SCD, SRC, currentResourceId);
                profitWorker.postMessage({
                    orders,
                    shared,
                    SCD,
                    SRC,
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            } else if (pendingRows.size > 0) {
                // 清理 pendingRows 中已从 DOM 脱离的行（DOM 刷新后残留）
                for (const [rid, row] of pendingRows) {
                    if (!row.isConnected) pendingRows.delete(rid);
                }
            }

            // 重算模拟结果
            updateGlobalSimulation();
        }

        // ===== 监听购买成功（market-order/take POST），自动切回"全部" =====
        (function () {
            const TAKE_URL = '/api/v2/market-order/take/';

            function onTakeSuccess() {
                if (!currentResourceId || !currentRealmId) return;
                const autoSelectEnabled = (() => {
                    try {
                        const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                        return cfg['autoSelectBestMarketRow'] === true;
                    } catch (e) { return false; }
                })();
                if (!autoSelectEnabled) return;

                // 清除当前pending状态，避免干扰
                if (_pendingAutoSelectPollTimer) { clearTimeout(_pendingAutoSelectPollTimer); _pendingAutoSelectPollTimer = null; }
                _pendingAutoSelect = null;

                // 点击quality-selection下拉菜单中的"全部"，让游戏自然刷新数据
                const qBtn = document.getElementById('quality-selection');
                if (!qBtn) return;
                const currentSpan = qBtn.querySelector('span');
                const curQ = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
                if (isNaN(curQ)) return;

                // 当前已是"全部"则不需要切换，游戏购买后会自动请求新数据
                if (curQ === '全部' || isNaN(curQ)) return;

                qBtn.click();
                setTimeout(() => {
                    const dropdownMenu = qBtn.parentElement?.querySelector('.dropdown-menu');
                    if (!dropdownMenu) return;
                    const items = dropdownMenu.querySelectorAll('li a');
                    for (const item of items) {
                        if (item.textContent?.trim() === '全部' || item.textContent?.trim() === 'All') {
                            item.click();
                            // 品质切换后游戏会自动请求新市场数据，正常流程会触发 updateGlobalSimulation
                            return;
                        }
                    }
                }, 100);
            }

            // 拦截 fetch
            const origFetch = window.fetch;
            window.fetch = async function (...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                const isTake = url.includes(TAKE_URL);
                const response = await origFetch.apply(this, args);
                if (isTake && response.ok) {
                    try {
                        const cloned = response.clone();
                        cloned.json().then(() => onTakeSuccess()).catch(() => { });
                    } catch (e) { }
                }
                return response;
            };

            // 拦截 XHR
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                if (typeof url === 'string' && url.includes(TAKE_URL) && method.toUpperCase() === 'POST') {
                    this.addEventListener('load', function () {
                        if (this.status >= 200 && this.status < 300) {
                            onTakeSuccess();
                        }
                    });
                }
                return origOpen.apply(this, arguments);
            };
        })();

        return {
            init(resourceId) {
                // ---- 清理上一次初始化的残留 ----
                // 1. 清理定时器
                clearTimeout(_autoSelectTimer);
                _autoSelectTimer = null;
                if (_pendingAutoSelectPollTimer) {
                    clearTimeout(_pendingAutoSelectPollTimer);
                    _pendingAutoSelectPollTimer = null;
                }
                _pendingAutoSelect = null;
                cleanupInputListeners();

                // 2. 断开旧的 MutationObserver（防止累积！）
                if (_globalObserver) {
                    _globalObserver.disconnect();
                    _globalObserver = null;
                }
                if (_tableObserver) {
                    _tableObserver.disconnect();
                    _tableObserver = null;
                }

                // 3. 重置初始化标记，允许重新初始化
                _initDone = false;
                // 【修复】rowIdCounter 不清零，而是使用递增计数器避免新旧 Worker 响应冲突
                // 旧 Worker 响应到达时 pendingRows 已空会被跳过，但 ID 空间始终保持递增

                // 4. 清理 pendingRows 中残留的行引用（防止 DOM 元素无法 GC）
                pendingRows.clear();
                allProfitSpans.clear();

                // 5. 清除所有旧 form 上的 data-market-calc-initialized 标记
                // 【关键修复】防止 SPA 切换时残留属性导致新页面跳过初始化
                document.querySelectorAll('form[data-market-calc-initialized]').forEach(f => {
                    f.removeAttribute('data-market-calc-initialized');
                });

                // 6. 清除旧 summaryDisplay 避免 DOM 碎片
                if (summaryDisplay && summaryDisplay.parentNode) {
                    summaryDisplay.remove();
                }
                summaryDisplay = null;

                // ---- 新页面初始化 ----
                currentResourceId = resourceId;
                currentRealmId = null;

                // --- 核心优化 1: 启动即判断零售属性 ---
                let currentIsRetail = false;
                const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
                if (SCD_raw) {
                    const SCD = JSON.parse(SCD_raw);
                    currentIsRetail = Object.values(SCD.data.SALES).some(l => l.includes(parseInt(currentResourceId)));
                }

                // 如果不是零售商品，直接退出，不设置任何监听，不注入任何 UI
                if (!currentIsRetail) {
                    return;
                }

                const tryInit = () => {
                    // 如果已经初始化完成，不再重复执行（优化：避免 observer 反复调用）
                    if (_initDone) return;

                    const tbody = findValidTbody();
                    const form = document.querySelector('form');

                    // 1. 基础检查
                    if (!tbody || !form) return;

                    // 2. 检测是否已初始化（其他卡片已先完成），是则跳过
                    // 【安全】不设置 _initDone，不清除 observer——因为上一个 init 已清理了残留属性
                    // 如果真的是已初始化的页面，form 不应该有该属性（已被 cleanup 移除）
                    // 如果是其他竞争条件，observer 会在后续 DOM 变化时再尝试
                    if (form.hasAttribute('data-market-calc-initialized')) {
                        return;
                    }

                    // 3. 提取 Realm ID
                    extractRealmIdOnce(tbody);

                    // 4. 插入 UI 元素 — 通过 DOM 层级向上查找容器，避免依赖固定 CSS 类名
                    const formParent = form.parentElement;
                    const container = formParent?.parentElement?.parentElement;

                    if (container && !container.querySelector('[data-custom-notice]')) {
                        // 扫货模拟面板：固定头部（提示+按钮）+ 动态结果区
                        const d7 = DM();
                        const isNarrow7 = window.innerWidth <= 576;
                        summaryDisplay = document.createElement('div');
                        // padding-left: 面板内容与左边框的间距；margin-bottom: 与下方表格的间距；border-left: 绿色标识线
                        summaryDisplay.style.cssText = `background: ${d7 ? '#222' : '#f9f9f9'}; padding: 0 0 0 ${isNarrow7 ? '6px' : '12px'}; border-radius: 4px; margin-bottom: ${isNarrow7 ? '0px' : '10px'}; border-left: ${isNarrow7 ? '3px' : '4px'} solid #4CAF50; min-height: ${isNarrow7 ? '0' : '40px'}; color: ${d7 ? '#efefef' : '#333'};`;
                        summaryDisplay.dataset.customNotice = 'true';

                        // 固定头部行
                        const infoHeader = document.createElement('div');
                        infoHeader.style.cssText = `display: flex; flex-wrap: wrap; align-items: center; gap: ${isNarrow7 ? '2px' : '8px'}; margin-bottom: ${isNarrow7 ? '0px' : '8px'}; border-bottom: 1px solid ${d7 ? '#444' : '#ddd'};`;

                        const toggleBtn = document.createElement('button');
                        toggleBtn.type = 'button';
                        toggleBtn.id = 'sc-custom-toggle-wrapper';
                        const btnBorderColor = d7 ? '#555' : '#bbb';
                        const btnFgColor = d7 ? '#aaa' : '#666';
                        toggleBtn.style.cssText = `font-size: 11px; color: ${btnFgColor}; background: none; border: 1px solid ${btnBorderColor}; border-radius: 3px; padding: 1px 6px; cursor: pointer; white-space: nowrap;`;
                        const refreshToggleUI = () => {
                            const config = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                            const isEnabled = config['executiveCustomToggle'] !== undefined ? config['executiveCustomToggle'] : false;
                            toggleBtn.textContent = `自定义：${isEnabled ? '开' : '关'}`;
                            toggleBtn.style.color = isEnabled ? '#4CAF50' : btnFgColor;
                            toggleBtn.style.borderColor = isEnabled ? '#4CAF50' : btnBorderColor;
                        };
                        refreshToggleUI();
                        toggleBtn.onclick = (e) => {
                            e.preventDefault();
                            const config = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                            config['executiveCustomToggle'] = !(config['executiveCustomToggle'] === true);
                            localStorage.setItem('SC_PageActions_Settings', JSON.stringify(config));
                            refreshToggleUI();
                            const tbody = findValidTbody();
                            if (tbody) requestAnimationFrame(() => processNewRows(tbody, true));
                        };

                        const btnSettings = document.createElement('button');
                        btnSettings.type = 'button';
                        btnSettings.textContent = "自定义数据";
                        btnSettings.style.cssText = `font-size: 11px; color: ${btnFgColor}; background: none; border: 1px solid #673ab7; border-radius: 3px; padding: 1px 6px; cursor: pointer; white-space: nowrap;`;
                        btnSettings.onclick = (e) => {
                            e.preventDefault();
                            if (typeof executiveCustomButton !== 'undefined') executiveCustomButton.show();
                        };

                        // MP-?% 输入区域：整体不可换行（标签+输入框+%号+快捷按钮）
                        // 切换商品时确保旧值不残留
                        const oldMpInput = document.getElementById('sc-mp-input');
                        if (oldMpInput) oldMpInput.value = '0';

                        const mpGroup = document.createElement('span');
                        mpGroup.style.cssText = `display: inline-flex; align-items: center; gap: 1px; white-space: nowrap;`;

                        const mpLabel = document.createElement('span');
                        mpLabel.textContent = 'MP-';
                        mpLabel.style.cssText = `font-size: 12px; font-weight: bold; color: ${d7 ? '#ffb74d' : '#e65100'};`;

                        const mpInput = document.createElement('input');
                        mpInput.id = 'sc-mp-input';
                        mpInput.type = 'number';
                        mpInput.step = '0.01';
                        mpInput.value = '0';
                        mpInput.placeholder = '?';
                        mpInput.title = '模拟扫货成本：≥0为MP-?%，负数=直接减价。改后实时重算。';
                        mpInput.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
                        mpInput.addEventListener('input', () => {
                            const currentTbody = findValidTbody();
                            if (currentTbody) {
                                clearTimeout(window._scMpInputTimer);
                                window._scMpInputTimer = setTimeout(() => {
                                    requestAnimationFrame(() => processNewRows(currentTbody, true));
                                }, 250);
                            }
                        });

                        const mpPct = document.createElement('span');
                        mpPct.textContent = '%';
                        mpPct.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'};`;

                        const mpQuickBtn = document.createElement('button');
                        mpQuickBtn.type = 'button';
                        mpQuickBtn.textContent = '4%';
                        mpQuickBtn.title = '快捷填入 MP-4%';
                        mpQuickBtn.style.cssText = `font-size: 12px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#444' : '#e0e0e0'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 5px; cursor: pointer;`;
                        mpQuickBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            mpInput.value = '4';
                            mpInput.dispatchEvent(new Event('input', { bubbles: true }));
                        });
                        const mpClearBtn = document.createElement('button');
                        mpClearBtn.type = 'button';
                        mpClearBtn.textContent = '清空';
                        mpClearBtn.title = '清空 MP 值';
                        mpClearBtn.style.cssText = `font-size: 12px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#444' : '#e0e0e0'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 5px; cursor: pointer;`;
                        mpClearBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            mpInput.value = '0';
                            mpInput.dispatchEvent(new Event('input', { bubbles: true }));
                        });

                        mpGroup.appendChild(mpLabel);
                        mpGroup.appendChild(mpInput);
                        mpGroup.appendChild(mpPct);
                        mpGroup.appendChild(mpQuickBtn);
                        mpGroup.appendChild(mpClearBtn);

                        // --- 新增：高级设置容器（经济周期 + 建筑等级/时长）---
                        const extraControls = document.createElement('span');
                        extraControls.id = 'sc-extra-controls';
                        extraControls.style.cssText = `display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;`;

                        // 周期下拉框
                        const economyLabel = document.createElement('span');
                        economyLabel.textContent = '周期:';
                        economyLabel.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'};`;
                        extraControls.appendChild(economyLabel);

                        const economySelect = document.createElement('select');
                        economySelect.id = 'sc-economy-select';
                        economySelect.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px;`;
                        economySelect.innerHTML = `
                            <option value="">当前</option>
                            <option value="0">萧条</option>
                            <option value="1">平缓</option>
                            <option value="2">景气</option>
                        `;
                        economySelect.addEventListener('change', () => {
                            const currentTbody2 = findValidTbody();
                            if (currentTbody2) {
                                requestAnimationFrame(() => processNewRows(currentTbody2, true));
                            }
                        });
                        extraControls.appendChild(economySelect);

                        // 建筑等级输入框
                        const buildingLevelInput = document.createElement('input');
                        buildingLevelInput.id = 'sc-building-level';
                        buildingLevelInput.type = 'number';
                        buildingLevelInput.min = '1';
                        buildingLevelInput.step = '1';
                        buildingLevelInput.value = localStorage.getItem('sc_building_level') || '100';
                        buildingLevelInput.title = '建筑等级';
                        buildingLevelInput.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
                        buildingLevelInput.addEventListener('input', () => {
                            const raw = parseInt(buildingLevelInput.value);
                            const v = (raw >= 1 && Number.isFinite(raw)) ? raw : 1;
                            localStorage.setItem('sc_building_level', v);
                            updateGlobalSimulation();
                        });
                        buildingLevelInput.addEventListener('change', () => {
                            const raw = parseInt(buildingLevelInput.value);
                            const v = (raw >= 1 && Number.isFinite(raw)) ? raw : 1;
                            localStorage.setItem('sc_building_level', v);
                            updateGlobalSimulation();
                        });
                        extraControls.appendChild(buildingLevelInput);

                        const bldLabel1 = document.createElement('span');
                        bldLabel1.textContent = '级建筑运行';
                        bldLabel1.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'}; white-space: nowrap;`;
                        extraControls.appendChild(bldLabel1);

                        // 建筑运行时长输入框
                        const buildingHoursInput = document.createElement('input');
                        buildingHoursInput.id = 'sc-building-hours';
                        buildingHoursInput.type = 'number';
                        buildingHoursInput.min = '0';
                        buildingHoursInput.step = '0.01';
                        buildingHoursInput.value = localStorage.getItem('sc_building_hours') || '24';
                        buildingHoursInput.title = '运行时长（小时）';
                        buildingHoursInput.style.cssText = `font-size: 11px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#333' : '#fff'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
                        buildingHoursInput.addEventListener('input', () => {
                            const raw = parseFloat(buildingHoursInput.value);
                            const v = (raw > 0 && Number.isFinite(raw)) ? Math.round(raw * 100) / 100 : 0;
                            localStorage.setItem('sc_building_hours', v);
                            updateGlobalSimulation();
                        });
                        buildingHoursInput.addEventListener('change', () => {
                            const raw = parseFloat(buildingHoursInput.value);
                            const v = (raw > 0 && Number.isFinite(raw)) ? Math.round(raw * 100) / 100 : 0;
                            localStorage.setItem('sc_building_hours', v);
                            updateGlobalSimulation();
                        });
                        extraControls.appendChild(buildingHoursInput);

                        const bldLabel2 = document.createElement('span');
                        bldLabel2.textContent = 'H';
                        bldLabel2.style.cssText = `font-size: 11px; color: ${d7 ? '#aaa' : '#666'};`;
                        extraControls.appendChild(bldLabel2);

                        // --- 小屏视图切换：把基本控件包一层，与 extraControls 互斥显示 ---
                        const basicGroup = document.createElement('span');
                        basicGroup.id = 'sc-basic-group';
                        basicGroup.style.cssText = `display: inline-flex; align-items: center; gap: ${isNarrow7 ? '2px' : '8px'}; flex-wrap: wrap;`;
                        basicGroup.appendChild(toggleBtn);
                        basicGroup.appendChild(btnSettings);
                        basicGroup.appendChild(mpGroup);

                        // --- 切换按钮（仅小屏可见）---
                        const toggleExtraBtn = document.createElement('button');
                        toggleExtraBtn.type = 'button';
                        toggleExtraBtn.textContent = '⇆';
                        toggleExtraBtn.title = '切换高级设置（经济周期/建筑等级）';
                        toggleExtraBtn.style.cssText = `font-size: 12px; color: ${d7 ? '#efefef' : '#333'}; background: ${d7 ? '#444' : '#e0e0e0'}; border: 1px solid ${d7 ? '#555' : '#bbb'}; border-radius: 3px; padding: 1px 5px; cursor: pointer; display: ${isNarrow7 ? 'inline-block' : 'none'}; flex-shrink: 0;`;

                        // 小屏默认：基本可见，高级隐藏
                        if (isNarrow7) {
                            extraControls.style.display = 'none';
                        }

                        toggleExtraBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const bg = document.getElementById('sc-basic-group');
                            const ec = document.getElementById('sc-extra-controls');
                            if (!bg || !ec) return;
                            const showingBasic = bg.style.display !== 'none';
                            if (showingBasic) {
                                bg.style.display = 'none';
                                ec.style.display = 'inline-flex';
                                toggleExtraBtn.textContent = '↩';
                                toggleExtraBtn.title = '返回基本设置';
                            } else {
                                bg.style.display = 'inline-flex';
                                ec.style.display = 'none';
                                toggleExtraBtn.textContent = '⇆';
                                toggleExtraBtn.title = '切换高级设置（经济周期/建筑等级）';
                            }
                        });

                        infoHeader.appendChild(basicGroup);
                        infoHeader.appendChild(extraControls);
                        infoHeader.appendChild(toggleExtraBtn);
                        summaryDisplay.appendChild(infoHeader);

                        // 动态结果区（由 renderUI 填充）
                        const simContent = document.createElement('div');
                        simContent.id = 'sc-sim-content';
                        simContent.innerHTML = `<div style="color:${d7 ? '#888' : '#777'};font-size:12px;text-align:center;padding:8px;">等待数据加载…</div>`;
                        summaryDisplay.appendChild(simContent);

                        container.appendChild(summaryDisplay);

                        // 小屏幕：通过窗口宽度判断，≤991px 为小屏，需要滚动到表格底部
                        if (window.innerWidth <= 991) {
                            setTimeout(() => {
                                const rows = tbody.querySelectorAll('tr');
                                const lastRow = rows[rows.length - 1];
                                if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }, 200);
                        }

                        // 标记已完成注入
                        form.setAttribute('data-market-calc-initialized', 'true');
                    }

                    // 5. 标记初始化完成（必须在 processNewRows 之前设置，避免重复调用）
                    _initDone = true;

                    // 6. 初始执行：此时确认为零售，直接处理
                    processNewRows(tbody);

                    // 7. 开启表格行监听（使用模块级变量，确保断开旧的）
                    if (_tableObserver) _tableObserver.disconnect();
                    _tableObserver = new MutationObserver(() => {
                        requestAnimationFrame(() => processNewRows(tbody));
                    });
                    _tableObserver.observe(tbody, { childList: true });

                    // 8. 初始化成功，停止全局 document 监听
                    if (_globalObserver) {
                        _globalObserver.disconnect();
                        _globalObserver = null;
                    }
                };

                // --- 核心优化 2: 仅在零售模式下启动监听 ---
                tryInit();

                // 如果 tryInit 已标记完成（初始化已存在），不再创建全局 observer
                if (!_initDone) {
                    // 使用模块级 _globalObserver，确保之前已断开
                    _globalObserver = new MutationObserver((mutations) => {
                        // 如果已经初始化完成，不再执行昂贵的 tryInit
                        if (_initDone) return;
                        for (const mutation of mutations) {
                            if (mutation.addedNodes.length) {
                                tryInit();
                                break;
                            }
                        }
                    });
                    _globalObserver.observe(document.body, { childList: true, subtree: true });
                }
            }
        };
    })();

    // ======================
    // 模块8：合同计算时利润 使用SimcompaniesRetailCalculation_{realmId} SimcompaniesConstantsData
    // ======================
    const incomingContractsHandler = (function () {
        let cardIdCounter = 0;
        const pendingCards = new Map(); // cardId -> DOM element
        let processDebounceTimer = null; // 防抖计时器
        let activeObserver = null;       // 当前活跃的 MutationObserver
        let checkPageTimer = null;       // 页面轮询计时器（SAP 离开检测）

        // Worker 代码 —— 批量处理版本：一次接收所有卡片，共享数据只传一次
        const workerCode = `
        self.onmessage = function(e) {
            const { orders, shared, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
            if (!orders || !orders.length) { self.postMessage([]); return; }

            const lwe = shared.SCD.retailInfo;
            const zn = shared.SCD.data;
            const SRC = shared.SRC;

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

            const results = [];
            const size = 1;

            for (const order of orders) {
                const { cardId, price, quantity, quality, resourceId, ctx } = order;

                let currentPrice = price,
                    maxProfit = -Infinity;

                while (currentPrice > 0) {
                    const modeledData = wv(ctx.economyState, resourceId, ctx.forceQuality ?? null);
                    const w = zL(
                        ctx.buildingKind,
                        modeledData,
                        quantity,
                        ctx.v,
                        currentPrice,
                        ctx.forceQuality === void 0 ? quality : 0,
                        ctx.saturation,
                        SRC.acceleration,
                        size,
                        ctx.weather
                    );
                    const revenue = currentPrice * quantity;
                    const wagesTotal = Math.ceil(w * ctx.wages * SRC.acceleration * ctx.b / 3600);
                    const secondsToFinish = w;
                    const profit = (!secondsToFinish || secondsToFinish <= 0)
                        ? NaN
                        : (revenue - price * quantity - wagesTotal) / secondsToFinish;

                    if (!secondsToFinish || secondsToFinish <= 0) break;
                    if (profit > maxProfit) {
                        maxProfit = profit;
                    }

                    if (currentPrice < 8) {
                        currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                    } else if (currentPrice < 2001) {
                        currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                    } else {
                        currentPrice = Math.round(currentPrice + 1);
                    }
                }

                results.push({ cardId, maxProfit });
            }

            self.postMessage(results);
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

        // Worker 批量结果回调：立即注入时利润（不等待 MP 数据）
        profitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { cardId, maxProfit } = item;
                const card = pendingCards.get(cardId);
                if (!card) continue;
                pendingCards.delete(cardId);
                // 立即显示时利润，MP 部分后续由 MP 数据回调填充
                injectOrUpdateProfit(card, maxProfit * 3600);
            }
        };

        // =====================
        // 市场最大时利专用 Worker
        // =====================
        const marketWorkerCode = `
        self.onmessage = function(e) {
            const { orders, shared, customBonuses, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
            if (!orders || !orders.length) { self.postMessage([]); return; }

            const lwe = shared.SCD.retailInfo;
            const zn = shared.SCD.data;
            const SRC = shared.SRC;

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

            function buildCtx(resourceId, quality, isCustomEnabled, adminBonus, saleBonus) {
                const resource = parseInt(resourceId);
                let skillCMO, skillCOO;
                if (isCustomEnabled && adminBonus != null && saleBonus != null) {
                    skillCMO = saleBonus;
                    skillCOO = adminBonus;
                } else {
                    skillCMO = SRC.saleBonus;
                    skillCOO = SRC.adminBonus;
                }
                const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
                const buildingKind = Object.entries(zn.SALES).find(([, ids]) =>
                    ids.includes(resource)
                )?.[0];
                const salaryModifier = shared.SCD.buildingsSalaryModifier?.[buildingKind];
                const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);
                let saturation;
                if (resource === 150) {
                    const list = SRC.ResourcesRetailInfo || [];
                    const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                    saturation = m150?.saturation;
                } else {
                    const list = SRC.ResourcesRetailInfo || [];
                    const m = list.find(item => item.dbLetter === resource);
                    saturation = m?.saturation;
                }
                const resourceDetail = shared.SCD.constantsResources?.[resource];
                const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                    ? SRC.sellingSpeedMultiplier : undefined;
                const forceQuality = (resource === 150) ? quality : undefined;
                const v = salesModifierWithRecreationBonus + skillCMO;
                const b = Ul(SRC.administration, skillCOO);
                return {
                    economyState: SRC.economyState, buildingKind, wages,
                    saturation, weather, forceQuality, v, b
                };
            }

            // 对单个价格跑完整售价寻优，返回每小时利润（null 表示无法计算）
            function calcSingle(price, quantity, quality, resourceId, ctx) {
                const resource = parseInt(resourceId);
                const forceQ = (resource === 150) ? quality : undefined;
                const size = 1;
                let currentPrice = price;
                let maxProfit = -Infinity;
                while (currentPrice > 0) {
                    const modeledData = wv(ctx.economyState, resourceId, forceQ ?? null);
                    const w = zL(
                        ctx.buildingKind, modeledData, quantity, ctx.v,
                        currentPrice,
                        forceQ === void 0 ? quality : 0,
                        ctx.saturation, SRC.acceleration, size, ctx.weather
                    );
                    const revenue = currentPrice * quantity;
                    const wagesTotal = Math.ceil(w * ctx.wages * SRC.acceleration * ctx.b / 3600);
                    const secondsToFinish = w;
                    const profit = (!secondsToFinish || secondsToFinish <= 0)
                        ? NaN
                        : (revenue - price * quantity - wagesTotal) / secondsToFinish;
                    if (!secondsToFinish || secondsToFinish <= 0) break;
                    if (profit > maxProfit) {
                        maxProfit = profit;
                    }
                    if (currentPrice < 8) {
                        currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                    } else if (currentPrice < 2001) {
                        currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                    } else {
                        currentPrice = Math.round(currentPrice + 1);
                    }
                }
                return maxProfit > -Infinity ? maxProfit * 3600 : null;
            }

            const results = [];
            for (const order of orders) {
                const { cardId, marketData, targetQuality, quantity, resourceId } = order;
                if (!marketData || !marketData.length) {
                    results.push({ cardId, maxProfit: null, bestPrice: null, bestQuality: null });
                    continue;
                }

                const cb = customBonuses || {};
                const ctx = buildCtx(resourceId, targetQuality,
                    cb.isCustomEnabled === true, cb.adminBonus, cb.saleBonus);

                const resource = parseInt(resourceId);
                const exactOnly = (resource === 150);

                // 按品质分组，每组 {price, qty} 升序（用市场挂单自身数量计算）
                const qualityGroups = new Map();
                for (const entry of marketData) {
                    const p = parseFloat(entry.price);
                    const q = entry.quality;
                    const qty = parseFloat(entry.quantity) || 1;
                    if (p <= 0) continue;
                    if (exactOnly && q !== targetQuality) continue;
                    if (!qualityGroups.has(q)) qualityGroups.set(q, []);
                    qualityGroups.get(q).push({ price: p, qty });
                }
                for (const entries of qualityGroups.values()) {
                    entries.sort((a, b) => a.price - b.price);
                }

                let bestProfit = -Infinity;
                let bestPrice = null;
                let bestQuality = null;

                for (const [quality, entries] of qualityGroups) {
                    // 最低价先算 — 负利润则跳过整个品质
                    const cheapestProfit = calcSingle(entries[0].price, entries[0].qty, quality, resourceId, ctx);
                    if (cheapestProfit === null || cheapestProfit < 0) continue;
                    if (cheapestProfit > bestProfit) {
                        bestProfit = cheapestProfit;
                        bestPrice = entries[0].price;
                        bestQuality = quality;
                    }
                    // 其余价格逐个严格计算
                    for (let i = 1; i < entries.length; i++) {
                        const { price: p, qty } = entries[i];
                        const entryProfit = calcSingle(p, qty, quality, resourceId, ctx);
                        if (entryProfit === null || entryProfit < 0) break;
                        if (entryProfit > bestProfit) {
                            bestProfit = entryProfit;
                            bestPrice = p;
                            bestQuality = quality;
                        }
                    }
                }

                results.push({
                    cardId,
                    maxProfit: bestProfit > -Infinity ? bestProfit : null,
                    bestPrice: bestPrice,
                    bestQuality: bestQuality
                });
            }

            self.postMessage(results);
        };
        `;
        const marketProfitWorker = new Worker(URL.createObjectURL(new Blob([marketWorkerCode], { type: 'application/javascript' })));
        let marketCardIdCounter = 1000000; // 独立计数器，避免与合同 cardId 冲突
        const pendingMarketCards = new Map(); // cardId -> { card, mpPercent, mpValue, mpNotes }

        marketProfitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { cardId, maxProfit, bestPrice, bestQuality } = item;
                const entry = pendingMarketCards.get(cardId);
                if (!entry) continue;
                pendingMarketCards.delete(cardId);

                const { card, mpPercent, mpValue, mpNotes } = entry;
                card.__marketMaxProfit = maxProfit;
                card.__marketMaxPrice = bestPrice;
                card.__marketMaxQuality = bestQuality;
                // 刷新卡片显示
                updateCardMpDisplay(card, mpPercent, mpValue, mpNotes);
            }
        };

        // --- 预计算每个合同的共享上下文（从 Worker 移到主线程） ---
        function buildOrderContext(resourceId, quality, SCD, SRC, isCustomEnabled, SSB) {
            const resource = parseInt(resourceId);
            const zn = SCD.data;

            // 经济周期
            const economyState = SRC.economyState;

            // 高管加成（支持自定义覆盖）
            let skillCMO, skillCOO;
            if (isCustomEnabled && SSB) {
                skillCMO = SSB.saleBonus;
                skillCOO = SSB.adminBonus;
            } else {
                skillCMO = SRC.saleBonus;
                skillCOO = SRC.adminBonus;
            }

            const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;

            // 建筑类型 & 工资
            const buildingKind = Object.entries(zn.SALES).find(([, ids]) =>
                ids.includes(resource)
            )?.[0];
            const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
            const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);

            // 饱和度（仅资源150=树按品质区分）
            const list = SRC.ResourcesRetailInfo || [];
            let saturation;
            if (resource === 150) {
                const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                saturation = m150?.saturation;
            } else {
                const m = list.find(item => item.dbLetter === resource);
                saturation = m?.saturation;
            }

            // 天气（仅夏季物品）
            const resourceDetail = SCD.constantsResources?.[resource];
            const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                ? SRC.sellingSpeedMultiplier : undefined;

            // forceQuality（仅资源150需要）
            const forceQuality = (resource === 150) ? quality : undefined;

            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = (() => {
                const r = SRC.administration || 1;
                return r - (r - 1) * skillCOO / 100;
            })();

            return {
                economyState, buildingKind, wages,
                saturation, weather, forceQuality,
                v, b
            };
        }

        // --- 计算单张卡片的 MP 信息（游戏机制：高Q可替代低Q，但低Q不可替代高Q） ---
        function calcMpInfo(cardData, marketData, status) {
            const resourceId = parseInt(cardData.dbLetter);
            const targetQuality = (cardData.quality !== null && cardData.quality !== undefined) ? cardData.quality : 0;

            if (status === 'error') {
                return { mpPercent: null, mpValue: null, mpNotes: 'MP请求失败', mpBestQuality: null };
            }

            const expiredNote = (status === 'fallback_expired') ? ' (缓存已过期)' : '';

            if (!marketData || !Array.isArray(marketData) || marketData.length === 0) {
                return { mpPercent: null, mpValue: null, mpNotes: '市场无对应品质' + expiredNote, mpBestQuality: null };
            }

            // ID=150（树）只能精确匹配品质
            const exactOnly = (resourceId === 150);

            let bestPrice = Infinity;
            let bestQuality = null;

            if (exactOnly) {
                // 仅匹配同品质
                const sameQ = marketData.filter(o => o.quality === targetQuality && o.price > 0);
                if (sameQ.length > 0) {
                    bestPrice = Math.min(...sameQ.map(o => parseFloat(o.price)));
                    bestQuality = targetQuality;
                }
            } else {
                // 遍历 ≥ 合同品质的所有订单（高Q可替代低Q使用）
                for (const order of marketData) {
                    const p = parseFloat(order.price);
                    if (p > 0 && order.quality >= targetQuality && p < bestPrice) {
                        bestPrice = p;
                        bestQuality = order.quality;
                    }
                }
            }

            if (bestPrice !== Infinity && bestPrice > 0 && cardData.unitPrice > 0) {
                const mpPercent = ((bestPrice - cardData.unitPrice) / bestPrice) * 100;
                let mpNotes = (bestQuality !== targetQuality) ? `参考Q${bestQuality}价` : null;
                if (expiredNote) {
                    mpNotes = mpNotes ? `${mpNotes}${expiredNote}` : '缓存数据';
                }
                return { mpPercent, mpValue: bestPrice, mpNotes, mpBestQuality: bestQuality };
            }

            return { mpPercent: null, mpValue: null, mpNotes: '市场无对应品质' + expiredNote, mpBestQuality: null };
        }

        // --- 批量处理所有卡片（时利润与 MP 分离：时利润立即发送 Worker，MP 后台拉取） ---
        async function processAllCards(cards, forceReset = false) {
            if (!cards || cards.length === 0) return;

            const realmId = getRealmIdFromLink();
            const constantsKey = 'SimcompaniesConstantsData';
            const regionKey = `SimcompaniesRetailCalculation_${realmId}`;

            // 1. 检查数据是否就绪，否则触发初始化后重试
            if (!localStorage.getItem(constantsKey) || !localStorage.getItem(regionKey)) {
                try {
                    const constData = await constantsData.initialize();
                    Storage.save('constants', constData);
                    const regionData = await RegionData.fetchFullRegionData();
                    Storage.save('region', regionData);
                } catch (err) {
                    console.error('[合同批量] 数据初始化失败:', err);
                    return;
                }
            }

            const SCD = JSON.parse(localStorage.getItem(constantsKey));
            const SRC = JSON.parse(localStorage.getItem(regionKey));
            if (!SCD || !SRC) return;

            // 2. 读取自定义开关
            const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;
            let SSB = null;
            if (isCustomEnabled) {
                const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
                try { SSB = JSON.parse(localStorage.getItem(bonusKey)); } catch (e) { SSB = null; }
            }

            const EXCLUDED_IDS = [91, 94, 95, 96, 97, 99];

            // 3. 解析所有卡片，收集有效数据
            const cardInfos = [];
            const uniqueResourceIds = new Set();

            for (const card of cards) {
                if (!forceReset && card.hasAttribute('data-found') && !card.hasAttribute('data-retry')) continue;

                const data = parseContractCard(card);
                if (!data || !data.dbLetter) continue;

                const resourceId = parseInt(data.dbLetter);

                card.setAttribute('data-found', 'true');
                card.removeAttribute('data-retry');

                if (EXCLUDED_IDS.includes(resourceId)) {
                    // 如果在排除列表中，直接在此判定是否为高价合同（因为它们只支持单独设置绝对值，且无MP，无需后续处理）
                    checkAndApplyDoubleConfirm(card);
                    continue;
                }

                const isRetail = Object.values(SCD.data.SALES).some(arr => arr.includes(resourceId));

                // 标记 MP 待处理（时利润先展示）
                if (isRetail) card.__mpPending = true;

                cardInfos.push({ card, data, isRetail });
                uniqueResourceIds.add(data.dbLetter);
            }

            if (cardInfos.length === 0) return;

            // === 流程 A：时利润 — 立即发送给 Worker（不等待 MP 数据！） ===
            const retailOrders = [];
            for (const { card, data, isRetail } of cardInfos) {
                if (isRetail) {
                    const ctx = buildOrderContext(data.dbLetter, data.quality, SCD, SRC, isCustomEnabled, SSB);
                    const cardId = cardIdCounter++;
                    pendingCards.set(cardId, card);
                    retailOrders.push({
                        cardId,
                        price: data.unitPrice,
                        quantity: data.quantity,
                        quality: data.quality,
                        resourceId: data.dbLetter,
                        ctx
                    });
                }
            }
            if (retailOrders.length > 0) {
                profitWorker.postMessage({
                    orders: retailOrders,
                    shared: { SCD, SRC },
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            }

            // 为非零售物品提前注入 MP 占位符（与时利润计算并行展示）
            for (const { card, isRetail } of cardInfos) {
                if (!isRetail) {
                    card.__mpPending = true;
                    injectMpPlaceholder(card);
                }
            }

            // === 流程 B：MP 数据 — 后台拉取，完成后更新显示 ===
            fetchMpDataAndUpdate(cardInfos, realmId, SCD, SRC);
        }

        // --- 后台拉取 MP 数据并更新卡片显示（与利润计算并行） ---
        async function fetchMpDataAndUpdate(cardInfos, realmId, SCD, SRC) {
            // 1. 收集唯一资源ID
            const uniqueIds = new Set();
            for (const { data } of cardInfos) {
                if (data.dbLetter) uniqueIds.add(data.dbLetter);
            }
            if (uniqueIds.size === 0) return;

            // 2. 并行获取所有市场数据
            const marketDataMap = {};
            const marketPromises = [...uniqueIds].map(async (rid) => {
                marketDataMap[rid] = await getMarketDataForResource(realmId, rid);
            });
            await Promise.all(marketPromises);

            // 3. 计算并更新每张卡片的 MP 信息
            const marketMaxProfitEnabled = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();

            // 收集需要发送给市场最大时利 Worker 的订单
            pendingMarketCards.clear(); // 清理上一次计算的残留
            const marketOrders = [];
            let customBonuses = null;
            if (marketMaxProfitEnabled) {
                const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;
                if (isCustomEnabled) {
                    const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
                    try {
                        const SSB = JSON.parse(localStorage.getItem(bonusKey));
                        if (SSB) {
                            customBonuses = { isCustomEnabled: true, adminBonus: SSB.adminBonus, saleBonus: SSB.saleBonus };
                        }
                    } catch (e) { }
                }
                if (!customBonuses) {
                    customBonuses = { isCustomEnabled: false, adminBonus: null, saleBonus: null };
                }
            }

            for (const { card, data, isRetail } of cardInfos) {
                const marketResult = marketDataMap[data.dbLetter] || { data: null, status: 'error' };
                const mpInfo = calcMpInfo(data, marketResult.data, marketResult.status);
                card.__resourceId = data.dbLetter;  // 供跳转链接使用
                card.__mpPercent = mpInfo.mpPercent;
                card.__mpValue = mpInfo.mpValue;
                card.__mpBestQuality = mpInfo.mpBestQuality;
                if (mpInfo.mpNotes) card.__mpNotes = mpInfo.mpNotes;
                card.__mpPending = false;

                // 如果开启了"显示市场最大时利"，收集订单稍后发送给 Worker
                if (marketMaxProfitEnabled && isRetail && marketResult.data && marketResult.data.length > 0) {
                    const cid = marketCardIdCounter++;
                    pendingMarketCards.set(cid, {
                        card,
                        mpPercent: mpInfo.mpPercent,
                        mpValue: mpInfo.mpValue,
                        mpNotes: mpInfo.mpNotes
                    });
                    marketOrders.push({
                        cardId: cid,
                        marketData: marketResult.data,
                        targetQuality: (data.quality !== null && data.quality !== undefined) ? data.quality : 0,
                        quantity: data.quantity,
                        resourceId: data.dbLetter
                    });
                    // 暂时置空，等 Worker 回调填充
                    card.__marketMaxProfit = null;
                } else {
                    card.__marketMaxProfit = null;
                }

                // 更新卡片上的 MP 显示区域（市场最大时利暂未算出，先显示 MP-%）
                updateCardMpDisplay(card, mpInfo.mpPercent, mpInfo.mpValue, mpInfo.mpNotes);
            }

            // 发送市场最大时利订单给 Worker（异步计算）
            if (marketOrders.length > 0) {
                marketProfitWorker.postMessage({
                    orders: marketOrders,
                    shared: { SCD, SRC },
                    customBonuses: customBonuses,
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            }
        }

        function init() {
            // 先清理上一次遗留的 observer / timer
            cleanupAll();

            const isOnIncomingPage = () => /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);

            checkPageTimer = setInterval(() => {
                if (!isOnIncomingPage()) {
                    clearInterval(checkPageTimer);
                    checkPageTimer = null;
                    removeWarningNotice();
                    cleanupAll();
                    return;
                }

                const contractCards = document.querySelectorAll('div[tabindex="0"]');
                if (contractCards.length > 0) {
                    clearInterval(checkPageTimer);
                    checkPageTimer = null;
                    insertWarningNotice();
                    processAllCards([...contractCards]);
                    startMutationObserver();
                }
            }, 500);
        }

        function cleanupAll() {
            if (activeObserver) {
                activeObserver.disconnect();
                activeObserver = null;
            }
            if (checkPageTimer) {
                clearInterval(checkPageTimer);
                checkPageTimer = null;
            }
            if (processDebounceTimer) {
                clearTimeout(processDebounceTimer);
                processDebounceTimer = null;
            }
            // 清理 pendingCards 中残留的 DOM 引用
            pendingCards.clear();
            removeWarningNotice();
        }

        function startMutationObserver() {
            const targetNode = document.querySelectorAll('.row')[1];
            if (!targetNode) {
                console.error('[合同页面处理] 未找到目标容器');
                return;
            }

            const isOnIncomingPage = () => /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);

            activeObserver = new MutationObserver((mutationsList) => {
                // 页面已离开 → 自毁
                if (!isOnIncomingPage()) {
                    cleanupAll();
                    return;
                }

                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        clearTimeout(processDebounceTimer);
                        processDebounceTimer = setTimeout(() => {
                            // 再次检查以防延迟期间页面跳转
                            if (!isOnIncomingPage()) {
                                cleanupAll();
                                return;
                            }
                            const contractCards = document.querySelectorAll('div[tabindex="0"]');
                            processAllCards([...contractCards]);
                        }, 150);
                        break;
                    }
                }
            });

            activeObserver.observe(targetNode, { childList: true, subtree: true });
        }

        function getRealmIdFromLink() {
            const link = document.querySelector('a[href*="/company/"]');
            if (link) {
                const match = link.href.match(/\/company\/(\d+)\//);
                return match ? parseInt(match[1], 10) : null;
            }
            return null;
        }

        // 获取市场数据（含1分钟缓存过期检查）
        async function getMarketDataForResource(realmId, resourceId) {
            const key = `market_all_${realmId}_${resourceId}`;
            const raw = localStorage.getItem(key);

            let cachedData = null;
            let cachedValid = false;

            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    const dataArray = Array.isArray(parsed) ? parsed : parsed.data;
                    cachedData = dataArray;
                    if (parsed.timestamp && (Date.now() - parsed.timestamp < 60000)) {
                        cachedValid = true;
                    }
                } catch (e) { /* 缓存损坏 */ }
            }

            // 如果缓存有效，直接使用它并标记状态为 ok
            if (cachedValid && cachedData) {
                return { data: cachedData, status: 'ok' };
            }

            // 否则尝试拉取最新数据
            try {
                const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                const json = await response.json();
                if (Array.isArray(json)) {
                    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data: json }));
                    return { data: json, status: 'ok' };
                }
            } catch (e) {
                // 请求失败时，如果存在过期缓存则回退，并标记为过期
                if (cachedData) {
                    return { data: cachedData, status: 'fallback_expired' };
                }
            }
            // 完全获取不到且无缓存
            return { data: null, status: 'error' };
        }

        function refreshAllContractProfits() {
            const contractCards = document.querySelectorAll('div[tabindex="0"]');
            contractCards.forEach(card => {
                // 清理旧的显示元素（通过 data-sc-contract 标记识别）
                const oldEl = card.__profitDisplayEl;
                if (oldEl && oldEl.parentNode) oldEl.remove();
                // 兜底：按文本查找旧的 <b> 元素
                card.querySelectorAll('b').forEach(b => {
                    if (b.dataset?.scContract === 'true' ||
                        b.textContent.includes('时利润') ||
                        b.textContent.includes('MP-') ||
                        b.textContent.includes('MP+') ||
                        b.textContent.includes('市场最大时利')) b.remove();
                });
                card.removeAttribute('data-found');
                delete card.__mpNotes;
                delete card.__mpValue;
                delete card.__mpBestQuality;
                delete card.__mpPending;
                delete card.__marketMaxProfit;
                delete card.__marketMaxPrice;
                delete card.__marketMaxQuality;
                delete card.__profitDisplayEl;
            });
            processAllCards([...contractCards], true);
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
            return result;
        }

        // --- 为非零售物品提前注入 MP 占位符（无时利润） ---
        function injectMpPlaceholder(card) {
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));
            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            // 防止重复注入
            if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                priceBox.nextSibling.dataset?.scContract === 'true') return;

            const dPh = DM();
            const el = document.createElement('b');
            el.dataset.scContract = 'true';
            el.style.marginLeft = '8px';
            el.innerHTML = `<span class="sc-mp-part" style="color:${dPh ? '#aaa' : '#888'};white-space:nowrap;">MP计算中...</span>`;
            priceBox.parentNode.insertBefore(el, priceBox.nextSibling);
            card.__profitDisplayEl = el;
        }

        // --- 注入/更新时利润（仅时利润，不含 MP，用于 Worker 回调立即展示） ---
        function injectOrUpdateProfit(card, profitValue) {
            card.__contractProfit = profitValue;  // 供市场最大时利比较用
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));

            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            // 查找是否已有注入元素
            const existingEl = card.__profitDisplayEl ||
                (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                    priceBox.nextSibling.dataset?.scContract === 'true' ? priceBox.nextSibling : null);

            if (existingEl) {
                // 已存在：更新时利润部分
                const profitSpan = existingEl.querySelector('.sc-profit-part');
                if (profitSpan && profitValue !== null && profitValue !== undefined && isFinite(profitValue)) {
                    if (profitValue < 0) {
                        profitSpan.innerHTML = `<span style="color:#ff1744;font-weight:bold;">⚠️时利润:${profitValue.toFixed(2)}</span>`;
                    } else {
                        profitSpan.innerHTML = `时利润:${profitValue.toFixed(2)}`;
                    }
                    return;
                }
                // 结构不完整（MP 先到达了），移除重建
                existingEl.remove();
                if (card.__profitDisplayEl === existingEl) card.__profitDisplayEl = null;
            }

            // 首次注入：仅显示时利润 + MP 占位符
            const profitDisplay = document.createElement('b');
            profitDisplay.dataset.scContract = 'true';
            profitDisplay.style.marginLeft = '8px';

            let profitHtml = '';
            if (profitValue !== null && profitValue !== undefined && isFinite(profitValue)) {
                if (profitValue < 0) {
                    profitHtml = `<span class="sc-profit-part" style="color:#ff1744;font-weight:bold;">⚠️时利润:${profitValue.toFixed(2)}</span>`;
                } else {
                    profitHtml = `<span class="sc-profit-part">时利润:${profitValue.toFixed(2)}</span>`;
                }
            }
            // MP 占位（后续由 updateCardMpDisplay 填充）或直接显示已有 MP 数据
            const dPh = DM();
            let mpHtml = '';
            const mmpEnabled = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();
            if (card.__mpPending) {
                mpHtml = `<span class="sc-mp-part" style="color:${dPh ? '#aaa' : '#888'};white-space:nowrap;"> | MP计算中...</span>`;
            } else {
                // 先构建 MP-% 部分（始终显示）
                let mpPartHtml = '';
                if (card.__mpPercent !== undefined && card.__mpPercent !== null && isFinite(card.__mpPercent)) {
                    const prefix = card.__mpPercent < 0 ? 'MP+' : 'MP-';
                    const mpColor = card.__mpPercent < 0 ? 'color:#ef5350;' : '';
                    mpPartHtml = ` | <span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(card.__mpPercent).toFixed(2)}%`;
                    // 开关开启时追加参考价格
                    if (mmpEnabled && card.__mpValue != null && isFinite(card.__mpValue)) {
                        mpPartHtml += ` ($${card.__mpValue.toFixed(2)})`;
                    }
                    if (card.__mpNotes) {
                        mpPartHtml += `<span style="color:${dPh ? '#aaa' : '#777'};font-size:0.85em;"> ${card.__mpNotes}</span>`;
                    }
                    mpPartHtml += `</span>`;
                }
                // 开关开启时追加市场最大时利
                let mmpPartHtml = '';
                if (mmpEnabled && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
                    const mmp = card.__marketMaxProfit;
                    const mmpColor = mmp < 0 ? 'color:#ff1744;' : 'color:#4caf50;';
                    let mmpNote = '';
                    if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
                        mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
                    }
                    mmpPartHtml = ` | <span style="${mmpColor}white-space:nowrap;">市场最大时利:${mmp.toFixed(2)}`;
                    if (mmpNote) {
                        mmpPartHtml += `<span style="color:${dPh ? '#aaa' : '#777'};font-size:0.85em;">${mmpNote}</span>`;
                    }
                    mmpPartHtml += `</span>`;
                    if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
                        const lnkColor = '#ff9800';
                        mmpPartHtml += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:${lnkColor};text-decoration:none;">📈交易所</a>`;
                    }
                }
                mpHtml = `<span class="sc-mp-part">${mpPartHtml}${mmpPartHtml}</span>`;
            }

            profitDisplay.innerHTML = profitHtml + mpHtml;
            priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
            card.__profitDisplayEl = profitDisplay;
        }

        // --- 更新卡片上的 MP 信息显示 ---
        function updateCardMpDisplay(card, mpPercent, mpValue, mpNotes) {
            const displayEl = card.__profitDisplayEl;
            if (!displayEl) {
                // 如果没有时利润显示元素，创建仅 MP 的显示
                injectHourlyProfitLegacy(card, null, mpPercent, mpValue, mpNotes);
                return;
            }

            // 检查是否开启了"显示更多"
            const marketMaxProfitEnabled = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();

            // 已有时利润元素：更新 MP 部分
            const mpSpan = displayEl.querySelector('.sc-mp-part');
            const hasProfit = !!displayEl.querySelector('.sc-profit-part');
            const sep = hasProfit ? ' | ' : '';
            const dMp = DM();

            // 1. 构建 MP-% 部分（始终显示）
            let mpPartHtml = '';
            if (mpPercent !== null && mpPercent !== undefined && isFinite(mpPercent)) {
                const prefix = mpPercent < 0 ? 'MP+' : 'MP-';
                const mpColor = mpPercent < 0 ? 'color:#ef5350;' : '';
                mpPartHtml = `${sep}<span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(mpPercent).toFixed(2)}%`;
                if (marketMaxProfitEnabled && mpValue != null && isFinite(mpValue)) {
                    mpPartHtml += ` ($${mpValue.toFixed(2)})`;
                }
                if (mpNotes) {
                    mpPartHtml += `<span style="color:${dMp ? '#aaa' : '#777'};font-size:0.85em;"> ${mpNotes}</span>`;
                }
                mpPartHtml += `</span>`;
            } else {
                // 无有效 MP 数据
                if (mpNotes) {
                    mpPartHtml = `${sep}<span style="color:${dMp ? '#aaa' : '#777'};">${mpNotes}</span>`;
                }
            }

            // 2. 开关开启时追加市场最大时利
            let mmpPartHtml = '';
            if (marketMaxProfitEnabled && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
                const mmp = card.__marketMaxProfit;
                const mmpColor = mmp < 0 ? 'color:#ff1744;' : 'color:#4caf50;';
                let mmpNote = '';
                if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
                    mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
                }
                mmpPartHtml = ` | <span style="${mmpColor}white-space:nowrap;">市场最大时利:${mmp.toFixed(2)}`;
                if (mmpNote) {
                    mmpPartHtml += `<span style="color:${dMp ? '#aaa' : '#777'};font-size:0.85em;">${mmpNote}</span>`;
                }
                mmpPartHtml += `</span>`;
                if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
                    mmpPartHtml += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:#ff9800;text-decoration:none;">📈交易所</a>`;
                }
            }

            const mpHtml = mpPartHtml + mmpPartHtml;

            if (mpSpan) {
                mpSpan.innerHTML = mpHtml;
                // 清除占位符遗留的灰色，恢复正常文字颜色
                mpSpan.style.color = '';
            } else {
                // 没有占位 span，追加
                const currentHtml = displayEl.innerHTML;
                displayEl.innerHTML = currentHtml + mpHtml;
            }
            checkAndApplyDoubleConfirm(card);
        }

        // --- 非零售物品的完整注入（仅 MP，无时利润） ---
        function injectHourlyProfitLegacy(card, profitValue, mpPercent, mpValue, mpNotes) {
            const infoDiv = Array.from(card.querySelectorAll('div'))
                .find(div => div.textContent?.includes('@') && div.querySelector('b'));

            const priceBox = infoDiv?.querySelector('b');
            if (!priceBox) return;

            if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE &&
                priceBox.nextSibling.dataset?.scContract === 'true') {
                return;
            }

            const profitDisplay = document.createElement('b');
            profitDisplay.dataset.scContract = 'true';
            profitDisplay.style.marginLeft = '8px';

            let displayText = '';
            if (profitValue !== null && profitValue !== undefined && isFinite(profitValue)) {
                if (profitValue < 0) {
                    displayText = `<span style="color:#ff1744;font-weight:bold;">⚠️时利润:${profitValue.toFixed(2)}</span>`;
                } else {
                    displayText = `时利润:${profitValue.toFixed(2)}`;
                }
            }

            const dMpNote = DM();
            // 检查是否开启了"显示更多"
            const mmpEnabledLegacy = (() => {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['marketMaxProfitToggle'] === true;
            })();

            // 1. 构建 MP-% 部分（始终显示，参考价格仅在开关开启时显示）
            if (mpPercent !== null && mpPercent !== undefined && isFinite(mpPercent)) {
                if (displayText) displayText += ' |';
                const prefix = mpPercent < 0 ? 'MP+' : 'MP-';
                const mpColor = mpPercent < 0 ? 'color:#ef5350;' : '';
                let mpBaseText = `<span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(mpPercent).toFixed(2)}%`;
                if (mmpEnabledLegacy && mpValue != null && isFinite(mpValue)) {
                    mpBaseText += ` ($${mpValue.toFixed(2)})`;
                }
                if (mpNotes) {
                    mpBaseText += `<span style="color:${dMpNote ? '#aaa' : '#777'};font-size:0.85em;"> ${mpNotes}</span>`;
                }
                mpBaseText += `</span>`;
                displayText += mpBaseText;
            } else if (mpNotes) {
                if (displayText) displayText += ' |';
                displayText += `<span style="color:${dMpNote ? '#aaa' : '#777'};">${mpNotes}</span>`;
            }

            // 2. 开关开启时追加市场最大时利
            if (mmpEnabledLegacy && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
                if (displayText) displayText += ' |';
                const mmp = card.__marketMaxProfit;
                const mmpColor = mmp < 0 ? 'color:#ff1744;' : 'color:#4caf50;';
                let mmpNote = '';
                if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
                    mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
                }
                let mmpText = `<span style="${mmpColor}white-space:nowrap;">市场最大时利:${mmp.toFixed(2)}`;
                if (mmpNote) {
                    mmpText += `<span style="color:${dMpNote ? '#aaa' : '#777'};font-size:0.85em;">${mmpNote}</span>`;
                }
                mmpText += `</span>`;
                if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
                    mmpText += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:#ff9800;text-decoration:none;">📈交易所</a>`;
                }
                displayText += mmpText;
            }

            if (!displayText) return;
            profitDisplay.innerHTML = displayText;
            priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
            card.__profitDisplayEl = profitDisplay;
        }

        // --- 保留旧签名兼容（非零售物品从 MP 回调调用） ---
        function injectHourlyProfit(card, profitValue, mpPercent) {
            const mpValue = card.__mpValue || null;
            const mpNotes = card.__mpNotes || null;
            injectHourlyProfitLegacy(card, profitValue, mpPercent, mpValue, mpNotes);
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

                const isNarrow8 = window.innerWidth <= 576;
                const d8 = DM();
                const tip = document.createElement('div');
                tip.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: ${isNarrow8 ? '6px 8px' : '8px'};
                    color: ${d8 ? '#aaa' : '#777'};
                    font-size: ${isNarrow8 ? '11px' : '13px'};
                    width: 100%;
                `;
                tip.dataset.warningText = 'true';

                // 1. 插入文本提示
                const textSpan = document.createElement('span');
                textSpan.textContent = '自动更新数据有延迟，左下可手动更新';
                textSpan.style.cssText = `
                    white-space: ${isNarrow8 ? 'normal' : 'nowrap'};
                    flex: ${isNarrow8 ? '1 1 100%' : '0 0 auto'};
                `;
                tip.appendChild(textSpan);

                // 2. 按钮组容器
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: ${isNarrow8 ? '4px 6px' : '6px'};
                    flex: 1 1 auto;
                `;

                // 2a. 开关按钮
                const toggle = createGlobalCustomToggle(
                    'executiveCustomToggle',
                    '自定义',
                    { buttonClass: 'btn btn-primary' },
                    (isEnabled) => {
                        refreshAllContractProfits();
                    }
                );
                toggle.wrapper.style.marginLeft = "0";
                btnGroup.appendChild(toggle.wrapper);

                // 2b. 自定义数据功能按钮
                const customBtn = document.createElement('button');
                customBtn.type = 'button';
                customBtn.textContent = '自定义高管数据';
                customBtn.style.cssText = `
                    padding: 4px 10px; background: #2196f3;
                    color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                    font-weight: bold; white-space: nowrap; flex-shrink: 0;
                `;
                customBtn.onclick = () => executiveCustomButton.show();
                btnGroup.appendChild(customBtn);

                // 2c. 显示更多信息开关按钮
                const marketToggle = createGlobalCustomToggle(
                    'marketMaxProfitToggle',
                    '显示更多',
                    {},
                    () => {
                        refreshAllContractProfits();
                    }
                );
                marketToggle.wrapper.style.marginLeft = "0";
                btnGroup.appendChild(marketToggle.wrapper);

                // 2d. 预期价格设置按钮
                const priceSetBtn = document.createElement('button');
                priceSetBtn.type = 'button';
                priceSetBtn.textContent = '预期价格';
                priceSetBtn.style.cssText = `
                    padding: 4px 10px; background: #9c27b0;
                    color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                    font-weight: bold; white-space: nowrap; flex-shrink: 0;
                `;
                priceSetBtn.onclick = () => showContractPriceModal();
                btnGroup.appendChild(priceSetBtn);

                tip.appendChild(btnGroup);

                insertTarget.appendChild(tip);
            });
        }

        function removeWarningNotice() {
            const oldNotice = document.querySelector('[data-warning-text]');
            if (oldNotice) oldNotice.remove();
        }

        // ======================
        // 新增：高价合同二级确认相关辅助函数
        // ======================
        const EXCLUDED_IDS = [91, 94, 95, 96, 97, 99];

        function getParsedRules() {
            const settings = JSON.parse(localStorage.getItem('SC_Contract_HighPrice_Settings') || '{"global":"","individual":""}');
            const parsed = {
                global: null,
                individual: new Map()
            };

            if (settings.global) {
                const gVal = settings.global.trim();
                if (gVal) {
                    if (gVal.endsWith('%')) {
                        parsed.global = { type: 'percent', value: parseFloat(gVal.slice(0, -1)) };
                    } else {
                        parsed.global = { type: 'delta', value: parseFloat(gVal) };
                    }
                }
            }

            if (settings.individual) {
                const lines = settings.individual.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const parts = trimmed.split(/[，,]/);
                    if (parts.length !== 3) continue;

                    let itemId = null;
                    const itemKey = parts[0].trim();
                    if (/^\d+$/.test(itemKey)) {
                        itemId = parseInt(itemKey);
                    } else {
                        // 使用全局 resourceIdNameMap 映射中文名字
                        for (const [id, name] of Object.entries(resourceIdNameMap)) {
                            if (name === itemKey) {
                                itemId = parseInt(id);
                                break;
                            }
                        }
                    }

                    if (itemId === null) continue;
                    const quality = parseInt(parts[1].trim());
                    if (isNaN(quality)) continue;

                    const ruleVal = parts[2].trim();
                    let type = 'absolute';
                    let val = parseFloat(ruleVal);

                    if (ruleVal.endsWith('%')) {
                        type = 'percent';
                        val = parseFloat(ruleVal.slice(0, -1));
                    } else if (ruleVal.startsWith('-')) {
                        type = 'delta';
                        val = parseFloat(ruleVal);
                    }

                    parsed.individual.set(`${itemId}_${quality}`, { type, value: val });
                }
            }

            return parsed;
        }

        function isContractHighPrice(card) {
            const data = parseContractCard(card);
            if (!data || !data.dbLetter) return false;

            const itemId = parseInt(data.dbLetter);
            const quality = data.quality !== null ? data.quality : 0;
            const price = data.unitPrice;
            const mpValue = card.__mpValue;

            const rules = getParsedRules();

            // 1. 优先匹配单独规则
            const indivKey = `${itemId}_${quality}`;
            if (rules.individual.has(indivKey)) {
                const rule = rules.individual.get(indivKey);
                if (rule.type === 'absolute') {
                    return price > rule.value;
                } else if (rule.type === 'percent') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue * (1 + rule.value / 100);
                        return price > threshold;
                    }
                    return false;
                } else if (rule.type === 'delta') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue + rule.value;
                        return price > threshold;
                    }
                    return false;
                }
            }

            // 2. 其次匹配全局规则 (排除列表除外)
            if (EXCLUDED_IDS.includes(itemId)) return false;

            if (rules.global) {
                const rule = rules.global;
                if (rule.type === 'percent') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue * (1 + rule.value / 100);
                        return price > threshold;
                    }
                } else if (rule.type === 'delta') {
                    if (mpValue !== undefined && mpValue !== null && isFinite(mpValue)) {
                        const threshold = mpValue + rule.value;
                        return price > threshold;
                    }
                }
            }

            return false;
        }

        function resetAcceptBtn(btn) {
            btn.dataset.confirmed = 'false';
            const span = btn.querySelector('span');
            if (span && btn.__originalText) {
                span.textContent = btn.__originalText;
            }
            if (btn.__originalBg !== undefined) {
                btn.style.backgroundColor = btn.__originalBg;
            } else {
                btn.style.backgroundColor = '';
            }
            btn.style.borderColor = '';
            clearTimeout(btn.__resetTimer);
        }

        function checkAndApplyDoubleConfirm(card) {
            const acceptBtn = card.querySelector('a[aria-label="接受合同"], a.css-14hcbmv');
            if (!acceptBtn) return;

            const isHigh = isContractHighPrice(card);

            if (isHigh) {
                // 卡片边框变红以示警告
                card.style.border = "2px dashed #ff4444";
                card.style.borderRadius = "8px";

                const displayEl = card.__profitDisplayEl;
                if (displayEl && !displayEl.querySelector('.sc-high-price-warning')) {
                    const warningSpan = document.createElement('span');
                    warningSpan.className = 'sc-high-price-warning';
                    warningSpan.style.cssText = 'color:#ff4444; font-weight:bold; margin-left:8px; animation: sc-highprice-blink 1s infinite alternate;';
                    warningSpan.textContent = '[⚠️高价合同]';
                    displayEl.appendChild(warningSpan);

                    if (!document.getElementById('sc-highprice-blink-style')) {
                        const style = document.createElement('style');
                        style.id = 'sc-highprice-blink-style';
                        style.textContent = `
                            @keyframes sc-highprice-blink {
                                0% { opacity: 0.3; }
                                100% { opacity: 1; }
                            }
                        `;
                        document.head.appendChild(style);
                    }
                }

                if (!acceptBtn.__hasHighPriceInterceptor) {
                    acceptBtn.__hasHighPriceInterceptor = true;
                    acceptBtn.dataset.confirmed = 'false';

                    acceptBtn.addEventListener('click', function (e) {
                        if (!isContractHighPrice(card)) {
                            return; // 若非高价则放行
                        }

                        if (acceptBtn.dataset.confirmed !== 'true') {
                            e.stopPropagation();
                            e.preventDefault();

                            acceptBtn.dataset.confirmed = 'true';

                            const span = acceptBtn.querySelector('span');
                            acceptBtn.__originalText = span ? span.textContent : "接受";
                            if (span) span.textContent = acceptBtn.__originalText + "?";

                            acceptBtn.__originalBg = acceptBtn.style.backgroundColor;
                            acceptBtn.style.backgroundColor = '#ff4444';
                            acceptBtn.style.borderColor = '#ff4444';

                            clearTimeout(acceptBtn.__resetTimer);
                            acceptBtn.__resetTimer = setTimeout(() => {
                                resetAcceptBtn(acceptBtn);
                            }, 5000);
                        } else {
                            // 已确认状态，放行原生 click 动作，500ms 后自动复位防止卡死
                            setTimeout(() => {
                                resetAcceptBtn(acceptBtn);
                            }, 500);
                        }
                    }, true); // 捕获阶段拦截
                }
            } else {
                card.style.border = "";
                card.style.borderRadius = "";
                const displayEl = card.__profitDisplayEl;
                if (displayEl) {
                    const warningSpan = displayEl.querySelector('.sc-high-price-warning');
                    if (warningSpan) warningSpan.remove();
                }
                if (acceptBtn.__hasHighPriceInterceptor) {
                    resetAcceptBtn(acceptBtn);
                }
            }
        }

        function showContractPriceModal() {
            if (document.getElementById('sc-contract-price-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'sc-contract-price-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.6); z-index: 22000;
                display: flex; justify-content: center; align-items: center;
            `;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                background: var(--sc-bg); border: 1px solid var(--sc-border);
                border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                width: min(550px, 95vw); max-height: min(650px, 90vh);
                color: var(--sc-fg); font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;
            `;

            wrapper.innerHTML = `
                <div style="padding: 12px 20px; background: #9c27b0; color: white; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: bold; font-size: 15px;">
                    <span>合同预期价格设置</span>
                    <span id="sc-contract-price-close" style="cursor: pointer; font-size: 20px; font-weight: normal; line-height: 1;">&times;</span>
                </div>
                <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; font-weight: bold; font-size: 13px; margin-bottom: 6px; color: var(--sc-fg2);">全局高价判定规则</label>
                        <input id="sc-contract-global-val" type="text" placeholder="例如：-1.8% 或 -0.5 (不填则禁用全局)" style="width: 100%; padding: 8px 12px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" />
                        <span style="font-size: 11px; color: var(--sc-fg3); display: block; margin-top: 4px; line-height: 1.4;">
                            * <b>-?%</b>：合同价格高于 <b>MP * (1 - ?%)</b> 时需要二级确认。<br>
                            * <b>-?</b>：合同价格高于 <b>MP - ?</b> 时需要二级确认。
                        </span>
                    </div>
                    <hr style="border: 0; border-top: 1px solid var(--sc-border2); margin: 5px 0;">
                    <div style="display: flex; flex-direction: column; flex-grow: 1;">
                        <label style="display: block; font-weight: bold; font-size: 13px; margin-bottom: 6px; color: var(--sc-fg2);">单独物品判定规则</label>
                        <div style="display: flex; gap: 8px; font-size: 11px; font-weight: bold; color: var(--sc-fg3); margin-bottom: 5px; padding-right: 32px; box-sizing: border-box;">
                            <span style="flex: 2; padding-left: 2px;">物品名称或ID</span>
                            <span style="flex: 1; text-align: center;">品质</span>
                            <span style="flex: 2; padding-left: 2px;">价格规则 (-1.5% / -0.5 / 1.7)</span>
                        </div>
                        <div id="sc-contract-rules-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 5px; margin-bottom: 10px;">
                            <!-- 动态规则行 -->
                        </div>
                        <button id="sc-contract-add-rule-row" type="button" style="align-self: flex-start; padding: 5px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background-color 0.2s;">+ 添加物品规则</button>
                        <span style="font-size: 11px; color: var(--sc-fg3); display: block; margin-top: 8px; line-height: 1.4;">
                            * 支持直接写绝对价格（如 1.7），或偏离值（-1.5% / -0.5）。<br>
                            * 航空航天终端产品无MP，仅能使用绝对价格
                        </span>
                        <details id="sc-contract-ref-details" style="margin-top: 8px; border: 1px solid var(--sc-border2); border-radius: 6px; padding: 6px 10px; background: var(--sc-bg2); cursor: pointer; user-select: none;">
                            <summary style="font-size: 11px; font-weight: bold; color: var(--sc-fg2); outline: none;">查看物品名称/ID对照参考表 (点击物品可直接填入空行)</summary>
                            <div id="sc-contract-ref-tags" style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; max-height: 100px; overflow-y: auto; cursor: default;">
                                <!-- 标签由 JS 动态生成 -->
                            </div>
                        </details>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; border-top: 1px solid var(--sc-border2); padding-top: 15px;">
                        <button id="sc-contract-price-cancel" style="padding: 8px 16px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background-color 0.2s;">取消</button>
                        <button id="sc-contract-price-save" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background-color 0.2s;">保存</button>
                    </div>
                </div>
            `;

            modal.appendChild(wrapper);

            // 动态创建并注入 datalist 自动完成候选列表
            let datalist = document.getElementById('sc-contract-resource-options');
            if (!datalist) {
                datalist = document.createElement('datalist');
                datalist.id = 'sc-contract-resource-options';
                datalist.innerHTML = Object.values(resourceIdNameMap)
                    .filter(name => name && name !== 'undefined')
                    .map(name => `<option value="${name}"></option>`)
                    .join('');
                modal.appendChild(datalist);
            }

            document.body.appendChild(modal);

            const updateThemeVars = () => {
                const isDark = DM();
                modal.style.setProperty('--sc-bg', theme.bg);
                modal.style.setProperty('--sc-bg2', theme.bg2);
                modal.style.setProperty('--sc-fg', theme.fg);
                modal.style.setProperty('--sc-fg2', theme.fg2);
                modal.style.setProperty('--sc-fg3', theme.fg3);
                modal.style.setProperty('--sc-border', theme.border);
                modal.style.setProperty('--sc-border2', theme.border2);
                modal.style.setProperty('--sc-input-bg', theme.inputBg);
                modal.style.setProperty('--sc-input-fg', theme.inputFg);
            };

            updateThemeVars();

            const themeObserver = new MutationObserver(() => {
                updateThemeVars();
            });
            themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

            const rulesListContainer = document.getElementById('sc-contract-rules-list');

            function addRuleRow(itemVal = '', qualVal = '', ruleVal = '') {
                const row = document.createElement('div');
                row.className = 'sc-contract-rule-row';
                row.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;';

                row.innerHTML = `
                    <input type="text" class="sc-rule-item" list="sc-contract-resource-options" value="${itemVal}" placeholder="如：苹果 或 3" style="flex: 2; min-width: 0; padding: 6px 10px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none;" />
                    <input type="number" class="sc-rule-quality" value="${qualVal}" min="0" max="12" placeholder="0" style="flex: 1; min-width: 0; padding: 6px 5px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none; text-align: center;" />
                    <input type="text" class="sc-rule-value" value="${ruleVal}" placeholder="如：-1.5% 或 1.7" style="flex: 2; min-width: 0; padding: 6px 10px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none;" />
                    <button type="button" class="sc-rule-delete" style="flex: 0 0 24px; height: 24px; padding: 0; background: #e53935; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
                `;

                row.querySelector('.sc-rule-delete').onclick = () => {
                    row.remove();
                };

                rulesListContainer.appendChild(row);
            }

            // 初始化规则列表
            const settings = JSON.parse(localStorage.getItem('SC_Contract_HighPrice_Settings') || '{"global":"","individual":""}');
            document.getElementById('sc-contract-global-val').value = settings.global || '';

            const lines = (settings.individual || '').split('\n');
            let hasRows = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const parts = trimmed.split(/[，,]/);
                if (parts.length === 3) {
                    addRuleRow(parts[0].trim(), parts[1].trim(), parts[2].trim());
                    hasRows = true;
                }
            }

            if (!hasRows) {
                addRuleRow('', '', '');
            }

            document.getElementById('sc-contract-add-rule-row').onclick = (e) => {
                e.preventDefault();
                addRuleRow('', '', '');
            };

            // 动态生成常见物品名称/ID对照表小标签
            const tagsContainer = document.getElementById('sc-contract-ref-tags');
            if (tagsContainer) {
                tagsContainer.innerHTML = '';
                const sortedItems = Object.entries(resourceIdNameMap)
                    .filter(([id, name]) => name && name !== 'undefined')
                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

                for (const [id, name] of sortedItems) {
                    const tag = document.createElement('span');
                    tag.textContent = `${name}(${id})`;
                    tag.title = `点击可直接填入该物品`;
                    tag.style.cssText = `
                        display: inline-block; padding: 2px 6px; background: var(--sc-border2);
                        color: var(--sc-fg); font-size: 11px; border-radius: 4px; cursor: pointer;
                        transition: all 0.2s; border: 1px solid var(--sc-border);
                    `;

                    // 绑定悬停变色效果
                    tag.onmouseenter = () => {
                        tag.style.background = '#9c27b0';
                        tag.style.color = '#fff';
                        tag.style.borderColor = '#9c27b0';
                    };
                    tag.onmouseleave = () => {
                        tag.style.background = 'var(--sc-border2)';
                        tag.style.color = 'var(--sc-fg)';
                        tag.style.borderColor = 'var(--sc-border)';
                    };

                    // 绑定点击填充事件
                    tag.onclick = (event) => {
                        event.preventDefault();
                        const rows = rulesListContainer.querySelectorAll('.sc-contract-rule-row');
                        let targetInput = null;

                        // 优先寻找最后一行空的物品输入框
                        for (let i = rows.length - 1; i >= 0; i--) {
                            const input = rows[i].querySelector('.sc-rule-item');
                            if (input && !input.value.trim()) {
                                targetInput = input;
                                break;
                            }
                        }

                        // 如果全满了，自动开辟新行并填充
                        if (!targetInput) {
                            addRuleRow(name, '', '');
                            const newRows = rulesListContainer.querySelectorAll('.sc-contract-rule-row');
                            targetInput = newRows[newRows.length - 1].querySelector('.sc-rule-item');
                        } else {
                            targetInput.value = name;
                        }

                        if (targetInput) {
                            targetInput.focus();
                            const origBorder = targetInput.style.borderColor;
                            targetInput.style.borderColor = '#4CAF50';
                            setTimeout(() => {
                                targetInput.style.borderColor = origBorder;
                            }, 500);
                        }
                    };

                    tagsContainer.appendChild(tag);
                }
            }

            const closeBtn = document.getElementById('sc-contract-price-close');
            const cancelBtn = document.getElementById('sc-contract-price-cancel');
            const saveBtn = document.getElementById('sc-contract-price-save');

            const closeModal = () => {
                themeObserver.disconnect();
                modal.remove();
            };

            closeBtn.onclick = closeModal;
            cancelBtn.onclick = closeModal;

            saveBtn.onclick = (e) => {
                e.preventDefault();
                const globalInput = document.getElementById('sc-contract-global-val').value.trim();

                // 1. 校验全局
                if (globalInput) {
                    if (!/^-\d+(?:\.\d+)?%?$/.test(globalInput)) {
                        showToast("全局设置格式不正确。请输入类似 -1.8% 或 -0.5 的偏离格式", "error");
                        return;
                    }
                }

                // 2. 校验及组装单独规则行
                const rows = rulesListContainer.querySelectorAll('.sc-contract-rule-row');
                const indivRules = [];

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const itemInput = row.querySelector('.sc-rule-item').value.trim();
                    const qualInput = row.querySelector('.sc-rule-quality').value.trim();
                    const valInput = row.querySelector('.sc-rule-value').value.trim();

                    // 只要物品输入和规则输入均为空，则忽略该行
                    if (!itemInput && !valInput) continue;

                    // 若不完整则报错
                    if (!itemInput || qualInput === "" || !valInput) {
                        showToast(`第 ${i + 1} 行规则信息不完整，请填写所有列或将其删除`, "error");
                        return;
                    }

                    let itemId = null;
                    if (/^\d+$/.test(itemInput)) {
                        itemId = parseInt(itemInput);
                    } else {
                        // 查找物品 ID
                        for (const [id, name] of Object.entries(resourceIdNameMap)) {
                            if (name === itemInput) {
                                itemId = parseInt(id);
                                break;
                            }
                        }
                    }

                    if (itemId === null) {
                        showToast(`第 ${i + 1} 行的物品名称或ID '${itemInput}' 无法识别，请使用物品ID或正确的物品名称`, "error");
                        return;
                    }

                    const quality = parseInt(qualInput);
                    if (isNaN(quality) || quality < 0) {
                        showToast(`第 ${i + 1} 行的品质 '${qualInput}' 必须是正整数`, "error");
                        return;
                    }

                    const isAbsolute = /^\d+(?:\.\d+)?$/.test(valInput);
                    const isOffset = /^-\d+(?:\.\d+)?%?$/.test(valInput);

                    if (!isAbsolute && !isOffset) {
                        showToast(`第 ${i + 1} 行的规则 '${valInput}' 格式不正确。请输入绝对价格（如 1.7）或偏离值（如 -1.5% 或 -0.5）`, "error");
                        return;
                    }

                    if (EXCLUDED_IDS.includes(itemId) && !isAbsolute) {
                        showToast(`物品 ID ${itemId} 没有 MP 数据，只能使用绝对价格作为判定条件（第 ${i + 1} 行）`, "error");
                        return;
                    }

                    indivRules.push(`${itemInput},${quality},${valInput}`);
                }

                // 保存
                localStorage.setItem('SC_Contract_HighPrice_Settings', JSON.stringify({
                    global: globalInput,
                    individual: indivRules.join('\n')
                }));

                showToast("保存成功", "success");
                closeModal();
                refreshAllContractProfits();
            };
        }

        return { init };
    })();

    // ======================
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
                // console.log('[ConstantsAutoUpdater] 基本数据已更新');
            } catch (err) {
                console.error('[ConstantsAutoUpdater] 基本数据更新失败', err);
            }
        };

        const checkAndUpdate = () => {
            if (needsUpdate()) {
                // console.log('[ConstantsAutoUpdater] 开始更新基本数据...');
                update();
            } else {
                // console.log('[ConstantsAutoUpdater] 基本数据是最新的');
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
                // console.log(`[RegionAutoUpdater] 领域数据（${realmId}）已更新`);
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
                // console.log(`[RegionAutoUpdater] 开始更新领域数据（${realmId}）...`);
                update(realmId);
            } else {
                // console.log(`[RegionAutoUpdater] 领域数据（${realmId}）是最新的`);
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
            const d12t = DM();
            const section = document.createElement("div");
            section.style.marginBottom = '8px';

            const header = document.createElement("div");
            header.textContent = (isOpen ? '▼ ' : '▶ ') + title;
            header.style.cssText = `cursor:pointer;font-weight:bold;padding:6px;background:${d12t ? '#444' : '#e8e8e8'};border-radius:4px;user-select:none;color:${d12t ? 'white' : '#333'};`;
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
                    headerRow.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div><div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div><div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">单位成本</div>`;
                    qualityContent.appendChild(headerRow);

                    const allDecayArrays = groupedByQuality[quality].flatMap(i => i.futureDecayArray || i.result || []);

                    if (allDecayArrays.length === 0) {
                        const row = document.createElement("div");
                        row.style.display = "flex";
                        row.style.gap = "16px";
                        row.style.padding = "1px 0";
                        row.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">已全部衰减</div>
                            <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</div>
                            <div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">∞</div>
                        `;
                        qualityContent.appendChild(row);
                    } else {
                        allDecayArrays.forEach(({ amount, time, unitCost }) => {
                            const row = document.createElement("div");
                            row.style.display = "flex";
                            row.style.gap = "16px";
                            row.style.padding = "1px 0";
                            row.innerHTML = `
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                <div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${unitCost === Infinity
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
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div>
                            <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div>
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
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
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
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div>
                            <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div>
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
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
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
                        headerRow.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">剩余量</div><div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">达成时间</div>`;
                        priceContent.appendChild(headerRow);

                        const allDecayArrays = groupedByPrice[price].flatMap(i => i.result || []);

                        if (allDecayArrays.length === 0) {
                            const row = document.createElement("div");
                            row.style.display = "flex";
                            row.style.gap = "16px";
                            row.style.padding = "1px 0";
                            row.innerHTML = `
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">已全部衰减</div>
                                <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</div>
                            `;
                            priceContent.appendChild(row);
                        } else {
                            allDecayArrays.forEach(({ amount, time }) => {
                                const row = document.createElement("div");
                                row.style.display = "flex";
                                row.style.gap = "16px";
                                row.style.padding = "1px 0";
                                row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
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
            const d12 = DM();

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
                background: ${d12 ? '#222' : '#fff'};
                color: ${d12 ? 'white' : '#333'};
                padding: 10px;
                z-index: 9998;
                border-radius: 6px;
                font-size: clamp(12px, 1.5vw, 16px);
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
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
                background: ${d12 ? '#444' : '#e0e0e0'};
                padding: 8px 10px;
                font-weight: bold;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                flex-shrink: 0;
                position: relative;
                color: ${d12 ? 'white' : '#333'};
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
                color: ${d12 ? 'white' : '#333'};
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
                color: ${d12 ? 'white' : '#333'};
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

        // 3. processMarketData（isAll: 是否为 /all/ 端点，使用不同缓存键避免被单品质数据覆盖）
        function processMarketData(json, realm, id, isAll) {
            if (!Array.isArray(json)) return;
            const dataToSave = {
                timestamp: Date.now(),
                data: json
            };
            const prefix = isAll ? 'market_all_' : 'market_';
            localStorage.setItem(`${prefix}${realm}_${id}`, JSON.stringify(dataToSave));
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = args[0];
            const match = typeof url === 'string' && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)\/?($|\?)/);
            const matchAll = typeof url === 'string' && url.match(/\/api\/v3\/market\/all\/(\d+)\/(\d+)\/?($|\?)/);
            const m = match || matchAll;
            if (m) {
                const realm = parseInt(m[1], 10);
                const id = parseInt(m[2], 10);

                const response = await originalFetch(...args);
                response.clone().json().then(json => {
                    processMarketData(json, realm, id, !!matchAll);
                }).catch(() => { });
                return response;
            }
            return originalFetch(...args);
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            try {
                const match = typeof url === 'string' && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)(\/|$|\?)/);
                const matchAll = typeof url === 'string' && url.match(/\/api\/v3\/market\/all\/(\d+)\/(\d+)(\/|$|\?)/);
                const m = match || matchAll;
                if (m) {
                    const realm = parseInt(m[1], 10);
                    const id = parseInt(m[2], 10);
                    this._realm = realm;
                    this._id = id;
                    this._isAll = !!matchAll;
                    this.addEventListener('readystatechange', () => {
                        if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                            try {
                                const json = JSON.parse(this.responseText);
                                processMarketData(json, this._realm, this._id, this._isAll);
                            } catch { }
                        }
                    }, false);
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
            const TARGET_BUTTON_CLASS = 'css-1r3lxky'; //调查雇主按钮
            const PARENT_CONTAINER_CLASS = 'css-1flj9lk'; //包含调查雇主按钮的父级容器
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

            const d14 = DM();
            const panel = document.createElement('div');
            panel.id = 'sc-plugin-panel';
            const baseStyle = `margin-top: 12px; padding: 12px; border-radius: 4px; font-family: sans-serif; font-size: 14px; background-color: ${d14 ? '#2c2c2c' : '#f2f2f2'}; border: 1px solid ${d14 ? '#555' : '#d1d1d1'}; color: ${d14 ? '#efefef' : '#333'};`;

            let contentHtml = "";
            if (isError) {
                const errBg = d14 ? '#3a2e1a' : '#fff3cd';
                const errFg = d14 ? '#f0c040' : '#856404';
                const errBorder = d14 ? '#5a4a20' : '#ffeeba';
                contentHtml = `<div style="color: ${errFg}; background-color: ${errBg}; border: 1px solid ${errBorder}; padding: 8px; border-radius: 4px; font-size: 14px;">` + String.fromCodePoint(9888, 65039) + ` <b>匹配失败：</b> 未在通知中找到此次挖人信息。</div>
                <div style="margin-top:10px; padding:8px; background-color:${d14 ? '#3a2020' : '#fff5f5'}; border:1px solid ${d14 ? '#5a3030' : '#ffcccc'}; border-radius:4px; font-size:14px; color:${d14 ? '#ef5350' : '#c62828'}; line-height:1.4;">
                    <b>⚠️请注意：</b><br>
                    1. 本功能为插件功能，<b>禁止在游戏内聊天室提及</b>。<br>
                    2. 若在发送通知前点开高管，则可能导致此次挖人数据不再显示。<br>
                    3. 若通知内高管被他人抢先招募，<b>在点击"寻找其他候选人"后显示的数据无效</b>。
                </div>`;
            } else {
                const currentRealm = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
                const fg2 = d14 ? '#bbb' : '#555';
                const fg3 = d14 ? '#999' : '#777';
                const fg4 = d14 ? '#aaa' : '#888';
                const border1 = d14 ? '#555' : '#eee';
                const border2 = d14 ? '#444' : '#ddd';
                const border3 = d14 ? '#555' : '#ccc';
                const bg1 = d14 ? '#3a3a3a' : '#e6e6e6';
                const bg2 = d14 ? '#333' : '#fff';
                const bg3 = d14 ? '#333333' : '#e8e8e8';
                const bg4 = d14 ? '#3a2020' : '#fff5f5';
                const bg4border = d14 ? '#5a3030' : '#ffcccc';
                const linkColor = '#2196f3';

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
                    const detailStr = details.length > 0 ? `<span style="color:${fg3}; margin-left:4px;">(${details.join(' ')})</span>` : '';
                    const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm, t.employer.company);
                    return `<div style="padding:2px 0; border-bottom:1px dashed ${border1}; color:${fg2}; font-size:14px;">在 <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}</div>`;
                }).join('') || '无历史培训记录';

                // 2. 从业履历
                const workHistoryHtml = data.workHistory?.map(w => {
                    const isCurrent = !w.end;
                    const cUrl = getCompanyLink(w.employer.realmId ?? currentRealm, w.employer.company);
                    const posName = positionMap(w.position);

                    return `
                    <div style="padding:4px 0; border-bottom:1px solid ${border1}; ${isCurrent ? 'background: ' + bg3 + ';' : ''}">
                        <span style="color:${d14 ? '#ccc' : '#444'}; font-size:14px;">
                            ${isCurrent ? '⭐ ' : ''}在
                            <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none; font-weight:${isCurrent ? 'bold' : 'normal'};">${w.employer.company}</a>
                            担任 <b>${w.daysActive}</b> 天的 <b>${posName}</b>
                            ${isCurrent ? ` <span style="color:${d14 ? '#81c784' : '#2e7d32'}; font-size:14px;">(当前所在职位)</span>` : ''}
                        </span>
                    </div>`;
                }).join('') || '无从业记录';

                // 3. 当前培训状态
                const currentTrainingStatus = data.currentTraining
                    ? `<b style="color:${linkColor};">${trainingNameMap(data.currentTraining.training)}</b>`
                    : `<span style="color:${d14 ? '#888' : '#999'};">当前无培训</span>`;

                contentHtml = `
                <div style="font-weight:bold; border-bottom:1px solid ${d14 ? '#555' : '#ccc'}; padding-bottom:5px; margin-bottom:8px; display:flex; justify-content:space-between;">高管解析 <span style="color:${d14 ? '#aaa' : '#888'}; font-size:14px; font-weight:normal;">高管名字: ${data.name}  ID: ${data.id}</span></div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? '#bbb' : '#666'}; margin-bottom:4px;">📊 目前培训技能总和 <span style="font-weight:normal; color:${d14 ? '#aaa' : '#888'};">(已完成 ${trainings.length} 次)</span></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
                    <div style="background:${d14 ? '#3a3a3a' : '#e6e6e6'}; padding:4px 8px; border:1px solid ${d14 ? '#444' : '#ddd'};">管理: <b style="color:${d14 ? '#ef5350' : '#d32f2f'};">+${total.coo}</b></div>
                    <div style="background:${d14 ? '#3a3a3a' : '#e6e6e6'}; padding:4px 8px; border:1px solid ${d14 ? '#444' : '#ddd'};">会计: <b style="color:${d14 ? '#ef5350' : '#d32f2f'};">+${total.cfo}</b></div>
                    <div style="background:${d14 ? '#3a3a3a' : '#e6e6e6'}; padding:4px 8px; border:1px solid ${d14 ? '#444' : '#ddd'};">沟通: <b style="color:${d14 ? '#ef5350' : '#d32f2f'};">+${total.cmo}</b></div>
                    <div style="background:${d14 ? '#3a3a3a' : '#e6e6e6'}; padding:4px 8px; border:1px solid ${d14 ? '#444' : '#ddd'};">科学: <b style="color:${d14 ? '#ef5350' : '#d32f2f'};">+${total.cto}</b></div>
                </div>
                <div style="font-size:14px; margin-bottom:10px; padding-left:2px;">
                    <span style="color:${d14 ? '#bbb' : '#666'};">进行中：</span>${currentTrainingStatus}
                </div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? '#bbb' : '#666'}; margin-bottom:4px;">💼 从业履历</div>
                <div style="max-height:100px; overflow-y:auto; background:${d14 ? '#333' : '#fff'}; border:1px solid ${d14 ? '#444' : '#ddd'}; padding:4px; margin-bottom:10px; font-size:14px;">${workHistoryHtml}</div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? '#bbb' : '#666'}; margin-bottom:4px;">🎓 详细培训历史</div>
                <div style="max-height:100px; overflow-y:auto; background:${d14 ? '#333' : '#fff'}; border:1px solid ${d14 ? '#444' : '#ddd'}; padding:4px; font-size:14px;">${historyHtml}</div>

                <div style="margin-top:10px; padding:8px; background-color:${d14 ? '#3a2020' : '#fff5f5'}; border:1px solid ${d14 ? '#5a3030' : '#ffcccc'}; border-radius:4px; font-size:14px; color:${d14 ? '#ef5350' : '#c62828'}; line-height:1.4;">
                    <b>⚠️请注意：</b><br>
                    1. 本功能为插件功能，<b>禁止在游戏内聊天室提及</b>。<br>
                    2. 若在发送通知前点开高管，则可能导致此次挖人数据不再显示。<br>
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

        // --- 拦截部分（优化：仅匹配目标URL时才处理响应体） ---
        const _fetch = window.fetch;
        window.fetch = async function (...args) {
            const res = await _fetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : (args[0].url || "");
            // 仅当URL匹配目标时才克隆响应体，避免每次请求的性能开销
            if (url.includes(OFFERS_URL) || url.includes(NOTIFICATIONS_KEYWORD) || EXEC_API_REGEX.test(url)) {
                res.clone().text().then(text => { try { processData(url, JSON.parse(text)); } catch (e) { } });
            }
            return res;
        };
        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, url) {
            // 仅当URL匹配目标时才添加load监听
            if (typeof url === 'string' && (url.includes(OFFERS_URL) || url.includes(NOTIFICATIONS_KEYWORD) || EXEC_API_REGEX.test(url))) {
                this.addEventListener("load", function () {
                    try {
                        if (this.responseText) {
                            const d = JSON.parse(this.responseText);
                            processData(url, d);
                        }
                    } catch (e) { }
                });
            }
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
            const d15s = DM();
            const style = document.createElement('style');
            style.id = 'sc-module15-styles';
            style.textContent = `
            @keyframes sc-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .sc-spinner { border: 3px solid ${d15s ? '#444' : '#f3f3f3'}; border-top: 3px solid #2196f3; border-radius: 50%; width: 30px; height: 30px; animation: sc-spin 1s linear infinite; margin: 0 auto 10px auto; }
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

        // --- 拦截网络请求（优化：仅匹配目标URL时才处理响应体） ---
        const _fetch = window.fetch;
        window.fetch = async function (...args) {
            const res = await _fetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : (args[0].url || "");
            if (FORMER_EXEC_API_REGEX.test(url)) {
                res.clone().text().then(text => { try { processData(url, JSON.parse(text)); } catch (e) { } });
            }
            return res;
        };

        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, url) {
            if (typeof url === 'string' && FORMER_EXEC_API_REGEX.test(url)) {
                this.addEventListener("load", function () {
                    try {
                        if (this.responseText) {
                            const d = JSON.parse(this.responseText);
                            processData(url, d);
                        }
                    } catch (e) { }
                });
            }
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
            background: rgba(0, 0, 0, 0.5); z-index: 99999;
            display: flex; justify-content: center; align-items: center;
            opacity: 0; transition: opacity 0.2s ease-in-out;
        `;

            // 3. 创建弹窗容器
            const d15 = DM();
            const modal = document.createElement('div');
            modal.style.cssText = `
            background: ${d15 ? '#1e1e1e' : '#fff'}; border-radius: 8px; width: 450px; max-width: 90vw;
            max-height: 85vh; overflow-y: auto; padding: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); position: relative;
            font-family: sans-serif; transform: scale(0.95); transition: transform 0.2s ease-in-out;
            color: ${d15 ? '#efefef' : '#333'};
        `;

            // 初始显示加载状态
            modal.innerHTML = `
            <div style="display:flex; justify-content:flex-end;">
                <button id="sc-modal-close-temp" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d15 ? '#aaa' : '#999'}; line-height:1;">&times;</button>
            </div>
            <div style="text-align:center; padding: 30px 20px; color:${d15 ? '#bbb' : '#666'};">
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
                    // const workHistory = data.workHistory || [];
                    // let myDaysActiveSum = 0;
                    // let isSeveranceBroken = false;

                    // // 0. 获取当前 Realm（后续多处使用）
                    // const currentRealm = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;

                    // // 1. 从本地缓存取出 savedExecInfo（含 salary, unemployed）
                    // const savedExecs = load("SC-former-executives");
                    // const savedExecInfo = savedExecs.find(e => e.id === executiveId) || null;

                    // // 2. 获取本公司名
                    // let myCompanyName = null;
                    // if (currentRealm !== null) {
                    //     const srcKey = `SimcompaniesRetailCalculation_${currentRealm}`;
                    //     const SRC = JSON.parse(localStorage.getItem(srcKey) || "{}");
                    //     myCompanyName = SRC.company;
                    // }

                    // if (myCompanyName && workHistory.length > 0) {
                    //     // 3. 找到你在履历中最后一次出现的索引 (时间最近的一条)
                    //     //     workHistory 从 0(最新) 到 N(最旧) 排列
                    //     const myLastIndex = workHistory.findIndex(w => w.employer && w.employer.company === myCompanyName);

                    //     if (myLastIndex !== -1) {
                    //         // 4. 核心：检查从「当前职位(索引0)」到「你在该高管的最后职位(myLastIndex)」之间
                    //         //    是否所有相邻记录的 start 都等于上一条的 end（无缝衔接）
                    //         //    逻辑：workHistory[i] 是较新的职位，workHistory[i+1] 是较旧的职位
                    //         for (let i = 0; i < myLastIndex; i++) {
                    //             const newerJobStart = workHistory[i].start;
                    //             const olderJobEnd = workHistory[i+1].end;

                    //             // 如果旧职位的 end 缺失，或 不等于新职位的 start → 断层
                    //             if (!olderJobEnd || newerJobStart !== olderJobEnd) {
                    //                 isSeveranceBroken = true;
                    //                 break;
                    //             }
                    //         }

                    //         // 5. 若无断层，计算该高管在贵公司累计天数
                    //         if (!isSeveranceBroken) {
                    //             myDaysActiveSum = workHistory
                    //                 .filter(w => w.employer && w.employer.company === myCompanyName)
                    //                 .reduce((sum, w) => sum + (w.daysActive || 0), 0);
                    //         }
                    //     } else {
                    //         isSeveranceBroken = true; // 没雇佣过，自然没补偿
                    //     }
                    // }

                    // // 6. 补偿金 HTML 渲染
                    // let severanceHtml = '';
                    // if (savedExecInfo) {
                    //     const { salary, unemployed } = savedExecInfo;

                    //     if (unemployed) {
                    //         severanceHtml = `<span style="color:#999;">高管当前不在职</span>`;
                    //     } else if (isSeveranceBroken) {
                    //         severanceHtml = `<span style="color:#d32f2f;">补偿金已断开 (曾有失业/被开除)</span>`;
                    //     } else if (myDaysActiveSum < 2) {
                    //         severanceHtml = `<span style="color:#999;">在职不足2天，无补偿金</span>`;
                    //     } else if (myDaysActiveSum >= 2) {
                    //         const compensation = Math.floor(salary * myDaysActiveSum * 1 / (2 * 100)); // 计算补偿金
                    //         severanceHtml = `<span style="color:#e67e22; font-weight:bold;">持续补偿: $${Math.round(compensation).toLocaleString()}</span>`;
                    //     }
                    // }

                    const trainings = data.trainings || [];
                    let total = { coo: 0, cfo: 0, cmo: 0, cto: 0 };

                    // 主题变量声明（必须在后续 HTML 模板使用前）
                    const d15r = DM();
                    const modalBg = d15r ? '#1e1e1e' : '#fff';
                    const modalFg = d15r ? '#efefef' : '#333';
                    const modalFg2 = d15r ? '#ccc' : '#555';
                    const modalFg3 = d15r ? '#aaa' : '#888';
                    const modalFg4 = d15r ? '#bbb' : '#666';
                    const modalBorder1 = d15r ? '#444' : '#eee';
                    const modalBorder2 = d15r ? '#3a3a3a' : '#e9ecef';
                    const modalBg1 = d15r ? '#2a2a2a' : '#f8f9fa';
                    const modalBg2 = d15r ? '#1a1a2e' : '#eef7ff';
                    const modalBg2border = d15r ? '#2a3a5e' : '#cce5ff';
                    const modalBg3 = d15r ? '#333' : '#fff';
                    const linkColor = '#2196f3';

                    const historyHtml = trainings.map(t => {
                        total.coo += t.skillCoo || 0; total.cfo += t.skillCfo || 0;
                        total.cmo += t.skillCmo || 0; total.cto += t.skillCto || 0;
                        const details = [];
                        if (t.skillCoo) details.push(`管理+${t.skillCoo}`);
                        if (t.skillCfo) details.push(`会计+${t.skillCfo}`);
                        if (t.skillCmo) details.push(`沟通+${t.skillCmo}`);
                        if (t.skillCto) details.push(`科学+${t.skillCto}`);
                        const detailStr = details.length > 0 ? `<span style="color:${d15r ? '#999' : '#777'}; margin-left:4px;">(${details.join(' ')})</span>` : '';
                        const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm, t.employer.company);
                        return `<div style="padding:6px 0; border-bottom:1px dashed ${modalBorder1}; color:${modalFg2}; font-size:14px;">在 <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}</div>`;
                    }).join('') || `<div style="color:${d15r ? '#888' : '#999'}; text-align:center; padding:10px;">无历史培训记录</div>`;

                    const workHistoryHtml = data.workHistory?.map(w => {
                        const isCurrent = !w.end;
                        const cUrl = getCompanyLink(w.employer.realmId ?? currentRealm, w.employer.company);
                        const posName = positionMap(w.position);
                        return `
                    <div style="padding:8px 0; border-bottom:1px solid ${modalBorder1}; ${isCurrent ? 'background: ' + (d15r ? '#1a1a2e' : '#eef7ff') + '; padding-left:5px; border-left:3px solid #2196f3;' : ''}">
                        <span style="color:${d15r ? '#ccc' : '#444'}; font-size:14px;">
                            ${isCurrent ? '⭐ ' : ''}在
                            <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none; font-weight:${isCurrent ? 'bold' : 'normal'};">${w.employer.company}</a>
                            担任 <b>${w.daysActive}</b> 天的 <b>${posName}</b>
                            ${isCurrent ? ` <span style="color:${d15r ? '#81c784' : '#2e7d32'}; font-size:13px;">(当前所在职位)</span>` : ''}
                        </span>
                    </div>`;
                    }).join('') || `<div style="color:${d15r ? '#888' : '#999'}; text-align:center; padding:10px;">无从业记录</div>`;

                    const currentTrainingStatus = data.currentTraining
                        ? `<b style="color:${linkColor};">${trainingNameMap(data.currentTraining.training)}</b>`
                        : `<span style="color:${d15r ? '#888' : '#999'};">当前无培训</span>`;

                    // 替换弹窗内容为真实数据
                    modal.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid ${modalBorder1}; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0 0 4px 0; font-size:18px; color:${modalFg};">${data.name}</h3>
                            <div style="color:${modalFg3}; font-size:12px;">高管ID: ${data.id}</div>
                        </div>
                        <button id="sc-modal-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d15r ? '#aaa' : '#999'}; line-height:1; padding:0 0 5px 10px;">&times;</button>
                    </div>

                    <div style="font-size:14px; font-weight:bold; color:${modalFg2}; margin-bottom:8px;">📊 培训技能总计 <span style="font-weight:normal; color:${modalFg3}; font-size:12px;">(完成 ${trainings.length} 次)</span></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">管理:</span> <b style="color:${d15r ? '#ef5350' : '#d32f2f'};">+${total.coo}</b>
                        </div>
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">会计:</span> <b style="color:${d15r ? '#ef5350' : '#d32f2f'};">+${total.cfo}</b>
                        </div>
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">沟通:</span> <b style="color:${d15r ? '#ef5350' : '#d32f2f'};">+${total.cmo}</b>
                        </div>
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">科学:</span> <b style="color:${d15r ? '#ef5350' : '#d32f2f'};">+${total.cto}</b>
                        </div>
                    </div>
                    <div style="font-size:14px; margin-bottom:20px; background:${modalBg2}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBg2border};">
                        <span style="color:${modalFg4};">进行中：</span>${currentTrainingStatus}
                    </div>

                    <div style="font-size:14px; font-weight:bold; color:${modalFg2}; margin-bottom:8px;">💼 从业履历</div>
                    <div style="max-height:160px; overflow-y:auto; background:${modalBg3}; border:1px solid ${modalBorder1}; border-radius:6px; padding:0 12px; margin-bottom:20px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">${workHistoryHtml}</div>

                    <div style="font-size:14px; font-weight:bold; color:${modalFg2}; margin-bottom:8px;">🎓 详细培训历史</div>
                    <div style="max-height:160px; overflow-y:auto; background:${modalBg3}; border:1px solid ${modalBorder1}; border-radius:6px; padding:0 12px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">${historyHtml}</div>
                `;

                    // 重新绑定真实数据的关闭按钮
                    document.getElementById('sc-modal-close').onclick = closeModal;
                })
                .catch(() => {
                    const d15e = DM();
                    modal.innerHTML = `
                    <div style="display:flex; justify-content:flex-end;">
                        <button id="sc-modal-close-err" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d15e ? '#aaa' : '#999'}; line-height:1;">&times;</button>
                    </div>
                    <div style="text-align:center; padding: 30px 20px;">
                        <div style="color:${d15e ? '#ef5350' : '#d32f2f'}; font-size:40px; margin-bottom:10px;">⚠️</div>
                        <div style="color:${d15e ? '#ef5350' : '#d32f2f'}; font-weight:bold; margin-bottom:15px;">档案调取失败</div>
                        <div style="color:${d15e ? '#bbb' : '#666'}; font-size:14px;">网络可能开小差了，请稍后重试。</div>
                    </div>
                `;
                    document.getElementById('sc-modal-close-err').onclick = closeModal;
                });
        }

        // --- DOM 注入逻辑 ---
        function injectMoreInfoButtons() {
            if (!isPageModuleEnabled('formerExecEnhance')) return;
            // 直接通过前任高管行CSS类名查找，避免依赖文字匹配（兼容多语言）
            const rows = document.querySelectorAll('.css-19er0v9'); //前任高管行css
            if (rows.length === 0) return;

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
    // 模块16：高管页面自定义高管数据按钮注入
    // ======================
    const ExecutiveCustomButtonModule = (function () {

        // --- UI 注入逻辑 ---
        function injectCustomButton() {
            const container = document.querySelector('.css-1wne25x'); // 会议室css
            if (!container) return;

            const targetHeader = container.querySelector('h3');
            if (!targetHeader || targetHeader.querySelector('#sc-custom-exec-btn')) return;

            // 按钮通用样式
            const baseStyle = `
                margin-left: 10px; padding: 4px 10px; color: white; border: none;
                border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;
                vertical-align: middle; transition: all 0.2s;
            `;

            // 按钮: 自定义按钮
            const btnCustom = document.createElement('button');
            btnCustom.id = 'sc-custom-exec-btn';
            btnCustom.textContent = "自定义高管数据";
            btnCustom.style.cssText = baseStyle + "background-color: #673ab7;"; // 紫色区分
            btnCustom.onclick = (e) => {
                e.preventDefault();
                executiveCustomButton.show();
            };

            targetHeader.appendChild(btnCustom);
        }

        // --- 监听与初始化 ---
        const observer = new MutationObserver(() => injectCustomButton());

        function init() {
            if (typeof window.isPageModuleEnabled === 'function' && !window.isPageModuleEnabled('executiveSave')) return;
            observer.observe(document.body, { childList: true, subtree: true });
            injectCustomButton();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }

        return { forceInject: injectCustomButton };
    })();

    // ======================
    // 模块17：COO收益计算
    // ======================
    (function () {
        // 建筑 kind → 基本时薪映射（严格区分大小写）
        const BASE_WAGES = {
            '0': 759, '1': 448.5, '2': 379.5, '3': 0, '4': 0, '5': 0,
            '6': 241.5, '7': 586.5, '8': 724.5, '9': 759,
            'A': 345, 'a': 552, 'b': 414, 'B': 586.5, 'C': 172.5,
            'c': 414, 'D': 621, 'd': 172.5, 'E': 414, 'e': 414,
            'F': 138, 'f': 448.5, 'G': 138, 'g': 345, 'H': 310.5,
            'h': 586.5, 'I': 241.5, 'i': 379.5, 'j': 448.5, 'k': 379.5,
            'L': 379.5, 'l': 517.5, 'M': 276, 'm': 655.5, 'n': 0,
            'O': 517.5, 'o': 379.5, 'P': 103.5, 'p': 448.5, 'q': 517.5,
            'Q': 276, 'R': 483, 'r': 586.5, 'S': 310.5, 's': 586.5,
            'T': 138, 't': 207, 'u': 241.5, 'v': 79.35, 'W': 345,
            'x': 483, 'Y': 414, 'y': 0, 'z': 241.5
        };

        function getBuildingsData() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return [];
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return [];
                const data = JSON.parse(raw);
                return data.buildings || [];
            } catch (e) {
                return [];
            }
        }

        function getSRCData() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return null;
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        }

        // 计算当前所有建筑运行24小时的管理费
        function calcTotalAdminFee(buildings, SRC) {
            if (!buildings || buildings.length === 0 || !SRC) return 0;
            const adminOverhead = SRC.administration || 1;
            if (adminOverhead <= 1) return 0;
            let total = 0;
            for (const b of buildings) {
                const baseWage = BASE_WAGES[b.kind];
                if (baseWage === undefined || baseWage === 0) continue;
                // 机器人：robotsSpecialization 为数字则表示安装了机器人，减少3%管理费即 *0.97
                const robotMultiplier = (typeof b.robotsSpecialization === 'number') ? 0.97 : 1;
                total += baseWage * b.size * 24 * robotMultiplier * (adminOverhead - 1);
            }
            return total;
        }

        function showCOOCalcModal() {
            // 清理旧弹窗
            const existing = document.getElementById('sc-coo-calc-overlay');
            if (existing) existing.remove();

            const buildings = getBuildingsData();
            const SRC = getSRCData();

            if (!buildings || buildings.length === 0) {
                alert('未找到建筑数据，请先在游戏中打开任意页面以触发建筑数据捕获，或手动更新领域数据。');
                return;
            }
            if (!SRC) {
                alert('未找到领域数据，请先更新领域数据（左下角按钮）。');
                return;
            }

            const totalFee = calcTotalAdminFee(buildings, SRC);
            const defaultCOO = SRC.adminBonus || 0;

            const d17 = DM();
            const bg = d17 ? '#1e1e1e' : '#fff';
            const fg = d17 ? '#efefef' : '#333';
            const fg2 = d17 ? '#ccc' : '#555';
            const border = d17 ? '#555' : '#ccc';
            const inputBg = d17 ? '#333' : '#f5f5f5';
            const inputFg = d17 ? '#efefef' : '#333';
            const accentBg = d17 ? '#1a3a5c' : '#e3f2fd';
            const accentBorder = d17 ? '#2a5a8c' : '#bbdefb';
            const resultBg = d17 ? '#1a3a1a' : '#e8f5e9';
            const resultBorder = d17 ? '#2a5a2a' : '#c8e6c9';

            // 锁定背景滚动
            const origOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            const overlay = document.createElement('div');
            overlay.id = 'sc-coo-calc-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.5); z-index: 99999;
                display: flex; justify-content: center; align-items: center;
                opacity: 0; transition: opacity 0.2s;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: ${bg}; color: ${fg}; border-radius: 12px;
                width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
                padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                font-family: sans-serif; transform: scale(0.95);
                transition: transform 0.2s;
            `;

            modal.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ${border}; padding-bottom:12px; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:18px;">💰COO收益计算</h3>
                    <button id="sc-coo-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d17 ? '#aaa' : '#999'}; line-height:1;">&times;</button>
                </div>

                <div style="background:${accentBg}; border:1px solid ${accentBorder}; border-radius:8px; padding:12px; margin-bottom:16px;">
                    <div style="font-size:13px; color:${fg2}; margin-bottom:4px;">当前地图上所有建筑运行24小时的管理费</div>
                    <div id="sc-coo-total-fee" style="font-size:24px; font-weight:bold; color:#2196F3;">$${totalFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style="font-size:11px; color:${d17 ? '#888' : '#999'}; margin-top:4px;">管理费用: ${(((SRC.administration || 1) - 1) * 100).toFixed(1)}% | 建筑数: ${buildings.length}</div>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="font-size:14px; font-weight:bold; display:block; margin-bottom:6px;">COO有效点数</label>
                    <input id="sc-coo-input" type="number" min="0" step="1" value="${defaultCOO}"
                        style="width:100%; padding:10px; border:1px solid ${border}; border-radius:6px;
                        background:${inputBg}; color:${inputFg}; font-size:16px; box-sizing:border-box;">
                </div>

                <div style="background:${resultBg}; border:1px solid ${resultBorder}; border-radius:8px; padding:12px;">
                    <div style="font-size:13px; color:${fg2}; margin-bottom:4px;">COO节省的管理费</div>
                    <div id="sc-coo-saved-fee" style="font-size:24px; font-weight:bold; color:#4CAF50;">$0.00</div>
                    <div style="font-size:13px; color:${fg2}; margin-top:8px; margin-bottom:4px;">每日实际管理费</div>
                    <div id="sc-coo-remain-fee" style="font-size:24px; font-weight:bold; color:#FF9800;">$0.00</div>
                </div>

                <div style="margin-top:16px; font-size:11px; color:${d17 ? '#888' : '#999'}; text-align:center;">
                    计算公式：某建筑管理费 = 一级基本工资*等级*24h*机器人*管理费用 | COO节省的管理费 = 建筑管理费总和 * COO有效点数%
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // 动画入场
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            // 更新结果函数
            const updateResult = () => {
                const cooPoints = parseFloat(document.getElementById('sc-coo-input')?.value) || 0;
                const savedFee = totalFee * (cooPoints / 100);
                const remainFee = totalFee - savedFee;
                const savedEl = document.getElementById('sc-coo-saved-fee');
                const remainEl = document.getElementById('sc-coo-remain-fee');
                if (savedEl) savedEl.textContent = '$' + savedFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                if (remainEl) remainEl.textContent = '$' + remainFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            // 绑定输入事件
            document.getElementById('sc-coo-input').addEventListener('input', updateResult);
            updateResult(); // 初始计算

            // 关闭逻辑
            const closeModal = () => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    overlay.remove();
                    document.body.style.overflow = origOverflow;
                    document.removeEventListener('keydown', handleEsc);
                }, 200);
            };

            overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
            document.getElementById('sc-coo-close').onclick = closeModal;
            const handleEsc = (e) => { if (e.key === 'Escape') closeModal(); };
            document.addEventListener('keydown', handleEsc);
        }

        // --- 注入按钮到高管页面 ---
        function injectCOOButton() {
            // 查找目标容器
            const h3 = document.querySelector('.css-6zujxw h3');
            if (!h3) return;
            // 防止重复注入
            if (document.getElementById('sc-coo-calc-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'sc-coo-calc-btn';
            btn.textContent = 'COO收益计算';
            btn.style.cssText = `
                margin-left: 12px; padding: 4px 12px; background: #2196F3; color: white;
                border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                font-weight: bold; vertical-align: middle; transition: all 0.2s;
            `;
            btn.onmouseenter = () => btn.style.backgroundColor = '#1976d2';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2196F3';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showCOOCalcModal();
            };

            h3.appendChild(btn);
        }

        // --- 页面监听与初始化（MutationObserver，与模块16一致） ---
        function isExecPage() {
            return /\/headquarters\/executives\/?$/.test(location.href);
        }

        const observer = new MutationObserver(() => {
            if (isExecPage()) injectCOOButton();
        });

        function init() {
            if (typeof window.isPageModuleEnabled === 'function' && !window.isPageModuleEnabled('cooProfit')) return;
            observer.observe(document.body, { childList: true, subtree: true });
            if (isExecPage()) injectCOOButton();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // ======================
    // 模块18：出库合同MP-?%
    // ======================
    const outgoingContractMPHandler = (function () {
        const STORAGE_KEY = 'SC_OutgoingMP_Presets';
        const USE_INPUT_KEY = 'SC_OutgoingMP_UseInput';
        const DEFAULT_PRESETS = 'MP-4%';
        let initTimer = null;
        let _qualityCache = {}; // 品质缓存 { resourceId: quality }，按资源ID隔离

        // VWAP 相关常量与函数
        const VWAP_CACHE_KEY = 'SC_OutgoingVWAP_Cache';
        const VWAP_CACHE_MS = 10 * 60 * 1000;

        async function getVWAPData(realmId, resourceId, quality) {
            const cacheKey = `${VWAP_CACHE_KEY}_${realmId}_${resourceId}_${quality}`;
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) { const p = JSON.parse(cached); if (Date.now() - p.t < VWAP_CACHE_MS) { mpLog('VWAP 缓存命中, 值:', p.v); return p.v; } }
            } catch (e) { /* ignore */ }
            mpLog('VWAP 缓存未命中, 发起网络请求...');
            const tStart = Date.now();
            try {
                const url = `https://api.simcotools.com/v1/realms/${realmId}/market/vwaps/${resourceId}/${quality}`;
                const vwap = await new Promise((resolve) => {
                    if (typeof GM_xmlhttpRequest === 'function') {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: url,
                            onload: function (resp) {
                                try {
                                    const data = JSON.parse(resp.responseText);
                                    const v = typeof data === 'number' ? data
                                        : (data.vwap || data.price || data.value
                                            || (Array.isArray(data.vwaps) && data.vwaps[0]?.vwap)
                                            || (Array.isArray(data) && data[0]?.vwap));
                                    console.log('[VWAP] API返回:', { status: resp.status, raw: resp.responseText?.substring(0, 100), parsed: v });
                                    resolve(typeof v === 'number' && v > 0 ? v : null);
                                } catch (e) { console.warn('[VWAP] 解析失败:', e); resolve(null); }
                            },
                            onerror: function (e) { console.warn('[VWAP] GM_xmlhttpRequest 错误:', e); resolve(null); },
                            ontimeout: function () { console.warn('[VWAP] 请求超时'); resolve(null); },
                            timeout: 10000
                        });
                    } else {
                        fetch(url)
                            .then(r => r.json())
                            .then(data => {
                                const v = typeof data === 'number' ? data
                                    : (data.vwap || data.price || data.value
                                        || (Array.isArray(data.vwaps) && data.vwaps[0]?.vwap)
                                        || (Array.isArray(data) && data[0]?.vwap));
                                console.log('[VWAP] fetch返回:', v);
                                resolve(typeof v === 'number' && v > 0 ? v : null);
                            })
                            .catch(e => { console.warn('[VWAP] fetch失败:', e); resolve(null); });
                    }
                });
                if (vwap !== null) {
                    try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: vwap })); } catch (e) { }
                    mpLog('VWAP 网络请求完成, 耗时:', Date.now() - tStart, 'ms, 值:', vwap);
                    return vwap;
                }
                mpLog('VWAP 网络请求无有效值, 耗时:', Date.now() - tStart, 'ms');
            } catch (e) { mpLog('VWAP 请求异常:', e.message); }
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) { const p = JSON.parse(cached); return p.v; }
            } catch (e) { }
            return null;
        }

        function isUseInputEnabled() {
            return localStorage.getItem(USE_INPUT_KEY) === 'true';
        }

        function toggleUseInput() {
            const enabled = !isUseInputEnabled();
            localStorage.setItem(USE_INPUT_KEY, enabled ? 'true' : 'false');
            initButtons();
            return enabled;
        }

        function loadPresets() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored !== null) {
                return stored.replace(/，/g, ',').split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            return DEFAULT_PRESETS.split(',').map(s => s.trim());
        }

        function savePresets(presets) {
            localStorage.setItem(STORAGE_KEY, presets.join(','));
            initButtons();
        }

        function showConfigModal() {
            const currentPresets = loadPresets();
            const presetsString = currentPresets.join(', ');
            const modalId = 'outgoingmp-config-modal';
            document.getElementById(modalId)?.remove();

            const bgSum = (window.getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [])
                .map(Number).reduce((a, b) => a + b, 0);
            const isDark = bgSum < 380;
            const bg = isDark ? '#333' : '#fff';
            const fg = isDark ? '#EEE' : '#333';
            const border = isDark ? '#555' : '#ccc';
            const inputBg = isDark ? '#2C2C2C' : '#f5f5f5';
            const inputFg = isDark ? '#EEE' : '#333';
            const inputBorder = isDark ? '#666' : '#bbb';
            const codeBg = isDark ? '#444' : '#e8e8e8';
            const codeFg = isDark ? '#ffb74d' : '#c62828';
            const overlayBg = 'rgba(0,0,0,0.7)';
            const shadow = '0 5px 15px rgba(0,0,0,0.5)';
            const btnCancelBg = isDark ? '#555' : '#e0e0e0';
            const btnCancelFg = isDark ? 'white' : '#333';

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${overlayBg};z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:5vh;box-sizing:border-box;`;

            modal.innerHTML = `
                <div style="background:${bg};color:${fg};padding:0;border-radius:6px;box-shadow:${shadow};width:90%;max-width:450px;border:1px solid ${border};">
                    <div style="padding:15px;border-bottom:1px solid ${border};">
                        <h4 style="margin:0;font-size:18px;font-weight:600;">MP-?%出库价设置</h4>
                    </div>
                    <div style="padding:15px;">
                        <p style="margin-top:0;margin-bottom:15px;font-size:14px;line-height:1.6;">
                            使用<strong style="color:#FF8888;">逗号（, 或 ，）</strong>分隔。使用MP±%或者VWAP±%。支持：<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP-4%</code> → MP -4%<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP+5%</code> → MP +5%<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP-10</code> → MP -$10<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP+6</code> → MP +$6<br>
                            • <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">VWAP-4%</code> → VWAP -4%<br>
                            VWAP来自simcotools.com。字母不区分大小写，半角全角均可。
                        </p>
                        <textarea id="outgoingmp-config-input"
                            style="width:100%;height:80px;margin-bottom:12px;padding:8px;border:1px solid ${inputBorder};border-radius:4px;box-sizing:border-box;font-size:14px;color:${inputFg};background:${inputBg};resize:vertical;"></textarea>
                        <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:13px;color:${fg};">根据输入框已有价格计算：</span>
                            <button id="outgoingmp-useinput-toggle" type="button" style="padding:4px 12px;border:1px solid ${inputBorder};border-radius:4px;cursor:pointer;font-size:13px;background:${inputBg};color:${inputFg};"></button>
                            <span style="font-size:11px;color:${isDark ? '#aaa' : '#888'};">开启后，若输入框已填价格，则按钮将以输入框内已填价格（而非市场最低价）为基础计算</span>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:10px;">
                            <button id="outgoingmp-config-cancel" style="background-color:${btnCancelBg};color:${btnCancelFg};border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;">取消</button>
                            <button id="outgoingmp-config-save" style="background-color:#5cb85c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;">保存</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const inputEl = document.getElementById('outgoingmp-config-input');
            inputEl.value = presetsString;

            // ✎ 基于输入框已有价格开关
            const useInputToggle = document.getElementById('outgoingmp-useinput-toggle');
            const updateToggleBtn = () => {
                const on = isUseInputEnabled();
                useInputToggle.textContent = on ? '✎ 开' : '✎ 关';
                useInputToggle.style.color = on ? '#4CAF50' : '';
            };
            updateToggleBtn();
            useInputToggle.addEventListener('click', () => {
                toggleUseInput();
                updateToggleBtn();
            });

            document.getElementById('outgoingmp-config-cancel').addEventListener('click', () => modal.remove());
            document.getElementById('outgoingmp-config-save').addEventListener('click', () => {
                const newString = inputEl.value.replace(/，/g, ',');
                const newPresets = newString.split(',').map(s => s.trim()).filter(s => s.length > 0);
                savePresets(newPresets);
                modal.remove();
            });
        }

        // 从百科链接提取 resourceId
        function parseResourceId() {
            const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
            if (!link) return null;
            const match = link.href.match(/\/resource\/(\d+)\//);
            return match ? parseInt(match[1], 10) : null;
        }

        // 解析品质：使用品质缓存避免重复轮询
        async function parseQuality() {
            const resourceId = parseResourceId();
            if (resourceId === null) return 0;
            // 品质缓存命中（按资源ID）直接返回
            if (_qualityCache[resourceId] !== undefined && _qualityCache[resourceId] >= 0) {
                mpLog('parseQuality 缓存命中:', _qualityCache[resourceId]);
                return _qualityCache[resourceId];
            }

            const startUrl = location.href;
            const MAX_WAIT = 3000; // 轮询超时减到3秒，快速失败不阻塞
            const RETRY_INTERVAL = 200;
            const startTime = Date.now();
            let loopCount = 0;

            // 多语言匹配文本
            const SELL_ORDER_TEXTS = ['当前交易所卖单', 'Current exchange orders', '當前交易所賣單'];
            const FILTER_BTN_TEXTS = ['按品质过滤', 'Filter by quality', '按品質過濾'];
            const SHOW_ALL_TEXTS = ['Show all', '显示所有', '顯示所有'];
            const AVG_PRICE_TITLES = ['平均零售价格', 'Average retail price', '平均零售價格'];

            while (Date.now() - startTime < MAX_WAIT) {
                if (location.href !== startUrl) return 0;

                // === 策略1：从交易所卖单文字提取品质 ===
                let s1Quality = null;
                let s1FilterBtn = false;
                let s1ShowAllBtn = false;
                let s1Found = false; // 是否找到了卖单文本
                let s1RawText = '';   // 调试用
                let s1BtnRaw = '';    // 调试用
                const allSpans = document.querySelectorAll('span');
                for (const span of allSpans) {
                    const b = span.querySelector('b');
                    if (!b) continue;
                    const text = b.textContent?.trim() || '';
                    if (SELL_ORDER_TEXTS.some(t => text.includes(t))) {
                        s1Found = true;
                        s1RawText = text;
                        const qMatch = text.match(/Q(\d+)\+/);
                        if (qMatch) { s1Quality = parseInt(qMatch[1], 10); }
                        const btnText = span.querySelector('button')?.textContent || '';
                        s1BtnRaw = btnText;
                        s1ShowAllBtn = SHOW_ALL_TEXTS.some(t => btnText.includes(t));
                        s1FilterBtn = FILTER_BTN_TEXTS.some(t => btnText.includes(t));
                        break;
                    }
                }

                // 辅助：从DOM元素提取品质（先试文本数字，否则数SVG星星）
                const extractQualityFromEl = (el) => {
                    const txt = el.textContent?.trim() || '';
                    const numMatch = txt.match(/^(\d+)/);
                    if (numMatch) return parseInt(numMatch[1], 10);
                    // 没有数字：数SVG星星个数（.fa-star）
                    const svgCount = el.querySelectorAll('.svg-inline--fa.fa-star').length;
                    return svgCount > 0 ? svgCount : null;
                };

                // === 策略2：有平均零售价格从平均零售价格找；没有则从合并成本附近找 ===
                let s2Quality = null;
                let s2RawTxt = '';    // 调试用
                const titleSelector = AVG_PRICE_TITLES.map(t => `[title="${t}"]`).join(', ');
                const avgPriceEl = document.querySelector(titleSelector);
                if (avgPriceEl) {
                    // 有平均零售价格：从其下个兄弟元素提取品质
                    const sibling = avgPriceEl.nextElementSibling;
                    if (sibling) {
                        s2RawTxt = sibling.textContent?.trim() || '';
                        s2Quality = extractQualityFromEl(sibling);
                    }
                } else {
                    // 无平均零售价格：从"合并成本"文本节点自身往后找品质元素
                    let qualityEl = null;
                    const allEls = document.querySelectorAll('*');
                    for (const el of allEls) {
                        for (const node of el.childNodes) {
                            if (node.nodeType === 3 && node.textContent?.includes('合并成本')) {
                                // 从这个文本节点往后遍历兄弟节点，找第一个元素
                                let next = node.nextSibling;
                                while (next) {
                                    if (next.nodeType === 1) {
                                        qualityEl = next;
                                        break;
                                    }
                                    next = next.nextSibling;
                                }
                                // 如果紧跟着的是<br>等无效元素，继续往后找
                                if (qualityEl) {
                                    let q = extractQualityFromEl(qualityEl);
                                    let fallback = qualityEl.nextElementSibling;
                                    while (q === null && fallback) {
                                        qualityEl = fallback;
                                        q = extractQualityFromEl(fallback);
                                        if (q !== null) break;
                                        fallback = fallback.nextElementSibling;
                                    }
                                }
                                break;
                            }
                        }
                        if (qualityEl) break;
                    }
                    if (qualityEl) {
                        s2RawTxt = qualityEl.textContent?.trim() || '';
                        s2Quality = extractQualityFromEl(qualityEl);
                        if (s2Quality !== null) {
                            mpLog('策略2 从合并成本后兄弟元素:', s2Quality, 'txt:', s2RawTxt.substring(0, 30));
                        }
                    }
                }

                // === 调试日志：本次轮询各策略原始数据 ===
                mpLog('parseQuality 轮询#' + loopCount +
                    ' s1Found=' + s1Found +
                    ' rawText="' + (s1RawText || '').substring(0, 80) + '"' +
                    ' qMatch=' + s1Quality +
                    ' btn="' + (s1BtnRaw || '').substring(0, 30) + '"' +
                    ' showAll=' + s1ShowAllBtn +
                    ' filter=' + s1FilterBtn +
                    ' s2El=' + (avgPriceEl ? 'avgprice' : 'cost') +
                    ' s2Txt="' + (s2RawTxt || '').substring(0, 30) + '"' +
                    ' s2Q=' + s2Quality);

                // === 比对（按用户规范三类情况） ===
                if (s1Found || s2Quality !== null) {
                    // 情况1：有Q前缀且有"Show all"按钮 → 可信，直接返回Q
                    if (s1Quality !== null && s1ShowAllBtn) {
                        _qualityCache[resourceId] = s1Quality;
                        mpLog('parseQuality 情况1(可信Q):', s1Quality);
                        return s1Quality;
                    }
                    // 情况3：有文本但无Q前缀且无按钮 → 可信Q0
                    if (s1Found && s1Quality === null && !s1FilterBtn && !s1ShowAllBtn) {
                        _qualityCache[resourceId] = 0;
                        mpLog('parseQuality 情况3(可信Q0)');
                        return 0;
                    }
                    // 情况2：有"Filter by quality"按钮 → 不可信，用平均零售价格
                    if (s1FilterBtn && s2Quality !== null) {
                        _qualityCache[resourceId] = s2Quality;
                        mpLog('parseQuality 情况2(平均零售价格):', s2Quality);
                        return s2Quality;
                    }
                    // 情况4：策略1未找到卖单文本（如仓库出售/合同页面），直接用策略2
                    if (!s1Found && s2Quality !== null) {
                        _qualityCache[resourceId] = s2Quality;
                        mpLog('parseQuality 情况4(纯平均零售价格):', s2Quality);
                        return s2Quality;
                    }
                    // 调试：有数据但无一匹配 → 打印原因
                    if (s1Found) {
                        mpLog('parseQuality 轮询#' + loopCount + ' 未匹配: s1Q=' + s1Quality + ' showAll=' + s1ShowAllBtn + ' filter=' + s1FilterBtn + ' s2Q=' + s2Quality);
                    }
                }

                await new Promise(r => setTimeout(r, RETRY_INTERVAL));
                loopCount++;
            }
            mpLog('parseQuality 超时退出, loopCount:', loopCount);
            _qualityCache[resourceId] = 0;
            return 0;
        }

        // 同步读取缓存（无论新旧，立即返回）。无缓存返回 null
        function getCachedMarketData(realmId, resourceId) {
            const keys = [`market_all_${realmId}_${resourceId}`, `market_${realmId}_${resourceId}`];
            let bestData = null, bestTs = 0;
            for (const key of keys) {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                try {
                    const parsed = JSON.parse(raw);
                    const ts = parsed.timestamp || 0;
                    if (ts > bestTs) {
                        const arr = Array.isArray(parsed) ? parsed : parsed.data;
                        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0].quality === 'number') {
                            bestData = arr;
                            bestTs = ts;
                        }
                    }
                } catch (e) { }
            }
            mpLog('getCachedMarketData 结果:', bestData ? `ts=${bestTs} age=${Date.now() - bestTs}ms rows=${bestData.length}` : 'null');
            return { data: bestData, ts: bestTs }; // 返回数据和时间戳
        }

        // 后台刷新市场数据（网络请求，不阻塞调用方）
        async function refreshMarketData(realmId, resourceId) {
            mpLog('refreshMarketData 开始请求...');
            const tStart = Date.now();
            try {
                const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
                const resp = await fetch(url);
                const json = await resp.json();
                mpLog('refreshMarketData 完成, 耗时:', Date.now() - tStart, 'ms, 状态:', resp.status, '条数:', Array.isArray(json) ? json.length : '非数组');
                if (Array.isArray(json)) {
                    localStorage.setItem(`market_all_${realmId}_${resourceId}`, JSON.stringify({ timestamp: Date.now(), data: json }));
                    return json;
                }
            } catch (e) {
                mpLog('refreshMarketData 失败:', e.message);
            }
            return null;
        }

        // 找最低市场价：150只匹配同品质，其它可匹配 ≥ 品质
        function findLowestMP(marketData, resourceId, targetQuality) {
            const exactOnly = resourceId === 150;
            let bestPrice = Infinity, bestQuality = null;
            for (const entry of marketData) {
                const p = parseFloat(entry.price);
                const q = entry.quality;
                if (p <= 0) continue;
                if (exactOnly && q !== targetQuality) continue;
                if (!exactOnly && q < targetQuality) continue;
                if (p < bestPrice) { bestPrice = p; bestQuality = q; }
            }
            return bestPrice !== Infinity ? { price: bestPrice, quality: bestQuality } : null;
        }

        // 检查目标品质本身是否有挂单（不跨品质），返回最低价或 null
        function findExactQualityPrice(marketData, targetQuality) {
            let bestPrice = Infinity;
            for (const entry of marketData) {
                const p = parseFloat(entry.price);
                if (p > 0 && entry.quality === targetQuality && p < bestPrice) {
                    bestPrice = p;
                }
            }
            return bestPrice !== Infinity ? bestPrice : null;
        }

        // 解析预设值为目标价格（支持MP-和VWAP-前缀，不区分大小写）
        function calcTargetPrice(mpPrice, preset) {
            const s = preset.trim().toLowerCase();
            let m = s.match(/^(?:mp|vwap)\s*([+-])\s*([\d.]+)\s*%$/);
            if (m) {
                const pct = parseFloat(m[2]) / 100;
                return m[1] === '-' ? mpPrice * (1 - pct) : mpPrice * (1 + pct);
            }
            m = s.match(/^(?:mp|vwap)\s*-\s*([\d.]+)$/);
            if (m && !s.includes('%')) return mpPrice - parseFloat(m[1]);
            m = s.match(/^(?:mp|vwap)\s*\+\s*([\d.]+)$/);
            if (m && !s.includes('%')) return mpPrice + parseFloat(m[1]);
            m = s.match(/^([\d.]+)$/);
            if (m) return parseFloat(m[1]);
            return null;
        }

        // 价格步长规则（仅 sell 页面使用）: [threshold, step]
        const SELL_STEPS = [
            [20000, 500], [10000, 100], [5000, 25], [1000, 10],
            [500, 5], [200, 2], [100, 1], [50, 0.5],
            [20, 0.25], [5, 0.1], [2, 0.05], [1, 0.01],
            [0.5, 0.005], [0, 0.001]
        ];

        function roundToStep(price, isContract) {
            if (isContract) return Math.round(price * 1000) / 1000; // 合同始终精确到3位小数
            for (const [threshold, step] of SELL_STEPS) {
                if (price >= threshold) {
                    if (step >= 1) {
                        return Math.round(price / step) * step;
                    } else {
                        // step < 1: 用整数乘除避免浮点精度问题
                        const mult = Math.round(1 / step);
                        return Math.round(price * mult) / mult;
                    }
                }
            }
            return Math.round(price * 1000) / 1000;
        }

        function getSellStep(price) {
            for (const [threshold, step] of SELL_STEPS) {
                if (price >= threshold) return step;
            }
            return 0.001;
        }

        let _skipInputRefresh = false;
        function setInputValue(input, value, count = 3) {
            _skipInputRefresh = true;
            const lastValue = input.value;
            input.value = value;
            const event = new Event('input', { bubbles: true });
            event.simulated = true;
            if (input._valueTracker) input._valueTracker.setValue(lastValue);
            input.dispatchEvent(event);
            setTimeout(() => { _skipInputRefresh = false; }, 100);
            if (count > 0) return setInputValue(input, value, --count);
        }

        // === DEBUG 日志辅助 ===
        const MP_DEBUG = false;
        function mpLog(...args) { if (MP_DEBUG) console.log('[MP-DEBUG]', Date.now(), '|', ...args); }

        async function initButtons() {
            mpLog('initButtons 开始');
            // === 第一步：同步清理 ===
            document.querySelectorAll('.outgoingmp-btn-row').forEach(r => r.remove());
            document.querySelectorAll('.outgoingmp-info').forEach(e => e.remove());
            const prevParent = document.querySelector('[data-outgoing-mp-added]');
            if (prevParent) delete prevParent.dataset.outgoingMpAdded;

            const resourceId = parseResourceId();
            const realmId = getRealmIdFromLink();
            if (!resourceId || realmId === null) { mpLog('initButtons 退出: 无resourceId或realmId'); return; }
            mpLog('initButtons resourceId:', resourceId, 'realmId:', realmId);

            const priceInput = document.querySelector('input[name="price"]');
            if (!priceInput) { mpLog('initButtons 退出: 无priceInput'); return; }

            const parentDiv = priceInput.parentElement;
            if (!parentDiv || parentDiv.dataset.outgoingMpAdded) { mpLog('initButtons 退出: 已注入或无parentDiv'); return; }
            parentDiv.dataset.outgoingMpAdded = 'true';

            // 监听输入框手动修改：开关开启时自动刷新按钮
            if (!priceInput.hasAttribute('data-outgoingmp-listener')) {
                priceInput.setAttribute('data-outgoingmp-listener', 'true');
                let _refreshTimer;
                priceInput.addEventListener('input', () => {
                    if (_skipInputRefresh) return;
                    if (!isUseInputEnabled()) return;
                    clearTimeout(_refreshTimer);
                    _refreshTimer = setTimeout(() => initButtons(), 300);
                });
            }

            const isContract = /\/contract\/?$/.test(location.href);
            mpLog('isContract:', isContract);
            const allBtn = parentDiv.parentElement?.querySelector('button.btn-secondary');
            const btnClass = allBtn ? allBtn.className : 'btn btn-secondary';

            // === 第二步：按钮行容器立即插入 DOM ===
            const btnRow = document.createElement('div');
            btnRow.className = 'outgoingmp-btn-row';
            btnRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:5px;';

            if (isContract) {
                const configBtn = document.createElement('button');
                configBtn.type = 'button';
                configBtn.className = btnClass;
                configBtn.textContent = '+';
                configBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); showConfigModal(); };
                btnRow.appendChild(configBtn);
            }

            // 占位信息（按钮行已可见）
            const infoSpan = document.createElement('span');
            infoSpan.className = 'outgoingmp-info';
            infoSpan.style.cssText = `font-size:11px;color:${DM() ? '#aaa' : '#666'};white-space:nowrap;margin-left:4px;`;
            infoSpan.textContent = '⌛ 加载中...';
            btnRow.appendChild(infoSpan);
            parentDiv.appendChild(btnRow);
            mpLog('按钮行已插入DOM');

            // === 第三步：品质 + 市场数据 ===
            mpLog('开始 parseQuality...');
            const quality = await parseQuality();
            _qualityCache[resourceId] = quality; // 缓存品质供 calcAndDisplayProfit 使用
            mpLog('parseQuality 完成, quality:', quality);

            // Phase 1: 读缓存（同步）
            mpLog('读取缓存...');
            const cacheResult = getCachedMarketData(realmId, resourceId);
            const cachedData = cacheResult.data;
            const cacheAge = cacheResult.ts ? Date.now() - cacheResult.ts : Infinity;
            mpLog('缓存结果:', cachedData ? `有数据(${cachedData.length}条) age=${cacheAge}ms` : '无缓存');
            const cachedMpInfo = cachedData ? findLowestMP(cachedData, resourceId, quality) : null;
            mpLog('缓存最低价:', JSON.stringify(cachedMpInfo));

            if (cachedMpInfo) {
                if (cachedMpInfo.quality !== quality) {
                    // 最便宜的在更高品质，但目标品质本身可能有货也可能无货
                    const exactPrice = findExactQualityPrice(cachedData, quality);
                    if (exactPrice !== null) {
                        infoSpan.textContent = `Q${quality}有 $${exactPrice}·参考Q${cachedMpInfo.quality} $${cachedMpInfo.price}`;
                    } else {
                        infoSpan.textContent = `Q${quality}无货·参考Q${cachedMpInfo.quality} $${cachedMpInfo.price}`;
                    }
                } else {
                    infoSpan.textContent = `Q${cachedMpInfo.quality}最低 $${cachedMpInfo.price}`;
                }
            } else if (cachedData) {
                // 有市场数据但无匹配品质
                let foundHigher = null;
                for (let q = quality + 1; q <= 12; q++) {
                    const hi = findLowestMP(cachedData, resourceId, q);
                    if (hi) { foundHigher = hi; break; }
                }
                if (foundHigher) {
                    infoSpan.textContent = `Q${quality}无货·参考Q${foundHigher.quality} $${foundHigher.price}`;
                } else {
                    infoSpan.textContent = quality === 0 ? '无市场数据' : `无≥Q${quality}`;
                }
            } else {
                infoSpan.textContent = '⌛ 请求市场数据...';
            }

            // 用缓存数据先渲染按钮（如有）
            const renderButtons = (marketData, mpBasePrice, source) => {
                mpLog('renderButtons 调用, source:', source, 'mpBasePrice:', mpBasePrice, 'data:', marketData ? `${marketData.length}条` : 'null');
                // 清除之前可能存在的 MP 按钮（保留 config 按钮和 infoSpan）
                btnRow.querySelectorAll('.outgoingmp-mpbtn').forEach(b => b.remove());

                const currentVal2 = parseFloat(priceInput.value);
                const useInput2 = isUseInputEnabled() && currentVal2 > 0;

                if (isUseInputEnabled() && !(currentVal2 > 0) && mpBasePrice > 0) {
                    infoSpan.textContent = (infoSpan.textContent || '') + '（已用市场价）';
                }

                const createPresetBtn = (basePrice, presets, labelMap) => {
                    if (basePrice <= 0) return;
                    presets.slice().reverse().forEach(preset => {
                        const rawTarget = calcTargetPrice(basePrice, preset);
                        if (rawTarget === null) return;
                        const rounded = Math.round(rawTarget * 1000) / 1000;
                        const btn = document.createElement('button');
                        btn.type = 'button'; btn.className = btnClass + ' outgoingmp-mpbtn';
                        btn.textContent = labelMap ? labelMap(preset) : preset;
                        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, rounded); };
                        btnRow.appendChild(btn);
                    });
                };

                if (isContract) {
                    if (!useInput2) {
                        const presets = loadPresets();
                        const mpPresets = presets.filter(p => !/^vwap/i.test(p.trim()));
                        if (mpPresets.length > 0) {
                            createPresetBtn(mpBasePrice, mpPresets, null);
                        }
                    } else {
                        createPresetBtn(currentVal2, loadPresets(), null);
                    }
                } else {
                    if (mpBasePrice > 0) {
                        const step = getSellStep(mpBasePrice);
                        const mpRounded = roundToStep(mpBasePrice, false);
                        const btnMP = document.createElement('button');
                        btnMP.type = 'button'; btnMP.className = btnClass + ' outgoingmp-mpbtn';
                        btnMP.textContent = `市场价 $${mpRounded}`;
                        btnMP.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, mpRounded); };
                        btnRow.appendChild(btnMP);
                        const oneDown = roundToStep(mpBasePrice - step, false);
                        if (oneDown > 0 && Math.abs(oneDown - mpRounded) > 1e-9) {
                            const btn1s = document.createElement('button');
                            btn1s.type = 'button'; btn1s.className = btnClass + ' outgoingmp-mpbtn';
                            btn1s.textContent = `压价 $${oneDown}`;
                            btn1s.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, oneDown); };
                            btnRow.appendChild(btn1s);
                        }
                    }
                }
            };

            // 用缓存数据先渲染（如果有）
            if (cachedMpInfo || cachedData) {
                renderButtons(cachedData, cachedMpInfo ? cachedMpInfo.price : 0, '缓存');
            }

            // Phase 2: 缓存过期(>1分钟)则后台刷新一次，不阻塞按钮
            const CACHE_MAX_AGE = 60000;
            if (!cachedData) {
                mpLog('无缓存, 请求网络...');
                const tStart = Date.now();
                const freshData = await refreshMarketData(realmId, resourceId);
                mpLog('网络请求完成, 耗时:', Date.now() - tStart, 'ms, 结果:', freshData ? `${freshData.length}条` : 'null');
                const freshMpInfo = freshData ? findLowestMP(freshData, resourceId, quality) : null;
                if (freshMpInfo) {
                    if (freshMpInfo.quality !== quality) {
                        const exactPrice = findExactQualityPrice(freshData, quality);
                        if (exactPrice !== null) {
                            infoSpan.textContent = `Q${quality}有 $${exactPrice}·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                        } else {
                            infoSpan.textContent = `Q${quality}无货·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                        }
                    } else {
                        infoSpan.textContent = `Q${freshMpInfo.quality}最低 $${freshMpInfo.price}`;
                    }
                } else {
                    infoSpan.textContent = '无市场数据';
                }
                renderButtons(freshData, freshMpInfo ? freshMpInfo.price : 0, '网络');
            } else {
                mpLog('有缓存(age=' + cacheAge + 'ms)', cacheAge > CACHE_MAX_AGE ? '过期,后台刷新' : '有效,不刷新');
                // 过期则提示并后台刷新一次（不阻塞当前按钮）
                if (cacheAge > CACHE_MAX_AGE) {
                    infoSpan.textContent = (infoSpan.textContent || '') + ' ⌛更新中...';
                    refreshMarketData(realmId, resourceId).then(freshData => {
                        if (freshData) {
                            const freshMpInfo = findLowestMP(freshData, resourceId, quality);
                            if (freshMpInfo) {
                                if (freshMpInfo.quality !== quality) {
                                    const exactPrice = findExactQualityPrice(freshData, quality);
                                    if (exactPrice !== null) {
                                        infoSpan.textContent = `Q${quality}有 $${exactPrice}·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                                    } else {
                                        infoSpan.textContent = `Q${quality}无货·参考Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                                    }
                                } else {
                                    infoSpan.textContent = `Q${freshMpInfo.quality}最低 $${freshMpInfo.price}`;
                                }
                            }
                            renderButtons(freshData, freshMpInfo ? freshMpInfo.price : 0, '后台刷新');
                        }
                    }).catch(() => { });
                }
            }

            // === 第五步：仅当预设中有VWAP时才获取VWAP ===
            if (isContract) {
                const presets = loadPresets();
                const hasVWAPPreset = presets.some(p => /^vwap/i.test(p.trim()));
                if (hasVWAPPreset) {
                    mpLog('启动 VWAP 获取...');
                    getVWAPData(realmId, resourceId, quality).then(vwap => {
                        mpLog('VWAP 结果:', vwap);
                        if (vwap !== null && vwap > 0) {
                            // 追加 VWAP 提示
                            infoSpan.textContent = (infoSpan.textContent || '') + ` | VWAP $${vwap.toFixed(2)}`;
                            // 追加 VWAP 预设按钮
                            if (presets.length > 0) {
                                const seenLabels = new Set();
                                presets.slice().reverse().forEach(preset => {
                                    const rawTarget = calcTargetPrice(vwap, preset);
                                    if (rawTarget === null) return;
                                    const label = preset.replace(/^mp/i, 'VWAP');
                                    if (seenLabels.has(label)) return;
                                    seenLabels.add(label);
                                    const rounded = Math.round(rawTarget * 1000) / 1000;
                                    const btn = document.createElement('button');
                                    btn.type = 'button'; btn.className = btnClass;
                                    btn.textContent = label;
                                    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setInputValue(priceInput, rounded); };
                                    btnRow.appendChild(btn);
                                });
                            }
                            mpLog('VWAP 按钮追加完成');
                        }
                    }).catch(e => { mpLog('VWAP 错误:', e); });
                } else {
                    mpLog('预设中无VWAP, 跳过');
                }
            }
            mpLog('initButtons 完成');
        }

        // ===== 运输利润计算 & 展示 =====
        let _profitObserver = null;
        let _profitCalcTimer = null;
        let _inputListenerBound = false;
        let _profitDetailExpanded = false;
        let _lastProfitKey = ''; // 去重：上次计算的 (资源+价格+数量) 键

        function startProfitObserver() {
            if (_profitObserver) _profitObserver.disconnect();

            const schedule = () => {
                clearTimeout(_profitCalcTimer);
                _profitCalcTimer = setTimeout(calcAndDisplayProfit, 200);
            };

            // 监听 DOM 变化（仅关心运输元素出现/消失的节点变更）
            _profitObserver = new MutationObserver((mutations) => {
                const isOwnMutation = mutations.some(m => {
                    let el = m.target;
                    while (el) {
                        if (el.classList && el.classList.contains('sc-profit-display')) return true;
                        el = el.parentElement;
                    }
                    return false;
                });
                // 只在添加了有意义的新节点时才触发，忽略纯文本变更
                const hasRelevantNode = mutations.some(m =>
                    m.type === 'childList' && m.addedNodes.length > 0
                );
                if (!isOwnMutation && hasRelevantNode) schedule();
            });
            _profitObserver.observe(document.body, { childList: true, subtree: true });

            // 监听输入框变化（React 受控组件不触发 characterData）
            if (!_inputListenerBound) {
                _inputListenerBound = true;
                document.addEventListener('input', (e) => {
                    if (e.target.matches('input[name="price"], input[name="amount"], input[name="quantity"]')) {
                        schedule();
                    }
                });
            }

            // 初始触发一次
            setTimeout(calcAndDisplayProfit, 300);
        }

        async function calcAndDisplayProfit() {
            mpLog('calcAndDisplayProfit 触发');
            const onPage = /\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/.test(location.href);
            if (!onPage) { mpLog('calcAndDisplayProfit: 不在目标页面'); return; }

            const isContract = /\/contract\/?$/.test(location.href);

            // 先获取价格和数量，未填则不出利润
            const priceInput = document.querySelector('input[name="price"]');
            const qtyInput = document.querySelector('input[name="amount"], input[name="quantity"]');
            if (!priceInput || !qtyInput) { return; }
            const price = parseFloat(priceInput.value) || 0;
            const quantity = parseFloat(qtyInput.value) || 0;
            if (price <= 0 || quantity <= 0) { return; }

            // 去重：价格和数量没变则跳过（避免频繁触发 parseQuality）
            const profitKey = `${parseResourceId()}_${price}_${quantity}`;
            if (profitKey === _lastProfitKey) { mpLog('calcAndDisplayProfit 跳过: 值未变'); return; }
            _lastProfitKey = profitKey;

            // 获取资源ID、品质
            const resourceId = parseResourceId();
            const quality = await parseQuality();
            if (!resourceId) { return; }

            // 从 constantsResources 获取每单位运输用量（transportation 字段）
            const SCD = (() => { try { return JSON.parse(localStorage.getItem('SimcompaniesConstantsData')); } catch (e) { return null; } })();
            if (!SCD) { return; }
            const resourceInfo = SCD?.constantsResources?.[resourceId];
            const perUnitTransport = resourceInfo?.transportation ?? 0;

            // 计算运输总量（游戏向上取整；合同运输量始终减半，市场出售始终全量）
            const contractExactTransport = perUnitTransport * quantity * 0.5;
            const contractTransportTotal = Math.ceil(contractExactTransport);
            const sellExactTransport = perUnitTransport * quantity * 1;
            const sellTransportTotal = Math.ceil(sellExactTransport);

            // 从缓存读取仓库数据
            const realmId = getRealmIdFromLink();
            if (realmId === null) { return; }
            const SRC = (() => { try { return JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`)); } catch (e) { return null; } })();
            const warehouse = SRC?.warehouseResources;
            if (!warehouse || !Array.isArray(warehouse)) { return; }

            // 找产品单位成本（cost 总和 / amount）
            let productUnitCost = 0;
            const productEntries = warehouse.filter(e => e.kind === resourceId && e.quality === quality);
            if (productEntries.length > 0) {
                const e = productEntries[0];
                const costSum = Object.values(e.cost || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
                productUnitCost = e.amount > 0 ? costSum / e.amount : 0;
            }

            // 找运输单位成本（资源ID=13，无品质区分）
            let transportUnitCost = 0;
            const transportEntries = warehouse.filter(e => e.kind === 13);
            if (transportEntries.length > 0) {
                const e = transportEntries[0];
                const costSum = Object.values(e.cost || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
                transportUnitCost = e.amount > 0 ? costSum / e.amount : 0;
            }

            const revenue = price * quantity;
            const productCost = productUnitCost * quantity;
            const contractTransportCost = contractTransportTotal * transportUnitCost;
            const sellTransportCost = sellTransportTotal * transportUnitCost;
            const contractNet = revenue - productCost - contractTransportCost;
            const marketNet = revenue * 0.96 - productCost - sellTransportCost;

            // 运输向上取整提醒
            const sellWasteTransport = sellTransportTotal - sellExactTransport;
            const transportWasteNote = (sellWasteTransport > 0.001 && perUnitTransport > 0)
                ? `运输向上取整：消耗 ${sellTransportTotal} 运输单位，浪费 ${sellWasteTransport.toFixed(2)} 单位` : '';

            const grossProfit = revenue - productCost;
            const marketFee = revenue * 0.04;

            const d = DM();
            const profitColor = (v) => v >= 0 ? '#4CAF50' : '#f44336';
            const fmt = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // === 增量更新：检查是否已有展示元素 ===
            const existingDisplay = document.querySelector('.sc-profit-display');

            if (existingDisplay) {
                // 已有元素：仅更新文本值（不重建DOM，避免闪烁）
                _profitDetailExpanded = existingDisplay.getAttribute('data-expanded') === 'true';

                // 更新摘要
                const summary = existingDisplay.querySelector('#sc-profit-summary');
                if (summary) {
                    if (isContract) {
                        summary.innerHTML = `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
                    } else {
                        summary.innerHTML = `<span>市场利润: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>` +
                            `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
                    }
                }

                // 更新明细表格中各单元格
                const setVal = (id, text, color) => {
                    const el = existingDisplay.querySelector('#' + id);
                    if (el) { el.textContent = text; if (color) el.style.color = color; }
                };
                if (isContract) {
                    setVal('sc-pd-revenue', fmt(revenue));
                    setVal('sc-pd-cost', '-' + fmt(productCost));
                    setVal('sc-pd-fee', fmt(0));
                    setVal('sc-pd-transport', '-' + fmt(contractTransportCost));
                    const pEl = existingDisplay.querySelector('#sc-pd-profit');
                    if (pEl) { pEl.textContent = fmt(contractNet); pEl.style.color = profitColor(contractNet); }
                } else {
                    setVal('sc-pd-m-revenue', fmt(revenue));
                    setVal('sc-pd-c-revenue', fmt(revenue));
                    setVal('sc-pd-m-cost', '-' + fmt(productCost));
                    setVal('sc-pd-c-cost', '-' + fmt(productCost));
                    setVal('sc-pd-m-fee', '-' + fmt(marketFee));
                    setVal('sc-pd-c-fee', fmt(0));
                    setVal('sc-pd-m-transport', '-' + fmt(sellTransportCost));
                    setVal('sc-pd-c-transport', '-' + fmt(contractTransportCost));
                    const mpEl = existingDisplay.querySelector('#sc-pd-m-profit');
                    if (mpEl) { mpEl.textContent = fmt(marketNet); mpEl.style.color = profitColor(marketNet); }
                    const cpEl = existingDisplay.querySelector('#sc-pd-c-profit');
                    if (cpEl) { cpEl.textContent = fmt(contractNet); cpEl.style.color = profitColor(contractNet); }
                }

                // 更新运输浪费提醒
                const wasteEl = existingDisplay.querySelector('#sc-pd-waste');
                if (wasteEl) {
                    if (transportWasteNote) { wasteEl.textContent = '⚠️ ' + transportWasteNote; wasteEl.style.display = ''; }
                    else { wasteEl.style.display = 'none'; }
                } else if (transportWasteNote) {
                    const w = document.createElement('div');
                    w.id = 'sc-pd-waste';
                    w.style.cssText = 'color:#FF9800;margin-top:4px;';
                    w.textContent = '⚠️ ' + transportWasteNote;
                    const detail = existingDisplay.querySelector('#sc-profit-detail');
                    if (detail) detail.after(w);
                }
                return;
            }

            // === 首次创建 ===
            const isNarrow = window.innerWidth <= 576;
            const displayDiv = document.createElement('div');
            displayDiv.className = 'sc-profit-display';
            displayDiv.style.cssText = `
                margin: ${isNarrow ? '4px 0' : '8px 0'};
                padding: ${isNarrow ? '6px 10px' : '10px 14px'};
                border-radius: 8px;
                background: ${d ? '#1a2e1a' : '#e8f5e9'};
                border: 1px solid ${d ? '#2a5a2a' : '#c8e6c9'};
                line-height: 1.6;
                color: ${d ? '#efefef' : '#333'};
                font-family: sans-serif;
                user-select: none;
            `;

            let html = `<div id="sc-profit-header" style="font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:4px;">
                <span id="sc-profit-arrow">${_profitDetailExpanded ? '▼' : '▶'}</span> 📊 利润明细
            </div>`;

            html += `<div id="sc-profit-summary" style="display:flex;flex-wrap:wrap;gap:${isNarrow ? '4px' : '16px'};margin-top:4px;">`;
            if (isContract) {
                html += `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
            } else {
                html += `<span>市场利润: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>`;
                html += `<span>合同利润: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
            }
            html += `</div>`;

            const thStyle = `padding:2px 6px;text-align:right;font-weight:bold;color:${d ? '#aaa' : '#666'};`;
            const tdStyle = `padding:2px 6px;text-align:right;white-space:nowrap;`;
            const rowStyle = `border-bottom:1px solid ${d ? '#333' : '#e0e0e0'};`;
            const labelTd = (t, bold) => `<td style="${thStyle}text-align:left;${bold ? 'font-weight:bold;' : ''}">${t}</td>`;
            html += `<div id="sc-profit-detail" style="display:${_profitDetailExpanded ? 'block' : 'none'};margin-top:6px;">
                <table style="border-collapse:collapse;width:100%;">`;
            if (isContract) {
                html += `<tr>${labelTd('')}<th style="${thStyle}">合同</th></tr>
                    <tr style="${rowStyle}">${labelTd('收入')}<td id="sc-pd-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('成本')}<td id="sc-pd-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('手续费')}<td id="sc-pd-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('运输费用')}<td id="sc-pd-transport" style="${tdStyle};color:#f44336;">-${fmt(contractTransportCost)}</td></tr>
                    <tr>${labelTd('利润', true)}<td id="sc-pd-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
            } else {
                html += `<tr>${labelTd('')}<th style="${thStyle}">市场</th><th style="${thStyle}">合同</th></tr>
                    <tr style="${rowStyle}">${labelTd('收入')}<td id="sc-pd-m-revenue" style="${tdStyle}">${fmt(revenue)}</td><td id="sc-pd-c-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('成本')}<td id="sc-pd-m-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td><td id="sc-pd-c-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('手续费')}<td id="sc-pd-m-fee" style="${tdStyle};color:#f44336;">-${fmt(marketFee)}</td><td id="sc-pd-c-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd('运输费用')}<td id="sc-pd-m-transport" style="${tdStyle};color:#f44336;">-${fmt(sellTransportCost)}</td><td id="sc-pd-c-transport" style="${tdStyle};color:#f44336;">-${fmt(contractTransportCost)}</td></tr>
                    <tr>${labelTd('利润', true)}<td id="sc-pd-m-profit" style="${tdStyle};font-weight:bold;color:${profitColor(marketNet)};">${fmt(marketNet)}</td><td id="sc-pd-c-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
            }
            html += `</table></div>`;

            if (transportWasteNote) {
                html += `<div id="sc-pd-waste" style="color:#FF9800;margin-top:4px;">⚠️ ${transportWasteNote}</div>`;
            }

            displayDiv.innerHTML = html;
            displayDiv.setAttribute('data-expanded', _profitDetailExpanded ? 'true' : 'false');

            displayDiv.querySelector('#sc-profit-header').addEventListener('click', () => {
                const detail = displayDiv.querySelector('#sc-profit-detail');
                const arrow = displayDiv.querySelector('#sc-profit-arrow');
                if (detail.style.display === 'none') {
                    detail.style.display = 'block';
                    arrow.textContent = '▼';
                    _profitDetailExpanded = true;
                } else {
                    detail.style.display = 'none';
                    arrow.textContent = '▶';
                    _profitDetailExpanded = false;
                }
                displayDiv.setAttribute('data-expanded', _profitDetailExpanded ? 'true' : 'false');
            });

            const rowContainer = priceInput.closest('.row');
            if (rowContainer && rowContainer.parentNode) {
                rowContainer.parentNode.insertBefore(displayDiv, rowContainer.nextSibling);
            }
        }

        function init() {
            mpLog('init 被调用');
            // 清理旧缓存（SPA 切换页面时）
            _qualityCache = {};
            _lastProfitKey = '';
            if (initTimer) { clearInterval(initTimer); initTimer = null; }
            document.querySelectorAll('.outgoingmp-btn-row').forEach(r => r.remove());
            document.querySelectorAll('.outgoingmp-info').forEach(e => e.remove());
            document.querySelectorAll('.sc-profit-display').forEach(e => e.remove());
            const prev = document.querySelector('[data-outgoing-mp-added]');
            if (prev) delete prev.dataset.outgoingMpAdded;

            // 启动运输利润计算观察器
            mpLog('启动 startProfitObserver');
            startProfitObserver();

            // 如果价格输入框已存在，直接初始化
            if (document.querySelector('input[name="price"]')) {
                mpLog('priceInput 已存在, 直接调用 initButtons');
                initButtons();
                return;
            }

            mpLog('priceInput 未找到, 启动轮询');
            // 持续轮询（不设上限），处理 SPA 内 URL 不变但 DOM 变化的场景
            // 离开页面时自动停止
            initTimer = setInterval(() => {
                const onPage = /\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/.test(location.href);
                if (!onPage) { mpLog('轮询: 离开页面, 停止'); clearInterval(initTimer); initTimer = null; return; }
                if (document.querySelector('input[name="price"]')) {
                    mpLog('轮询: 发现 priceInput, 调用 initButtons');
                    clearInterval(initTimer);
                    initTimer = null;
                    initButtons();
                }
            }, 500);
        }

        return { init };
    })();

    // ======================
    // 模块19：仓库中计算传统零售物品的时利润
    // ======================
    const WarehouseRetailProfit = (function () {
        const workerCode = `
        self.onmessage = function(e) {
        const { items, shared, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
        if (!items || !items.length) { self.postMessage([]); return; }

        const lwe = shared.SCD.retailInfo;
        const zn = shared.SCD.data;
        const SRC = shared.SRC;
        const acceleration = SRC.acceleration;
        const size = 1;

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
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, sz, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / sz;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
        };

        const results = [];

        for (const item of items) {
            const { idx, unitCost, quality, quantity, resourceId, itemSaturation, itemForceQuality } = item;

            const economyState = shared.economyState;
            const buildingKind = shared.buildingKind;
            const wagesVal = shared.wages;
            const v = shared.v;
            const b = shared.b;
            const weather = shared.weather;

            // 成本价（兼容 unitCost 可能为 0 的情况）
            const startPrice = Math.max(Math.ceil(unitCost) || 1, 1);
            let currentPrice = startPrice;
            let maxProfit = -Infinity;
            let bestPrice = currentPrice;

            while (currentPrice > 0) {
                const modeledData = wv(economyState, resourceId, itemForceQuality ?? null);
                const w = zL(
                    buildingKind,
                    modeledData,
                    quantity,
                    v,
                    currentPrice,
                    itemForceQuality === void 0 ? quality : 0,
                    itemSaturation,
                    acceleration,
                    size,
                    weather
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wagesVal * acceleration * b / 3600);
                const secondsToFinish = w;

                if (!secondsToFinish || secondsToFinish <= 0) break;

                const profit = (revenue - unitCost * quantity - wagesTotal) / secondsToFinish;
                if (profit > maxProfit) {
                    maxProfit = profit;
                    bestPrice = currentPrice;
                }

                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }

            results.push({
                idx,
                maxProfit: maxProfit > -Infinity ? maxProfit * 3600 : null,
                bestPrice: maxProfit > -Infinity ? bestPrice : null
            });
        }

        self.postMessage(results);
        };
        `;
        const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
        const pendingItems = new Map(); // idx -> DOM element

        profitWorker.onmessage = function (e) {
            const results = e.data;
            if (!Array.isArray(results)) return;
            if (!Array.isArray(results)) return;

            for (const item of results) {
                const { idx, maxProfit, bestPrice } = item;
                const el = pendingItems.get(idx);
                if (!el) continue;
                pendingItems.delete(idx);

                if (maxProfit !== null && isFinite(maxProfit)) {
                    const profitColor = maxProfit >= 0 ? '#4CAF50' : '#f44336';
                    const prefix = maxProfit >= 0 ? '' : '⚠️';
                    el.textContent = `${prefix}时利润:${maxProfit.toFixed(2)}`;
                    el.style.color = profitColor;
                } else {
                    el.textContent = '无法计算';
                    el.style.color = '#888';
                }
                el.style.fontWeight = 'bold';
            }
        };

        // 从百科全书链接解析资源ID（同模块18）
        function parseResourceId() {
            const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
            if (!link) return null;
            const match = link.href.match(/\/resource\/(\d+)\//);
            return match ? parseInt(match[1], 10) : null;
        }

        // 在给定容器内解析品质（星标 SVG）
        function parseQualityFromContainer(container) {
            const starSelectors = [
                'svg[data-icon="star"]',
                'svg.fa-star',
                '.fa-star',
                '[class*="fa-star"]',
            ];
            for (const sel of starSelectors) {
                try {
                    const stars = container.querySelectorAll(sel);
                    if (stars.length === 0) continue;
                    const groups = new Map();
                    stars.forEach(svg => {
                        const p = svg.parentElement;
                        if (!groups.has(p)) groups.set(p, []);
                        groups.get(p).push(svg);
                    });
                    let maxQ = 0;
                    for (const [parent, svgs] of groups) {
                        const txt = parent.textContent?.trim() || '';
                        const numMatch = txt.match(/^(\d+)/);
                        if (numMatch) {
                            const q = parseInt(numMatch[1], 10);
                            if (q > maxQ) maxQ = q;
                        } else if (svgs.length > maxQ) {
                            maxQ = svgs.length;
                        }
                    }
                    if (maxQ > 0) return maxQ;
                } catch (e) { /* 选择器无效则跳过 */ }
            }
            return 0;
        }

        // 基于结构查找物品堆叠容器（不依赖特定CSS类名，兼容锁定/未锁定两种状态）
        function findItemStacks() {
            const costRows = document.querySelectorAll('.css-16qjhms');
            const stacks = new Set();
            costRows.forEach(row => {
                // 向上遍历找到包含数量和成本信息的顶层容器
                let el = row.parentElement;
                while (el && el !== document.body) {
                    // 检查是否同时包含数量 <b> 和成本行 .css-16qjhms
                    const hasQuantity = el.querySelector('span.css-nzibbl > b');
                    if (hasQuantity) {
                        stacks.add(el);
                        break;
                    }
                    el = el.parentElement;
                }
            });
            return [...stacks];
        }

        // 在堆叠容器中找到数量/品质所在行的 div（跳过锁定图标）
        function findQuantityRow(stack) {
            const bEl = stack.querySelector('span.css-nzibbl > b');
            if (!bEl) return null;
            // 从 <b> 向上遍历，找到 stack 的直接子 div
            let el = bEl.parentElement; // span.css-nzibbl
            while (el && el.parentElement !== stack) {
                el = el.parentElement;
            }
            return el; // stack 的直接子 div（包含 <b> 和星星）
        }

        // 判断是否为仓库物品页面（非 sell/contract 子页面）
        function isWarehouseItemPage() {
            const url = location.href;
            return /\/headquarters\/warehouse\/(?!.*\/(?:sell|contract)\/?$)[^\/]+\/?$/.test(url);
        }

        // 注入自定义高管数据开关按钮（放到资源ID链接的父元素前面）
        function injectCustomToggle() {
            // 全局查重，防止多次注入
            if (document.querySelector('[data-warehouse-custom-toggle]')) return;

            const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
            if (!link) return;
            const parent = link.parentElement;
            if (!parent) return;

            const toggleContainer = document.createElement('span');
            toggleContainer.dataset.warehouseCustomToggle = 'true';
            toggleContainer.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:8px;';

            const toggle = createGlobalCustomToggle(
                'executiveCustomToggle',
                '自定义',
                { buttonClass: 'btn btn-primary' },
                () => {
                    // 刷新仓库时利润计算
                    document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                    pendingItems.clear();
                    calculateAndDisplay();
                }
            );
            toggle.wrapper.style.marginLeft = '0';
            toggleContainer.appendChild(toggle.wrapper);

            // 自定义高管数据按钮
            const customBtn = document.createElement('button');
            customBtn.type = 'button';
            customBtn.textContent = '自定义高管数据';
            customBtn.style.cssText = 'padding:4px 10px;background:#2196f3;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;white-space:nowrap;';
            customBtn.onclick = (e) => {
                e.preventDefault();
                if (typeof executiveCustomButton !== 'undefined') executiveCustomButton.show();
            };
            toggleContainer.appendChild(customBtn);

            // 插入到父元素前面
            parent.parentNode.insertBefore(toggleContainer, parent);
        }

        function calculateAndDisplay() {
            if (!isWarehouseItemPage()) return;

            const resourceId = parseResourceId();
            if (!resourceId) return;

            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            if (realmId === null) return;

            // 预检查：是否为零售物品
            const SCD_raw = localStorage.getItem('SimcompaniesConstantsData');
            if (!SCD_raw) return;
            const SCD = JSON.parse(SCD_raw);
            const isRetail = Object.values(SCD.data.SALES || {}).some(arr => arr.includes(resourceId));
            if (!isRetail) return;

            const SRC_raw = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
            if (!SRC_raw) return;
            const SRC = JSON.parse(SRC_raw);
            const warehouseResources = SRC.warehouseResources;
            if (!warehouseResources || !Array.isArray(warehouseResources)) return;

            // 查找页面上所有物品堆叠（基于结构，兼容不同CSS类名和锁定状态）
            const stacks = findItemStacks();
            if (stacks.length === 0) return;

            // 注入自定义高管数据开关（放到资源ID链接的父元素前面）
            injectCustomToggle();

            const zn = SCD.data;

            // 构建共享上下文
            const pageActionsConfig = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
            const isCustomEnabled = pageActionsConfig['executiveCustomToggle'] === true;

            let skillCMO, skillCOO;
            if (isCustomEnabled) {
                const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
                try {
                    const SSB = JSON.parse(localStorage.getItem(bonusKey));
                    if (SSB) { skillCMO = SSB.saleBonus; skillCOO = SSB.adminBonus; }
                    else { skillCMO = SRC.saleBonus; skillCOO = SRC.adminBonus; }
                } catch (e) { skillCMO = SRC.saleBonus; skillCOO = SRC.adminBonus; }
            } else {
                skillCMO = SRC.saleBonus;
                skillCOO = SRC.adminBonus;
            }

            const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
            const buildingKind = Object.entries(zn.SALES).find(([, ids]) => ids.includes(resourceId))?.[0];
            const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
            const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);

            const economySelectEl = document.getElementById('sc-economy-select');
            const economyState = (economySelectEl && economySelectEl.value !== '')
                ? parseInt(economySelectEl.value) : SRC.economyState;

            const v = salesModifierWithRecreationBonus + skillCMO;
            const b = (() => {
                const r = SRC.administration || 1;
                return r - (r - 1) * skillCOO / 100;
            })();

            const resourceDetail = SCD.constantsResources?.[resourceId];
            const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                ? SRC.sellingSpeedMultiplier : undefined;

            const shared = {
                SCD, SRC,
                economyState, buildingKind, wages,
                v, b, weather
            };

            const list = SRC.ResourcesRetailInfo || [];
            const orders = [];
            let idx = 0;

            stacks.forEach(stack => {
                // 防止重复注入
                if (stack.querySelector('.sc-warehouse-profit')) return;

                // 解析数量：<b> 标签内的数字
                const bEl = stack.querySelector('b');
                const rawQty = bEl ? bEl.textContent?.replace(/,/g, '') : '0';
                const quantity = parseFloat(rawQty) || 0;
                if (quantity <= 0) return;

                // 解析品质
                const quality = parseQualityFromContainer(stack);

                // 在 warehouseResources 中匹配 (kind=resourceId, quality=quality)
                const warehouseEntry = warehouseResources.find(e => e.kind === resourceId && e.quality === quality);
                if (!warehouseEntry) return;

                const costSum = Object.values(warehouseEntry.cost || {}).reduce((s, val) => s + (typeof val === 'number' ? val : 0), 0);
                const unitCost = warehouseEntry.amount > 0 ? costSum / warehouseEntry.amount : 0;

                // 每个物品的饱和度（资源150按品质区分）
                let itemSaturation;
                if (resourceId === 150) {
                    const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                    itemSaturation = m150?.saturation;
                } else {
                    const m = list.find(item => item.dbLetter === resourceId);
                    itemSaturation = m?.saturation;
                }

                const itemForceQuality = (resourceId === 150) ? quality : undefined;

                // 创建展示元素
                const profitEl = document.createElement('span');
                profitEl.className = 'sc-warehouse-profit';
                profitEl.textContent = '计算中...';
                profitEl.style.cssText = 'margin-left:8px;font-size:13px;color:#888;';

                // 插入到数量/品质所在行（跳过可能的锁定图标div）
                const quantityRow = findQuantityRow(stack);
                if (quantityRow) {
                    quantityRow.appendChild(profitEl);
                }

                pendingItems.set(idx, profitEl);
                orders.push({
                    idx,
                    unitCost,
                    quality,
                    quantity,
                    resourceId: String(resourceId),
                    itemSaturation,
                    itemForceQuality
                });
                idx++;
            });

            if (orders.length > 0) {
                profitWorker.postMessage({
                    items: orders,
                    shared,
                    SCXXCS,
                    PROFIT_PER_BUILDING_LEVEL,
                    RETAIL_ADJUSTMENT
                });
            }
        }

        // 页面监听 & DOM 就绪检测
        let initRetries = 0;
        let domObserver = null;

        function tryInit() {
            if (!isWarehouseItemPage()) return;
            const stacks = findItemStacks();
            if (stacks.length > 0) {
                calculateAndDisplay();
                initRetries = 0;
                return;
            }
            if (initRetries < 30) {
                initRetries++;
                setTimeout(tryInit, 400);
            }
        }

        function init() {
            if (typeof window.isPageModuleEnabled === 'function' && !window.isPageModuleEnabled('warehouseProfit')) {
                // 如果关闭，清理可能残留的元素
                document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                document.querySelectorAll('[data-warehouse-custom-toggle]').forEach(e => e.remove());
                if (domObserver) { domObserver.disconnect(); domObserver = null; }
                pendingItems.clear();
                return;
            }
            initRetries = 0;
            // 清理旧展示（SPA 切换物品时）
            document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
            pendingItems.clear();

            if (domObserver) domObserver.disconnect();
            tryInit();

            // 监听 DOM 变化，捕获 React 异步渲染
            domObserver = new MutationObserver(() => {
                if (isWarehouseItemPage()) {
                    const allStacks = findItemStacks();
                    const hasNew = allStacks.length > 0;
                    const hasPending = allStacks.some(s => !s.querySelector('.sc-warehouse-profit'));
                    if (hasNew && hasPending) calculateAndDisplay();
                }
            });
            domObserver.observe(document.body, { childList: true, subtree: true });
        }

        // 全局 URL 变化监听（SPA 导航）
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                if (isWarehouseItemPage()) {
                    setTimeout(init, 400);
                } else {
                    // 离开仓库物品页面时清理注入的按钮和观察器
                    if (domObserver) { domObserver.disconnect(); domObserver = null; }
                    document.querySelectorAll('[data-warehouse-custom-toggle]').forEach(e => e.remove());
                    document.querySelectorAll('.sc-warehouse-profit').forEach(e => e.remove());
                    pendingItems.clear();
                }
            }
        }).observe(document, { subtree: true, childList: true });

        // 首次加载
        setTimeout(init, 600);

        return { init };
    })();

    // ======================
    // 模块20：聊天室色弱辅助
    // ======================
    const ChatAccessibility = (function () {
        // 颜色类表情 → [单中文字] 映射（色弱用户可辨别）
        const EMOJI_TEXT = {
            '🟢': '绿', '🔴': '红', '🟡': '黄', '🔵': '蓝', '🟣': '紫', '🟠': '橙',
            '⚪': '白', '⚫': '黑', '🟤': '棕',
        };

        // 仅在这些聊天室中生效
        const ALLOWED_ROOMS = ['Sales', 'Aerospace sales', '[ZH] 交易'];

        let observer = null;
        let styleInjected = false;

        // 检查功能开关是否开启
        function isEnabled() {
            try {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                return cfg['chatAccessibility'] === true;
            } catch (e) {
                return false;
            }
        }
        function setEnabled(val) {
            try {
                const cfg = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
                cfg['chatAccessibility'] = val;
                localStorage.setItem('SC_PageActions_Settings', JSON.stringify(cfg));
            } catch (e) { }
        }

        // 更新页面上所有切换按钮的状态
        function refreshAllButtons() {
            const enabled = isEnabled();
            document.querySelectorAll('.sc-chat-toggle-btn').forEach(btn => {
                btn.textContent = enabled ? '🟢 文字' : '🔴 图标';
                btn.title = enabled ? '点击切换为原始 Emoji 图标显示' : '点击切换为文字辅助显示（方便色弱识别）';
            });
        }

        // 更新所有聊天容器的辅助状态
        function refreshAllContainers() {
            const enabled = isEnabled();
            findChatContainers().forEach(container => {
                container.classList.toggle('sc-chat-assist', enabled);
            });
        }

        // 注入切换样式
        function injectStyles() {
            if (styleInjected) return;
            styleInjected = true;
            const style = document.createElement('style');
            style.textContent =
                `.sc-chat-emoji-text{display:none;font-size:inherit;vertical-align:middle;font-style:normal;color:inherit}` +
                `.sc-chat-assist .sc-chat-emoji-text{display:inline}` +
                `.sc-chat-assist .sc-chat-emoji-wrapper img.emoji{display:none}`;
            document.head.appendChild(style);
        }

        // 处理单个 emoji：包裹并附加文字替代
        function processEmoji(img) {
            if (img.dataset.scEmojiDone) return;
            const alt = img.getAttribute('alt') || '';
            const text = EMOJI_TEXT[alt];
            if (!text) return;

            img.dataset.scEmojiDone = 'true';

            const wrapper = document.createElement('span');
            wrapper.className = 'sc-chat-emoji-wrapper';
            wrapper.style.cssText = 'display:inline-flex;align-items:center;';

            const textSpan = document.createElement('span');
            textSpan.className = 'sc-chat-emoji-text';
            textSpan.textContent = '[' + text + ']';

            img.parentNode?.insertBefore(wrapper, img);
            wrapper.appendChild(img);
            wrapper.appendChild(textSpan);
        }

        function scanContainer(container) {
            const emojis = container.querySelectorAll('img.emoji:not([data-sc-emoji-done])');
            emojis.forEach(processEmoji);
        }

        // 查找所有聊天消息容器（兼容两种渲染格式）
        function findChatContainers() {
            const byClass = document.querySelectorAll('div.css-xo2rg1.e1llepen2');
            if (byClass.length > 0) return byClass;
            // 后备：通过内联样式匹配（column-reverse + scrollable）
            return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
        }

        // 获取当前聊天室名称
        function getChatRoom() {
            // 优先通过聊天室标识容器查找
            const roomIndicator = document.querySelector('div.css-13udsys.col-lg-6');
            if (roomIndicator) {
                const header = roomIndicator.querySelector('div.well-header.text-uppercase.css-12ztnbp');
                if (header) return header.textContent?.trim() || '';
            }
            // 后备：直接查找 header
            const header = document.querySelector('div.well-header.text-uppercase.css-12ztnbp');
            if (header) return header.textContent?.trim() || '';
            return '';
        }

        // 给所有符合条件的聊天室 header 添加切换按钮
        function addToggleButtons() {
            // 功能开关未开启则不显示按钮
            if (!isEnabled()) return;

            const headers = document.querySelectorAll('div.well-header.text-uppercase.css-12ztnbp');
            headers.forEach(header => {
                // 查重
                if (header.querySelector('.sc-chat-toggle-btn')) return;

                const roomName = header.textContent?.trim() || '';
                if (!ALLOWED_ROOMS.includes(roomName)) return;

                const enabled = isEnabled();
                const btn = document.createElement('button');
                btn.className = 'sc-chat-toggle-btn';
                btn.textContent = enabled ? '🟢 文字' : '🔴 图标';
                btn.title = enabled ? '点击切换为原始 Emoji 图标显示' : '点击切换为文字辅助显示（方便色弱识别）';
                btn.style.cssText = 'background:none;border:1px solid currentColor;border-radius:4px;cursor:pointer;font-size:12px;padding:1px 6px;margin-left:8px;vertical-align:middle;line-height:1.4;color:inherit;opacity:0.8;';

                btn.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const newState = !isEnabled();
                    setEnabled(newState);
                    refreshAllContainers();
                    refreshAllButtons();

                    if (newState) {
                        findChatContainers().forEach(c => scanContainer(c));
                    }

                    if (typeof refreshPageActionToggles === 'function') refreshPageActionToggles();
                };

                header.appendChild(btn);
            });
        }

        // 初始化监听
        function init() {
            if (observer) { observer.disconnect(); observer = null; }

            injectStyles();

            const room = getChatRoom();
            if (!room) {
                setTimeout(init, 1000);
                return;
            }

            if (!ALLOWED_ROOMS.includes(room)) return;

            const chatContainers = findChatContainers();
            if (chatContainers.length === 0) {
                setTimeout(init, 1000);
                return;
            }

            chatContainers.forEach(container => {
                // 先处理所有 emoji（无论开关状态，以便后续 CSS 切换）
                scanContainer(container);
            });

            // 给所有符合条件的聊天室 header 添加切换按钮
            addToggleButtons();

            // 应用当前开关状态到所有容器
            refreshAllContainers();

            // 监听新消息（始终监听，但 CSS 控制显示）
            if (observer) observer.disconnect();
            observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const n of m.addedNodes) {
                        if (n.nodeType === 1) scanContainer(n);
                    }
                }
            });
            chatContainers.forEach(container => {
                observer.observe(container, { childList: true, subtree: true });
            });
        }

        // SPA 页面导航监听
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                setTimeout(init, 500);
            }
        }).observe(document, { subtree: true, childList: true });

        // 延迟启动
        setTimeout(init, 1000);

        return { init, getChatRoom, EMOJI_TEXT, ALLOWED_ROOMS };
    })();

    // ======================
    // 模块21：地图空闲建筑高亮
    // ======================
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
    // 模块22：PA任务答案
    // ======================
    const PAQuestAnswers = (function () {
        const PA_DATA_KEY = 'SC_PA_Quests_Cache';
        const PA_DATA_URL = 'https://sc.22-7.top/scripts/PA-Quests.json';
        const CACHE_TTL = 3600000; // 1小时
        const MATCH_THRESHOLD = 0.7;

        let questData = null;
        let dataLoadAttempted = false;
        let initAttempted = false;
        let observer = null;

        // 检查功能开关
        function isEnabled() {
            return window.isPageModuleEnabled ? window.isPageModuleEnabled('paQuestAnswers') : true;
        }

        // 加载PA数据
        async function loadData() {
            if (dataLoadAttempted) return questData;
            dataLoadAttempted = true;

            // 先读缓存
            const cached = localStorage.getItem(PA_DATA_KEY);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.timestamp < CACHE_TTL) {
                        questData = parsed.data;
                        return questData;
                    }
                } catch (e) { }
            }

            // 请求新数据
            try {
                const resp = await fetch(PA_DATA_URL, { cache: 'no-cache' });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0) {
                    questData = data;
                    localStorage.setItem(PA_DATA_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                }
            } catch (e) {
                console.error('[PA任务] 数据加载失败:', e);
                // 尝试使用过期缓存
                if (!questData && cached) {
                    try { questData = JSON.parse(cached).data; } catch (e2) { }
                }
            }
            return questData;
        }

        // 计算匹配率（忽略空白差异）
        // 优先看问题是否完整出现在文本中（qToT），
        // 再用文本→问题方向防止短文本片段误匹配长问题
        function calcMatchRate(text, question) {
            // 先剔除 $%s、%(...)s 等占位符模式（避免s/d字母残留），
            // 再只保留中文字和英文字母，抛弃数字和特殊符号
            const t = text.toLowerCase().replace(/\s+/g, '').replace(/[^a-z\u4e00-\u9fff]/g, '');
            const q = question.toLowerCase().replace(/\s+/g, '')
                .replace(/\$%s/g, '').replace(/%s/g, '').replace(/%\([\w]+\)\w/g, '')
                .replace(/:re-\d+:/g, '')
                .replace(/[^a-z\u4e00-\u9fff]/g, '');
            if (!q || !t) return 0;

            // 问题→文本：问题的字符在文本中有多少按顺序出现
            let qi = 0;
            for (let ti = 0; ti < t.length && qi < q.length; ti++) {
                if (t[ti] === q[qi]) qi++;
            }
            const qToT = qi / q.length;

            // 文本→问题：文本的字符在问题中有多少按顺序出现
            let ti2 = 0;
            for (let qi2 = 0; qi2 < q.length && ti2 < t.length; qi2++) {
                if (q[qi2] === t[ti2]) ti2++;
            }
            const tToQ = ti2 / t.length;

            // 如果问题已明确出现在文本中（qToT很高），直接以qToT为准
            // 否则取两者最小值防止误匹配
            return qToT >= 0.85 ? qToT : Math.min(qToT, tToQ);
        }

        // 查找最佳匹配
        function findBestMatch(text) {
            if (!questData || !text || text.length < 3) return null;
            let best = null;
            let bestScore = 0;

            for (const q of questData) {
                const variants = [];
                if (q.q_sc) variants.push({ text: q.q_sc, lang: 'sc' });
                if (q.q_tc) variants.push({ text: q.q_tc, lang: 'tc' });
                if (q.q_en) variants.push({ text: q.q_en, lang: 'en' });

                for (const v of variants) {
                    const score = calcMatchRate(text, v.text);
                    if (score > bestScore) {
                        bestScore = score;
                        best = { quest: q, lang: v.lang };
                    }
                }
            }

            return bestScore >= MATCH_THRESHOLD ? best : null;
        }

        // 从元素提取纯文本（跳过链接、脚本等）
        function extractText(element) {
            const parts = [];
            function walk(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = (node.textContent || '').trim();
                    if (t) parts.push(t);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName;
                    if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE') return;
                    for (let child = node.firstChild; child; child = child.nextSibling) {
                        walk(child);
                    }
                }
            }
            walk(element);
            return parts.join('').trim();
        }

        // 从消息元素获取用于匹配的文本段列表
        // 返回数组，每个元素独立匹配，避免拼接答案选项导致双向匹配失败
        function getMessageTexts(element) {
            // PA消息（带 pa-reply 链接）：提取第一个 pa-reply 之前的文本（即问题文本）
            var paReply = element.querySelector('a.pa-reply');
            if (paReply) {
                var parts = [];
                var children = element.children;
                for (var i = 0; i < children.length; i++) {
                    // 遇到包含 pa-reply 的子元素就停止
                    if (children[i].querySelector('a.pa-reply')) break;
                    var t = extractText(children[i]);
                    if (t) parts.push(t);
                }
                if (parts.length > 0) return [parts.join(' ').trim()];
                return [];
            }

            // 聊天消息/其他：优先按子元素分割独立匹配
            var texts = [];
            var children = element.children;
            if (children.length > 1) {
                for (var i = 0; i < children.length; i++) {
                    var childText = extractText(children[i]);
                    if (childText && childText.length > 3) {
                        texts.push(childText);
                    }
                }
                // 同时加入全部合并文本（处理问题被拆分到多个span的情况）
                var fullText = extractText(element);
                if (fullText) texts.push(fullText);
            }
            // 如果子元素分割没有结果，退回到整体提取
            if (texts.length === 0) {
                var fullText = extractText(element);
                if (fullText) texts.push(fullText);
            }
            return texts;
        }

        // 创建答案UI
        function createAnswerUI(match) {
            const { quest, lang } = match;
            const answer = quest['a_' + lang] || quest.a_sc || quest.a_tc || quest.a_en || '';
            const effect = quest.effect || '';

            const box = document.createElement('div');
            box.className = 'sc-pa-answer-box';
            box.style.cssText = 'margin-top:6px;padding:8px 10px;border-radius:6px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:3px;';

            // 答案行
            const answerRow = document.createElement('div');
            answerRow.style.cssText = 'display:flex;align-items:flex-start;gap:6px;';

            const ansLabel = document.createElement('span');
            ansLabel.style.cssText = 'font-weight:bold;color:#16a34a;white-space:nowrap;flex-shrink:0;';
            ansLabel.textContent = '答案：';

            const ansValue = document.createElement('span');
            ansValue.style.cssText = 'color:#333;word-break:break-word;flex:1;';
            ansValue.textContent = answer;

            // 复制按钮（放在行末）
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '复制';
            copyBtn.title = '复制答案和效果';
            copyBtn.style.cssText = 'background:none;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px;padding:0 5px;line-height:1.8;flex-shrink:0;color:#666;transition:all 0.2s;';
            copyBtn.onmouseenter = function () { this.style.borderColor = '#666'; this.style.color = '#333'; };
            copyBtn.onmouseleave = function () { this.style.borderColor = '#ccc'; this.style.color = '#666'; };
            copyBtn.onclick = function (e) {
                e.stopPropagation();
                e.preventDefault();
                const copyStr = '答案: ' + answer + (effect ? '\n效果: ' + effect : '');
                navigator.clipboard.writeText(copyStr).then(function () {
                    copyBtn.textContent = '✅';
                    setTimeout(function () { copyBtn.textContent = '📋'; }, 2000);
                }).catch(function () {
                    const ta = document.createElement('textarea');
                    ta.value = copyStr;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    copyBtn.textContent = '✅';
                    setTimeout(function () { copyBtn.textContent = '📋'; }, 2000);
                });
            };

            answerRow.appendChild(ansLabel);
            answerRow.appendChild(ansValue);
            answerRow.appendChild(copyBtn);
            box.appendChild(answerRow);

            // 效果行
            if (effect) {
                const effectRow = document.createElement('div');
                effectRow.style.cssText = 'display:flex;align-items:flex-start;gap:6px;';

                const effLabel = document.createElement('span');
                effLabel.style.cssText = 'font-weight:bold;color:#ea580c;white-space:nowrap;flex-shrink:0;';
                effLabel.textContent = '效果：';

                const effValue = document.createElement('span');
                effValue.style.cssText = 'color:#555;word-break:break-word;';
                effValue.textContent = effect;

                effectRow.appendChild(effLabel);
                effectRow.appendChild(effValue);
                box.appendChild(effectRow);
            }

            return box;
        }

        // 处理单个消息元素
        function processMessage(element) {
            if (element.scPaProcessed) return;
            element.scPaProcessed = true;

            var texts = getMessageTexts(element);
            for (var ti = 0; ti < texts.length; ti++) {
                if (!texts[ti] || texts[ti].length < 3) continue;
                var match = findBestMatch(texts[ti]);
                if (match) {
                    if (element.querySelector('.sc-pa-answer-box')) return;
                    var answerUI = createAnswerUI(match);
                    element.appendChild(answerUI);
                    return;
                }
            }
        }

        // 扫描页面上的消息
        function scanPage() {
            if (!questData || questData.length === 0) return;

            // 1. 处理 PA 系统消息（通过 pa-reply 链接定位）
            document.querySelectorAll('a.pa-reply').forEach(function (link) {
                let el = link.parentElement;
                for (let i = 0; i < 10 && el && el !== document.body; i++) {
                    var texts = getMessageTexts(el);
                    if (texts.length > 0 && !el.scPaProcessed) {
                        processMessage(el);
                        break;
                    }
                    el = el.parentElement;
                }
            });

            // 2. 处理聊天室消息（通过聊天容器定位，与模块20复用相同逻辑）
            var chatContainers = findChatContainers();
            chatContainers.forEach(function (container) {
                container.querySelectorAll(':scope > div').forEach(function (msgEl) {
                    if (!msgEl.scPaProcessed) {
                        processMessage(msgEl);
                    }
                });
            });

            // 3. 处理 PA 对话区域中不含 pa-reply 的消息
            var paReplyLinksForContainer = document.querySelectorAll('a.pa-reply');
            if (paReplyLinksForContainer.length > 0) {
                var paContainer = paReplyLinksForContainer[0].parentElement;
                for (var i = 0; i < 10 && paContainer && paContainer !== document.body; i++) {
                    var allInside = true;
                    for (var j = 0; j < paReplyLinksForContainer.length; j++) {
                        if (!paContainer.contains(paReplyLinksForContainer[j])) {
                            allInside = false;
                            break;
                        }
                    }
                    if (allInside && paContainer.children.length >= 2) break;
                    paContainer = paContainer.parentElement;
                }
                if (paContainer && paContainer !== document.body && !paContainer.querySelector('.sc-pa-answer-box')) {
                    Array.from(paContainer.children).forEach(function (child) {
                        if (!child.scPaProcessed && child.textContent.trim().length > 3
                            && !child.querySelector('a.pa-reply')
                            && !child.querySelector('.sc-pa-answer-box')) {
                            processMessage(child);
                        }
                    });
                }
            }
        }

        // 查找聊天容器（与模块20相同逻辑）
        function findChatContainers() {
            const byClass = document.querySelectorAll('div.css-xo2rg1.e1llepen2');
            if (byClass.length > 0) return byClass;
            return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
        }

        // 初始化
        async function init() {
            // 仅在 /messages/ 页面运行
            if (!/\/messages(\/|$)/.test(location.href)) {
                if (observer) { observer.disconnect(); observer = null; }
                initAttempted = false;
                dataLoadAttempted = false;
                return;
            }
            // 检查开关
            if (!isEnabled()) return;

            // 加载数据
            await loadData();
            if (!questData || questData.length === 0) {
                dataLoadAttempted = false;
                setTimeout(init, 3000);
                return;
            }

            if (initAttempted) return;
            initAttempted = true;

            // 扫描现有消息
            scanPage();

            // 监听变化
            if (observer) observer.disconnect();

            observer = new MutationObserver(function (mutations) {
                if (!isEnabled()) return;
                for (var mi = 0; mi < mutations.length; mi++) {
                    var m = mutations[mi];
                    for (var ni = 0; ni < m.addedNodes.length; ni++) {
                        var n = m.addedNodes[ni];
                        if (n.nodeType === 1) {
                            // 扫描新增节点
                            scanElement(n);
                        }
                    }
                }
            });

            // 观察聊天容器
            findChatContainers().forEach(function (c) {
                observer.observe(c, { childList: true, subtree: true });
            });

            // 也观察整个页面以捕获PA区域的变化
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // 扫描单个元素（用于 MutationObserver）
        function scanElement(element) {
            if (!questData || questData.length === 0) return;

            // 如果是 pa-reply 链接，处理其消息容器
            if (element.tagName === 'A' && element.classList.contains('pa-reply')) {
                let el = element.parentElement;
                for (let i = 0; i < 10 && el && el !== document.body; i++) {
                    var texts = getMessageTexts(el);
                    if (texts.length > 0 && !el.scPaProcessed) {
                        processMessage(el);
                        break;
                    }
                    el = el.parentElement;
                }
                return;
            }

            // 如果是聊天消息容器（与模块20相同检测逻辑）
            if (element.matches && element.matches('div[style*="column-reverse"][style*="overflow"]')) {
                element.querySelectorAll(':scope > div').forEach(function (msgEl) {
                    if (!msgEl.scPaProcessed) processMessage(msgEl);
                });
                return;
            }

            // 如果新增的节点内有 pa-reply，处理其消息容器
            if (element.querySelectorAll) {
                var links = element.querySelectorAll('a.pa-reply');
                if (links.length > 0) {
                    links.forEach(function (link) {
                        let el = link.parentElement;
                        for (let i = 0; i < 10 && el && el !== document.body; i++) {
                            var linkTexts = getMessageTexts(el);
                            if (linkTexts.length > 0 && !el.scPaProcessed) {
                                processMessage(el);
                                break;
                            }
                            el = el.parentElement;
                        }
                    });
                }
            }

            // 通用后备：处理新增的有文本内容的元素（新聊天消息、新PA消息等）
            if (!element.scPaProcessed && element.nodeType === 1
                && element.textContent.trim().length > 5) {
                // 跳过容器本身（已在前面专门处理）
                if (element.matches && element.matches('div[style*="column-reverse"]')) return;
                processMessage(element);
            }
        }

        // SPA 导航监听
        var lastUrl = location.href;
        new MutationObserver(function () {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                initAttempted = false;
                dataLoadAttempted = false;
                if (observer) { observer.disconnect(); observer = null; }
                setTimeout(init, 300);
            }
        }).observe(document, { subtree: true, childList: true });

        // 延迟启动
        setTimeout(init, 500);

        return { init };
    })();

    // ======================
    // 模块23：Snipboard图片预览
    // ======================
    (function () {
        'use strict';

        var MODULE_KEY = 'snipboardPreview';

        function isEnabled() {
            return window.isPageModuleEnabled ? window.isPageModuleEnabled(MODULE_KEY) : true;
        }

        // 动态注入样式，只在小屏幕媒体查询下生效以优化小屏幕布局，大屏幕保持原样
        function injectStyles() {
            var styleId = 'sc-snipboard-preview-style';
            var existingStyle = document.getElementById(styleId);
            var isDark = typeof DM === 'function' ? DM() : false;
            var styleText = `
                .sc-snipboard-preview-img {
                    display: block !important;
                    max-width: 180px !important;
                    max-height: 180px !important;
                    width: 100% !important;
                    height: auto !important;
                    object-fit: cover !important;
                    box-sizing: border-box !important;
                    border-radius: 4px;
                    border: 1px solid ${isDark ? '#444' : '#ddd'} !important;
                    box-shadow: ${isDark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.15)'} !important;
                    margin-top: 8px !important;
                }
            `;
            if (existingStyle) {
                existingStyle.textContent = styleText;
            } else {
                var style = document.createElement('style');
                style.id = styleId;
                style.textContent = styleText;
                document.head.appendChild(style);
            }
        }

        // 查找聊天容器（与模块20相同逻辑）
        function findChatContainers() {
            var byClass = document.querySelectorAll('div.css-xo2rg1.e1llepen2');
            if (byClass.length > 0) return byClass;
            return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
        }

        // 判断链接是否为图片URL
        function isImageUrl(href) {
            return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(href);
        }

        // 处理单个链接
        function processLink(link) {
            var href = link.getAttribute('href');
            if (!href) return;

            // 只处理 snipboard.io 链接
            if (!href.includes('snipboard.io')) return;

            // 避免重复处理
            if (link.getAttribute('data-snipboard-processed') === '1') return;

            var imgUrl = href;
            // 确保使用 https 协议，消除浏览器的混合内容（Mixed Content）警告
            if (imgUrl.indexOf('http://') === 0) {
                imgUrl = imgUrl.replace('http://', 'https://');
            }
            // 如果URL不以图片格式结尾，添加 .jpg（snipboard默认）
            if (!isImageUrl(imgUrl)) {
                imgUrl = imgUrl.replace(/\/?$/, '.jpg');
            }

            link.setAttribute('data-snipboard-processed', '1');

            var img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'sc-snipboard-preview-img';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.height = 'auto';
            img.setAttribute('data-sc-original-src', imgUrl);
            img.addEventListener('click', function (e) {
                e.stopPropagation();
                showLightbox(imgUrl);
            });

            // 在链接后面插入图片
            link.parentNode.insertBefore(img, link.nextSibling);
        }

        // 显示图片放大灯箱
        function showLightbox(url) {
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;cursor:pointer;';

            var closeBtn = document.createElement('span');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = 'position:fixed;top:16px;right:24px;font-size:36px;color:#fff;cursor:pointer;z-index:100000;line-height:1;font-family:sans-serif;user-select:none;';
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeLightbox();
            });

            function closeLightbox() {
                overlay.style.opacity = '0';
                setTimeout(function () { overlay.remove(); }, 200);
                document.removeEventListener('keydown', onKeyDown);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') closeLightbox();
            }

            overlay.addEventListener('click', closeLightbox);
            document.addEventListener('keydown', onKeyDown);

            var img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:4px;box-shadow:0 0 20px rgba(0,0,0,0.5);cursor:default;transition:opacity 0.2s;';
            img.style.opacity = '0';
            img.addEventListener('load', function () { img.style.opacity = '1'; });
            img.addEventListener('click', function (e) { e.stopPropagation(); });

            overlay.appendChild(closeBtn);
            overlay.appendChild(img);
            document.body.appendChild(overlay);
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s';
            requestAnimationFrame(function () { overlay.style.opacity = '1'; });
        }

        // 扫描容器中的 snipboard 链接
        function scanContainer(container) {
            if (!isEnabled()) return;
            var links = container.querySelectorAll('a[href*="snipboard.io"]');
            for (var i = 0; i < links.length; i++) {
                processLink(links[i]);
            }
        }

        // 扫描所有聊天容器
        function scanAll() {
            if (!isEnabled()) return;
            var containers = findChatContainers();
            for (var i = 0; i < containers.length; i++) {
                scanContainer(containers[i]);
            }
        }

        // 初始化
        var observer = null;
        var initAttempted = false;

        function init() {
            if (initAttempted) return;
            initAttempted = true;

            if (!isEnabled()) return;

            // 注入或更新样式配置
            injectStyles();

            // 扫描现有内容
            scanAll();

            // 监听变化
            if (observer) observer.disconnect();

            observer = new MutationObserver(function (mutations) {
                if (!isEnabled()) return;
                for (var mi = 0; mi < mutations.length; mi++) {
                    var m = mutations[mi];
                    for (var ni = 0; ni < m.addedNodes.length; ni++) {
                        var n = m.addedNodes[ni];
                        if (n.nodeType === 1) {
                            // 查找新增节点中的 snipboard 链接
                            var links = n.querySelectorAll ? n.querySelectorAll('a[href*="snipboard.io"]') : [];
                            for (var li = 0; li < links.length; li++) {
                                processLink(links[li]);
                            }
                            // 如果新增节点本身是链接
                            if (n.tagName === 'A' && n.href && n.href.indexOf('snipboard.io') !== -1) {
                                processLink(n);
                            }
                        }
                    }
                }
            });

            // 观察聊天容器
            var containers = findChatContainers();
            for (var i = 0; i < containers.length; i++) {
                observer.observe(containers[i], { childList: true, subtree: true });
            }
        }

        // SPA 导航监听
        var lastUrl = location.href;
        new MutationObserver(function () {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                initAttempted = false;
                if (observer) { observer.disconnect(); observer = null; }
                setTimeout(init, 300);
            }
        }).observe(document, { subtree: true, childList: true });

        // 延迟启动
        setTimeout(init, 500);

        return { init };
    })();

    // ======================
    // 模块24：聊天输入框自动扩大
    // ======================
    (function () {
        'use strict';

        var MODULE_KEY = 'chatInputExpander';

        function isEnabled() {
            return typeof window.isPageModuleEnabled === 'function' ? window.isPageModuleEnabled(MODULE_KEY) : true;
        }

        // 动态注入样式，支持浅色和深色模式，且通过媒体查询实现响应式布局
        function injectStyles() {
            var styleId = 'sc-chat-input-expander-style';
            var existingStyle = document.getElementById(styleId);
            var isDark = typeof DM === 'function' ? DM() : false;

            // 依据深浅色模式采用不同的蓝色阴影透明度以保证视觉高级感
            var shadowColor = isDark ? 'rgba(33, 150, 243, 0.5)' : 'rgba(33, 150, 243, 0.3)';
            var styleText = `
                /* 默认过渡动画，实现平滑的高度伸缩和发光效果 */
                .sc-chat-textarea-transition {
                    transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s, border-color 0.2s !important;
                }
                .sc-chat-container-transition {
                    transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }

                /* 焦点在输入框内时的扩大状态（默认桌面端/平板） */
                .sc-chat-textarea-focused {
                    height: 130px !important;
                    top: 0px !important;
                    bottom: 0px !important;
                    border-color: #2196F3 !important;
                    box-shadow: 0 0 10px ${shadowColor} !important;
                }
                /* 使输入框紧邻的前置高亮渲染 div 的高度同步拉伸，防止文本输入层级错位导致输入法定位失灵被覆盖 */
                .sc-chat-wrap-focused > div {
                    height: 130px !important;
                    min-height: 130px !important;
                }
                .sc-chat-input-group-focused {
                    height: 130px !important;
                }
                /* 发送按钮容器高度扩大，并利用 vertical-align 靠底对齐，保持原有 table-cell 布局不被破坏 */
                .sc-chat-btn-focused {
                    height: 130px !important;
                    vertical-align: bottom !important;
                }
                .sc-chat-outer-focused {
                    height: 138px !important;
                }

                /* 移动端/小屏幕适配：防止弹出的虚拟键盘和过大输入框遮挡全部屏幕 */
                @media (max-width: 767px) {
                    .sc-chat-textarea-focused {
                        height: 90px !important;
                    }
                    .sc-chat-wrap-focused > div {
                        height: 90px !important;
                        min-height: 90px !important;
                    }
                    .sc-chat-input-group-focused {
                        height: 90px !important;
                    }
                    .sc-chat-btn-focused {
                        height: 90px !important;
                    }
                    .sc-chat-outer-focused {
                        height: 98px !important;
                    }
                }
            `;

            if (existingStyle) {
                existingStyle.textContent = styleText;
            } else {
                var style = document.createElement('style');
                style.id = styleId;
                style.textContent = styleText;
                document.head.appendChild(style);
            }
        }

        // 识别聊天输入框（通过 DOM 结构与聊天室特有特征判定，不依赖文本内容）
        function isChatInput(el) {
            if (!el || el.tagName !== 'TEXTAREA') return false;

            // 1. 必须位于 input-group 容器中
            var inputGroup = el.closest('.input-group');
            if (!inputGroup) return false;

            // 2. 向上寻找祖先节点，直到找到包含聊天记录容器的公共祖先（不限制层数以确保 100% 兼容）
            var isInsideChat = false;
            var cur = el.parentElement;
            while (cur && cur !== document.body) {
                if (cur.classList.contains('e1llepen1') ||
                    cur.querySelector('.e1llepen2') ||
                    cur.querySelector('div[style*="column-reverse"]')) {
                    isInsideChat = true;
                    break;
                }
                cur = cur.parentElement;
            }

            // console.log('[SC-ChatInputExpander] 检测输入框焦点:', el, '判定是否为聊天框:', isInsideChat);
            return isInsideChat;
        }

        // 动态定位关联的容器节点
        function findContainers(textarea) {
            var inputGroup = textarea.closest('.input-group');
            var btnContainer = inputGroup ? inputGroup.querySelector('.input-group-btn') : null;
            var outerContainer = null;

            // 1. 向上寻找整个聊天窗的容器（参考模块23检测逻辑）
            var chatRoom = textarea.closest('.e1llepen1');
            if (!chatRoom) {
                var cur = textarea.parentElement;
                while (cur && cur !== document.body) {
                    if (cur.querySelector('.e1llepen2') || cur.querySelector('div[style*="column-reverse"]')) {
                        chatRoom = cur;
                        break;
                    }
                    cur = cur.parentElement;
                }
            }

            // 2. 输入框的最外层包装容器必然是聊天窗 chatRoom 的直接子节点
            if (chatRoom) {
                var cur = textarea.parentElement;
                while (cur && cur !== chatRoom) {
                    if (cur.parentElement === chatRoom) {
                        outerContainer = cur;
                        break;
                    }
                    cur = cur.parentElement;
                }
            }

            // 3. 兜底保护：若上述算法未定位到，则降级使用 inputGroup 往上两层
            if (!outerContainer && inputGroup) {
                outerContainer = inputGroup.parentElement;
                if (outerContainer && outerContainer.style.width === '100%') {
                    outerContainer = outerContainer.parentElement;
                }
            }

            /*
            console.log('[SC-ChatInputExpander] 定位到的容器:', {
                inputGroup: inputGroup,
                btnContainer: btnContainer,
                outerContainer: outerContainer
            });
            */

            return {
                inputGroup: inputGroup,
                btnContainer: btnContainer,
                outerContainer: outerContainer
            };
        }

        // 初始化模块
        function init() {
            if (!isEnabled()) return;
            injectStyles();
        }

        var isClickingInside = false;

        // 收缩单个输入框关联的所有容器
        function collapseContainers(textarea) {
            var containers = findContainers(textarea);
            textarea.classList.remove('sc-chat-textarea-focused');

            var parent = textarea.parentElement;
            if (parent) {
                parent.classList.remove('sc-chat-wrap-focused');
            }

            if (containers.inputGroup) {
                containers.inputGroup.classList.remove('sc-chat-input-group-focused');
            }
            if (containers.btnContainer) {
                containers.btnContainer.classList.remove('sc-chat-btn-focused');
            }
            if (containers.outerContainer) {
                containers.outerContainer.classList.remove('sc-chat-outer-focused');
            }
        }

        // 收缩所有已展开的聊天输入框
        function collapseAll() {
            var expanded = document.querySelectorAll('.sc-chat-textarea-focused');
            for (var i = 0; i < expanded.length; i++) {
                collapseContainers(expanded[i]);
            }
        }

        // 监听鼠标按下事件，判断用户点击是否在聊天输入组件内部（例如点击发送按钮），此时不能立刻失焦收缩，避免点击位移失效
        document.addEventListener('mousedown', function (e) {
            if (!isEnabled()) return;
            var target = e.target;
            if (target) {
                var inputGroup = target.closest('.input-group');
                var outerFocused = target.closest('.sc-chat-outer-focused');
                if (inputGroup || outerFocused) {
                    isClickingInside = true;
                    return;
                }
            }
            isClickingInside = false;
        });

        // 鼠标松开后延迟重置点击状态，如果此时焦点彻底移出了输入框，则在交互完成后收缩
        document.addEventListener('mouseup', function () {
            if (!isEnabled()) return;
            setTimeout(function () {
                isClickingInside = false;
                var activeEl = document.activeElement;
                if (!isChatInput(activeEl)) {
                    collapseAll();
                }
            }, 150);
        });

        // 利用全局事件代理监听焦点，避免 React 重新渲染页面导致绑定失效
        document.addEventListener('focusin', function (e) {
            if (!isEnabled()) return;
            var target = e.target;
            if (isChatInput(target)) {
                var containers = findContainers(target);

                target.classList.add('sc-chat-textarea-transition');
                target.classList.add('sc-chat-textarea-focused');

                var parent = target.parentElement;
                if (parent) {
                    parent.classList.add('sc-chat-container-transition');
                    parent.classList.add('sc-chat-wrap-focused');
                }

                if (containers.inputGroup) {
                    containers.inputGroup.classList.add('sc-chat-container-transition');
                    containers.inputGroup.classList.add('sc-chat-input-group-focused');
                }
                if (containers.btnContainer) {
                    containers.btnContainer.classList.add('sc-chat-container-transition');
                    containers.btnContainer.classList.add('sc-chat-btn-focused');
                }
                if (containers.outerContainer) {
                    containers.outerContainer.classList.add('sc-chat-container-transition');
                    containers.outerContainer.classList.add('sc-chat-outer-focused');
                }

                // 解决移动端虚拟键盘弹起时输入框可能被键盘物理覆盖遮挡的问题：平滑将输入框滚动至可视区域中上部
                setTimeout(function () {
                    if (document.activeElement === target) {
                        if (typeof target.scrollIntoViewIfNeeded === 'function') {
                            target.scrollIntoViewIfNeeded(false);
                        } else {
                            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                    }
                }, 300);
            }
        });

        document.addEventListener('focusout', function (e) {
            var target = e.target;
            if (isChatInput(target)) {
                // 如果用户当前正在点击输入区内部（如发送按钮），绝不立刻收缩以防止点击丢失
                if (isClickingInside) return;
                collapseContainers(target);
            }
        });

        // 立即初始化以注入样式
        init();
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
        const dUp = DM();
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
                background: ${dUp ? '#1e1e1e' : '#ffffff'}; color: ${dUp ? '#efefef' : '#333'}; cursor: default;
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
                display: none; cursor: pointer; font-size: 20px; color: ${dUp ? '#aaa' : '#999'};
                line-height: 1; padding: 5px;
            }
            .sc-update-toast.expanded .sc-update-close { display: block; }
            .sc-update-close:hover { color: ${dUp ? '#ccc' : '#333'}; }

            /* 内容区域 */
            .sc-update-body {
                max-height: 0; opacity: 0; transition: all 0.3s ease; overflow: hidden;
            }
            .sc-update-toast.expanded .sc-update-body {
                max-height: 400px; opacity: 1; margin-top: 15px;
            }

            .sc-changelog-box {
                background: ${dUp ? '#2a2a2a' : '#f5f7f9'}; padding: 12px; border-radius: 6px;
                margin: 10px 0; color: ${dUp ? '#ccc' : '#555'}; font-size: 13px;
                border-left: 3px solid ${dUp ? '#555' : '#ddd'}; max-height: 150px; overflow-y: auto;
            }

            /* 底部按钮区域 */
            .sc-update-actions {
                display: flex; justify-content: space-between; align-items: center; margin-top: 20px;
            }
            .sc-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; }
            .sc-btn-primary { background: #2196F3; color: white; }
            .sc-btn-link { background: transparent; color: ${dUp ? '#aaa' : '#999'}; text-decoration: underline; padding: 8px 0; }
            .sc-btn-link:hover { color: ${dUp ? '#ccc' : '#666'}; }
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
                <p style="font-size: 11px; color: ${dUp ? '#aaa' : '#999'}; margin: 10px 0;">
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
        // @changelog    修复因用时太短导致的工资计算误差提前中断时利润遍历问题

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
