export     const createGlobalCustomToggle = (key, label, nativeStyles = {}, onToggleCallback) => {
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
