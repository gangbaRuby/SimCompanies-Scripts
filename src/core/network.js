export const Network = (() => {
    // 通用请求方法（fetch版本）
    const makeRequest = async (url, responseType, retryCount) => {
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) throw new Error(`HTTP错误 ${res.status}`);

            if (responseType === 'json') {
                return await res.json();
            } else {
                return await res.text();
            }
        } catch (err) {
            if (retryCount > 0) {
                console.warn(`请求错误或解析失败 ${url}, 重试中... (${retryCount})`);
                return makeRequest(url, responseType, retryCount - 1);
            } else {
                throw new Error(`最终请求失败: ${err}`);
            }
        }
    };

    return {
        // 获取JSON数据
        requestJson: (url, retryCount = 3) => makeRequest(url, 'json', retryCount),

        // 获取原始文本
        requestRaw: (url, retryCount = 3) => makeRequest(url, 'text', retryCount)
    };
})();
