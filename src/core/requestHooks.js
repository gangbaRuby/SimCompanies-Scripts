import { getRealmIdFromLink } from './storage.js';
import { RegionData } from '../features/regionData.js';

// ======================
// 模块2-1：领域数据模块的补充，处理学院升级中学徒无效的情况
// ======================
(function () {
    const buildings_URL = "/api/v2/companies/me/buildings/"; // 截取的接口
    const uc = "l"; // 前缀

    function saveMergedLocalStorage(key, newData) {
        try {
            const existing = JSON.parse(localStorage.getItem(key) || "{}");
            const merged = { ...existing, ...newData };
            localStorage.setItem(key, JSON.stringify(merged));
        } catch (e) {
            console.warn("⚠️ localStorage 合并写入失败，直接使用新数据", e);
            localStorage.setItem(key, JSON.stringify(newData));
        }
    }

    // 处理函数
    function processBuildings(buildings) {
        const academyResult = buildings
            .filter(t => t.kind === "y" && !t.purchasedRecently)
            .reduce((acc, r) => {
                const busy = r.busy;
                acc.active += (!busy && !(r.position?.startsWith(uc)) ? r.size : 0);
                acc.slots += (busy?.expanding ? r.size - 1 : r.size);
                return acc;
            }, { active: 0, slots: 0 });

        const bankResult = buildings
            .filter(t => t.kind === "n" && !t.purchasedRecently)
            .reduce((acc, r) => {
                const busy = r.busy;
                acc.active += (!busy && !(r.position?.startsWith(uc)) ? r.size : 0);
                acc.slots += (busy?.expanding ? r.size - 1 : r.size);
                return acc;
            }, { active: 0, slots: 0 });

        return {
            active: academyResult.active,
            slots: academyResult.slots,
            bankLevel: bankResult.active
        };
    }

    // 捕获并处理数据
    function handleData(data) {
        if (!Array.isArray(data) || data.length === 0) return;
        // console.log("📦 捕获到建筑数据:", data);
        const result = processBuildings(data);
        // console.log("⚡ active & slots 计算结果:", result);

        const realmId = getRealmIdFromLink();
        if (realmId === 0 || realmId === 1) {
            const key = `SimcompaniesRetailCalculation_${realmId}`;
            let stored = {};
            try {
                const raw = localStorage.getItem(key);
                if (raw) stored = JSON.parse(raw);
            } catch (e) {
                console.warn("⚠️ 读取 localStorage 时解析失败，初始化为空对象", e);
            }

            // --- 新增：保存指定position的建筑信息（id, kind, size, position, robotsSpecialization）供模块17等使用 ---
            const TARGET_POSITIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'B0', 'B1', 'B2', 'B3'];
            const buildings = data
                .filter(b => TARGET_POSITIONS.includes(b.position))
                .map(b => ({
                    id: b.id,
                    kind: b.kind,
                    size: b.size,
                    position: b.position,
                    robotsSpecialization: b.robotsSpecialization
                }));
            stored.buildings = buildings;

            const oldAcademyActive = stored.academyActive ?? 0; // 使用 nullish 合并更安全
            const newAcademyActive = result.active;             // 新计算值

            // 更新 localStorage 中的 academyActive
            stored.academyActive = newAcademyActive;
            stored.bankLevel = result.bankLevel;
            localStorage.setItem(key, JSON.stringify(stored));

            // 仅当值发生变化时才触发全流程计算
            if (oldAcademyActive !== newAcademyActive) {
                // console.log("🔔 academyActive 变化，触发高管加成重新计算");
                if (typeof RegionData !== "undefined" && RegionData.fetchFullRegionData) {
                    RegionData.fetchFullRegionData()
                        .then(newData => {
                            // 合并回 localStorage（保留 buildings 不被覆盖）
                            const existingRaw = localStorage.getItem(key);
                            let existingData = {};
                            try { existingData = JSON.parse(existingRaw); } catch (e) { }
                            const merged = { ...existingData, ...newData };
                            localStorage.setItem(key, JSON.stringify(merged));
                            // console.log("✅ 高管加成已刷新:", key);
                        })
                        .catch(err => console.error("❌ 高管加成重新计算失败:", err));
                }
            } else {
                // console.log("⚡ academyActive 未变化，不触发高管加成计算");
            }
        }

    }

    // Hook fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        try {
            if (typeof args[0] === "string" && args[0].includes(buildings_URL)) {
                response.clone().json().then(handleData).catch(err => console.error("❌ JSON 解析失败:", err));
            }
        } catch (e) { console.error(e); }
        return response;
    };

    // Hook XHR（备用）
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url, async) {
        this.addEventListener("load", function () {
            if (url && url.includes(buildings_URL) && this.responseText) {
                try { handleData(JSON.parse(this.responseText)); }
                catch (e) { console.error("❌ XHR JSON 解析失败:", e); }
            }
        });
        return originalXHR.apply(this, arguments);
    };

    // console.log("✅ 建筑数据捕获 & active/slots 计算 + localStorage 保存 hook 已启动");
})();

// ======================
// 模块2-2：领域仓库数据
// ======================
(function () {
    const resources_URL = "/api/v3/resources/";

    function handleData(data) {
        if (!Array.isArray(data) || data.length === 0) return;
        const realmId = getRealmIdFromLink();
        if (realmId !== 0 && realmId !== 1) return;
        const key = `SimcompaniesRetailCalculation_${realmId}`;
        try {
            const existing = JSON.parse(localStorage.getItem(key) || "{}");
            existing.warehouseResources = data;
            localStorage.setItem(key, JSON.stringify(existing));
        } catch (e) {
            console.warn("⚠️ 仓库数据写入失败", e);
            localStorage.setItem(key, JSON.stringify({ warehouseResources: data }));
        }
    }

    // Hook fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        try {
            if (typeof args[0] === "string" && args[0].includes(resources_URL)) {
                response.clone().json().then(handleData).catch(err => console.error("❌ 仓库 JSON 解析失败:", err));
            }
        } catch (e) { console.error(e); }
        return response;
    };

    // Hook XHR（备用）
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url, async) {
        this.addEventListener("load", function () {
            if (url && url.includes(resources_URL) && this.responseText) {
                try { handleData(JSON.parse(this.responseText)); }
                catch (e) { console.error("❌ 仓库 XHR JSON 解析失败:", e); }
            }
        });
        return originalXHR.apply(this, arguments);
    };
})();
