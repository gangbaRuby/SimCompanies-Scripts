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
        let initTimer = null;

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
            if (container.matches?.('img.emoji:not([data-sc-emoji-done])')) processEmoji(container);
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

        // 只读取房间名，避免色弱/全局屏蔽按钮的文案参与白名单匹配。
        function readRoomName(header) {
            if (!header) return '';
            const title = header.cloneNode(true);
            title.querySelectorAll('.sc-chat-toggle-btn, .sc-chat-block-quick').forEach(btn => btn.remove());
            return title.textContent?.trim() || '';
        }

        // 获取当前聊天室名称
        function getChatRoom() {
            // 优先通过聊天室标识容器查找
            const roomIndicator = document.querySelector('div.css-13udsys.col-lg-6');
            if (roomIndicator) {
                const header = roomIndicator.querySelector('div.well-header.text-uppercase.css-12ztnbp');
                if (header) return readRoomName(header);
            }
            // 后备：直接查找 header
            const header = document.querySelector('div.well-header.text-uppercase.css-12ztnbp');
            return readRoomName(header);
        }

        function cleanupUI() {
            document.querySelectorAll('.sc-chat-toggle-btn').forEach(btn => btn.remove());
            document.querySelectorAll('.sc-chat-assist').forEach(container => container.classList.remove('sc-chat-assist'));
        }

        function scheduleInit(delay) {
            if (initTimer !== null) clearTimeout(initTimer);
            initTimer = setTimeout(init, delay);
        }

        // 给所有符合条件的聊天室 header 添加切换按钮
        function addToggleButtons() {
            // 功能开关未开启则不显示按钮
            if (!isEnabled()) return;

            const headers = document.querySelectorAll('div.well-header.text-uppercase.css-12ztnbp');
            headers.forEach(header => {
                const roomName = readRoomName(header);
                if (!ALLOWED_ROOMS.includes(roomName)) {
                    header.querySelector('.sc-chat-toggle-btn')?.remove();
                    return;
                }

                // 查重
                if (header.querySelector('.sc-chat-toggle-btn')) return;

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
            if (initTimer !== null) { clearTimeout(initTimer); initTimer = null; }
            if (observer) { observer.disconnect(); observer = null; }

            // 设置面板关闭功能时立即恢复图标并移除入口，不等待切换聊天室。
            if (!isEnabled()) {
                cleanupUI();
                return;
            }

            injectStyles();

            const room = getChatRoom();
            if (!room) {
                cleanupUI();
                scheduleInit(1000);
                return;
            }

            if (!ALLOWED_ROOMS.includes(room)) {
                cleanupUI();
                return;
            }

            // 标题和消息列表可分批挂载，按钮状态无需等待消息列表。
            addToggleButtons();
            refreshAllButtons();

            const chatContainers = findChatContainers();
            if (chatContainers.length === 0) {
                scheduleInit(1000);
                return;
            }

            // 仅开启时扫描包裹；重复刷新后重新监听当前消息容器。
            chatContainers.forEach(container => scanContainer(container));

            // 应用当前开关状态到所有容器
            refreshAllContainers();

            // 标题按钮切到图标模式时保留监听，但不扫描包裹。
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
                scheduleInit(500);
            }
        }).observe(document, { subtree: true, childList: true });

        // 延迟启动
        scheduleInit(1000);

        // 供设置面板开关后触发重新扫描（与 scChatEmojiPickerRefresh 同模式）
        window.scChatAccessibilityRefresh = () => init();

        return { init, getChatRoom, EMOJI_TEXT, ALLOWED_ROOMS };
    })();
