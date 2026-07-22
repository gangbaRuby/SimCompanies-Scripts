import { constantsData } from './constantsData.js';
import { RegionData } from './regionData.js';
import { Storage } from './dataStorage.js';

export const ConstantsAutoUpdater = (() => {
    const STORAGE_KEY = 'SimcompaniesConstantsData';
    const ONE_HOUR = 60 * 60 * 1000;

    const needsUpdate = () => {
        const dataStr = localStorage.getItem(STORAGE_KEY);
        if (!dataStr) return true;

        try {
            const data = JSON.parse(dataStr);
            const lastTime = new Date(data.timestamp).getTime();
            const now = Date.now();
            return now - lastTime > ONE_HOUR;
        } catch (e) {
            return true;
        }
    };

    const update = async () => {
        try {
            const data = await constantsData.initialize();
            Storage.save('constants', data);
            // console.log('[ConstantsAutoUpdater] 基本数据已更新');
        } catch (err) {
            console.error('[ConstantsAutoUpdater] 基本数据更新失败', err);
        }
    };

    const checkAndUpdate = () => {
        if (needsUpdate()) {
            // console.log('[ConstantsAutoUpdater] 开始更新基本数据...');
            update();
        } else {
            // console.log('[ConstantsAutoUpdater] 基本数据是最新的');
        }
    };

    return { checkAndUpdate };
})();

export const RegionAutoUpdater = (() => {
    const ONE_HOUR = 60 * 60 * 1000;

    const needsUpdate = (realmId) => {
        const key = `SimcompaniesRetailCalculation_${realmId}`;
        const dataStr = localStorage.getItem(key);
        if (!dataStr) return true;

        try {
            const data = JSON.parse(dataStr);
            const lastTime = new Date(data.timestamp).getTime();
            const weatherUntil = new Date(data.sellingSpeedMultiplier.weatherUntil).getTime();
            const now = Date.now();

            const ONE_HOUR = 60 * 60 * 1000;
            if (now - lastTime > ONE_HOUR) return true; //大于1小时
            if (now > weatherUntil) return true; //天气过期

            // 当前北京时间
            const nowInBeijing = new Date(now + 8 * 60 * 60 * 1000);

            // 早上 7:45 的北京时间戳 7:30开始更新饱和度 保险起见7:45更新 也是保证新的一天的第一次更新
            const todayBeijing = new Date(nowInBeijing.toISOString().slice(0, 10)); // 北京当天 0点
            const morning745 = new Date(todayBeijing.getTime() + 7 * 60 * 60 * 1000 + 45 * 60 * 1000).getTime();

            // 早上 22:01 的北京时间戳 高管获得经验的更新
            const todayBeijing1 = new Date(nowInBeijing.toISOString().slice(0, 10)); // 北京当天 0点
            const executives2201 = new Date(todayBeijing1.getTime() + 22 * 60 * 60 * 1000 + 1 * 60 * 1000).getTime();

            // 本周五 23:01 的北京时间戳
            const currentWeekday = nowInBeijing.getUTCDay(); // 周日是 0
            const daysUntilFriday = (5 - currentWeekday + 7) % 7;
            const fridayDate = new Date(todayBeijing.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
            const friday2301 = new Date(fridayDate.getTime() + 23 * 60 * 60 * 1000 + 1 * 60 * 1000).getTime();

            const lastTimeInBeijing = lastTime + 8 * 60 * 60 * 1000;

            // 触发早上 7:45 的更新
            if (now >= morning745 && lastTimeInBeijing < morning745) {
                return true;
            }

            // 触发晚上 22:01 的更新
            if (now >= executives2201 && lastTimeInBeijing < executives2201) {
                return true;
            }

            // 触发周五 23:01 的更新
            if (now >= friday2301 && lastTimeInBeijing < friday2301) {
                return true;
            }

            return false;
        } catch (e) {
            return true;
        }
    };


    const update = async (realmId) => {
        try {
            let data;
            data = await RegionData.fetchFullRegionData();
            Storage.save('region', data);
            // console.log(`[RegionAutoUpdater] 领域数据（${realmId}）已更新`);
        } catch (err) {
            console.error(`[RegionAutoUpdater] 领域数据（${realmId}）更新失败`, err);
        }
    };

    const checkAndUpdate = (realmId) => {
        if (realmId === null) {
            console.warn('[RegionAutoUpdater] 页面上无法识别 realmId');
            return;
        }

        if (needsUpdate(realmId)) {
            // console.log(`[RegionAutoUpdater] 开始更新领域数据（${realmId}）...`);
            update(realmId);
        } else {
            // console.log(`[RegionAutoUpdater] 领域数据（${realmId}）是最新的`);
        }
    };

    return { checkAndUpdate };
})();
