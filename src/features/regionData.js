export const RegionData = (() => {
    let updateGeneration = 0;
    let pendingUpdate = null;
    let pendingStartedAt = 0;
    let updateSuspended = false;

    // 切换领域/重开时由既有响应捕获器通知，只作废插件在途更新，不发请求。
    const invalidatePendingUpdate = () => {
        updateGeneration++;
        pendingUpdate = null;
    };

    const setUpdateSuspended = (suspended) => {
        updateSuspended = suspended;
        invalidatePendingUpdate();
    };

    const assertCurrentUpdate = (generation) => {
        if (generation !== updateGeneration) throw new Error('领域数据更新已失效，请重新更新。');
    };

    // 公司信息
    const getAuthInfo = async () => {
        const Network = window.__SC_Network;
        const data = await Network.requestJson('https://www.simcompanies.com/api/v3/companies/auth-data/');
        return {
            realmId: data.authCompany?.realmId,
            companyId: data.authCompany?.companyId,
            company: data.authCompany?.company,
            salesModifier: data.authCompany?.salesModifier,
            economyState: data.temporals?.economyState,
            acceleration: data.levelInfo?.acceleration?.multiplier
        };
    };

    // 休闲加成，管理费
    const getCompanies_by_company = async (realmId, company) => {
        const Network = window.__SC_Network;
        const formattedCompany = company.replace(/ /g, "-");
        const data = await Network.requestJson(
            `https://www.simcompanies.com/api/v3/companies-by-company/${realmId}/${formattedCompany}/`
        );
        return {
            recreationBonus: data.infrastructure?.recreationBonus,
            administration: data.infrastructure?.administrationOverhead,
        };
    };

    // 高管技能
    const getExecutives = async () => {
        const Network = window.__SC_Network;
        const response = await Network.requestJson('https://www.simcompanies.com/api/v3/companies/me/executives/');
        const data = response.executives;
        return filterExecutives(data);
    };

    // 主动读取和响应截取共用原有筛选、学院与加成公式。
    const filterExecutives = (data) => {
        const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

        // 定义职位代码映射
        const targetPositions = ['o', 'f', 'm', 't', 'v', 'y'];

        return data.filter(exec =>
            exec.currentWorkHistory &&
            targetPositions.includes(exec.currentWorkHistory.position) &&
            (!exec.strikeUntil || new Date(exec.strikeUntil) < new Date()) &&
            new Date(exec.currentWorkHistory.start) < threeHoursAgo &&
            !exec.currentTraining
        );
    };

    // 计算高管加成
    const calculateExecutiveBonus = (executives, realmId) => {

        let academyActive = 15; // 默认值为 15
        let COO_Apprentice, CMO_Apprentice;

        try {
            const stored = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed.academyActive === "number") {
                    academyActive = parsed.academyActive;
                }
            }
        } catch (e) {
            console.warn("⚠️ 无法解析 SimcompaniesRetailCalculation 数据，使用默认值 15:", e);
        }

        // 整理职位 → 技能表
        const skills = executives.reduce((acc, exec) => {
            if (exec.currentWorkHistory) {
                acc[exec.currentWorkHistory.position] = exec.skills;
            }
            return acc;
        }, {});

        // 安全读取技能值，没值就返回0
        const safeSkill = (position, skillName) => skills[position]?.[skillName] || 0;

        if (academyActive >= 15) {
            COO_Apprentice = safeSkill('v', 'coo') / 2
            CMO_Apprentice = safeSkill('y', 'cmo') / 2
        } else if (academyActive >= 5) {
            COO_Apprentice = safeSkill('v', 'coo') / 2
            CMO_Apprentice = 0
        } else {
            COO_Apprentice = 0
            CMO_Apprentice = 0
        }

        let adminBonus = Math.floor(safeSkill('o', 'coo') +
            COO_Apprentice +
            (safeSkill('f', 'coo') + safeSkill('m', 'coo') + safeSkill('t', 'coo')) / 4);
        if (adminBonus > 80) {
            adminBonus = 80 + Math.floor((adminBonus - 80) / 2);
        }
        if (adminBonus > 60) {
            adminBonus = 60 + Math.floor((adminBonus - 60) / 2);
        }

        let saleBonus = Math.floor(safeSkill('m', 'cmo') +
            CMO_Apprentice +
            (safeSkill('o', 'cmo') + safeSkill('f', 'cmo') + safeSkill('t', 'cmo')) / 4);
        if (saleBonus > 80) {
            saleBonus = 80 + Math.floor((saleBonus - 80) / 2);
        }
        if (saleBonus > 60) {
            saleBonus = 60 + Math.floor((saleBonus - 60) / 2);
        }
        saleBonus = Math.floor(saleBonus / 3)

        return {
            saleBonus,
            adminBonus
        };
    };

    // 饱和度
    const getResourcesRetailInfo = async (realmId) => {
        const Network = window.__SC_Network;
        const data = await Network.requestJson(
            `https://www.simcompanies.com/api/v4/${realmId}/resources-retail-info/`
        );
        const resourcesRetailInfo = [];

        // 遍历每个数据项并将对应的数据组合在一起
        data.forEach(item => {
            resourcesRetailInfo.push({
                quality: item.quality,
                dbLetter: item.dbLetter,
                averagePrice: item.averagePrice,
                saturation: item.saturation
            });
        });
        // console.log(resourcesRetailInfo);
        return resourcesRetailInfo;
    }

    // 天气
    const getWeather = async (realmId) => {
        const Network = window.__SC_Network;
        try {
            const data = await Network.requestJson(`https://www.simcompanies.com/api/v2/weather/${realmId}/`);
            return {
                Until: data.until,
                sellingSpeedMultiplier: data.sellingSpeedMultiplier
            };
        } catch (e) {
            console.warn(`[Weather] Failed to fetch weather for realm ${realmId}:`, e);
            return {
                Until: null,
                sellingSpeedMultiplier: null
            };
        }
    };

    // 完整领域数据获取
    const loadFullRegionData = async (generation) => {
        const auth = await getAuthInfo();
        assertCurrentUpdate(generation);
        const companies_by_company = await getCompanies_by_company(auth.realmId, auth.company);
        assertCurrentUpdate(generation);
        const [executives, resourcesRetailInfo, sellingSpeedMultiplier, weatherUntil] = await Promise.all([
            getExecutives(),
            getResourcesRetailInfo(auth.realmId),
            getWeather(auth.realmId)
        ]);
        assertCurrentUpdate(generation);

        return {
            ...auth,
            ...companies_by_company,
            ...calculateExecutiveBonus(executives, auth.realmId),
            ResourcesRetailInfo: resourcesRetailInfo,
            sellingSpeedMultiplier,
            weatherUntil,
            timestamp: new Date().toISOString()
        };
    };

    const fetchFullRegionData = () => {
        if (updateSuspended) return Promise.reject(new Error('正在切换领域，请稍后更新。'));
        // 只合并在途任务，不缓存成功结果；超过 30 秒允许后续调用重新尝试。
        if (pendingUpdate && Date.now() - pendingStartedAt < 30 * 1000) return pendingUpdate;
        if (pendingUpdate) invalidatePendingUpdate();
        pendingStartedAt = Date.now();
        const request = loadFullRegionData(updateGeneration).finally(() => {
            if (pendingUpdate === request) pendingUpdate = null;
        });
        pendingUpdate = request;
        return request;
    };

    // 截取到不完整高管数据时保留旧值，不把缺失技能误算为零。
    const getExecutiveBonusesFromResponse = (response, realmId) => {
        const list = response?.executives;
        if (!Array.isArray(list) || list.some(exec => !exec || typeof exec !== 'object' ||
            !Object.prototype.hasOwnProperty.call(exec, 'currentWorkHistory') ||
            (exec.currentWorkHistory != null &&
                (typeof exec.currentWorkHistory.position !== 'string' ||
                 !Number.isFinite(Date.parse(exec.currentWorkHistory.start)))))) return null;
        const executives = filterExecutives(list);
        if (executives.some(exec => !Number.isFinite(exec.skills?.coo) ||
            !Number.isFinite(exec.skills?.cmo))) return null;
        return calculateExecutiveBonus(executives, realmId);
    };

    return {
        setUpdateSuspended,
        getExecutiveBonusesFromResponse,
        fetchFullRegionData,
        getCurrentRealmId: async () => (await getAuthInfo()).realmId
    };
})();
