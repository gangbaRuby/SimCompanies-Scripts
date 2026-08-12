import { getRealmIdFromLink } from '../core/storage.js';
import { DM } from '../utils/ui.js';
import { registerExportInfo } from '../core/exportInfo.js';

        const ExecutiveTrainingModule = (function () {
        let panelRelocateTimer = null;
        let currentPanelRenderTimer = null;

        const OFFERS_URL = "/api/v2/companies/executives/my-offers/";
        const NOTIFICATIONS_KEYWORD = "/game-notifications/";
        const EXEC_API_REGEX = /\/api\/v4\/executives\/(\d+)\/$/;
        const CURRENT_EXECS_API_REGEX = /\/api\/v3\/companies\/\d+\/executives\/?(\?|$)/;
        const CURRENT_EXECS_STORAGE_KEY = 'SC-Current-Executives';
        const SLOT_MAP = {
            "coo": "o", "cfo": "f", "cmo": "m", "cto": "t",
            "coo-apprentice": "v", "cfo-apprentice": "x", "cmo-apprentice": "y", "cto-apprentice": "z",
            "g1": "1", "g2": "2", "g3": "3", "g4": "4", "g5": "5"
        };

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

        const getCurrentExecSlot = () => {
            const match = location.pathname.match(/\/executives\/([a-z0-9-]+)\/?$/);
            return match ? (SLOT_MAP[match[1]] || null) : null;
        };

        const getCurrentExecRecord = () => {
            const slot = getCurrentExecSlot();
            if (!slot) return null;
            return load(CURRENT_EXECS_STORAGE_KEY).find(e => e.position === slot) || null;
        };

        const getCurrentExecPanelContainer = () =>
            document.querySelector('#page .row > .col-lg-6') || null;

        const getReactFiber = (el) => {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            return key ? el[key] : null;
        };

        const getHostNodeFromFiber = (fiber) => {
            const queue = [fiber];
            while (queue.length) {
                const node = queue.pop();
                if (!node) continue;
                if (node.stateNode instanceof Element) return node.stateNode;
                if (node.sibling) queue.push(node.sibling);
                if (node.child) queue.push(node.child);
            }
            return null;
        };

        // 定位培训课程进度汇总块，不依赖 CSS 类名和游戏文案。
        const getCurrentExecTrainingSummaryNode = (execId) => {
            const page = document.getElementById('page');
            if (!page || execId == null) return null;

            const findKeyedTop = (rootFiber) => {
                const queue = [rootFiber];
                while (queue.length) {
                    const node = queue.pop();
                    if (!node) continue;
                    if (node.key === 'top') {
                        const host = getHostNodeFromFiber(node);
                        const hasProgress = !!(host && host.querySelector('[role="progressbar"]'));
                        if (hasProgress) {
                            return host;
                        }
                    }
                    if (node.sibling) queue.push(node.sibling);
                    if (node.child) queue.push(node.child);
                }
                return null;
            };

            for (const el of page.querySelectorAll('div')) {
                const fiber = getReactFiber(el);
                if (!fiber) continue;

                let node = fiber;
                while (node) {
                    const props = node.memoizedProps;
                    if (props && props.executive && String(props.executive.id) === String(execId)) {
                        const found = findKeyedTop(node);
                        if (found) return found;
                        break;
                    }
                    node = node.return;
                }
            }

            const pageFound = findKeyedTop(getReactFiber(page));
            return pageFound;
        };

        const clearCurrentPanelRenderTimer = () => {
            if (currentPanelRenderTimer) {
                clearInterval(currentPanelRenderTimer);
                currentPanelRenderTimer = null;
            }
        };
        window.addEventListener('pagehide', clearCurrentPanelRenderTimer, { once: true });

        const ensureAgencyPanelRelocated = () => {
            const panel = document.getElementById('sc-plugin-panel');
            if (!panel) {
                if (panelRelocateTimer) {
                    clearInterval(panelRelocateTimer);
                    panelRelocateTimer = null;
                }
                return;
            }
            if (getValidTargetContainer()) return;
            const firstCol = getCurrentExecPanelContainer();
            if (firstCol && panel.parentElement !== firstCol) {
                firstCol.appendChild(panel);
            }
        };

        const startAgencyPanelRelocateWatch = () => {
            if (panelRelocateTimer) return;
            panelRelocateTimer = setInterval(ensureAgencyPanelRelocated, 500);
            window.addEventListener('pagehide', () => {
                if (panelRelocateTimer) {
                    clearInterval(panelRelocateTimer);
                    panelRelocateTimer = null;
                }
                clearCurrentPanelRenderTimer();
            }, { once: true });
        };

        const isExecutiveHistoryEnabled = () =>
            typeof window.isPageModuleEnabled === 'function'
                ? window.isPageModuleEnabled('executiveHistory')
                : true;

        function processCurrentExecutives(d) {
            const list = Array.isArray(d) ? d : (d.executives || []);
            const current = list
                .filter(e => e && e.id != null)
                .map(e => ({
                    id: e.id,
                    name: e.name || '',
                    age: e.age ?? null,
                    position: e.currentWorkHistory?.position ?? e.position ?? null
                }))
                .filter(e => e.position != null);
            if (current.length > 0) save(CURRENT_EXECS_STORAGE_KEY, current);
        }

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
        function renderSkillPanel(data, isError = false, mode = 'agency') {
            const targetContainer = mode === 'current' ? getCurrentExecPanelContainer() : getValidTargetContainer();
            const panelId = mode === 'current' ? 'sc-current-exec-panel' : 'sc-plugin-panel';
            const existingPanel = document.getElementById(panelId);
            if (!targetContainer || (mode !== 'current' && existingPanel)) return;
            if (mode === 'current') clearCurrentPanelRenderTimer();

            const d14 = DM();
            const panel = existingPanel || document.createElement('div');
            panel.id = panelId;
            const baseStyle = `margin-top: 12px; padding: 12px; border-radius: 4px; font-family: sans-serif; font-size: 14px; background-color: ${d14 ? '#2c2c2c' : '#f2f2f2'}; border: 1px solid ${d14 ? '#555' : '#d1d1d1'}; color: ${d14 ? '#efefef' : '#333'};${mode === 'current' ? ' width:100%; box-sizing:border-box;' : ''}`;

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

                // 1. 详细培训历史（已完成次数排除正在培训，历史仍展示并标注）
                const trainings = Array.isArray(data.trainings) ? data.trainings : [];
                const currentTraining = data.currentTraining || null;
                const trainingTime = (t) => {
                    const raw = t?.datetime || t?.start || t?.end || t?.time;
                    const ts = raw ? Date.parse(raw) : NaN;
                    return Number.isNaN(ts) ? Infinity : ts;
                };
                const formatTrainingTime = (t) => {
                    const raw = t?.datetime || t?.start || t?.end || t?.time;
                    const d = new Date(raw);
                    if (!raw || Number.isNaN(d.getTime())) return '';
                    const parts = new Intl.DateTimeFormat('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        year: 'numeric', month: 'numeric', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: false
                    }).formatToParts(d);
                    const map = {};
                    parts.forEach(p => { map[p.type] = p.value; });
                    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
                };
                const isCurrentTrainingEntry = (t) => {
                    if (currentTraining) {
                        if (t.id != null && currentTraining.id != null && String(t.id) === String(currentTraining.id)) return true;
                        if (t.datetime && currentTraining.datetime && t.datetime === currentTraining.datetime) return true;
                    }
                    const startRaw = t?.datetime || t?.start || t?.time;
                    const start = startRaw ? Date.parse(startRaw) : NaN;
                    if (Number.isNaN(start) || start > Date.now() || t.end) return false;
                    return start + 27 * 60 * 60 * 1000 > Date.now();
                };
                const sortedTrainings = [...trainings].sort((a, b) => trainingTime(a) - trainingTime(b));
                const completedTrainings = sortedTrainings.filter(t => !isCurrentTrainingEntry(t));
                let total = { coo: 0, cfo: 0, cmo: 0, cto: 0 };
                sortedTrainings.forEach(t => {
                    total.coo += t.skillCoo || 0; total.cfo += t.skillCfo || 0;
                    total.cmo += t.skillCmo || 0; total.cto += t.skillCto || 0;
                });
                const historyHtml = sortedTrainings.map((t, index) => {
                    const isCurrent = isCurrentTrainingEntry(t);
                    const details = [];
                    if (t.skillCoo) details.push(`管理+${t.skillCoo}`);
                    if (t.skillCfo) details.push(`会计+${t.skillCfo}`);
                    if (t.skillCmo) details.push(`沟通+${t.skillCmo}`);
                    if (t.skillCto) details.push(`科学+${t.skillCto}`);
                    const detailStr = details.length > 0 ? `<span style="color:${fg3}; margin-left:4px;">(${details.join(' ')})</span>` : '';
                    const timeText = formatTrainingTime(t);
                    const timeHtml = timeText
                        ? `<span style="color:${fg3}; margin-left:6px;">${timeText}</span>`
                        : '';
                    const currentBadge = isCurrent
                        ? `<span style="color:${d14 ? '#81c784' : '#2e7d32'}; margin-left:4px;">（正在培训）</span>`
                        : '';
                    const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm, t.employer.company);
                    return `<div style="padding:2px 0; border-bottom:1px dashed ${border1}; color:${fg2}; font-size:14px;">${index + 1}. 在 <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}${timeHtml}${currentBadge}</div>`;
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

                const panelTitle = mode === 'current' ? '现任高管详情' : '高管解析';
                const warningHtml = mode === 'current'
                    ? ''
                    : `<div style="margin-top:10px; padding:8px; background-color:${d14 ? '#3a2020' : '#fff5f5'}; border:1px solid ${d14 ? '#5a3030' : '#ffcccc'}; border-radius:4px; font-size:14px; color:${d14 ? '#ef5350' : '#c62828'}; line-height:1.4;">
                    <b>⚠️请注意：</b><br>
                    1. 本功能为插件功能，<b>禁止在游戏内聊天室提及</b>。<br>
                    2. 若在发送通知前点开高管，则可能导致此次挖人数据不再显示。<br>
                    3. 若通知内高管被他人抢先招募，<b>在点击“寻找其他候选人”后显示的数据无效</b>。
                </div>`;

                contentHtml = `
                <div style="font-weight:bold; border-bottom:1px solid ${d14 ? '#555' : '#ccc'}; padding-bottom:5px; margin-bottom:8px; display:flex; justify-content:space-between;">${panelTitle} <span style="color:${d14 ? '#aaa' : '#888'}; font-size:14px; font-weight:normal;">高管名字: ${data.name}  ID: ${data.id}</span></div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? '#bbb' : '#666'}; margin-bottom:4px;">📊 目前培训技能总和 <span style="font-weight:normal; color:${d14 ? '#aaa' : '#888'};">(已完成 ${completedTrainings.length} 次)</span></div>
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

                ${warningHtml}`;
            }

            panel.style = baseStyle;
            panel.innerHTML = contentHtml;
            if (mode === 'current') {
                panel.dataset.scExecId = data?.id != null ? String(data.id) : '';
                const anchor = getCurrentExecTrainingSummaryNode(data?.id);
                if (anchor) {
                    anchor.after(panel);
                } else {
                    const startedAt = Date.now();
                    clearCurrentPanelRenderTimer();
                    currentPanelRenderTimer = setInterval(() => {
                        const retryAnchor = getCurrentExecTrainingSummaryNode(data?.id);
                        if (retryAnchor) {
                            clearCurrentPanelRenderTimer();
                            retryAnchor.after(panel);
                        } else if (Date.now() - startedAt > 5000) {
                            clearCurrentPanelRenderTimer();
                            if (targetContainer) targetContainer.appendChild(panel);
                        }
                    }, 200);
                }
            } else {
                targetContainer.after(panel);
                startAgencyPanelRelocateWatch();
            }
        }

        // --- 数据处理层 ---
        function processData(url, d) {
            if (!d) return;

            // 0. 现任高管列表
            if (isExecutiveHistoryEnabled() && CURRENT_EXECS_API_REGEX.test(url)) {
                processCurrentExecutives(d);
                return;
            }

            // 1. 渲染高管详情
            if (EXEC_API_REGEX.test(url)) {
                if (getValidTargetContainer()) {
                    renderSkillPanel(d);
                } else {
                    const current = getCurrentExecRecord();
                    const execMatch = url.match(EXEC_API_REGEX);
                    const currentSlot = getCurrentExecSlot();
                    const detailPosition = d?.currentWorkHistory?.position;
                    const detailSlot = detailPosition != null ? SLOT_MAP[detailPosition] : null;
                    const matchesSlot = currentSlot != null && (
                        detailSlot === currentSlot ||
                        (current && execMatch && Number(execMatch[1]) === Number(current.id))
                    );
                    if (execMatch && matchesSlot && getCurrentExecPanelContainer()) {
                        if (isExecutiveHistoryEnabled()) renderSkillPanel(d, false, 'current');
                    }
                }
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
            if (url.includes(OFFERS_URL) || url.includes(NOTIFICATIONS_KEYWORD) || EXEC_API_REGEX.test(url) || CURRENT_EXECS_API_REGEX.test(url)) {
                res.clone().text().then(text => { try { processData(url, JSON.parse(text)); } catch (e) { } });
            }
            return res;
        };
        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, url) {
            // 仅当URL匹配目标时才添加load监听
            if (typeof url === 'string' && (url.includes(OFFERS_URL) || url.includes(NOTIFICATIONS_KEYWORD) || EXEC_API_REGEX.test(url) || CURRENT_EXECS_API_REGEX.test(url))) {
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
                const internalSlot = SLOT_MAP[slotCode];
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

registerExportInfo({
    name: '高管培训与现任高管记录',
    scope: 'realm',
    keys: realmId => realmId === null
        ? ['SC-my-offers', 'SC-AGENCY_FOUND_EXECUTIVE', 'SC-Current-Executives']
        : [`R${realmId}-SC-my-offers`, `R${realmId}-SC-AGENCY_FOUND_EXECUTIVE`, `R${realmId}-SC-Current-Executives`]
});

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.ExecutiveTrainingModule = ExecutiveTrainingModule;
