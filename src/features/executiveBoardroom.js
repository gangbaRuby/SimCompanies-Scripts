import { getRealmIdFromLink, getScopedKey } from '../core/storage.js';
import { DM, showToast, theme } from '../utils/ui.js';
import { Storage } from './dataStorage.js';
import { Network } from '../core/network.js';
import { registerExportInfo } from '../core/exportInfo.js';

export const executiveCustomButton = (function () {
        let boardroomState = {
            'o': null, 'f': null, 'm': null, 't': null,
            'v': null, 'x': null, 'y': null, 'z': null,
            '1': null, '2': null, '3': null, '4': null, '5': null
        };

        let draggedSlotId = null;
        let selectedSlotId = null;

        const SLOT_LABELS = {
            o: 'COO', f: 'CFO', m: 'CMO', t: 'CTO',
            v: 'COO 学徒', x: 'CFO 学徒', y: 'CMO 学徒', z: 'CTO 学徒',
            '1': '职员 1', '2': '职员 2', '3': '职员 3', '4': '职员 4', '5': '职员 5'
        };

        // 依据高管 API 列表生成一份席位表（纯函数，不修改 boardroomState）
        function buildStateFromExecList(execList) {
            const state = {
                'o': null, 'f': null, 'm': null, 't': null,
                'v': null, 'x': null, 'y': null, 'z': null,
                '1': null, '2': null, '3': null, '4': null, '5': null
            };

            let staffIdx = 1;
            (Array.isArray(execList) ? execList : []).forEach(exec => {
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
                if (posStr && Object.prototype.hasOwnProperty.call(state, posStr)) {
                    state[posStr] = emp;
                } else {
                    while (staffIdx <= 5 && state[String(staffIdx)] !== null) {
                        staffIdx++;
                    }
                    if (staffIdx <= 5) {
                        state[String(staffIdx)] = emp;
                        staffIdx++;
                    }
                }
            });
            return state;
        }

        // Map executives array from Sim Companies API to boardroomState（写入自定义数据）
        function mapExecutivesToState(execList) {
            const mapped = buildStateFromExecList(execList);
            Object.keys(boardroomState).forEach(k => { boardroomState[k] = mapped[k] || null; });
        }

        // 比对：游戏当前摆放（只读获取）vs 自定义数据摆放，标出需要调整位置的高管
        function renderCompareResults(currentState) {
            const container = document.getElementById('sc-boardroom-compare-results');
            if (!container) return;

            const gameSlots = {};
            const customSlots = {};
            Object.keys(boardroomState).forEach(id => {
                const g = currentState[id] && currentState[id].name;
                const c = boardroomState[id] && boardroomState[id].name;
                if (g && gameSlots[g] === undefined) gameSlots[g] = id;
                if (c && customSlots[c] === undefined) customSlots[c] = id;
            });

            const moves = [];
            const onlyGame = [];
            const onlyCustom = [];
            Object.keys(customSlots).forEach(name => {
                const target = customSlots[name];
                if (gameSlots[name] === undefined) {
                    onlyCustom.push({ name: name, slot: target });
                    return;
                }
                if (gameSlots[name] !== target) {
                    moves.push({ name: name, from: gameSlots[name], to: target });
                }
            });
            Object.keys(gameSlots).forEach(name => {
                if (customSlots[name] === undefined) onlyGame.push({ name: name, slot: gameSlots[name] });
            });

            const label = id => SLOT_LABELS[id] || id;
            const total = moves.length + onlyGame.length + onlyCustom.length;
            if (total === 0) {
                container.innerHTML = '<div style="font-size: 12px; margin: 2px 0 10px; padding: 8px 10px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-aca-bg); color: var(--sc-successFg);">与当前游戏摆放一致，无需调整。</div>';
                return;
            }

            let html = '';
            html += '<div style="font-size: 12px; margin: 2px 0 10px; padding: 8px 10px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-aca-bg); color: var(--sc-fg); line-height: 1.8;">';
            html += '<div style="font-weight: bold;">比对结果：<span style="color: var(--sc-dangerFg);">' + total + '</span> 位高管需要调整（按自定义数据摆放）</div>';
            moves.forEach(mv => {
                const partner = moves.find(o => o !== mv && o.from === mv.to && o.to === mv.from);
                html += '<div>' + mv.name + '：<span style="color: var(--sc-fg3);">当前 ' + label(mv.from) + '</span> → <span style="color: var(--sc-successFg);">自定义 ' + label(mv.to) + '</span>' + (partner ? '（与 ' + partner.name + ' 交换）' : '') + '</div>';
            });
            onlyCustom.forEach(it => {
                html += '<div>' + it.name + '：<span style="color: var(--sc-dangerFg);">自定义数据有（' + label(it.slot) + '），游戏当前没有</span></div>';
            });
            onlyGame.forEach(it => {
                html += '<div>' + it.name + '：<span style="color: var(--sc-dangerFg);">游戏当前有（' + label(it.slot) + '），自定义数据没有</span></div>';
            });
            html += '<div style="font-size: 11px; color: var(--sc-fg3); margin-top: 4px;">* 本次比对只读取游戏当前高管数据，不会改写自定义数据。</div>';
            html += '</div>';
            container.innerHTML = html;
        }

        // 点击「比对当前游戏摆放」：只读获取当前高管数据并比对（不写入自定义数据）
        function compareWithGame(btn) {
            const container = document.getElementById('sc-boardroom-compare-results');
            if (!container || !btn || btn.disabled) return;
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '获取中…';
            container.innerHTML = '<div style="font-size: 12px; margin: 2px 0 10px; padding: 8px 10px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-aca-bg); color: var(--sc-fg3);">正在获取游戏当前高管数据…</div>';
            Network.requestJson('https://www.simcompanies.com/api/v3/companies/me/executives/')
                .then(res => {
                    const data = res && res.executives;
                    if (data && data.length > 0) {
                        renderCompareResults(buildStateFromExecList(data));
                    } else {
                        container.innerHTML = '<div style="font-size: 12px; margin: 2px 0 10px; padding: 8px 10px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-aca-bg); color: var(--sc-dangerFg);">未获取到高管数据。</div>';
                    }
                })
                .catch(err => {
                    console.error(err);
                    container.innerHTML = '<div style="font-size: 12px; margin: 2px 0 10px; padding: 8px 10px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-aca-bg); color: var(--sc-dangerFg);">网络请求失败，请稍后重试。</div>';
                })
                .finally(() => {
                    btn.disabled = false;
                    btn.textContent = originalText;
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

        function getAcademyRadioValue() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            try {
                const stored = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));
                const academyActive = Number(stored?.academyActive);
                if (Number.isFinite(academyActive) && academyActive >= 0) {
                    if (academyActive >= 20) return 20;
                    if (academyActive >= 15) return 15;
                    if (academyActive >= 10) return 10;
                    if (academyActive >= 5) return 5;
                    return 0;
                }
            } catch (e) {
                console.warn('读取学院等级失败，使用默认区间 15-19:', e);
            }
            return 15;
        }

        // 读取当前领域真实的学院总等级（领域数据缓存里没有时返回 null）
        function readRealmAcademyLevel() {
            const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            try {
                const stored = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));
                const level = Number(stored && stored.academyActive);
                if (Number.isFinite(level) && level >= 0) return level;
            } catch (e) { /* 忽略读取失败 */ }
            return null;
        }

        // 把弹窗的学院总等级单选同步到真实学院总等级所在区间
        function syncAcademyRadioToRealm() {
            const level = readRealmAcademyLevel();
            if (level === null) return null;
            const bucket = level >= 20 ? 20 : level >= 15 ? 15 : level >= 10 ? 10 : level >= 5 ? 5 : 0;
            document.querySelectorAll('input[name="sc-aca-r"]').forEach(radio => {
                radio.checked = Number(radio.value) === bucket;
            });
            return bucket;
        }

        // 读取当前选中的学院总等级（右侧模拟计算与最优摆放共用）
        function getCheckedAcademyLevel() {
            const selectedRadio = document.querySelector('input[name="sc-aca-r"]:checked');
            return selectedRadio ? parseInt(selectedRadio.value) : 15;
        }

        // 依据学院等级计算 4 个职位的原始/有效点数（与右侧模拟计算同一套公式）
        function computeEffectivePoints(state, academyLevel) {
            const getSkill = (slotId, skillKey) => {
                const raw = state[slotId] && state[slotId].skills ? state[slotId].skills[skillKey] : 0;
                const num = Number(raw);
                return Number.isFinite(num) ? num : 0;
            };

            const hasCooApp = academyLevel >= 5;
            const hasCfoApp = academyLevel >= 10;
            const hasCmoApp = academyLevel >= 15;
            const hasCtoApp = academyLevel >= 20;

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

            const applyDecay = (raw) => {
                let val = raw;
                if (val > 80) val = 80 + (val - 80) / 2;
                if (val > 60) val = 60 + (val - 60) / 2;
                return Math.floor(val);
            };

            return {
                rawCoo: rawCoo, effCoo: applyDecay(rawCoo),
                rawCfo: rawCfo, effCfo: applyDecay(rawCfo),
                rawCmo: rawCmo, effCmo: applyDecay(rawCmo),
                rawCto: rawCto, effCto: applyDecay(rawCto)
            };
        }

        function calculateResults() {
            const selectedRadio = document.querySelector('input[name="sc-aca-r"]:checked');
            const academyLevel = selectedRadio ? parseInt(selectedRadio.value) : 15;

            // 原始汇总点数与衰减有效点数（与「最优摆放建议」共用同一套公式）
            const {
                rawCoo, effCoo,
                rawCfo, effCfo,
                rawCmo, effCmo,
                rawCto, effCto
            } = computeEffectivePoints(boardroomState, academyLevel);

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

        // ===================== 最优摆放建议（精确求解） =====================
        // 各席位对 COO/CMO/CTO 有效点数的贡献系数（学徒席仅在学院等级达标时参与枚举）
        const OPT_SEAT_COEF = {
            o: { coo: 1, cmo: 0.25, cto: 0.25 },
            f: { coo: 0.25, cmo: 0.25, cto: 0.25 },
            m: { coo: 0.25, cmo: 1, cto: 0.25 },
            t: { coo: 0.25, cmo: 0.25, cto: 1 },
            v: { coo: 0.5, cmo: 0, cto: 0 },
            y: { coo: 0, cmo: 0.5, cto: 0 },
            z: { coo: 0, cmo: 0, cto: 0.5 }
        };

        // 该席位在当前学院等级下是否产生贡献
        function isOptSeatActive(seat, academyLevel) {
            if (seat === 'o' || seat === 'f' || seat === 'm' || seat === 't') return true;
            if (seat === 'v') return academyLevel >= 5;
            if (seat === 'y') return academyLevel >= 15;
            if (seat === 'z') return academyLevel >= 20;
            return false;
        }

        // 各目标需要枚举的席位（最多 6 个，控制组合量）
        // admin/restaurant/target：COO 与 CMO 相关（含 v/y）；research：COO 与 CTO 相关（含 v/z）
        function optSeatsForMode(mode, academyLevel) {
            if (mode === 'research') {
                return ['o', 'f', 'm', 't']
                    .concat(academyLevel >= 5 ? ['v'] : [])
                    .concat(academyLevel >= 20 ? ['z'] : []);
            }
            return ['o', 'f', 'm', 't']
                .concat(academyLevel >= 5 ? ['v'] : [])
                .concat(academyLevel >= 15 ? ['y'] : []);
        }

        // 当前 13 个格子中所有非空高管作为候选池
        function collectExecutivePool() {
            const pool = [];
            Object.keys(boardroomState).forEach(id => {
                const emp = boardroomState[id];
                if (emp && emp.skills) {
                    pool.push({
                        slotId: id,
                        name: emp.name || '未命名',
                        skills: {
                            coo: Number(emp.skills.coo) || 0,
                            cfo: Number(emp.skills.cfo) || 0,
                            cmo: Number(emp.skills.cmo) || 0,
                            cto: Number(emp.skills.cto) || 0
                        },
                        obj: emp
                    });
                }
            });
            return pool;
        }

        function decayEffective(raw) {
            let val = raw;
            if (val > 80) val = 80 + (val - 80) / 2;
            if (val > 60) val = 60 + (val - 60) / 2;
            return Math.floor(val);
        }

        // 可分片排列枚举器：每次 step 处理 budget 个叶子后让出主线程，避免卡页面
        function createAssignEnumerator(seatCount, candCount) {
            const used = new Array(candCount).fill(false);
            const idx = new Array(seatCount).fill(-1);
            let d = 0;
            let j = 0;
            let finished = false;
            return {
                idx: idx,
                step: function (budget, onLeaf) {
                    let processed = 0;
                    while (processed < budget && !finished) {
                        let placed = false;
                        while (j < candCount) {
                            if (!used[j]) {
                                used[j] = true;
                                idx[d] = j;
                                placed = true;
                                j++;
                                break;
                            }
                            j++;
                        }
                        if (placed) {
                            if (d === seatCount - 1) {
                                onLeaf();
                                processed++;
                                used[idx[d]] = false;
                                idx[d] = -1;
                            } else {
                                d++;
                                j = 0;
                            }
                        } else {
                            if (d === 0) {
                                finished = true;
                                break;
                            }
                            d--;
                            used[idx[d]] = false;
                            j = idx[d] + 1;
                            idx[d] = -1;
                        }
                    }
                    return finished;
                }
            };
        }

        // tokenId：与 optRunId 不一致即视为已取消，返回 null
        // 精确枚举所选席位的人员分配（候选不足时用空席占位），分片后台求解
        // mode：admin | restaurant | target（销售速度）| research（研究类生产提升）
        // kMin：指定销售速度所需 floor(effCmo/3) 下限；ctoMin：指定研究提升所需 effCto 下限
        // tokenId：与 optRunId 不一致即视为已取消，返回 null
        function findBestPlacements(pool, academyLevel, mode, kMin, ctoMin, tokenId) {
            return new Promise((resolve) => {
                const seats = optSeatsForMode(mode, academyLevel);
                const coefs = seats.map(seat => OPT_SEAT_COEF[seat]);

                const cands = pool.slice();
                while (cands.length < seats.length) {
                    cands.push({ slotId: null, name: null, obj: null, empty: true, skills: { coo: 0, cmo: 0, cto: 0 } });
                }
                const total = cands.length;
                const cooVals = cands.map(c => c.skills.coo);
                const cmoVals = cands.map(c => c.skills.cmo);
                const ctoVals = cands.map(c => c.skills.cto);

                const best = { admin: null, restaurant: null, targetSales: null, targetResearch: null, ctoMax: null };
                const bestArr = { admin: null, restaurant: null, targetSales: null, targetResearch: null, ctoMax: null };
                const isBetter = (cur, next) => cur === null || next[0] > cur[0] || (next[0] === cur[0] && next[1] > cur[1]);

                const en = createAssignEnumerator(seats.length, total);

                const evaluate = () => {
                    const idx = en.idx;
                    let sCoo = 0;
                    let sCmo = 0;
                    let sCto = 0;
                    for (let i = 0; i < seats.length; i++) {
                        sCoo += coefs[i].coo * cooVals[idx[i]];
                        sCmo += coefs[i].cmo * cmoVals[idx[i]];
                        sCto += coefs[i].cto * ctoVals[idx[i]];
                    }
                    const effCoo = decayEffective(Math.floor(sCoo));
                    const effCmo = decayEffective(Math.floor(sCmo));
                    const effCto = decayEffective(Math.floor(sCto));
                    // 目标①管理费用最低：effCoo 最大；平手取 effCmo 更大
                    // 目标②餐馆评级最高：effCmo 最大；平手取 effCoo 更大
                    // 目标③指定销售速度：effCmo >= 3*kMin 前提下 effCoo 最大；平手取 effCmo 更大
                    // 目标④指定研究提升：effCto >= ctoMin 前提下 effCoo 最大；平手取 effCto 更大
                    const adminKey = [effCoo, effCmo];
                    const restaurantKey = [effCmo, effCoo];
                    const ctoMaxKey = [effCto, effCoo];
                    if (isBetter(best.admin, adminKey)) { best.admin = adminKey; bestArr.admin = idx.slice(); }
                    if (isBetter(best.restaurant, restaurantKey)) { best.restaurant = restaurantKey; bestArr.restaurant = idx.slice(); }
                    if (isBetter(best.ctoMax, ctoMaxKey)) { best.ctoMax = ctoMaxKey; bestArr.ctoMax = idx.slice(); }
                    if (kMin !== null && effCmo >= 3 * kMin) {
                        const key = [effCoo, effCmo];
                        if (isBetter(best.targetSales, key)) { best.targetSales = key; bestArr.targetSales = idx.slice(); }
                    }
                    if (ctoMin !== null && effCto >= ctoMin) {
                        const key = [effCoo, effCto];
                        if (isBetter(best.targetResearch, key)) { best.targetResearch = key; bestArr.targetResearch = idx.slice(); }
                    }
                };

                const makeResult = (arrIdx) => {
                    if (!arrIdx) return null;
                    let sCoo = 0;
                    let sCmo = 0;
                    let sCto = 0;
                    for (let i = 0; i < seats.length; i++) {
                        sCoo += coefs[i].coo * cooVals[arrIdx[i]];
                        sCmo += coefs[i].cmo * cmoVals[arrIdx[i]];
                        sCto += coefs[i].cto * ctoVals[arrIdx[i]];
                    }
                    const placement = seats.map((seat, i) => {
                        const c = cands[arrIdx[i]];
                        return { seat: seat, obj: c && !c.empty ? c.obj : null, name: c && !c.empty ? c.name : null };
                    });
                    return {
                        placement: placement,
                        effCoo: decayEffective(Math.floor(sCoo)),
                        effCmo: decayEffective(Math.floor(sCmo)),
                        effCto: decayEffective(Math.floor(sCto))
                    };
                };

                const CHUNK = 30000;
                const tick = () => {
                    if (tokenId !== optRunId) { resolve(null); return; }
                    const finished = en.step(CHUNK, evaluate);
                    if (!finished) { setTimeout(tick, 0); return; }
                    resolve({
                        admin: makeResult(bestArr.admin),
                        restaurant: makeResult(bestArr.restaurant),
                        targetSales: makeResult(bestArr.targetSales),
                        targetResearch: makeResult(bestArr.targetResearch),
                        ctoMax: makeResult(bestArr.ctoMax)
                    });
                };
                tick();
            });
        }


        // 读取零售计算缓存里的基础值，用于换算展示
        function readBaseNumbers() {
            const rId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            let SRC = {};
            try {
                SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${rId}`)) || {};
            } catch (e) { /* 忽略 */ }
            return {
                baseAdminVal: (SRC.administration || 1) - 1,
                baseSalesVal: (SRC.salesModifier || 0) + (SRC.recreationBonus || 0)
            };
        }

        function formatMetrics(effCoo, effCmo, effCto) {
            const base = readBaseNumbers();
            const adminPct = base.baseAdminVal * (1 - effCoo / 100) * 100;
            const restaurant = base.baseSalesVal * 0.02 + effCmo * 0.01;
            const salesPct = base.baseSalesVal + Math.floor(effCmo / 3);
            const researchPct = effCto * 2;
            return {
                adminText: adminPct.toFixed(2) + '%',
                restaurantText: '+' + restaurant.toFixed(3),
                salesText: salesPct.toFixed(1) + '%',
                researchText: researchPct.toFixed(1) + '%'
            };
        }

        // 当前摆法的指标（按真实学院等级）
        function currentMetrics(academyLevel) {
            const eff = computeEffectivePoints(boardroomState, academyLevel);
            return {
                effCoo: eff.effCoo,
                effCmo: eff.effCmo,
                effCto: eff.effCto,
                text: formatMetrics(eff.effCoo, eff.effCmo, eff.effCto)
            };
        }

        // 写入已保存加成与董事会摆法（弹窗「保存」与「应用到自定义数据并保存」共用）
        function saveBoardroom() {
            const res = calculateResults();
            const rId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
            localStorage.setItem(`R${rId}-SC-Saved-Bonuses`, JSON.stringify({
                adminBonus: res.adminBonus,
                saleBonus: res.saleBonus,
                timestamp: Date.now(),
                source: 'manual'
            }));
            localStorage.setItem(`R${rId}-SC-Saved-Boardroom`, JSON.stringify(boardroomState));
        }

        // 把一套推荐摆法应用到 13 个格子并自动保存（后台计算后应用）
        // 把一套推荐摆法应用到 13 个格子并自动保存（后台计算后应用）
        function applyBestPlacement(targetKey, btn) {
            syncAcademyRadioToRealm();
            const academyLevel = getCheckedAcademyLevel();
            const pool = collectExecutivePool();
            if (pool.length === 0) {
                showToast('暂无可用的高管数据', 'error');
                return;
            }

            let kMin = null;
            let ctoMin = null;
            if (targetKey === 'target') {
                kMin = optTargetK();
                if (kMin === null) {
                    showToast('请先输入有效的目标销售速度', 'error');
                    return;
                }
            }
            if (targetKey === 'research') {
                ctoMin = optResearchCto();
                if (ctoMin === null) {
                    showToast('请先输入有效的研究类生产提升目标', 'error');
                    return;
                }
            }

            const token = ++optRunId;
            optBusy = true;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '计算中…';
            }
            findBestPlacements(pool, academyLevel, targetKey, kMin, ctoMin, token).then(bests => {
                optBusy = false;
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '应用到自定义数据并保存';
                }
                if (!bests) return; // 已取消
                const best = targetKey === 'target' ? bests.targetSales
                    : targetKey === 'research' ? bests.targetResearch
                    : bests[targetKey];
                if (!best) {
                    showToast('当前目标无法达到，请调整目标后重试', 'error');
                    return;
                }

                const original = Object.assign({}, boardroomState);
                Object.keys(boardroomState).forEach(k => { boardroomState[k] = null; });

                const used = new Set();
                best.placement.forEach(item => {
                    if (isOptSeatActive(item.seat, academyLevel) && item.obj) {
                        boardroomState[item.seat] = item.obj;
                        used.add(item.obj);
                    }
                });

                // 未上榜高管尽量保留原席位；已用于本次推荐的学徒席不再作为候补位，避免被覆盖
                const leftover = pool.filter(c => !used.has(c.obj));
                const committedSeats = new Set(best.placement
                    .filter(item => isOptSeatActive(item.seat, academyLevel) && item.obj)
                    .map(item => item.seat));
                const restSeats = ['x', '1', '2', '3', '4', '5']
                    .concat(['v', 'y', 'z'].filter(seat => !committedSeats.has(seat)));
                const freeSeats = [];
                restSeats.forEach(seatId => {
                    const cur = original[seatId];
                    if (cur && !used.has(cur)) {
                        const li = leftover.findIndex(c => c.obj === cur);
                        if (li >= 0) {
                            boardroomState[seatId] = cur;
                            used.add(cur);
                            leftover.splice(li, 1);
                            return;
                        }
                    }
                    freeSeats.push(seatId);
                });
                freeSeats.forEach(seatId => {
                    const next = leftover.shift();
                    if (next) boardroomState[seatId] = next.obj;
                });

                renderBoardroom();
                saveBoardroom();
                renderOptimizerResults();
                computeAndShowOptResult();
                showToast('已应用最优摆放并保存', 'success');
            });
        }

        // ============ 最优摆放建议（手动选择目标，后台计算） ============
        let optMode = 'admin';       // admin | restaurant | target（销售速度）| research（研究类生产提升）
        let optTargetInput = '';     // 目标最终销售速度(%)，仅 target 模式
        let optResearchInput = '';   // 目标研究类生产提升(%)，仅 research 模式
        let optRunId = 0;            // 计算令牌：切换/重算/关闭时自增以取消旧任务
        let optBusy = false;         // 是否正在后台计算

        const OPT_MODE_LABELS = {
            admin: '管理费用最低',
            restaurant: '餐馆评级最高',
            target: '指定销售速度时管理费用最低',
            research: '指定研究类生产提升时管理费用最低'
        };

        // 「指定销售速度」所需的 CMO 加成下限 k（需满足 floor(effCmo/3) >= k）
        function optTargetK() {
            const value = parseInt(optTargetInput, 10);
            if (!Number.isFinite(value) || value < 0) return null;
            const base = readBaseNumbers();
            return Math.max(0, Math.ceil(value - base.baseSalesVal - 1e-9));
        }

        // 「指定研究类生产提升」所需的 effCto 下限（研究提升 = effCto × 2%）
        function optResearchCto() {
            const value = parseInt(optResearchInput, 10);
            if (!Number.isFinite(value) || value < 0) return null;
            return Math.max(0, Math.ceil(value / 2 - 1e-9));
        }

        // 按当前目标发起后台求解
        function optFindBest(pool, academyLevel, mode, tokenId) {
            let kMin = null;
            let ctoMin = null;
            if (mode === 'target') kMin = optTargetK();
            if (mode === 'research') ctoMin = optResearchCto();
            return findBestPlacements(pool, academyLevel, mode, kMin, ctoMin, tokenId);
        }

        // 按当前手动选择的目标后台计算并把结果写入 #sc-opt-result
        function computeAndShowOptResult() {
            const resultBox = document.getElementById('sc-opt-result');
            if (!resultBox || optBusy) return;

            syncAcademyRadioToRealm();
            const academyLevel = getCheckedAcademyLevel();
            const pool = collectExecutivePool();
            if (pool.length === 0) {
                resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-fg3); padding: 4px 2px;">暂无高管数据：请先录入或点击「获取当前最新高管数据」。</div>';
                return;
            }

            if (optMode === 'target') {
                const targetValue = parseInt(optTargetInput, 10);
                if (!Number.isFinite(targetValue) || targetValue < 0) {
                    resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-dangerFg); padding: 4px 2px;">请输入有效的目标销售速度（%）后再计算。</div>';
                    return;
                }
            }
            if (optMode === 'research') {
                const targetValue = parseInt(optResearchInput, 10);
                if (!Number.isFinite(targetValue) || targetValue < 0) {
                    resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-dangerFg); padding: 4px 2px;">请输入有效的研究类生产提升目标（%）后再计算。</div>';
                    return;
                }
            }

            const token = ++optRunId;
            optBusy = true;
            const calcBtn = document.getElementById('sc-opt-calc-btn');
            if (calcBtn) {
                calcBtn.disabled = true;
                calcBtn.textContent = '计算中…';
            }
            resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-fg3); padding: 4px 2px;">正在后台计算…</div>';

            optFindBest(pool, academyLevel, optMode, token).then(bests => {
                optBusy = false;
                if (calcBtn) {
                    calcBtn.disabled = false;
                    calcBtn.textContent = '计算摆法';
                }
                if (!bests) return; // 已取消，结果区由重绘更新

                if (optMode === 'target' && !bests.targetSales) {
                    const targetValue = parseInt(optTargetInput, 10);
                    const kMin = optTargetK();
                    const base = readBaseNumbers();
                    const maxK = Math.floor(bests.restaurant.effCmo / 3);
                    const reachable = (base.baseSalesVal + maxK).toFixed(1);
                    resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-dangerFg); line-height: 1.7; padding: 6px 2px;">目标销售速度 ' + targetValue + '% 无法达到：至少需要高管销售加成 +' + kMin + '%，当前高管最高只能到 +' + maxK + '%（销售速度最高约 ' + reachable + '%）。请调低目标，或提升 CMO 技能后再试。</div>';
                    return;
                }
                if (optMode === 'research' && !bests.targetResearch) {
                    const targetValue = parseInt(optResearchInput, 10);
                    const needCto = optResearchCto();
                    const maxEffCto = bests.ctoMax ? bests.ctoMax.effCto : 0;
                    const reachable = (maxEffCto * 2).toFixed(1);
                    resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-dangerFg); line-height: 1.7; padding: 6px 2px;">目标研究类生产提升 ' + targetValue + '% 无法达到：至少需要 CTO 有效点数 ' + needCto + '，当前高管最高 ' + maxEffCto + '（研究提升最高约 ' + reachable + '%）。请调低目标，或提升 CTO 技能后再试。</div>';
                    return;
                }

                const best = optMode === 'target' ? bests.targetSales
                    : optMode === 'research' ? bests.targetResearch
                    : bests[optMode];
                if (!best) {
                    resultBox.innerHTML = '<div style="font-size: 12px; color: var(--sc-dangerFg); padding: 4px 2px;">该目标无可行解，请调整后重试。</div>';
                    return;
                }
                const m = formatMetrics(best.effCoo, best.effCmo, best.effCto);
                const seatText = best.placement
                    .filter(item => isOptSeatActive(item.seat, academyLevel) && item.obj && item.name)
                    .map(item => SLOT_LABELS[item.seat] + '：' + item.name)
                    .join(' ｜ ');

                let html = '';
                if (optMode === 'target') {
                    const targetValue = parseInt(optTargetInput, 10);
                    const kMin = optTargetK();
                    const maxK = Math.floor(bests.restaurant.effCmo / 3);
                    html += '<div style="font-size: 11px; color: var(--sc-fg3); margin: 2px 0 6px;">目标：销售速度 ≥ ' + targetValue + '%（需 CMO 加成 ≥ +' + kMin + '%，当前上限 +' + maxK + '%）</div>';
                }
                if (optMode === 'research') {
                    const targetValue = parseInt(optResearchInput, 10);
                    const needCto = optResearchCto();
                    const maxEffCto = bests.ctoMax ? bests.ctoMax.effCto : 0;
                    html += '<div style="font-size: 11px; color: var(--sc-fg3); margin: 2px 0 6px;">目标：研究类生产提升 ≥ ' + targetValue + '%（需 CTO 有效点数 ≥ ' + needCto + '，当前上限 ' + maxEffCto + '）</div>';
                }
                html += '<div style="border: 1px solid var(--sc-border2); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; line-height: 1.8;">';
                html += '<div style="font-weight: bold; color: var(--sc-fg2);">' + OPT_MODE_LABELS[optMode] + '</div>';
                html += '<div style="color: var(--sc-fg);">' + seatText + '</div>';
                const metricsText = optMode === 'research'
                    ? '管理费用 <span style="color: var(--sc-successFg); font-weight: bold;">' + m.adminText + '</span> ｜ 研究类生产提升 ' + m.researchText
                    : '管理费用 <span style="color: var(--sc-successFg); font-weight: bold;">' + m.adminText + '</span> ｜ 餐馆评级 ' + m.restaurantText + ' ｜ 销售速度 ' + m.salesText;
                html += '<div style="color: var(--sc-fg3);">预计：' + metricsText + '</div>';
                html += '<div style="margin-top: 6px;"><button data-opt-apply="' + optMode + '" style="padding: 5px 14px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">应用到自定义数据并保存</button></div>';
                html += '</div>';
                resultBox.innerHTML = html;
                const applyBtn = resultBox.querySelector('button[data-opt-apply]');
                if (applyBtn) {
                    applyBtn.onclick = () => applyBestPlacement(applyBtn.getAttribute('data-opt-apply'), applyBtn);
                }
            });
        }

        // 渲染「最优摆放建议」面板：先手动选择目标，点「计算摆法」后台计算
        function renderOptimizerResults() {
            const container = document.getElementById('sc-boardroom-opt-results');
            if (!container) return;

            // 若有旧计算在跑，先取消
            if (optBusy) {
                optRunId++;
                optBusy = false;
            }

            syncAcademyRadioToRealm();
            const academyLevel = getCheckedAcademyLevel();
            const pool = collectExecutivePool();
            if (pool.length === 0) {
                container.innerHTML = '<div style="font-size: 12px; color: var(--sc-fg3); padding: 4px 2px;">暂无高管数据：请先在下方格子录入，或点击「获取当前最新高管数据」。</div>';
                return;
            }

            const cur = currentMetrics(academyLevel);

            let html = '';
            html += '<div style="border: 1px solid var(--sc-border2); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; line-height: 1.9;">';
            html += '<div style="margin-bottom: 4px;"><label for="sc-opt-mode" style="color: var(--sc-fg2); font-weight: bold;">优化目标：</label>';
            html += '<select id="sc-opt-mode" style="max-width: 100%; padding: 4px 6px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 12px;">';
            html += '<option value="admin">管理费用最低</option>';
            html += '<option value="restaurant">餐馆评级最高</option>';
            html += '<option value="target">指定销售速度时管理费用最低</option>';
            html += '<option value="research">指定研究类生产提升时管理费用最低</option>';
            html += '</select></div>';
            if (optMode === 'target') {
                html += '<div style="margin-bottom: 4px;">目标最终销售速度（%）：';
                html += '<input id="sc-opt-target" type="number" min="0" step="1" placeholder="如 ' + cur.text.salesText.replace('%', '') + '" style="width: 90px; padding: 3px 6px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 12px;">';
                html += '<div style="font-size: 11px; color: var(--sc-fg3);">最终销售速度 = 基础销售速度 + CMO 加成（整数 %）。</div></div>';
            }
            if (optMode === 'research') {
                html += '<div style="margin-bottom: 4px;">目标研究类生产提升（%）：';
                html += '<input id="sc-opt-research" type="number" min="0" step="2" placeholder="如 ' + cur.text.researchText.replace('%', '') + '" style="width: 90px; padding: 3px 6px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 12px;">';
                html += '<div style="font-size: 11px; color: var(--sc-fg3);">研究提升 = CTO 有效点数 × 2%（即 2 的倍数）。</div></div>';
            }
            html += '<div style="margin-top: 2px;"><button id="sc-opt-calc-btn" style="padding: 5px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">计算摆法</button></div>';
            html += '</div>';

            html += '<div id="sc-opt-result" style="font-size: 12px; color: var(--sc-fg3); padding: 2px 2px 4px;">选择上方优化目标后点击「计算摆法」。</div>';
            container.innerHTML = html;

            const modeSel = document.getElementById('sc-opt-mode');
            modeSel.value = optMode;
            modeSel.onchange = () => {
                optMode = modeSel.value;
                // 切换目标后重绘（含目标输入框显隐）并清空旧结果
                renderOptimizerResults();
            };

            const targetInput = document.getElementById('sc-opt-target');
            if (targetInput) {
                targetInput.value = optTargetInput;
                targetInput.oninput = () => { optTargetInput = targetInput.value; };
            }
            const researchInput = document.getElementById('sc-opt-research');
            if (researchInput) {
                researchInput.value = optResearchInput;
                researchInput.oninput = () => { optResearchInput = researchInput.value; };
            }

            const calcBtn = document.getElementById('sc-opt-calc-btn');
            if (calcBtn) {
                calcBtn.onclick = () => computeAndShowOptResult();
            }
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
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                            <button id="sc-boardroom-save-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">保存</button>
                            <button id="sc-boardroom-fetch-btn" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">获取当前最新高管数据</button>
                            <button id="sc-boardroom-opt-btn" style="padding: 8px 16px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">最优摆放建议</button>
                            <button id="sc-boardroom-compare-btn" style="padding: 8px 16px; background: #607d8b; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">比对当前游戏摆放</button>
                        </div>
                        <div id="sc-boardroom-compare-results"></div>
                        <div id="sc-boardroom-opt-results"></div>
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
                optRunId++; // 取消可能仍在后台运行的摆放计算
                observer.disconnect();
                modal.remove();
            };

            const btnSave = document.getElementById('sc-boardroom-save-btn');
            const btnFetch = document.getElementById('sc-boardroom-fetch-btn');
            const btnOpt = document.getElementById('sc-boardroom-opt-btn');
            if (btnOpt) {
                btnOpt.onclick = (e) => {
                    e.preventDefault();
                    renderOptimizerResults();
                };
            }
            const btnCompare = document.getElementById('sc-boardroom-compare-btn');
            if (btnCompare) {
                btnCompare.onclick = (e) => {
                    e.preventDefault();
                    compareWithGame(btnCompare);
                };
            }

            btnSave.onclick = (e) => {
                e.preventDefault();
                saveBoardroom();
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
            const academyRadioValue = getAcademyRadioValue();
            rightContainer.innerHTML = `
                <div style="font-size: 15px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid var(--sc-border); padding-bottom: 10px; color: var(--sc-fg);">
                    高管加成模拟计算
                </div>

                <div style="margin-bottom: 15px; font-size: 13px; background: var(--sc-aca-bg); padding: 10px; border-radius: 8px; border: 1px solid var(--sc-border);">
                    <strong style="display: block; margin-bottom: 6px; color: var(--sc-fg); font-size: 12px;">学院总等级:</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--sc-fg); font-size: 12px;">
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="0" ${academyRadioValue === 0 ? 'checked' : ''} style="vertical-align:middle;"> 0-4</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="5" ${academyRadioValue === 5 ? 'checked' : ''} style="vertical-align:middle;"> 5-9</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="10" ${academyRadioValue === 10 ? 'checked' : ''} style="vertical-align:middle;"> 10-14</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="15" ${academyRadioValue === 15 ? 'checked' : ''} style="vertical-align:middle;"> 15-19</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="20" ${academyRadioValue === 20 ? 'checked' : ''} style="vertical-align:middle;"> 20+</label>
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

registerExportInfo({
    name: '自定义高管数据',
    scope: 'realm',
    // backup: true, // 2026-08 临时排除：该模块自带"获取最新数据"按钮，缺数据可手动刷新
    keys: realmId => realmId === null
        ? ['SC-Saved-Boardroom', 'SC-Saved-Bonuses']
        : [`R${realmId}-SC-Saved-Boardroom`, `R${realmId}-SC-Saved-Bonuses`]
});