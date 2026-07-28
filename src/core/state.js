export const state = {
    hasNewVersion: undefined,
    latestVersion: undefined,
    localVersion: typeof GM_info !== 'undefined' ? GM_info.script.version : '1.32.38',
    SCXXCS: 0,
    PROFIT_PER_BUILDING_LEVEL: 370,
    RETAIL_ADJUSTMENT: {
        B: 2.28
    }
};
