// 对照 GamePages-Cqav9NJ6.js 的 jor：品质按高/低排序取货，cost 是整批库存成本。
// index-BPROLoVc.js 的 Spt（导入名 mR）为 47 小时；与原生汇总一致，只纳入完成寻单的订单。
export const SALES_SEARCH_MS = 47 * 60 * 60 * 1000;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const positiveId = value => Number.isSafeInteger(value) && value > 0;

export function normalizeSalesOrders(data, building, now = Date.now()) {
    if (!Array.isArray(data)) throw new Error('订单数据格式不完整，请刷新后重试。');
    const ids = new Set();
    const result = [];
    for (const order of data) {
        if (!order || !positiveId(order.id) || ids.has(order.id) || !Number.isFinite(Date.parse(order.datetime))) {
            throw new Error('订单编号或寻单时间无法识别。');
        }
        ids.add(order.id);
        if (Date.parse(order.datetime) + SALES_SEARCH_MS >= now) continue;
        if (!Array.isArray(order.resources) || !order.resources.length || order.resources.length > 2 ||
            !finite(order.qualityBonus) || order.qualityBonus < 0 || !finite(order.searchCost) || order.searchCost < 0) {
            throw new Error('订单条款不完整，暂不能计算。');
        }
        const kinds = new Set();
        const resources = order.resources.map(resource => {
            if (!resource || !positiveId(resource.kind) || !positiveId(resource.amount) ||
                !finite(resource.price) || resource.price < 0 || kinds.has(resource.kind)) {
                throw new Error('订单货物数据无法识别。');
            }
            kinds.add(resource.kind);
            return { kind: resource.kind, amount: resource.amount, price: resource.price };
        });
        result.push({
            id: order.id, buildingId: building.id, buildingName: building.name || `大楼 #${building.id}`,
            ordinal: result.length + 1, resources, qualityBonus: order.qualityBonus, searchCost: order.searchCost
        });
    }
    return result;
}

export function normalizeSalesStock(data, kinds, requireCost = true) {
    if (!Array.isArray(data)) throw new Error('仓库数据不完整，请刷新后重试。');
    const seen = new Set();
    const stock = [];
    for (const entry of data) {
        if (!entry || !positiveId(entry.kind)) throw new Error('仓库货物类型无法识别。');
        if (entry.blocked || !kinds.has(entry.kind)) continue;
        if (!finite(entry.amount) || entry.amount < 0) throw new Error('仓库数量无法识别。');
        if (entry.amount === 0) continue;
        let unitCost = 0;
        if (requireCost) {
            if (!Number.isSafeInteger(entry.quality) || entry.quality < 0 || !entry.cost ||
                typeof entry.cost !== 'object' || Array.isArray(entry.cost) || !Object.keys(entry.cost).length ||
                !Object.values(entry.cost).every(value => finite(value) && value >= 0)) {
                throw new Error('仓库品质或成本不完整，暂不能计算利润。');
            }
            const key = `${entry.kind}:${entry.quality}`;
            if (seen.has(key)) throw new Error('同种同品质库存出现重复记录，请刷新后重试。');
            seen.add(key);
            unitCost = Object.values(entry.cost).reduce((sum, value) => sum + value, 0) / entry.amount;
        }
        stock.push({ kind: entry.kind, quality: entry.quality, amount: entry.amount, unitCost });
    }
    return stock.sort((a, b) => a.kind - b.kind || b.quality - a.quality);
}

export function calculateSalesShortage(orders, stock) {
    const totals = new Map();
    for (const order of orders) {
        for (const resource of order.resources) {
            totals.set(resource.kind, (totals.get(resource.kind) || 0) + resource.amount);
        }
    }
    for (const entry of stock) {
        if (totals.has(entry.kind)) totals.set(entry.kind, totals.get(entry.kind) - entry.amount);
    }
    return [...totals].sort(([a], [b]) => a - b)
        .map(([kind, amount]) => ({ kind, amount: Math.ceil(Math.max(0, amount)) })).filter(entry => entry.amount > 0);
}

export function simulateSalesOrder(order, stock, lowestQualityFirst = false) {
    const next = stock.map(entry => ({ ...entry }));
    let base = 0;
    let bonus = 0;
    let cost = 0;
    const deliveries = [];
    for (const resource of order.resources) {
        let remaining = resource.amount;
        const lots = next.filter(entry => entry.kind === resource.kind && entry.amount > 0)
            .sort((a, b) => lowestQualityFirst ? a.quality - b.quality : b.quality - a.quality);
        let qualitySum = 0;
        for (const lot of lots) {
            const amount = Math.min(remaining, lot.amount);
            if (amount <= 0) break;
            remaining -= amount;
            lot.amount -= amount;
            qualitySum += amount * lot.quality;
            cost += amount * lot.unitCost;
            deliveries.push({ kind: lot.kind, quality: lot.quality, amount });
        }
        if (remaining > 1e-9) return null;
        base += resource.price * resource.amount;
        bonus += resource.price * qualitySum * order.qualityBonus / 100;
    }
    return { stock: next, profit: base + bonus - cost - order.searchCost, base, bonus, cost, deliveries, lowestQualityFirst };
}

// 忽略各订单之间的库存竞争，以最高品质奖励和最低单位成本构造乐观上界。
// 允许亏损中间步骤：先消耗一部分库存也可能改善之后的品质分配。
function upperBound(order, stock) {
    let profit = -order.searchCost;
    for (const resource of order.resources) {
        const lots = stock.filter(entry => entry.kind === resource.kind && entry.amount > 0);
        if (lots.reduce((sum, entry) => sum + entry.amount, 0) + 1e-9 < resource.amount) return -Infinity;
        const quality = Math.max(...lots.map(entry => entry.quality));
        const cost = Math.min(...lots.map(entry => entry.unitCost));
        profit += resource.amount * (resource.price * (1 + quality * order.qualityBonus / 100) - cost);
    }
    return profit;
}

export async function optimizeSalesOrders(orders, stock, {
    isCancelled = () => false, shouldStop = () => false, onProgress = () => {},
    maxNodes = 300000, maxMilliseconds = 15000, yieldEvery = 128
} = {}) {
    const start = performance.now();
    const stack = [{ remaining: orders.map((_, index) => index), stock, profit: 0, steps: [] }];
    const memo = new Map();
    let best = { profit: 0, steps: [] };
    let visited = 0;
    while (stack.length) {
        if (isCancelled()) return { ...best, exact: false, cancelled: true, visited };
        if (shouldStop() || visited >= maxNodes || performance.now() - start >= maxMilliseconds) break;
        const state = stack.pop();
        visited++;
        if (state.profit > best.profit + 1e-8 ||
            (Math.abs(state.profit - best.profit) <= 1e-8 && state.steps.length > best.steps.length)) {
            best = { profit: state.profit, steps: state.steps };
        }
        const key = `${state.remaining.join(',')}|${state.stock.map(entry => entry.amount).join(',')}`;
        const previous = memo.get(key);
        if (previous === undefined || previous < state.profit - 1e-8) {
            // 只限制缓存大小，缓存满后继续搜索，不能因此宣称已找出最优。
            if (memo.size < 50000 || previous !== undefined) memo.set(key, state.profit);
            const bound = state.profit + state.remaining.reduce((sum, index) => sum + Math.max(0, upperBound(orders[index], state.stock)), 0);
            if (bound >= best.profit - 1e-8) {
                const choices = [];
                for (const index of state.remaining) {
                    const order = orders[index];
                    const high = simulateSalesOrder(order, state.stock, false);
                    if (!high) continue;
                    const low = simulateSalesOrder(order, state.stock, true);
                    const options = [high];
                    if (low && (Math.abs(high.profit - low.profit) > 1e-8 ||
                        high.stock.some((entry, position) => entry.amount !== low.stock[position].amount))) options.push(low);
                    for (const option of options) {
                        const { stock: next, ...step } = option;
                        choices.push({ remaining: state.remaining.filter(value => value !== index), stock: next,
                            profit: state.profit + option.profit, steps: [...state.steps, { order, ...step }] });
                    }
                }
                choices.sort((a, b) => a.profit - b.profit);
                stack.push(...choices);
            }
        }
        if (visited % yieldEvery === 0) {
            onProgress({ visited, profit: best.profit });
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    return { ...best, exact: stack.length === 0, cancelled: false, visited };
}
