export const RegionData = (() => {
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
    const fetchFullRegionData = async () => {
        const auth = await getAuthInfo();
        const companies_by_company = await getCompanies_by_company(auth.realmId, auth.company);
        const [executives, resourcesRetailInfo, sellingSpeedMultiplier, weatherUntil] = await Promise.all([
            getExecutives(),
            getResourcesRetailInfo(auth.realmId),
            getWeather(auth.realmId)
        ]);

        // 计算高管加成
        const calculateExecutiveBonus = (executives) => {

            let academyActive = 15; // 默认值为 15
            let COO_Apprentice, CMO_Apprentice;

            try {
                const stored = localStorage.getItem(`SimcompaniesRetailCalculation_${auth.realmId}`);
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

        return {
            ...auth,
            ...companies_by_company,
            ...calculateExecutiveBonus(executives),
            ResourcesRetailInfo: resourcesRetailInfo,
            sellingSpeedMultiplier,
            weatherUntil,
            timestamp: new Date().toISOString()
        };
    };

    return {
        fetchFullRegionData,
        getCurrentRealmId: async () => (await getAuthInfo()).realmId
    };
})();
