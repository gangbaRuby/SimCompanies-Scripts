export const Network = (() => {
    // 与游戏当前请求头算法一致：UTF-8、MD5 运算、末尾 a、特殊十六进制字符表。
    // 游戏升级时需重新核对，不能替换为普通 MD5 文本或复用上一次请求的保护头。
    const protectionDigest = (value) => {
        const input = new TextEncoder().encode(value + 'a');
        const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
        bytes.set(input);
        bytes[input.length] = 0x80;
        const view = new DataView(bytes.buffer);
        view.setUint32(bytes.length - 8, input.length * 8, true);
        view.setUint32(bytes.length - 4, Math.floor(input.length / 0x20000000), true);
        const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
        const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
        for (let offset = 0; offset < bytes.length; offset += 64) {
            let [a, b, c, d] = state;
            for (let step = 0; step < 64; step++) {
                const round = step >>> 4;
                const mix = round === 0 ? (b & c) | (~b & d)
                    : round === 1 ? (d & b) | (~d & c)
                    : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
                const word = round === 0 ? step : round === 1 ? (5 * step + 1) % 16
                    : round === 2 ? (3 * step + 5) % 16 : (7 * step) % 16;
                const sum = (a + mix + Math.floor(Math.abs(Math.sin(step + 1)) * 0x100000000)
                    + view.getUint32(offset + word * 4, true)) | 0;
                const shift = shifts[round * 4 + step % 4];
                const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
                [a, b, c, d] = [d, next, b, c];
            }
            [a, b, c, d].forEach((value, index) => { state[index] = (state[index] + value) | 0; });
        }
        const alphabet = '0123456789abceef';
        return state.map(word => [0, 8, 16, 24].map(shift => {
            const byte = (word >>> shift) & 255;
            return alphabet[byte >>> 4] + alphabet[byte & 15];
        }).join('')).join('');
    };

    // 只为插件主动发出的同源 API GET 补头；调用方继续负责取消、超时与响应处理。
    const getRequestOptions = (url, options = {}) => {
        const target = new URL(url, location.href);
        const method = String(options.method || 'GET').toUpperCase();
        if (method === 'GET' && target.origin === location.origin && target.pathname.startsWith('/api/')) {
            const timestamp = Date.now();
            // 游戏签的是传入客户端的路径；保留中文等原始字符，不能先统一 URL 编码。
            const relative = String(url).replace(/^(?:https?:)?\/\/[^/?#]+/i, '').split('#')[0];
            const requestPath = relative.startsWith('/') ? relative : target.pathname + target.search;
            const headers = new Headers(options.headers);
            if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*');
            headers.set('X-Ts', String(timestamp));
            headers.set('X-Prot', protectionDigest(timestamp + requestPath));
            headers.set('X-tz-offset', String(new Date().getTimezoneOffset()));
            return {
                ...options,
                method: 'GET',
                credentials: options.credentials ?? 'same-origin',
                headers
            };
        }
        return options;
    };

    // 通用请求方法（fetch版本）
    const makeRequest = async (url, responseType, retryCount) => {
        try {
            const options = getRequestOptions(url, { method: 'GET' });
            // 静态资源及外站维持原有请求方式。
            if (!options.headers) options.headers = { 'Content-Type': 'application/json' };
            const res = await fetch(url, options);

            const cfMitigated = res.headers.get('cf-mitigated');
            if (!res.ok || cfMitigated?.toLowerCase() === 'challenge') {
                throw Object.assign(new Error(`HTTP错误 ${res.status}`), {
                    status: res.status,
                    contentType: res.headers.get('content-type'),
                    cfMitigated,
                    cfRay: res.headers.get('cf-ray')
                });
            }

            if (responseType === 'json') {
                return await res.json();
            } else {
                return await res.text();
            }
        } catch (err) {
            // 登录失效或访问被拦截时原样重试不会恢复；保留诊断字段，不记录响应正文或 Cookie。
            if (retryCount > 0 && err.status !== 401 && err.status !== 403 &&
                err.cfMitigated?.toLowerCase() !== 'challenge') {
                console.warn(`请求错误或解析失败 ${url}, 重试中... (${retryCount})`);
                return makeRequest(url, responseType, retryCount - 1);
            } else {
                throw Object.assign(new Error(`最终请求失败: ${err}`), {
                    cause: err,
                    status: err.status,
                    contentType: err.contentType,
                    cfMitigated: err.cfMitigated,
                    cfRay: err.cfRay
                });
            }
        }
    };

    return {
        getRequestOptions,
        // 获取JSON数据
        requestJson: (url, retryCount = 3) => makeRequest(url, 'json', retryCount),

        // 获取原始文本
        requestRaw: (url, retryCount = 3) => makeRequest(url, 'text', retryCount)
    };
})();
