import { state } from '../core/state.js';
import { getRealmIdFromLink, getScopedKey } from '../core/storage.js';
import { registerExportInfo } from '../core/exportInfo.js';
import { resourceIdNameMap } from '../constants/resourceMap.js';
import { DM } from '../utils/ui.js';
import { createGlobalCustomToggle } from '../utils/uiComponents.js';
import { executiveCustomButton } from './executiveBoardroom.js';

const SETTINGS_KEY = 'SC-ReversePurchasePrice-Settings';
const CONTRACT_HIGH_PRICE_SETTINGS_KEY = 'SC_Contract_HighPrice_Settings';
const PRICE_LOWER_LIMIT = 0.01;
const PRICE_UPPER_LIMIT = 10;
const QUALITY_IDS = Array.from({ length: 13 }, (_, index) => index);
const CHAT_QUALITY_COLUMN_LIMIT = 5;
const MASKED_PRICE = '-----';
const STORE_NAMES = {
    '2': '车行',
    G: '生鲜商店',
    A: '加油站',
    C: '电子产品商店',
    H: '时装商店',
    d: '五金商店',
    t: '万圣节集市',
    z: '沙滩集市',
    I: '春季集市',
    u: 'Xmas市场'
};
const CALCULATION_REASON_LABELS = {
    'missing-price-data': '缺少平均价或饱和度',
    'missing-store': '缺少商店归属',
    'missing-model': '缺少零售模型',
    'invalid-production-cost': '零售模型生产成本无效',
    'invalid-selling-time': '售价范围内无法计算销售用时',
    'no-feasible-price': '没有满足每级时利润的收购价'
};
const DEFAULT_SETTINGS = {
    version: 1,
    targetHourlyProfit: '',
    buildingLevel: 100,
    saleQuantity: 1000,
    economyState: null,
    resourceIds: [],
    qualityIds: []
};

function getRealmSettingsKey(realmId) {
    return realmId === null ? SETTINGS_KEY : `R${realmId}-${SETTINGS_KEY}`;
}

registerExportInfo({
    name: '反推收购价设置',
    scope: 'realm',
    backup: true,
    keys: realmId => [getRealmSettingsKey(realmId)]
});

const ReversePurchasePrice = (function () {
    let mountedRoot = null;
    let uiRoot = null;
    let ui = null;
    let worker = null;
    let temporaryOverlay = null;
    let temporaryKeyHandler = null;
    let requestSequence = 0;
    let uiRequestSequence = 0;
    const pendingRequests = new Map();

    function readJson(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function uniquePositiveIntegers(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value > 0))];
    }

    function normalizeSettings(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const target = Number(source.targetHourlyProfit);
        const buildingLevel = Number(source.buildingLevel);
        const saleQuantity = Number(source.saleQuantity);
        const hasEconomyState = source.economyState !== null &&
            source.economyState !== undefined &&
            source.economyState !== '';
        const economyState = hasEconomyState ? Number(source.economyState) : null;
        return {
            version: 1,
            targetHourlyProfit: Number.isFinite(target) && target > 0 ? target : '',
            buildingLevel: Number.isFinite(buildingLevel) && buildingLevel > 0 ? buildingLevel : DEFAULT_SETTINGS.buildingLevel,
            saleQuantity: Number.isFinite(saleQuantity) && saleQuantity > 0 ? saleQuantity : DEFAULT_SETTINGS.saleQuantity,
            economyState: [0, 1, 2].includes(economyState) ? economyState : null,
            resourceIds: uniquePositiveIntegers(source.resourceIds),
            qualityIds: [...new Set(
                (Array.isArray(source.qualityIds) ? source.qualityIds : [])
                    .map(Number)
                    .filter(value => Number.isInteger(value) && value >= 0 && value <= 12)
            )].sort((a, b) => a - b)
        };
    }

    function loadSettings() {
        return normalizeSettings(readJson(getScopedKey(SETTINGS_KEY)));
    }

    function saveSettings(nextSettings) {
        const normalized = normalizeSettings(nextSettings);
        localStorage.setItem(getScopedKey(SETTINGS_KEY), JSON.stringify(normalized));
        return normalized;
    }

    function readCalculationData() {
        const realmId = getRealmIdFromLink();
        const constants = readJson('SimcompaniesConstantsData');
        const region = realmId === null ? null : readJson(`SimcompaniesRetailCalculation_${realmId}`);
        if (!constants?.data?.SALES || !constants?.retailInfo) {
            throw new Error('缺少基础数据，请先更新基础数据');
        }
        if (!region?.ResourcesRetailInfo) {
            throw new Error('缺少当前领域数据，请刷新地图或领域数据');
        }
        return { realmId, constants, region };
    }

    function getExecutiveBonuses(region) {
        let skillCMO = Number(region?.saleBonus) || 0;
        let skillCOO = Number(region?.adminBonus) || 0;
        let pageSettings = {};
        try {
            pageSettings = JSON.parse(localStorage.getItem('SC_PageActions_Settings') || '{}');
        } catch (error) {
            pageSettings = {};
        }
        if (pageSettings.executiveCustomToggle === true) {
            const saved = readJson(getScopedKey('SC-Saved-Bonuses'));
            const savedCMO = Number(saved?.saleBonus);
            const savedCOO = Number(saved?.adminBonus);
            if (Number.isFinite(savedCMO)) skillCMO = savedCMO;
            if (Number.isFinite(savedCOO)) skillCOO = savedCOO;
        }
        return { skillCMO, skillCOO };
    }

    function getRetailableResourceGroups(constants) {
        const assignedIds = new Set();
        return Object.entries(constants?.data?.SALES || {})
            .map(([storeKind, values]) => {
                const resourceIds = [...new Set(
                    (Array.isArray(values) ? values : [])
                        .map(Number)
                        .filter(resourceId => (
                            Number.isInteger(resourceId) &&
                            resourceId > 0 &&
                            !assignedIds.has(resourceId)
                        ))
                )];
                resourceIds.forEach(resourceId => assignedIds.add(resourceId));
                resourceIds.sort((a, b) => a - b);
                return {
                    storeKind,
                    storeName: STORE_NAMES[storeKind] || `商店 ${storeKind}`,
                    resourceIds
                };
            })
            .filter(group => group.resourceIds.length);
    }

    function buildSharedContext(constants, region, economyOverride = null) {
        const { skillCMO, skillCOO } = getExecutiveBonuses(region);
        const salesModifier = Number(region?.salesModifier) || 0;
        const recreationBonus = Number(region?.recreationBonus) || 0;
        const administration = Number(region?.administration) || 1;
        const currentEconomyState = Number(region?.economyState);
        const economyState = [0, 1, 2].includes(economyOverride)
            ? economyOverride
            : [0, 1, 2].includes(currentEconomyState)
                ? currentEconomyState
                : 1;
        // Match the market/contract hourly-profit calculation: CMO is applied directly.
        const v = salesModifier + recreationBonus + skillCMO;
        const b = administration - (administration - 1) * skillCOO / 100;
        return {
            SCD: constants,
            SRC: region,
            economyState,
            acceleration: Number(region?.acceleration) || 1,
            sellingSpeedMultiplier: region?.sellingSpeedMultiplier,
            v,
            b
        };
    }

    const workerCode = `
        self.onmessage = function (event) {
            const { token, pairs, shared, constants } = event.data;
            const { SCD, SRC, economyState, acceleration, sellingSpeedMultiplier, v, b } = shared;
            const {
                targetLevelProfit,
                buildingLevel,
                saleQuantity,
                priceLower,
                priceUpper,
                SCXXCS,
                PROFIT_PER_BUILDING_LEVEL,
                RETAIL_ADJUSTMENT
            } = constants;

            const lwe = SCD.retailInfo;
            const zn = SCD.data;

            function wv(economy, resourceId, forceQuality) {
                const resource = lwe?.[economy]?.[resourceId];
                if (!resource) return null;
                return forceQuality === null ? resource : resource.quality?.[forceQuality];
            }

            function Bpt(buildingKind, modeledData, quality, saturation, quantity, price) {
                const adjustment = RETAIL_ADJUSTMENT[buildingKind] ?? 1;
                const saturationFactor = Math.min(Math.max(2 - saturation, 0), 2);
                const speedFactor = Math.max(0.9, saturationFactor / 2 + 0.5);
                const qualityFactor = saturationFactor / 2 *
                    (1 + (quality / 12) * zn.RETAIL_MODELING_QUALITY_WEIGHT);
                const fixedCost = PROFIT_PER_BUILDING_LEVEL *
                    (modeledData.buildingLevelsNeededPerUnitPerHour * modeledData.modeledUnitsSoldAnHour + 1) *
                    adjustment *
                    qualityFactor +
                    (modeledData.modeledStoreWages ?? 0) * SCXXCS;
                const unitsSold = modeledData.modeledUnitsSoldAnHour * speedFactor;
                const productionCost = modeledData.modeledProductionCostPerUnit +
                    (fixedCost + (modeledData.modeledStoreWages ?? 0)) / unitsSold;
                const storeWages = modeledData.modeledStoreWages ?? 0;
                const curve = (storeWages + fixedCost) /
                    Math.pow(productionCost - modeledData.modeledProductionCostPerUnit, 2);
                const adjusted = fixedCost -
                    Math.pow(price - productionCost, 2) * curve;
                return (quantity * ((price - modeledData.modeledProductionCostPerUnit) * 3600) - storeWages) /
                    (adjusted + storeWages);
            }

            function zL(buildingKind, modeledData, quantity, salesModifier, price, quality, saturation, size, weather) {
                const seconds = Bpt(buildingKind, modeledData, quality, saturation, quantity, price);
                if (!Number.isFinite(seconds) || seconds <= 0) return NaN;
                let scaled = seconds / acceleration / size;
                scaled -= scaled * salesModifier / 100;
                if (weather?.sellingSpeedMultiplier) scaled /= weather.sellingSpeedMultiplier;
                return scaled;
            }

            function findRetailInfo(resourceId, quality) {
                const list = SRC.ResourcesRetailInfo || [];
                return list.find(item => (
                    Number(item.dbLetter) === resourceId &&
                    (resourceId !== 150 || Number(item.quality) === quality)
                )) || null;
            }

            function stepPrice(price) {
                if (price < 8) return 0.01;
                if (price < 2001) return 0.1;
                return 1;
            }

            function floorToStep(price) {
                const step = stepPrice(price);
                return Math.floor(price / step) * step;
            }

            function calculatePair(resourceId, quality) {
                const retailInfo = findRetailInfo(resourceId, quality);
                const averagePrice = Number(retailInfo?.averagePrice);
                const saturation = Number(retailInfo?.saturation);
                if (!Number.isFinite(averagePrice) || averagePrice <= 0 || !Number.isFinite(saturation)) {
                    return { value: null, reason: 'missing-price-data' };
                }

                const buildingKind = Object.entries(zn.SALES || {})
                    .find(([, resourceIds]) => resourceIds.map(Number).includes(resourceId))?.[0];
                if (!buildingKind) return { value: null, reason: 'missing-store' };

                const forceQuality = resourceId === 150 ? quality : undefined;
                const modeledData = wv(economyState, resourceId, forceQuality ?? null);
                if (!modeledData) return { value: null, reason: 'missing-model' };

                const productionCost = Number(modeledData.modeledProductionCostPerUnit);
                if (!Number.isFinite(productionCost)) {
                    return { value: null, reason: 'invalid-production-cost' };
                }

                const salaryModifier = Number(SCD.buildingsSalaryModifier?.[buildingKind]) || 1;
                const wages = (Number(zn.AVERAGE_SALARY) || 0) * salaryModifier;
                const resourceDetail = SCD.constantsResources?.[resourceId];
                const weather = resourceDetail?.retailSeason === 'Summer'
                    ? sellingSpeedMultiplier
                    : undefined;

                let sellPrice = floorToStep(averagePrice * priceLower);
                const endPrice = averagePrice * priceUpper;
                let maxCost = -Infinity;
                let hasValidSellingTime = false;

                while (sellPrice <= endPrice + 1e-9) {
                    const sellSeconds = zL(
                        buildingKind,
                        modeledData,
                        saleQuantity,
                        v,
                        sellPrice,
                        forceQuality === undefined ? quality : 0,
                        saturation,
                        buildingLevel,
                        weather
                    );
                    if (!Number.isFinite(sellSeconds) || sellSeconds <= 0) {
                        if (sellPrice > averagePrice) break;
                        sellPrice = Number((sellPrice + stepPrice(sellPrice)).toFixed(6));
                        continue;
                    }
                    hasValidSellingTime = true;

                    const revenue = sellPrice * saleQuantity;
                    const wagesTotal = Math.ceil(
                        sellSeconds * wages * buildingLevel * acceleration * b / 3600
                    );
                    const targetProfitTotal =
                        targetLevelProfit * sellSeconds * buildingLevel / 3600;
                    const purchaseCost =
                        (revenue - wagesTotal - targetProfitTotal) / saleQuantity;
                    if (
                        Number.isFinite(purchaseCost) &&
                        purchaseCost >= productionCost &&
                        purchaseCost <= productionCost * 10 &&
                        purchaseCost > maxCost
                    ) {
                        maxCost = purchaseCost;
                    }

                    sellPrice = Number((sellPrice + stepPrice(sellPrice)).toFixed(6));
                }

                if (maxCost > -Infinity) return { value: maxCost, reason: null };
                return {
                    value: null,
                    reason: hasValidSellingTime ? 'no-feasible-price' : 'invalid-selling-time'
                };
            }

            try {
                const cells = pairs.map(pair => {
                    const result = calculatePair(pair.resourceId, pair.quality);
                    return {
                        resourceId: pair.resourceId,
                        quality: pair.quality,
                        ...result
                    };
                });
                self.postMessage({ token, cells });
            } catch (error) {
                self.postMessage({ token, error: error?.message || String(error) });
            }
        };
    `;

    function settleWorkerError(error) {
        const message = error?.message || '反推收购价 Worker 执行失败';
        for (const pending of pendingRequests.values()) pending.reject(new Error(message));
        pendingRequests.clear();
        if (worker) {
            worker.terminate();
            worker = null;
        }
    }

    function ensureWorker() {
        if (worker) return worker;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = event => {
            const { token, cells, error } = event.data || {};
            const pending = pendingRequests.get(token);
            if (!pending) return;
            pendingRequests.delete(token);
            if (error) pending.reject(new Error(error));
            else pending.resolve(cells || []);
        };
        worker.onerror = event => {
            event.preventDefault?.();
            settleWorkerError(event.error || new Error(event.message));
        };
        return worker;
    }

    function calculate(inputSettings = loadSettings()) {
        const settings = normalizeSettings(inputSettings);
        const targetLevelProfit = Number(settings.targetHourlyProfit);
        if (!Number.isFinite(targetLevelProfit) || targetLevelProfit <= 0) {
            return Promise.reject(new Error('请输入每级时利润'));
        }
        if (!settings.resourceIds.length) {
            return Promise.reject(new Error('请至少选择一个资源'));
        }
        if (!settings.qualityIds.length) {
            return Promise.reject(new Error('请至少选择一个品质'));
        }

        let data;
        try {
            data = readCalculationData();
        } catch (error) {
            return Promise.reject(error);
        }

        const shared = buildSharedContext(data.constants, data.region, settings.economyState);
        const pairs = [];
        settings.resourceIds.forEach(resourceId => {
            settings.qualityIds.forEach(quality => {
                pairs.push({ resourceId, quality });
            });
        });

        const token = ++requestSequence;
        for (const pending of pendingRequests.values()) {
            pending.reject(new Error('计算已被新的请求替换'));
        }
        pendingRequests.clear();

        return new Promise((resolve, reject) => {
            pendingRequests.set(token, { resolve, reject });
            try {
                ensureWorker().postMessage({
                    token,
                    pairs,
                    shared,
                    constants: {
                        targetLevelProfit,
                        buildingLevel: settings.buildingLevel,
                        saleQuantity: settings.saleQuantity,
                        priceLower: PRICE_LOWER_LIMIT,
                        priceUpper: PRICE_UPPER_LIMIT,
                        SCXXCS: state.SCXXCS,
                        PROFIT_PER_BUILDING_LEVEL: state.PROFIT_PER_BUILDING_LEVEL,
                        RETAIL_ADJUSTMENT: state.RETAIL_ADJUSTMENT
                    }
                });
            } catch (error) {
                pendingRequests.delete(token);
                reject(error);
            }
        });
    }

    function truncateToSig(value, digits = 4) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '--';
        if (number === 0) return '0';
        const magnitude = Math.floor(Math.log10(Math.abs(number))) + 1;
        const factor = Math.pow(10, magnitude - digits);
        const truncated = Math.floor(number / factor) * factor;
        const decimals = Math.max(0, digits - magnitude);
        return truncated.toFixed(decimals);
    }

    function serializePriceTable(table) {
        return [...table.rows]
            .map(row => {
                const values = [...row.cells].map(cell => (
                    cell.dataset.copyText || cell.textContent.trim()
                ));
                if (!values.length) return '';
                if (row.parentElement?.tagName === 'THEAD') {
                    const qualityHeaders = values.slice(1).map((value, index, headers) => {
                        // Preserve the legacy GAS buy-list spacing.
                        const compact = value === 'Q2 ⭐' || index === headers.length - 1;
                        return compact ? `${value}|` : `${value} |`;
                    });
                    return `${values[0]}| ${qualityHeaders.join(' ')}`;
                }
                return `${values[0]}${values.slice(1).map(value => ` | ${value}`).join('')} |`;
            })
            .filter(Boolean)
            .join('\n');
    }

    function fallbackCopyText(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('aria-hidden', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, text.length);
        try {
            return document.execCommand('copy');
        } finally {
            textarea.remove();
        }
    }

    async function copyText(text) {
        let clipboardError = null;
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch (error) {
                clipboardError = error;
            }
        }
        if (fallbackCopyText(text)) return;
        throw clipboardError || new Error('浏览器不支持复制');
    }

    function ensureStyles() {
        if (document.getElementById('sc-reverse-purchase-price-style')) return;
        const style = document.createElement('style');
        style.id = 'sc-reverse-purchase-price-style';
        style.textContent = `
            .sc-reverse-purchase-price,.sc-reverse-purchase-price *,.sc-rpp-temporary-overlay,.sc-rpp-temporary-overlay *{box-sizing:border-box}
            .sc-reverse-purchase-price{display:grid;gap:12px;min-width:0;color:var(--sc-rpp-text);font-size:13px}
            .sc-rpp-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
            .sc-rpp-fields label{display:grid;min-width:0;gap:5px;color:var(--sc-rpp-muted);font-size:12px}
            .sc-rpp-fields input,.sc-rpp-fields select{width:100%;min-width:0;min-height:38px;padding:7px 9px;color:var(--sc-rpp-text);background:var(--sc-rpp-input);border:1px solid var(--sc-rpp-border);border-radius:4px}
            .sc-rpp-data-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
            .sc-rpp-data-controls .btn,.sc-rpp-actions .btn,.sc-rpp-control-button{min-height:38px;padding:7px 12px;color:var(--sc-rpp-text);background:var(--sc-rpp-input);border:1px solid var(--sc-rpp-border);border-radius:4px;cursor:pointer;font-size:12px;font-weight:600}
            .sc-rpp-data-controls .btn-primary,.sc-rpp-actions .btn-primary{color:#fff;background:var(--sc-rpp-accent);border-color:var(--sc-rpp-accent)}
            .sc-rpp-data-controls .btn:disabled,.sc-rpp-actions .btn:disabled{opacity:.5;cursor:not-allowed}
            .sc-rpp-selection{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
            .sc-rpp-group{display:grid;gap:7px;min-width:0}
            .sc-rpp-section-heading{color:var(--sc-rpp-text);font-size:13px}
            .sc-rpp-resource-groups{overflow:hidden;border:1px solid var(--sc-rpp-border);border-radius:4px;background:var(--sc-rpp-surface)}
            .sc-rpp-resource-store{display:grid;min-width:0}
            .sc-rpp-resource-store + .sc-rpp-resource-store{border-top:1px solid var(--sc-rpp-border)}
            .sc-rpp-store-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 9px;background:var(--sc-rpp-header)}
            .sc-rpp-store-toggle{display:flex;align-items:center;min-width:0;min-height:36px;gap:7px;padding:0;color:var(--sc-rpp-text);background:transparent;border:0;cursor:pointer;text-align:left}
            .sc-rpp-store-toggle::before{content:"";flex:none;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:6px solid currentColor;transition:transform .16s ease}
            .sc-rpp-resource-store.is-expanded .sc-rpp-store-toggle::before{transform:rotate(90deg)}
            .sc-rpp-store-toggle:focus-visible{outline:2px solid var(--sc-rpp-positive);outline-offset:2px}
            .sc-rpp-store-title{overflow:hidden;font-size:12px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
            .sc-rpp-store-count{color:var(--sc-rpp-muted);font-size:11px;font-variant-numeric:tabular-nums}
            .sc-rpp-store-actions{display:flex;flex:none;gap:5px}
            .sc-rpp-mini-button{min-height:34px;padding:5px 10px;color:var(--sc-rpp-text);background:var(--sc-rpp-input);border:1px solid var(--sc-rpp-border);border-radius:4px;cursor:pointer;font-size:12px;font-weight:600}
            .sc-rpp-mini-button:hover,.sc-rpp-mini-button:focus-visible{background:var(--sc-rpp-surface);outline:2px solid var(--sc-rpp-positive);outline-offset:1px}
            .sc-rpp-store-body{display:none;padding:5px 9px 9px}
            .sc-rpp-resource-store.is-expanded .sc-rpp-store-body{display:block}
            .sc-rpp-store-options{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:2px 6px}
            .sc-rpp-store-options label{display:flex;min-width:0;min-height:36px;align-items:center;gap:7px;padding:4px 6px;border-radius:3px;cursor:pointer;white-space:nowrap}
            .sc-rpp-store-options label:hover{background:var(--sc-rpp-header)}
            .sc-rpp-store-options input{flex:none;accent-color:var(--sc-rpp-positive)}
            .sc-rpp-quality-chips{display:flex;flex-wrap:wrap;gap:6px}
            .sc-rpp-quality-chip{position:relative;display:inline-flex;min-width:48px;min-height:36px;align-items:center;justify-content:center;padding:4px 8px;color:var(--sc-rpp-muted);background:var(--sc-rpp-input);border:1px solid var(--sc-rpp-border);border-radius:4px;cursor:pointer;font-size:12px;font-weight:600}
            .sc-rpp-quality-chip input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
            .sc-rpp-quality-chip:has(input:checked){color:#fff;background:var(--sc-rpp-accent);border-color:var(--sc-rpp-accent)}
            .sc-rpp-quality-chip:has(input:focus-visible){outline:2px solid var(--sc-rpp-positive);outline-offset:2px}
            .sc-rpp-quality-warning{display:none;padding:7px 9px;color:var(--sc-rpp-warning);border:1px solid var(--sc-rpp-warning);border-radius:4px;background:var(--sc-rpp-surface)}
            .sc-rpp-quality-warning.is-visible{display:block}
            .sc-rpp-actions{position:sticky;bottom:-14px;z-index:4;display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 0;background:var(--sc-rpp-dialog);border-top:1px solid var(--sc-rpp-border);box-shadow:0 -8px 18px rgba(0,0,0,.08)}
            .sc-rpp-action-buttons{display:flex;align-items:center;gap:8px}
            .sc-rpp-status{flex:1 1 160px;min-height:20px;color:var(--sc-rpp-muted)}
            .sc-rpp-status.is-error{color:var(--sc-rpp-negative)}
            .sc-rpp-table-wrap{overflow:auto;border:1px solid var(--sc-rpp-border);border-radius:3px}
            .sc-rpp-table{border-collapse:collapse;min-width:100%;font-variant-numeric:tabular-nums}
            .sc-rpp-table th,.sc-rpp-table td{padding:5px 9px;border-right:1px solid var(--sc-rpp-border);border-bottom:1px solid var(--sc-rpp-border);text-align:right;white-space:nowrap}
            .sc-rpp-table th:first-child,.sc-rpp-table td:first-child{text-align:left}
            .sc-rpp-table thead th{position:sticky;top:0;background:var(--sc-rpp-header)}
            .sc-rpp-table td.is-price{cursor:pointer}
            .sc-rpp-table td.is-price:hover,.sc-rpp-table td.is-price:focus-visible{background:var(--sc-rpp-header);outline:2px solid var(--sc-rpp-positive);outline-offset:-2px}
            .sc-rpp-table td.is-masked,.sc-rpp-table td.is-missing{color:var(--sc-rpp-muted)}
            .sc-rpp-table td.is-no-feasible{color:var(--sc-rpp-warning);text-decoration:underline dotted;text-underline-offset:2px}
            .sc-rpp-table td[data-reason]{cursor:help}
            .sc-rpp-temporary-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72)}
            .sc-rpp-temporary-dialog{width:min(980px,100%);max-height:calc(100vh - 40px);overflow:auto;padding:14px;color:var(--sc-rpp-text);background:var(--sc-rpp-dialog);border:1px solid var(--sc-rpp-border);border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,.45)}
            .sc-rpp-temporary-header{position:sticky;top:-14px;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-14px -14px 10px;padding:10px 14px;background:var(--sc-rpp-dialog);border-bottom:1px solid var(--sc-rpp-border)}
            .sc-rpp-temporary-title{margin:0;font-size:16px;line-height:1.3}
            .sc-rpp-temporary-close{width:40px;height:40px;padding:0;color:var(--sc-rpp-text);background:var(--sc-rpp-input);border:1px solid var(--sc-rpp-border);border-radius:4px;cursor:pointer;font-size:20px;line-height:1}
            @media (max-width:600px){
                .sc-rpp-temporary-overlay{padding:10px}
                .sc-rpp-temporary-dialog{width:100%;height:calc(100vh - 20px);height:calc(100dvh - 20px);max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);padding:12px}
                .sc-rpp-temporary-header{top:-12px;margin:-12px -12px 8px;padding:8px 12px}
                .sc-rpp-fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
                .sc-rpp-fields input,.sc-rpp-fields select{min-height:42px;padding:7px}
                .sc-reverse-purchase-price{gap:10px}
                .sc-rpp-data-controls{gap:6px}
                .sc-rpp-store-actions{gap:4px}
                .sc-rpp-store-options{grid-template-columns:repeat(2,minmax(0,1fr))}
                .sc-rpp-store-options label{min-height:44px}
                .sc-rpp-mini-button,.sc-rpp-store-toggle{min-height:44px}
                .sc-rpp-quality-chip{flex:1 1 calc(20% - 6px);min-height:42px}
                .sc-rpp-actions{bottom:-12px;padding:8px 0}
                .sc-rpp-action-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
                .sc-rpp-apply-contract{grid-column:1 / -1}
                .sc-rpp-actions .btn{width:100%;min-height:44px}
                .sc-rpp-status{flex-basis:100%}
            }
        `;
        document.head.appendChild(style);
    }

    function getThemeColors() {
        const dark = DM();
        return {
            text: dark ? '#f1f1f1' : '#242424',
            muted: dark ? 'rgba(255,255,255,.62)' : 'rgba(0,0,0,.58)',
            border: dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.16)',
            surface: dark ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.025)',
            input: dark ? '#35373a' : '#fff',
            dialog: dark ? '#33363a' : '#f7f7f7',
            header: dark ? '#42454a' : '#eceff1',
            accent: dark ? '#2f7d46' : '#2e7d3a',
            positive: dark ? '#79d68a' : '#2e7d3a',
            warning: dark ? '#ffd166' : '#9a6700',
            negative: dark ? '#ff8a80' : '#b42318'
        };
    }

    function applyThemeColors(element) {
        const colors = getThemeColors();
        element.style.setProperty('--sc-rpp-text', colors.text);
        element.style.setProperty('--sc-rpp-muted', colors.muted);
        element.style.setProperty('--sc-rpp-border', colors.border);
        element.style.setProperty('--sc-rpp-surface', colors.surface);
        element.style.setProperty('--sc-rpp-input', colors.input);
        element.style.setProperty('--sc-rpp-dialog', colors.dialog);
        element.style.setProperty('--sc-rpp-header', colors.header);
        element.style.setProperty('--sc-rpp-accent', colors.accent);
        element.style.setProperty('--sc-rpp-positive', colors.positive);
        element.style.setProperty('--sc-rpp-warning', colors.warning);
        element.style.setProperty('--sc-rpp-negative', colors.negative);
    }

    function createCheckbox(labelText, checked, onChange) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.addEventListener('change', onChange);
        const text = document.createElement('span');
        text.textContent = labelText;
        label.append(checkbox, text);
        return { label, checkbox };
    }

    function getCalculationStatus(cells) {
        const unresolved = cells.filter(cell => cell.value === null || cell.value === undefined);
        const hint = '点击价格可以留空';
        if (!unresolved.length) return { message: `计算完成，${hint}`, type: 'idle' };

        const noFeasiblePriceReasons = new Set(['no-feasible-price', 'invalid-selling-time']);
        const noFeasiblePriceCount = unresolved.filter(cell => noFeasiblePriceReasons.has(cell.reason)).length;
        const missingDataCount = unresolved.length - noFeasiblePriceCount;
        const details = [];
        if (noFeasiblePriceCount) details.push(`${noFeasiblePriceCount} 项无可行收购价`);
        if (missingDataCount) details.push(`${missingDataCount} 项缺少数据`);
        return {
            message: `计算完成，${hint}；${details.join('，')}`,
            type: cells.some(cell => Number.isFinite(cell.value)) ? 'idle' : 'error'
        };
    }

    function renderMatrix(tableHost, cells, settings) {
        const resourceIds = [...settings.resourceIds].sort((a, b) => a - b);
        const qualityIds = [...settings.qualityIds].sort((a, b) => a - b);
        const results = new Map(cells.map(cell => [`${cell.resourceId}-${cell.quality}`, cell]));
        const table = document.createElement('table');
        table.className = 'sc-rpp-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const buy = document.createElement('th');
        buy.textContent = 'BUY';
        headerRow.appendChild(buy);
        qualityIds.forEach(quality => {
            const th = document.createElement('th');
            th.textContent = `Q${quality} ⭐`;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        resourceIds.forEach(resourceId => {
            const row = document.createElement('tr');
            const resourceCell = document.createElement('th');
            resourceCell.textContent = resourceIdNameMap[resourceId] || `资源 ${resourceId}`;
            resourceCell.dataset.copyText = `:re-${resourceId}:`;
            row.appendChild(resourceCell);
            qualityIds.forEach(quality => {
                const cell = document.createElement('td');
                cell.dataset.resourceId = String(resourceId);
                cell.dataset.quality = String(quality);
                const result = results.get(`${resourceId}-${quality}`);
                const value = result?.value;
                if (value === null || value === undefined) {
                    const reason = result?.reason || 'unknown';
                    const reasonLabel = CALCULATION_REASON_LABELS[reason] || '无法计算';
                    cell.textContent = '--';
                    cell.classList.add('is-missing');
                    cell.classList.toggle(
                        'is-no-feasible',
                        reason === 'no-feasible-price' || reason === 'invalid-selling-time'
                    );
                    cell.dataset.reason = reason;
                    cell.title = reasonLabel;
                    cell.setAttribute(
                        'aria-label',
                        `${resourceIdNameMap[resourceId] || `资源 ${resourceId}`} Q${quality} 无法计算：${reasonLabel}`
                    );
                } else {
                    const formattedPrice = truncateToSig(value, 4);
                    const updateToggleLabel = () => {
                        const masked = cell.dataset.masked === 'true';
                        cell.setAttribute(
                            'aria-label',
                            `${resourceIdNameMap[resourceId] || `资源 ${resourceId}`} Q${quality} 收购价 ${masked ? MASKED_PRICE : formattedPrice}`
                        );
                    };
                    const togglePrice = () => {
                        const masked = cell.dataset.masked !== 'true';
                        cell.dataset.masked = String(masked);
                        cell.textContent = masked ? MASKED_PRICE : formattedPrice;
                        cell.classList.toggle('is-masked', masked);
                        cell.setAttribute('aria-pressed', String(masked));
                        updateToggleLabel();
                    };
                    cell.textContent = formattedPrice;
                    cell.classList.add('is-price');
                    cell.dataset.masked = 'false';
                    cell.tabIndex = 0;
                    cell.setAttribute('role', 'button');
                    cell.setAttribute('aria-pressed', 'false');
                    updateToggleLabel();
                    cell.addEventListener('click', togglePrice);
                    cell.addEventListener('keydown', event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        togglePrice();
                    });
                }
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        tableHost.replaceChildren(table);
    }

    function readUiSettings() {
        const resourceIds = [...ui.resourceBoxes]
            .filter(entry => entry.checkbox.checked)
            .map(entry => entry.resourceId);
        const qualityIds = [...ui.qualityBoxes]
            .filter(entry => entry.checkbox.checked)
            .map(entry => entry.quality);
        return normalizeSettings({
            targetHourlyProfit: ui.targetInput.value,
            buildingLevel: ui.levelInput.value,
            saleQuantity: ui.quantityInput.value,
            economyState: ui.economySelect.value,
            resourceIds,
            qualityIds
        });
    }

    function updateSelectionSettings() {
        if (!ui) return;
        saveSettings(readUiSettings());
        updateQualityWarning();
        updateResourceSummary();
    }

    function updateQualityWarning() {
        if (!ui?.qualityWarning) return;
        const selectedCount = ui.qualityBoxes.filter(entry => entry.checkbox.checked).length;
        const visible = selectedCount > CHAT_QUALITY_COLUMN_LIMIT;
        ui.qualityWarning.textContent = visible
            ? `已选择 ${selectedCount} 个品质，聊天室中超过 ${CHAT_QUALITY_COLUMN_LIMIT} 个品质可能导致排版溢出。`
            : '';
        ui.qualityWarning.classList.toggle('is-visible', visible);
    }

    function updateResourceSummary() {
        if (!ui?.storeGroups) return;
        let selectedTotal = 0;
        let resourceTotal = 0;
        ui.storeGroups.forEach(group => {
            const selected = group.entries.filter(entry => entry.checkbox.checked).length;
            selectedTotal += selected;
            resourceTotal += group.entries.length;
            group.count.textContent = `${selected}/${group.entries.length}`;
        });
        ui.resourceHeading.textContent = `资源 · 已选 ${selectedTotal}/${resourceTotal}`;
    }

    function setStatus(message, type = 'idle') {
        if (!ui) return;
        ui.status.textContent = message;
        ui.status.classList.toggle('is-error', type === 'error');
    }

    function resolveRuleResourceId(value) {
        if (/^\d+$/.test(value)) return Number(value);
        const entry = Object.entries(resourceIdNameMap)
            .find(([, name]) => name === value);
        return entry ? Number(entry[0]) : null;
    }

    function parseContractRule(line) {
        const parts = line.split(/[，,]/).map(part => part.trim());
        if (parts.length !== 3) return null;
        const resourceId = resolveRuleResourceId(parts[0]);
        const quality = Number(parts[1]);
        if (!Number.isInteger(resourceId) || !Number.isInteger(quality) || quality < 0) return null;
        return {
            key: `${resourceId}_${quality}`,
            resourceId,
            quality
        };
    }

    function getContractPriceUpdatesFromTable() {
        if (!ui) return new Map();
        const updates = new Map();
        ui.tableHost.querySelectorAll('tbody td[data-resource-id][data-quality]').forEach(cell => {
            const price = cell.textContent.trim();
            if (!/^\d+(?:\.\d+)?$/.test(price)) return;
            const resourceId = Number(cell.dataset.resourceId);
            const quality = Number(cell.dataset.quality);
            if (!Number.isInteger(resourceId) || !Number.isInteger(quality)) return;
            updates.set(`${resourceId}_${quality}`, {
                resourceId,
                quality,
                price
            });
        });
        return updates;
    }

    function applyContractSecondConfirmationSettings() {
        if (!ui) return;
        const updates = getContractPriceUpdatesFromTable();
        if (!updates.size) {
            setStatus('价格表没有可写入的收购价', 'error');
            return;
        }

        ui.applyContractButton.disabled = true;
        try {
            const raw = localStorage.getItem(CONTRACT_HIGH_PRICE_SETTINGS_KEY);
            const current = raw
                ? JSON.parse(raw)
                : { global: '-0', individual: '' };
            if (!current || typeof current !== 'object' || Array.isArray(current)) {
                throw new Error('合同二次确认设置格式异常');
            }

            const targetKeys = new Set(updates.keys());
            const preservedLines = (typeof current.individual === 'string' ? current.individual : '')
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .filter(line => {
                    const rule = parseContractRule(line);
                    return !rule || !targetKeys.has(rule.key);
                });
            const replacementLines = [...updates.values()]
                .sort((a, b) => a.resourceId - b.resourceId || a.quality - b.quality)
                .map(item => `${item.resourceId},${item.quality},${item.price}`);

            localStorage.setItem(CONTRACT_HIGH_PRICE_SETTINGS_KEY, JSON.stringify({
                ...current,
                individual: [...preservedLines, ...replacementLines].join('\n')
            }));
            setStatus(`已覆盖合同二确设置 ${updates.size} 项`);
        } catch (error) {
            setStatus(error?.message || '覆盖合同二确设置失败', 'error');
        } finally {
            if (ui) ui.applyContractButton.disabled = !ui.tableHost.querySelector('table');
        }
    }

    async function copyPriceTable() {
        if (!ui) return;
        const table = ui.tableHost.querySelector('table');
        if (!table) {
            setStatus('请先计算价格表', 'error');
            return;
        }
        ui.copyButton.disabled = true;
        try {
            await copyText(serializePriceTable(table));
            setStatus('已复制价格表');
        } catch (error) {
            setStatus('复制失败，请检查剪贴板权限', 'error');
        } finally {
            if (ui) ui.copyButton.disabled = !ui.tableHost.querySelector('table');
        }
    }

    async function runUiCalculation() {
        if (!ui) return;
        const settings = saveSettings(readUiSettings());
        const currentRequest = ++uiRequestSequence;
        ui.calculateButton.disabled = true;
        ui.copyButton.disabled = true;
        ui.applyContractButton.disabled = true;
        setStatus('计算中...');
        try {
            const cells = await calculate(settings);
            if (currentRequest !== uiRequestSequence || !ui) return;
            const status = getCalculationStatus(cells);
            renderMatrix(ui.tableHost, cells, settings);
            ui.copyButton.disabled = false;
            ui.applyContractButton.disabled = false;
            setStatus(status.message, status.type);
        } catch (error) {
            if (currentRequest !== uiRequestSequence || !ui) return;
            if (error?.message === '计算已被新的请求替换') return;
            setStatus(error?.message || '计算失败', 'error');
        } finally {
            if (ui) {
                ui.calculateButton.disabled = false;
                ui.copyButton.disabled = !ui.tableHost.querySelector('table');
                ui.applyContractButton.disabled = !ui.tableHost.querySelector('table');
            }
        }
    }

    function renderUi(container) {
        ensureStyles();
        const settings = loadSettings();
        const computed = (() => {
            try {
                return readCalculationData();
            } catch (error) {
                return null;
            }
        })();
        const availableResourceGroups = computed
            ? getRetailableResourceGroups(computed.constants)
            : settings.resourceIds.length
                ? [{ storeKind: 'saved', storeName: '已选资源', resourceIds: settings.resourceIds }]
                : [];

        uiRoot = document.createElement('section');
        uiRoot.className = 'sc-reverse-purchase-price';
        applyThemeColors(uiRoot);

        const fields = document.createElement('div');
        fields.className = 'sc-rpp-fields';
        const createNumberField = (labelText, value, step) => {
            const label = document.createElement('label');
            const text = document.createElement('span');
            text.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = step;
            input.value = value;
            label.append(text, input);
            fields.appendChild(label);
            return input;
        };
        const targetInput = createNumberField('每级时利润', settings.targetHourlyProfit, '0.01');
        const levelInput = createNumberField('建筑等级', settings.buildingLevel, '1');
        const quantityInput = createNumberField('销售数量', settings.saleQuantity, '1');
        const economyField = document.createElement('label');
        const economyLabel = document.createElement('span');
        economyLabel.textContent = '周期';
        const economySelect = document.createElement('select');
        [
            ['', '当前'],
            ['0', '萧条'],
            ['1', '平缓'],
            ['2', '景气']
        ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            economySelect.appendChild(option);
        });
        economySelect.value = settings.economyState === null ? '' : String(settings.economyState);
        economyField.append(economyLabel, economySelect);
        fields.appendChild(economyField);
        uiRoot.appendChild(fields);

        const dataControls = document.createElement('div');
        dataControls.className = 'sc-rpp-data-controls';
        const executiveToggle = createGlobalCustomToggle(
            'executiveCustomToggle',
            '自定义',
            { buttonClass: 'btn btn-primary' },
            updateSelectionSettings
        );
        executiveToggle.wrapper.style.marginLeft = '0';
        const customDataButton = document.createElement('button');
        customDataButton.type = 'button';
        customDataButton.className = 'btn';
        customDataButton.textContent = '自定义高管数据';
        customDataButton.addEventListener('click', () => executiveCustomButton.show());
        dataControls.append(executiveToggle.wrapper, customDataButton);
        uiRoot.appendChild(dataControls);

        const selection = document.createElement('div');
        selection.className = 'sc-rpp-selection';
        const resourceGroup = document.createElement('div');
        resourceGroup.className = 'sc-rpp-group';
        const resourceHeading = document.createElement('strong');
        resourceHeading.className = 'sc-rpp-section-heading';
        resourceHeading.textContent = '资源';
        const resourceBoxesHost = document.createElement('div');
        resourceBoxesHost.className = 'sc-rpp-resource-groups';
        const resourceBoxes = [];
        const storeGroups = [];
        const preferredStoreKind = availableResourceGroups.find(group => (
            group.resourceIds.some(resourceId => settings.resourceIds.includes(resourceId))
        ))?.storeKind || availableResourceGroups[0]?.storeKind;
        availableResourceGroups.forEach(storeGroup => {
            const store = document.createElement('section');
            store.className = 'sc-rpp-resource-store';
            store.dataset.storeKind = storeGroup.storeKind;
            const expanded = storeGroup.storeKind === preferredStoreKind;
            store.classList.toggle('is-expanded', expanded);
            const storeHeader = document.createElement('div');
            storeHeader.className = 'sc-rpp-store-header';
            const storeToggle = document.createElement('button');
            storeToggle.type = 'button';
            storeToggle.className = 'sc-rpp-store-toggle';
            storeToggle.setAttribute('aria-expanded', String(expanded));
            const storeTitle = document.createElement('span');
            storeTitle.className = 'sc-rpp-store-title';
            storeTitle.textContent = storeGroup.storeName;
            const storeCount = document.createElement('span');
            storeCount.className = 'sc-rpp-store-count';
            storeToggle.append(storeTitle, storeCount);
            const storeActions = document.createElement('div');
            storeActions.className = 'sc-rpp-store-actions';
            const selectAllButton = document.createElement('button');
            selectAllButton.type = 'button';
            selectAllButton.className = 'sc-rpp-mini-button';
            selectAllButton.textContent = '全选';
            selectAllButton.dataset.storeAction = 'select-all';
            selectAllButton.setAttribute('aria-label', `全选 ${storeGroup.storeName} 资源`);
            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.className = 'sc-rpp-mini-button';
            clearButton.textContent = '清空';
            clearButton.dataset.storeAction = 'clear';
            clearButton.setAttribute('aria-label', `清空 ${storeGroup.storeName} 资源`);
            storeActions.append(selectAllButton, clearButton);
            storeHeader.append(storeToggle, storeActions);
            const storeBody = document.createElement('div');
            storeBody.className = 'sc-rpp-store-body';
            const storeOptions = document.createElement('div');
            storeOptions.className = 'sc-rpp-store-options';
            const storeEntries = [];
            storeGroup.resourceIds.forEach(resourceId => {
                const entry = createCheckbox(
                    resourceIdNameMap[resourceId] || `资源 ${resourceId}`,
                    settings.resourceIds.includes(resourceId),
                    updateSelectionSettings
                );
                entry.checkbox.dataset.resourceId = String(resourceId);
                storeOptions.appendChild(entry.label);
                resourceBoxes.push({ resourceId, ...entry });
                storeEntries.push(entry);
            });
            const setStoreChecked = checked => {
                storeEntries.forEach(entry => {
                    entry.checkbox.checked = checked;
                });
                updateSelectionSettings();
            };
            selectAllButton.addEventListener('click', () => setStoreChecked(true));
            clearButton.addEventListener('click', () => setStoreChecked(false));
            storeToggle.addEventListener('click', () => {
                const isExpanded = store.classList.toggle('is-expanded');
                storeToggle.setAttribute('aria-expanded', String(isExpanded));
            });
            storeBody.appendChild(storeOptions);
            store.append(storeHeader, storeBody);
            resourceBoxesHost.appendChild(store);
            storeGroups.push({
                entries: storeEntries,
                count: storeCount
            });
        });
        resourceGroup.append(resourceHeading, resourceBoxesHost);

        const qualityGroup = document.createElement('div');
        qualityGroup.className = 'sc-rpp-group';
        const qualityHeading = document.createElement('strong');
        qualityHeading.className = 'sc-rpp-section-heading';
        qualityHeading.textContent = '品质';
        const qualityBoxesHost = document.createElement('div');
        qualityBoxesHost.className = 'sc-rpp-quality-chips';
        const qualityBoxes = QUALITY_IDS.map(quality => {
            const entry = createCheckbox(
                `Q${quality}`,
                settings.qualityIds.includes(quality),
                updateSelectionSettings
            );
            entry.label.classList.add('sc-rpp-quality-chip');
            entry.checkbox.dataset.quality = String(quality);
            qualityBoxesHost.appendChild(entry.label);
            return { quality, ...entry };
        });
        const qualityWarning = document.createElement('div');
        qualityWarning.className = 'sc-rpp-quality-warning';
        qualityWarning.setAttribute('role', 'status');
        qualityGroup.append(qualityHeading, qualityBoxesHost, qualityWarning);
        selection.append(resourceGroup, qualityGroup);
        uiRoot.appendChild(selection);

        const actions = document.createElement('div');
        actions.className = 'sc-rpp-actions';
        const calculateButton = document.createElement('button');
        calculateButton.type = 'button';
        calculateButton.className = 'btn btn-primary';
        calculateButton.textContent = '计算';
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn';
        copyButton.textContent = '复制价格表';
        copyButton.disabled = true;
        const applyContractButton = document.createElement('button');
        applyContractButton.type = 'button';
        applyContractButton.className = 'btn sc-rpp-apply-contract';
        applyContractButton.textContent = '覆盖二确设置';
        applyContractButton.title = '仅覆盖价格表中保留的收购价，不修改留空项和未涉及资源';
        applyContractButton.disabled = true;
        const status = document.createElement('div');
        status.className = 'sc-rpp-status';
        status.setAttribute('role', 'status');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'sc-rpp-action-buttons';
        actionButtons.append(calculateButton, copyButton, applyContractButton);
        actions.append(actionButtons, status);
        uiRoot.appendChild(actions);

        const tableHost = document.createElement('div');
        tableHost.className = 'sc-rpp-table-wrap';
        uiRoot.appendChild(tableHost);

        ui = {
            targetInput,
            levelInput,
            quantityInput,
            economySelect,
            resourceHeading,
            resourceBoxes,
            storeGroups,
            qualityBoxes,
            qualityWarning,
            calculateButton,
            copyButton,
            applyContractButton,
            status,
            tableHost
        };

        [targetInput, levelInput, quantityInput, economySelect].forEach(input => {
            input.addEventListener('change', updateSelectionSettings);
        });
        calculateButton.addEventListener('click', runUiCalculation);
        copyButton.addEventListener('click', copyPriceTable);
        applyContractButton.addEventListener('click', applyContractSecondConfirmationSettings);
        updateResourceSummary();
        updateQualityWarning();
        container.replaceChildren(uiRoot);
        if (!computed) {
            setStatus('缺少基础数据或领域数据，请先更新数据', 'error');
        }
    }

    function init(container) {
        const target = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        if (!(target instanceof Element)) return false;
        if (mountedRoot === target && uiRoot?.isConnected) return true;
        destroy();
        mountedRoot = target;
        renderUi(target);
        return true;
    }

    function openTemporaryPage() {
        if (temporaryOverlay?.isConnected) return true;
        ensureStyles();

        const overlay = document.createElement('div');
        overlay.className = 'sc-rpp-temporary-overlay';
        overlay.dataset.scReversePurchasePriceOverlay = 'true';
        applyThemeColors(overlay);

        const dialog = document.createElement('div');
        dialog.className = 'sc-rpp-temporary-dialog';
        const header = document.createElement('div');
        header.className = 'sc-rpp-temporary-header';
        const title = document.createElement('h2');
        title.className = 'sc-rpp-temporary-title';
        title.textContent = '反推收购价';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'sc-rpp-temporary-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', '关闭反推收购价');
        header.append(title, closeButton);

        const content = document.createElement('div');
        dialog.append(header, content);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        closeButton.addEventListener('click', destroy);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) destroy();
        });

        if (!init(content)) {
            overlay.remove();
            return false;
        }

        temporaryOverlay = overlay;
        temporaryKeyHandler = event => {
            if (event.key === 'Escape') destroy();
        };
        document.addEventListener('keydown', temporaryKeyHandler);
        return true;
    }

    function destroy() {
        uiRequestSequence++;
        requestSequence++;
        for (const pending of pendingRequests.values()) {
            pending.reject(new Error('计算已取消'));
        }
        pendingRequests.clear();
        if (worker) {
            worker.terminate();
            worker = null;
        }
        if (temporaryKeyHandler) {
            document.removeEventListener('keydown', temporaryKeyHandler);
            temporaryKeyHandler = null;
        }
        temporaryOverlay?.remove();
        temporaryOverlay = null;
        uiRoot?.remove();
        uiRoot = null;
        mountedRoot = null;
        ui = null;
    }

    function getSettings() {
        return loadSettings();
    }

    function updateSettings(settings) {
        return saveSettings(settings);
    }

    return {
        init,
        openTemporaryPage,
        destroy,
        calculate,
        getSettings,
        saveSettings: updateSettings
    };
})();

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.reversePurchasePrice = ReversePurchasePrice;

export { ReversePurchasePrice };
