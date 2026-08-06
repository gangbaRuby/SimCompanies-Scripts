import { getRealmIdFromLink } from '../core/storage.js';
import { DM } from '../utils/ui.js';
import { registerExportInfo } from '../core/exportInfo.js';

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

registerExportInfo({
    name: '前任高管记录',
    scope: 'realm',
    keys: realmId => realmId === null
        ? ['SC-former-executives']
        : [`R${realmId}-SC-former-executives`]
});

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.FormerExecutivesModule = FormerExecutivesModule;
