export const Storage = (() => {
    const KEYS = {
        region: realmId => `SimcompaniesRetailCalculation_${realmId}`,
        constants: 'SimcompaniesConstantsData'
    };

    const formatTime = (isoString) => {
        if (!isoString) return '无数据';
        const d = new Date(isoString);
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    return {
        save: (type, data) => {
            const key = type === 'region' ? KEYS.region(data.realmId) : KEYS.constants;
            try {
                if (type === 'region') {
                    // 读取现有数据并做合并，优先保留 newData 的字段，但如果 existing 有 academyLevels 且 newData 未提供，则保留 existing 的 academyLevels
                    const existingRaw = localStorage.getItem(key) || "{}";
                    const existing = JSON.parse(existingRaw);
                    const merged = { ...existing, ...data };
                    if (existing.academyLevels && !data.academyLevels) {
                        merged.academyLevels = existing.academyLevels;
                    }
                    // 若你还有其它需要强制保留的字段，可在此类似添加： merged.someField = existing.someField || data.someField;
                    localStorage.setItem(key, JSON.stringify(merged));
                } else {
                    // constants 仍然覆盖保存
                    localStorage.setItem(key, JSON.stringify(data));
                }
            } catch (e) {
                console.warn("⚠️ Storage.save 合并写入失败，回退为直接写入：", e);
                localStorage.setItem(key, JSON.stringify(data));
            }
        },

        getFormattedStatus: (type) => {
            try {
                let data;
                switch (type) {
                    case 'r1':
                        data = localStorage.getItem(KEYS.region(0));
                        break;
                    case 'r2':
                        data = localStorage.getItem(KEYS.region(1));
                        break;
                    case 'constants':
                        data = localStorage.getItem(KEYS.constants);
                        break;
                }

                const parsedData = data ? JSON.parse(data) : null;
                return {
                    text: parsedData ? formatTime(parsedData.timestamp) : '无数据',
                    className: parsedData
                        ? 'SimcompaniesRetailCalculation-has-data'
                        : 'SimcompaniesRetailCalculation-no-data'
                };
            } catch (error) {
                return {
                    text: '数据损坏',
                    className: 'SimcompaniesRetailCalculation-no-data'
                };
            }
        }

    };
})();
