// ======================
// 全局深色/浅色模式检测
// ======================
export const isDarkMode = () => {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const sum = (bg.match(/\d+/g) || []).map(Number).reduce((a, b) => a + b, 0);
    return sum < 380;
};
// 深色/浅色主题预设色板
export const DM = () => isDarkMode();
export const theme = {
    get bg() { return DM() ? '#1e1e1e' : '#ffffff'; },
    get bg2() { return DM() ? '#2c2c2c' : '#f5f5f5'; },
    get bg3() { return DM() ? '#333333' : '#e8e8e8'; },
    get bg4() { return DM() ? '#444444' : '#dddddd'; },
    get bg5() { return DM() ? '#222222' : '#fafafa'; },
    get fg() { return DM() ? '#efefef' : '#333333'; },
    get fg2() { return DM() ? '#cccccc' : '#555555'; },
    get fg3() { return DM() ? '#aaaaaa' : '#777777'; },
    get fg4() { return DM() ? '#aaaaaa' : '#666666'; },   // 提升浅色对比度 #999→#666
    get border() { return DM() ? '#555555' : '#cccccc'; },
    get border2() { return DM() ? '#444444' : '#dddddd'; },
    get inputBg() { return DM() ? '#222222' : '#ffffff'; },
    get inputFg() { return DM() ? '#efefef' : '#333333'; },
    get toastBg() { return DM() ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)'; },
    get toastFg() { return DM() ? '#efefef' : '#333333'; },
    get dangerFg() { return '#d32f2f'; },                  // 统一使用较深红色，避免依赖颜色区分
    get successFg() { return '#2e7d32'; },                 // 统一使用较深绿色
    get accent() { return '#2196F3'; },
};

// ======================
// 全局 Toast 提示组件
// ======================
export function showToast(message, type = 'error') {
    let toast = document.getElementById('auto-pricing-toast');
    if (!toast) {
        const d = DM();
        toast = document.createElement('div');
        toast.id = 'auto-pricing-toast';
        toast.style = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${d ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)'};
            color: ${d ? '#efefef' : '#333'};
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 99999;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            font-size: 14px;
            pointer-events: none;
            opacity: 0;
            max-width: 85vw;
            width: max-content;
            min-width: 200px;
            word-wrap: break-word;
            white-space: normal;
            text-align: center;
            box-sizing: border-box;
            line-height: 1.4;
        `;
        document.body.appendChild(toast);
    }

    toast.style.borderLeft = type === 'error' ? '5px solid #ff4444' : '5px solid #4CAF50';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.top = '25px';

    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.top = '10px';
    }, 3500);
}
