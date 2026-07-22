export function getRealmIdFromLink() {
    let method1Result = null; // 图片法提取结果
    let method2Result = null; // 链接法提取结果 (原逻辑)

    // --- 方法 1：从特定的 Realm Logo 图片提取 ---
    const realmLogoImg = document.querySelector('img[alt$="realm logo"]');
    if (realmLogoImg) {
        const src = realmLogoImg.src;
        if (src.includes('Magnates')) {
            method1Result = 0;
        } else if (src.includes('Entrepeneurs')) {
            method1Result = 1;
        }
    }

    // --- 方法 2：从链接提取 (你的原逻辑) ---
    const link = document.querySelector('a[href*="/company/"]');
    if (link) {
        const match = link.href.match(/\/company\/(\d+)\//);
        if (match) {
            method2Result = parseInt(match[1], 10);
        }
    }

    // --- 逻辑判断与返回 ---

    // 情况 A：两个方法都成功拿到了数据，进行一致性校验
    if (method1Result !== null && method2Result !== null) {
        if (method1Result !== method2Result) {
            console.warn(
                `[Realm检测冲突] 两个方法获取的 realmId 不一致：\n` +
                `第一个方法(图片法)结果: ${method1Result}\n` +
                `第二个方法(链接法)结果: ${method2Result}\n` +
                `已返回第二个方法的结果以确保代码正常运行。`
            );
            return method2Result;
        }
        return method2Result; // 结果一致
    }

    // 情况 B：只有一个方法成功，或者两个都失败
    if (method2Result !== null) return method2Result; // 优先返回方法 2
    if (method1Result !== null) return method1Result; // 方法 2 失败但方法 1 成功

    // 情况 C：最终保底方案 —— 全部失败
    return null;
}

export const getScopedKey = (k) => {
    const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
    return realmId !== null ? `R${realmId}-${k}` : k;
};
