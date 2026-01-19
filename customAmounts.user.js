// ==UserScript==
// @name         自定义运行时长
// @namespace    https://github.com/gangbaRuby
// @version      1.0.0
// @license      AGPL-3.0
// @description  你可以通过输入“am”，“pm”，“hr”和“m”来快捷决定生产数量。例如: 10pm, 2hr, 30m，11:4am,5:14,字母不区分大小写，半角全角均可
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://sc.22-7.top/scripts/customAmounts.user.js
// @downloadURL  https://sc.22-7.top/scripts/customAmounts.user.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';
    let hasNewVersion, latestVersion;
    let localVersion = GM_info.script.version;

    (function () {
        // --- 配置项 ---
        const CUSTOM_AMOUNTS_STORAGE_KEY = 'SC_AutoAmount_CustomAmounts';
        const DEFAULT_AMOUNTS_STRING = '10pm';
        const DEFAULT_BUTTON_CLASS = 'btn btn-secondary';

        // --- 目标元素选择器 ---
        const CARD_SELECTOR = '.col-xs-6.css-0.ewayztq2, .col-xs-6.resources.text-center'; //前者生产，后者零售
        const PROCESSED_DATA_ATTRIBUTE = 'data-custom-amount-added';

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
                            <h4 style="margin:0;font-size:18px;font-weight:600;">设置自动填入数量/时长</h4>
                        </div>
                        <div style="padding:15px;">
                            <p style="margin-top:0;margin-bottom:15px;font-size:14px;">
                                请输入自定义数量或运行时长，使用<strong style="color:#FF8888;">逗号（, 或 ，）</strong>分隔，可留空以禁用此功能。你可以通过输入“am”，“pm”，“hr”和“m”来快捷决定生产数量。例如: 10pm, 2hr, 30m，11:4am,5:14,字母不区分大小写，半角全角均可
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
        const scriptUrl = 'https://sc.22-7.top/scripts/customAmounts.user.js?t=' + Date.now();
        const downloadUrl = 'https://sc.22-7.top/scripts/customAmounts.user.js';
        // @changelog    自定义运行时长增加指定'HH:MMam/pm' 或 'HH:MM'

        fetch(scriptUrl)
            .then(res => {
                if (!res.ok) throw new Error('获取失败');
                return res.text();
            })
            .then(remoteText => {
                const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
                const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
                if (!matchVersion) return;

                latestVersion = matchVersion[1];
                const changeLog = matchChange ? matchChange[1] : '';

                if (compareVersions(latestVersion, localVersion) > 0) {
                    console.log(`📢 检测到新版本 v${latestVersion}`);
                    if (confirm(`自定义运行时长插件检测到新版本 v${latestVersion}，是否前往更新？\n\nv${latestVersion} ${changeLog}\n\n关于版本号说明 1.X.Y ，X为增添新功能或修复不可用，Y为细节修改不影响功能，如不需更新可将Y或其它位置修改为较大值。`)) {
                        window.open(downloadUrl, '_blank');
                    }
                    hasNewVersion = true;
                } else {
                    console.log("✅ 当前已是最新版本");
                    hasNewVersion = false;
                }
            })
            .catch(err => {
                console.warn('检查更新失败：', err);
            });
    }

    setTimeout(checkUpdate, 3000);


})();
