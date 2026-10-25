const BUILDING_NAME_PREFIX = 'be-bl-';

// 游戏建筑代码严格区分大小写和数字，查询时不做任何大小写归一化。
export const BUILDING_NAMES = Object.freeze({
    'be-bl-a': '汽车研发所',
    'be-bl-b': '畜牧实验室',
    'be-bl-c': '化学实验室',
    'be-bl-d': '五金商店',
    'be-bl-e': '屠宰场',
    'be-bl-f': '时装设计中心',
    'be-bl-g': '总承包商',
    'be-bl-h': '物理学实验室',
    'be-bl-i': '磨坊',
    'be-bl-j': '烘焙厂',
    'be-bl-k': '食品加工厂',
    'be-bl-l': '发射台',
    'be-bl-m': '中央厨房',
    'be-bl-n': '银行',
    'be-bl-o': '混凝土厂',
    'be-bl-p': '作物研究中心',
    'be-bl-q': '厨房',
    'be-bl-r': '餐馆',
    'be-bl-s': '软件研发院',
    'be-bl-x': '建材厂',
    'be-bl-1': '汽车厂',
    'be-bl-2': '车行',
    'be-bl-3': '神庙',
    'be-bl-4': '公园',
    'be-bl-5': '人工湖',
    'be-bl-6': '饮料工厂',
    'be-bl-7': '航空航天厂',
    'be-bl-8': '航空电子器件厂',
    'be-bl-9': '垂直整合设施',
    'be-bl-0': '机库',
    'be-bl-A': '加油站',
    'be-bl-B': '销售办公室',
    'be-bl-C': '电子产品商店',
    'be-bl-D': '推进器工厂',
    'be-bl-E': '发电厂',
    'be-bl-F': '牧场',
    'be-bl-G': '生鲜商店',
    'be-bl-H': '时装商店',
    'be-bl-L': '电子产品厂',
    'be-bl-M': '矿井',
    'be-bl-T': '时装厂',
    'be-bl-O': '油井',
    'be-bl-P': '农场',
    'be-bl-Q': '采石场',
    'be-bl-R': '炼油厂',
    'be-bl-S': '货运站',
    'be-bl-W': '水库',
    'be-bl-Y': '材料加工厂',
    'be-bl-t': '万圣节集市',
    'be-bl-u': 'Xmas市场',
    'be-bl-v': '森林苗圃',
    'be-bl-y': '学院',
    'be-bl-z': '沙滩集市',
    'be-bl-I': '春季集市'
});

export function getBuildingName(code, fallback = '') {
    if (code === undefined || code === null) return fallback;
    const rawCode = String(code);
    const key = rawCode.startsWith(BUILDING_NAME_PREFIX)
        ? rawCode
        : BUILDING_NAME_PREFIX + rawCode;
    return Object.prototype.hasOwnProperty.call(BUILDING_NAMES, key)
        ? BUILDING_NAMES[key]
        : fallback;
}
