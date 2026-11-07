import { RegionData } from '../features/regionData.js';

// 仅消费已有响应；不发请求、不续期完整缓存、不接管主动更新或失败备用流程。
// 明确无高管时使用零加成；首次计算数据在内存收齐后保存，不把残缺响应当作零值。
export function installRegionDataCapture() {
    const marker = '__scRegionDataCaptureInstalled';
    if (window[marker]) return;
    window[marker] = true;

    let sequence = 0;
    let identity = null;
    let identityEpoch = 0;
    let lastIdentitySequence = 0;
    const latestChallengeStarts = new Map();
    let pendingData = null;
    const pendingSwitches = new Set();
    const lastApplied = new Map();
    const xhrRequests = new WeakMap();
    const validRealm = realm => realm === 0 || realm === 1 || realm === 2;
    const validId = id => Number.isSafeInteger(id) && id > 0;
    const object = value => value && typeof value === 'object' && !Array.isArray(value);

    function readCache(realmId) {
        if (!validRealm(realmId)) return null;
        try {
            const data = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));
            return object(data) ? data : null;
        } catch { return null; }
    }

    function initialized(data, realmId) {
        return data?.realmId === realmId && validId(data.companyId) &&
            typeof data.company === 'string' && (data.timestamp === null ||
                (typeof data.timestamp === 'string' && Number.isFinite(Date.parse(data.timestamp)))) &&
            ['salesModifier', 'acceleration', 'recreationBonus', 'administration', 'adminBonus', 'saleBonus']
                .every(key => Number.isFinite(data[key])) && data.economyState != null &&
            Array.isArray(data.ResourcesRetailInfo) && object(data.sellingSpeedMultiplier);
    }

    function readIdentity() {
        // 页面公司链接和持久化缓存不能证明本次登录身份。
        // 身份仅来自本页已完成的 auth/sync 响应，查询或切换期间不猜测。
        return pendingSwitches.size === 0 ? identity : null;
    }

    function classify(input, method) {
        try {
            const raw = typeof input === 'string' ? input : input?.url || input?.href;
            const url = new URL(raw, location.href);
            if (url.origin !== location.origin) return null;
            const path = url.pathname;
            const verb = String(method || input?.method || 'GET').toUpperCase();
            const route = fields => ({ ...fields, path: path.replace(/\/$/, '') });
            let match;
            if (verb === 'POST' && (match = path.match(/^\/api\/v1\/realm\/(\d+)\/sync\/?$/))) {
                return route({ type: 'sync', realmId: Number(match[1]) });
            }
            if (verb === 'POST' && /^\/api\/v1\/challenges\/restart\/?$/.test(path)) {
                return route({ type: 'restart', realmId: 2 });
            }
            if (verb !== 'GET') return null;
            if (/^\/api\/v3\/companies\/auth-data\/?$/.test(path)) return route({ type: 'auth' });
            if ((match = path.match(/^\/api\/v3\/companies-by-company\/([012])\/[^/]+\/?$/))) {
                return route({ type: 'company', realmId: Number(match[1]) });
            }
            if ((match = path.match(/^\/api\/v3\/companies\/(me|\d+)\/executives\/?$/))) {
                return route({ type: 'executives', companyId: match[1] === 'me' ? null : Number(match[1]) });
            }
            if ((match = path.match(/^\/api\/v4\/([012])\/resources-retail-info\/?$/))) {
                return route({ type: 'retail', realmId: Number(match[1]) });
            }
            if ((match = path.match(/^\/api\/v2\/weather\/([012])\/?$/))) {
                return route({ type: 'weather', realmId: Number(match[1]) });
            }
        } catch { /* 非 URL 请求不参与截取。 */ }
        return null;
    }

    function beginRequest(input, method) {
        const route = classify(input, method);
        if (!route) return null;
        const order = ++sequence;
        const duringSwitch = pendingSwitches.size > 0;
        // auth 也可能揭示换账号/领域，发出时立即暂停依赖身份的写入。
        if (route.type === 'sync' || route.type === 'auth' || route.type === 'restart') {
            identity = null;
            pendingData = null;
            identityEpoch++;
            lastIdentitySequence = order;
        }
        if (route.type === 'sync' || route.type === 'restart') pendingSwitches.add(order);
        const owner = readIdentity();
        const realmId = route.realmId ?? owner?.realmId;
        return { ...route, order, epoch: identityEpoch, owner, duringSwitch,
            // 完整刷新已保存更新快照时，不再用更早发出的局部响应覆盖它。
            cacheTimestamp: readCache(realmId)?.timestamp,
            authTimestamps: route.type === 'auth' ? [0, 1, 2].map(realm => readCache(realm)?.timestamp) : null };
    }

    function merge(request, realmId, fields, companyId = null) {
        if (!validRealm(realmId)) return;
        const owner = request.type === 'auth' ? identity : request.owner;
        const ownsRealm = owner?.realmId === realmId && request.epoch === identityEpoch;
        // 挑战重开可能保留公司 ID，因此还必须绑定本次 challengeStart。
        if (realmId === 2 && (!ownsRealm || !owner.challengeStart)) return;
        const data = readCache(realmId);
        if (realmId === 2 && data?.companyId === owner.companyId &&
            Date.parse(data.challengeStart) > Date.parse(owner.challengeStart)) return;
        const timestamp = request.type === 'auth' ? request.authTimestamps[realmId] : request.cacheTimestamp;
        if (data?.timestamp !== timestamp) {
            pendingData = null;
            return;
        }
        const sameCompany = data?.realmId === realmId && data.companyId === (companyId ?? owner?.companyId);
        const sameAttempt = realmId !== 2 || (sameCompany && data.challengeStart === owner.challengeStart);
        const zeroBonuses = ownsRealm && owner.executivesUnavailable ? { adminBonus: 0, saleBonus: 0 } : {};
        if (realmId === 2) zeroBonuses.recreationBonus = 0;
        const patch = Object.fromEntries(Object.entries({ ...fields, ...(sameCompany ? zeroBonuses : {}) })
            .filter(([, value]) => value !== undefined));
        if (!Object.keys(patch).length) return;
        // 无高管不构成缺失；允许补齐旧缓存中没有写出的零加成。
        const ready = initialized({ ...data, ...(sameCompany ? zeroBonuses : {}) }, realmId) && sameAttempt &&
            (companyId === null || sameCompany);
        if (!ready) {
            // 只为明确无高管的公司收集首次数据。普通领域换账号仍交给原有完整更新。
            if (!ownsRealm || !owner.executivesUnavailable ||
                (realmId !== 2 && validId(data?.companyId) && !sameCompany)) return;
            if (!pendingData) pendingData = {
                realmId, companyId: owner.companyId, company: owner.company,
                ...(realmId === 2 ? { challengeStart: owner.challengeStart } : {}),
                ...zeroBonuses,
                // 尚无完整更新时间；原更新器将 null 视为过期，不推迟主动更新。
                timestamp: null
            };
            const key = `${realmId}:${owner.companyId}:${request.type}`;
            if ((lastApplied.get(key) || 0) > request.order) return;
            Object.assign(pendingData, patch, zeroBonuses);
            lastApplied.set(key, request.order);
            if (!initialized(pendingData, realmId)) return;
            // 同一公司/挑战才保留建筑等附加字段；跨挑战不继承上一轮数据。
            const existing = sameCompany && sameAttempt ? data : {};
            const complete = { ...existing, ...pendingData };
            if (typeof existing.timestamp === 'string' && Number.isFinite(Date.parse(existing.timestamp))) {
                complete.timestamp = existing.timestamp;
            }
            localStorage.setItem(`SimcompaniesRetailCalculation_${realmId}`, JSON.stringify(complete));
            pendingData = null;
            return;
        }
        const key = `${realmId}:${data.companyId}:${request.type}`;
        if ((lastApplied.get(key) || 0) > request.order) return;
        // 原 timestamp、建筑、仓库及其余字段完整保留，局部截取不冒充完整刷新。
        localStorage.setItem(`SimcompaniesRetailCalculation_${realmId}`, JSON.stringify({ ...data, ...patch }));
        lastApplied.set(key, request.order);
    }

    function handleResponse(request, data) {
        try {
            if (request.type === 'auth' || request.type === 'sync') {
                const auth = data?.authCompany;
                if (request.order !== lastIdentitySequence || request.epoch !== identityEpoch ||
                    request.duringSwitch || pendingSwitches.size > 0) return;
                if (!validRealm(auth?.realmId) || !validId(auth.companyId) ||
                    typeof auth.company !== 'string' || !auth.company) return;
                if (request.type === 'sync' && auth.realmId !== request.realmId) return;
                const challengeStart = typeof auth.challengeStart === 'string' && Number.isFinite(Date.parse(auth.challengeStart))
                    ? new Date(auth.challengeStart).toISOString() : null;
                if (auth.realmId === 2 && !challengeStart) return;
                if (auth.realmId === 2) {
                    const cached = readCache(2);
                    const latest = Math.max(latestChallengeStarts.get(auth.companyId) || 0,
                        cached?.companyId === auth.companyId ? Date.parse(cached.challengeStart) || 0 : 0);
                    if (Date.parse(challengeStart) < latest) return;
                    latestChallengeStarts.set(auth.companyId, Date.parse(challengeStart));
                }
                identity = { realmId: auth.realmId, companyId: auth.companyId, company: auth.company, challengeStart,
                    executivesUnavailable: auth.realmId === 2 || data.levelInfo?.capabilities?.executives === false };
                lastIdentitySequence = request.order;
                // sync 仅用于隔离切换中的响应，不扩大此次数据截取范围。
                if (request.type === 'sync') return;
                merge(request, auth.realmId, {
                    company: auth.company,
                    salesModifier: Number.isFinite(auth.salesModifier) ? auth.salesModifier : undefined,
                    economyState: Number.isInteger(data.temporals?.economyState) ? data.temporals.economyState : undefined,
                    acceleration: Number.isFinite(data.levelInfo?.acceleration?.multiplier)
                        ? data.levelInfo.acceleration.multiplier : undefined
                }, auth.companyId);
            } else if (request.type === 'company') {
                const info = data?.companyPublicInfo;
                const owner = request.owner;
                if (!owner || request.epoch !== identityEpoch || owner.realmId !== request.realmId ||
                    info?.id !== owner.companyId ||
                    (info.realmId != null && info.realmId !== request.realmId)) return;
                merge(request, request.realmId, {
                    recreationBonus: Number.isFinite(data.infrastructure?.recreationBonus) ? data.infrastructure.recreationBonus : undefined,
                    administration: Number.isFinite(data.infrastructure?.administrationOverhead) ? data.infrastructure.administrationOverhead : undefined
                }, owner.companyId);
            } else if (request.type === 'executives') {
                const owner = request.owner;
                if (!owner || request.epoch !== identityEpoch ||
                    (request.companyId !== null && request.companyId !== owner.companyId)) return;
                const list = data?.executives;
                if (owner.executivesUnavailable) return;
                if (!Array.isArray(list)) return;
                const employed = list.filter(exec => exec?.currentWorkHistory != null);
                // 数字 ID URL 已限定公司，响应若另带 employerId 仍须一致。
                if (employed.some(exec => exec.currentWorkHistory.employerId != null &&
                    exec.currentWorkHistory.employerId !== owner.companyId)) return;
                // me 没有 URL 身份证明：包括其他标签页切换登录态在内，必须逐项核对雇主。
                // 空列表/无雇主标识无法证明归属，保留旧值交给原有完整更新。
                if (request.companyId === null && (!employed.length ||
                    employed.some(exec => exec.currentWorkHistory.employerId !== owner.companyId))) return;
                const bonuses = RegionData.getExecutiveBonusesFromResponse(data, owner.realmId);
                if (bonuses) merge(request, owner.realmId, bonuses, owner.companyId);
            } else if (request.type === 'retail') {
                if (!Array.isArray(data) || !data.length || data.some(item => !object(item) ||
                    !Number.isInteger(item.dbLetter) || !Number.isFinite(item.averagePrice) ||
                    !Number.isFinite(item.saturation) ||
                    (item.quality != null && !Number.isInteger(item.quality)))) return;
                merge(request, request.realmId, {
                    ResourcesRetailInfo: data.map(({ quality, dbLetter, averagePrice, saturation }) =>
                        ({ quality, dbLetter, averagePrice, saturation }))
                });
            } else if (request.type === 'weather') {
                if (!object(data) || !Number.isFinite(Date.parse(data.until)) ||
                    !Number.isFinite(data.sellingSpeedMultiplier) || data.sellingSpeedMultiplier <= 0 ||
                    (data.realm != null && data.realm !== request.realmId)) return;
                merge(request, request.realmId, {
                    sellingSpeedMultiplier: { Until: data.until, sellingSpeedMultiplier: data.sellingSpeedMultiplier }
                });
            }
        } catch { /* 解析或存储失败不影响游戏及原有更新器。 */ }
    }

    function matchesResponse(request, responseUrl) {
        try {
            if (!responseUrl) return false;
            const url = new URL(responseUrl, location.href);
            return url.origin === location.origin && url.pathname.replace(/\/$/, '') === request.path;
        } catch { return false; }
    }

    function finishRequest(request, data) {
        if (!request || request.finished) return;
        request.finished = true;
        pendingSwitches.delete(request.order);
        if (data !== undefined) handleResponse(request, data);
    }

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        let request = null;
        try { request = beginRequest(args[0], args[1]?.method); } catch { /* 原请求照常执行。 */ }
        let pending;
        try { pending = originalFetch.apply(this, args); }
        catch (error) { finishRequest(request); throw error; }
        if (!request) return pending;
        return pending.then(response => {
            if (response.ok && matchesResponse(request, response.url)) {
                try { response.clone().json().then(data => finishRequest(request, data), () => finishRequest(request)); }
                catch { finishRequest(request); }
            } else finishRequest(request);
            return response;
        }, error => { finishRequest(request); throw error; });
    };

    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        xhrRequests.get(this)?.cleanup?.();
        const result = originalOpen.call(this, method, url, ...rest);
        xhrRequests.set(this, { method, url });
        return result;
    };
    window.XMLHttpRequest.prototype.send = function (...args) {
        const entry = xhrRequests.get(this);
        let request = null;
        try { if (entry && !entry.cleanup) request = beginRequest(entry.url, entry.method); } catch { /* 原请求照常执行。 */ }
        if (request) {
            const cleanup = () => {
                for (const type of ['load', 'error', 'abort', 'timeout', 'loadend']) this.removeEventListener(type, onEnd);
                entry.cleanup = null;
                finishRequest(request);
            };
            const onEnd = event => {
                try {
                    if (event.type === 'load' && xhrRequests.get(this) === entry &&
                        this.status >= 200 && this.status < 300 && matchesResponse(request, this.responseURL)) {
                        if (this.responseType === 'json') finishRequest(request, this.response);
                        else if (!this.responseType || this.responseType === 'text') finishRequest(request, JSON.parse(this.responseText));
                    }
                } catch { /* 不读取不支持的响应类型，不修改响应。 */ }
                finally { cleanup(); }
            };
            entry.cleanup = cleanup;
            for (const type of ['load', 'error', 'abort', 'timeout', 'loadend']) this.addEventListener(type, onEnd);
        }
        try { return originalSend.apply(this, args); }
        catch (error) { entry?.cleanup?.(); throw error; }
    };
    // 与既有请求 Hook 一样属于整页生命周期；SPA 切页继续捕获，页面销毁时由浏览器释放。
    // 无额外定时器/DOM Observer；XHR 元数据使用弱引用，重复安装由 marker 阻止。
}
