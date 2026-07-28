(function () {
    const PAGE_ACTIONS_CONFIG_KEY = 'SC_PageActions_Settings';

    // 将函数定义在外部，或挂载到 window
    window.isPageModuleEnabled = (key) => {
        try {
            const stored = localStorage.getItem(PAGE_ACTIONS_CONFIG_KEY);
            if (stored === null) return true; // 默认开启
            const config = JSON.parse(stored);
            return config[key] !== false;
        } catch (e) {
            return true;
        }
    };

    window.savePageModuleEnabled = (key, isEnabled) => {
        try {
            const stored = localStorage.getItem(PAGE_ACTIONS_CONFIG_KEY) || '{}';
            const config = JSON.parse(stored);
            config[key] = isEnabled;
            localStorage.setItem(PAGE_ACTIONS_CONFIG_KEY, JSON.stringify(config));
        } catch (e) {
            console.error('保存配置失败', e);
        }
    };

})();
