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