import { registerExportInfo } from '../core/exportInfo.js';

    const PAQuestAnswers = (function () {
        const PA_DATA_KEY = 'SC_PA_Quests_Cache';
        const PA_DATA_URL = 'https://sc.22-7.top/scripts/PA-Quests.json';
        const CACHE_TTL = 3600000; // 1小时
        const MATCH_THRESHOLD = 0.7;

        registerExportInfo({
            name: 'PA 任务答案缓存',
            scope: 'global',
            keys: [PA_DATA_KEY]
        });

        let questData = null;
        let dataLoadAttempted = false;
        let initAttempted = false;
        let observer = null;
        let cleanupTimer = null;

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
                        best = { quest: q, lang: v.lang, qText: v.text };
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

        // 提取 stopEl 之前的所有纯文本（用于定位 pa-reply 链接前的问题文字）
        function getTextBefore(element, stopEl) {
            const parts = [];
            function walk(node) {
                if (node === stopEl) return true;
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = (node.textContent || '').trim();
                    if (t) parts.push(t);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName;
                    if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE') return false;
                    for (let child = node.firstChild; child; child = child.nextSibling) {
                        if (walk(child)) return true;
                    }
                }
                return false;
            }
            walk(element);
            return parts.join('').trim();
        }

        // 从消息元素获取用于匹配的文本段列表
        // 返回 { text, el } 列表：text 独立匹配，el 为该文本的来源元素
        function getMessageTexts(element) {
            // PA消息（带 pa-reply 链接）：提取第一个 pa-reply 之前的文本（即问题文本）
            var paReply = element.querySelector('a.pa-reply');
            if (paReply) {
                var text = getTextBefore(element, paReply);
                if (text) return [{ text: text, el: element }];
                return [];
            }

            // 聊天消息/其他：优先按子元素分割独立匹配
            var results = [];
            var children = element.children;
            if (children.length > 1) {
                for (var i = 0; i < children.length; i++) {
                    var childText = extractText(children[i]);
                    if (childText && childText.length > 3) {
                        results.push({ text: childText, el: children[i] });
                    }
                }
                // 同时加入全部合并文本（处理问题被拆分到多个span的情况）
                var fullText = extractText(element);
                if (fullText) results.push({ text: fullText, el: element });
            }
            // 如果子元素分割没有结果，退回到整体提取
            if (results.length === 0) {
                var fullText = extractText(element);
                if (fullText) results.push({ text: fullText, el: element });
            }
            return results;
        }

        // 定位 PA 问题消息元素：从链接向上找最近的、包含该链接且链接前有足够文本的 DIV，
        // 避免把答案框追加到聊天窗口/页面级包装元素上
        function findPaMessageElement(link) {
            var el = link.parentElement;
            while (el && el !== document.body) {
                if (el.tagName === 'DIV') {
                    var text = getTextBefore(el, link);
                    if (text && text.length >= 3 && !isChatContainer(el)
                        && !el.querySelector('.input-group')) {
                        return el;
                    }
                }
                el = el.parentElement;
            }
            return null;
        }

        // 防御：答案框只允许插入消息级元素，拒绝聊天容器/聊天窗口/页面级包装元素
        function isSafeAnswerParent(el) {
            if (!el || el === document.body) return false;
            if (isChatContainer(el)) return false;
            if (el.querySelector && el.querySelector('.input-group')) return false;
            // 内部仍嵌套消息容器，说明是包装层而非单条消息
            if (el.querySelector && el.querySelector('div.css-xo2rg1.e1llepen2, div[style*="column-reverse"][style*="overflow"]')) return false;
            // PA 消息：包含 pa-reply 链接
            if (el.querySelector && el.querySelector('a.pa-reply')) return true;
            // 聊天消息：必须是已知消息容器的直接子元素
            return !!(el.parentElement && isChatContainer(el.parentElement));
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

            if (!isSafeAnswerParent(element)) {
                return;
            }

            var entries = getMessageTexts(element);
            for (var ti = 0; ti < entries.length; ti++) {
                if (!entries[ti].text || entries[ti].text.length < 3) continue;
                var match = findBestMatch(entries[ti].text);
                if (match) {
                    if (element.querySelector('.sc-pa-answer-box')) return;
                    var answerUI = createAnswerUI(match);
                    answerUI.dataset.scPaQuestion = match.qText;
                    // 若匹配文本来自子元素且该子元素本身是安全的消息内容块，优先插到该子元素
                    var target = element;
                    if (entries[ti].el !== element && entries[ti].el.tagName === 'DIV'
                        && isSafeAnswerParent(entries[ti].el)) {
                        target = entries[ti].el;
                    }
                    if (!isSafeAnswerParent(target)) return;
                    target.appendChild(answerUI);
                    return;
                }
            }
        }

        // 扫描页面上的消息
        function scanPage() {
            if (!questData || questData.length === 0) return;

            // 1. 处理 PA 系统消息（通过 pa-reply 链接定位）
            document.querySelectorAll('a.pa-reply').forEach(function (link) {
                var msgEl = findPaMessageElement(link);
                if (msgEl && !msgEl.scPaProcessed) {
                    processMessage(msgEl);
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

        // 判断是否为聊天消息容器（与 findChatContainers 同一套选择器）
        function isChatContainer(el) {
            if (!el || el.nodeType !== 1 || !el.matches) return false;
            return el.matches('div.css-xo2rg1.e1llepen2') ||
                el.matches('div[style*="column-reverse"][style*="overflow"]');
        }

        // 判断是否为消息级元素（聊天容器的直接子级，或包含 pa-reply 链接的 PA 消息）
        function isMessageLevelElement(el) {
            if (!el || el === document.body || isChatContainer(el)) return false;
            if (el.querySelector && el.querySelector('a.pa-reply')) return true;
            return !!(el.parentElement && isChatContainer(el.parentElement));
        }

        // 清理过期答案框：宿主被 React 清空/复用、宿主为聊天容器本身、
        // 或宿主文本不再匹配原问题时，移除答案框并允许重新评估宿主
        function cleanupStaleAnswers() {
            var boxes = document.querySelectorAll('.sc-pa-answer-box');
            for (var i = 0; i < boxes.length; i++) {
                var box = boxes[i];
                var parent = box.parentElement;
                if (!parent || !parent.isConnected) {
                    box.remove();
                    continue;
                }
                var qText = box.dataset.scPaQuestion;
                var valid = false;
                if (qText && !isChatContainer(parent)) {
                    var entries = getMessageTexts(parent);
                    for (var ti = 0; ti < entries.length; ti++) {
                        if (calcMatchRate(entries[ti].text, qText) >= MATCH_THRESHOLD) {
                            valid = true;
                            break;
                        }
                    }
                }
                if (valid) continue;

                box.remove();
                // 宿主可能已被 React 复用装入新消息：重置标记并重新评估
                parent.scPaProcessed = false;
                if (isMessageLevelElement(parent)) {
                    processMessage(parent);
                }
            }
        }

        // 防抖调度清理，避免每次 DOM 变更都全量校验
        function scheduleCleanup() {
            if (cleanupTimer) return;
            cleanupTimer = setTimeout(function () {
                cleanupTimer = null;
                cleanupStaleAnswers();
            }, 300);
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
            cleanupStaleAnswers();

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
                scheduleCleanup();
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
                var msgEl = findPaMessageElement(element);
                if (msgEl && !msgEl.scPaProcessed) {
                    processMessage(msgEl);
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
                        var msgEl = findPaMessageElement(link);
                        if (msgEl && !msgEl.scPaProcessed) {
                            processMessage(msgEl);
                        }
                    });
                }
            }

            // React 整体重建消息容器时，容器内部的消息不会作为独立新增节点出现，
            // 这里递归处理新增节点内部嵌套的已知聊天容器及其消息子元素
            if (element.querySelectorAll && !isChatContainer(element)) {
                var nestedContainers = element.querySelectorAll('div.css-xo2rg1.e1llepen2, div[style*="column-reverse"][style*="overflow"]');
                nestedContainers.forEach(function (c) {
                    c.querySelectorAll(':scope > div').forEach(function (msgEl) {
                        if (!msgEl.scPaProcessed) processMessage(msgEl);
                    });
                });
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
