import { getRealmIdFromLink, getScopedKey } from '../core/storage.js';
import { DM, showToast, theme } from '../utils/ui.js';
import { Storage } from './dataStorage.js';
import { Network } from '../core/network.js';

export const executiveCustomButton = (function () {
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
