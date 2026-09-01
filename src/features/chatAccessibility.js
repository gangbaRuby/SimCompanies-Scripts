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

            // 仅开启时扫描包裹（关闭时不产生 DOM 开销；开启由设置面板/头部按钮触发重新扫描）
            if (isEnabled()) {
                chatContainers.forEach(container => {
                    scanContainer(container);
                });
            }

            // 给所有符合条件的聊天室 header 添加切换按钮
            addToggleButtons();

            // 应用当前开关状态到所有容器
            refreshAllContainers();

            // 监听新消息（始终监听，但 CSS 控制显示；关闭时不扫描包裹）
            if (observer) observer.disconnect();
            observer = new MutationObserver((mutations) => {
                if (!isEnabled()) return;
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

        // 供设置面板开关后触发重新扫描（与 scChatEmojiPickerRefresh 同模式）
        window.scChatAccessibilityRefresh = () => init();

        return { init, getChatRoom, EMOJI_TEXT, ALLOWED_ROOMS };
    })();