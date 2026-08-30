import { getRealmIdFromLink } from './storage.js';
import { lzCompressToBase64, lzDecompressFromBase64, lzCompressToUTF16, lzDecompressFromUTF16 } from '../utils/lzstring.js';

const providers = [];

export function registerExportInfo(provider) {
    if (!provider || typeof provider !== 'object') return;
    providers.push(provider);
}

function collectKeys(provider, realmId) {
    const keys = typeof provider.keys === 'function'
        ? provider.keys(realmId)
        : (Array.isArray(provider.keys) ? provider.keys : []);
    return Array.isArray(keys) ? keys : [];
}

function keyMatches(provider, realmId, key) {
    if (!provider.match) return false;
    const pattern = typeof provider.match === 'function' ? provider.match(realmId) : provider.match;
    if (pattern instanceof RegExp) return pattern.test(key);
    return false;
}

function readRaw(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const entry = { raw };
    try {
        entry.parsed = JSON.parse(raw);
    } catch (e) {
        // 非 JSON 值保持原始字符串
    }
    return entry;
}

export function collectExportData() {
    const realmId = typeof getRealmIdFromLink === 'function' ? getRealmIdFromLink() : null;
    const realm = {};
    const global = {};
    const realmSeen = new Set();
    const globalSeen = new Set();

    const add = (target, seen, key) => {
        if (seen.has(key)) return;
        const entry = readRaw(key);
        if (entry === null) return;
        seen.add(key);
        target[key] = entry;
    };

    for (const provider of providers) {
        const isRealm = provider.scope === 'realm';
        const target = isRealm ? realm : global;
        const seen = isRealm ? realmSeen : globalSeen;
        for (const key of collectKeys(provider, realmId)) add(target, seen, key);
        if (provider.match) {
            for (const key of Object.keys(localStorage)) {
                if (keyMatches(provider, realmId, key)) add(target, seen, key);
            }
        }
    }

    const meta = {
        pluginName: typeof GM_info !== 'undefined' ? GM_info.script.name : 'autoMaxPPHPL',
        scriptVersion: typeof GM_info !== 'undefined' ? GM_info.script.version : '未知',
        exportedAt: new Date().toISOString(),
        pageUrl: location.href,
        realmId,
        registeredProviders: providers.map(p => p.name || '未命名'),
        realmKeyCount: Object.keys(realm).length,
        globalKeyCount: Object.keys(global).length
    };

    return { meta, realm, global };
}

export function downloadExportData() {
    const data = collectExportData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SC_Export_${data.meta.realmId ?? 'unknown'}_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return data;
}

// ---------- 全插件设置备份/恢复 ----------
// 只收集注册时标记 backup: true 的 provider（用户配置/偏好），
// 排除可自动获取的数据/缓存（buildings、库存、市场、任务答案等）。

function readRawValue(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : raw;
}

// 收集两个领域的领域键 + 全局键（原始字符串值）
export function collectSettingsData() {
    const realms = { '0': {}, '1': {} };
    const global = {};
    for (const provider of providers) {
        if (provider.backup !== true) continue;
        if (provider.scope === 'realm') {
            for (const rid of [0, 1]) {
                const target = realms[String(rid)];
                for (const key of collectKeys(provider, rid)) {
                    const raw = readRawValue(key);
                    if (raw !== undefined) target[key] = raw;
                }
            }
        } else {
            for (const key of collectKeys(provider, null)) {
                const raw = readRawValue(key);
                if (raw !== undefined) global[key] = raw;
            }
        }
    }
    return { realms, global };
}

export function downloadSettingsData() {
    const data = collectSettingsData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const payload = {
        app: 'autoMaxPPHPL',
        type: 'settings-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        realms: data.realms,
        global: data.global
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SC_Settings_Backup_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return payload;
}

// 解析备份文件（不写入）；返回 {realms, global} 或抛错
export function parseSettingsFile(file, onDone) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result));
            if (!parsed || typeof parsed !== 'object' ||
                !parsed.realms || typeof parsed.realms !== 'object' ||
                !parsed.global || typeof parsed.global !== 'object') {
                throw new Error('备份文件格式不正确');
            }
            onDone(null, { realms: parsed.realms, global: parsed.global });
        } catch (e) {
            onDone(e);
        }
    };
    reader.onerror = () => onDone(new Error('读取文件失败'));
    reader.readAsText(file);
}

// 写入备份数据（覆盖），返回写入项数
export function applySettingsData(data) {
    let count = 0;
    for (const rid of ['0', '1']) {
        const bucket = data.realms[rid];
        if (bucket && typeof bucket === 'object') {
            for (const key of Object.keys(bucket)) {
                if (typeof bucket[key] === 'string') {
                    localStorage.setItem(key, bucket[key]);
                    count += 1;
                }
            }
        }
    }
    if (data.global && typeof data.global === 'object') {
        for (const key of Object.keys(data.global)) {
            if (typeof data.global[key] === 'string') {
                localStorage.setItem(key, data.global[key]);
                count += 1;
            }
        }
    }
    return count;
}

// ---------- 云端备注备份（游戏备注作每用户独立存储） ----------
// 写备注由用户手动完成；插件只负责生成文本与读取导入。
const CLOUD_NOTE_LIMIT = 1900; // 游戏备注输入上限 2000，留余量
// 备份标记：置于编码文本前后各一个，导入时取两个标记之间的内容——
// 允许同一备注框里同时存在普通备注与备份文本（互相不覆盖）
const CLOUD_NOTE_MARKER = 'SC-BACKUP-1:';

function hasRiskChars(s) {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 32 || c === 127 || (c >= 0xD800 && c <= 0xDFFF)) return true;
    }
    return false;
}

export function encodeSettingsNote() {
    const body = lzCompressToBase64(JSON.stringify(buildNotePayload()));
    return CLOUD_NOTE_MARKER + body + CLOUD_NOTE_MARKER;
}

// 高压缩版：UTF-16 优先；若输出含控制符/代理对（粘贴有损风险），自动降级为 Base64
export function encodeSettingsNoteHigh() {
    const payload = JSON.stringify(buildNotePayload());
    const u16 = lzCompressToUTF16(payload);
    if (hasRiskChars(u16)) {
        return { text: CLOUD_NOTE_MARKER + lzCompressToBase64(payload) + CLOUD_NOTE_MARKER, mode: 'base64' };
    }
    return { text: CLOUD_NOTE_MARKER + u16 + CLOUD_NOTE_MARKER, mode: 'utf16' };
}

function buildNotePayload() {
    const data = collectSettingsData();
    return {
        app: 'autoMaxPPHPL',
        type: 'settings-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        realms: data.realms,
        global: data.global
    };
}

export function decodeSettingsNote(text) {
    if (!text) throw new Error('备注内容为空');
    const raw = String(text);
    // 取两个标记之间的内容（普通备注可与备份文本共存于同一备注框）
    const firstIdx = raw.indexOf(CLOUD_NOTE_MARKER);
    const lastIdx = raw.lastIndexOf(CLOUD_NOTE_MARKER);
    if (firstIdx < 0 || lastIdx <= firstIdx) throw new Error('未检测到备份标记');
    const body = raw.slice(firstIdx + CLOUD_NOTE_MARKER.length, lastIdx);
    // 自动识别：先试 base64（剥离空白），再试 UTF-16（保留原字符）
    const attempts = [
        () => lzDecompressFromBase64(body.replace(/\s+/g, '')),
        () => lzDecompressFromUTF16(body)
    ];
    let lastErr = null;
    for (const fn of attempts) {
        try {
            const json = fn();
            if (!json) continue;
            const parsed = JSON.parse(json);
            if (!parsed || typeof parsed.realms !== 'object' || typeof parsed.global !== 'object') continue;
            return { realms: parsed.realms, global: parsed.global };
        } catch (e) {
            lastErr = e;
        }
    }
    throw new Error('备注内容无法解压');
}

export function cloudNoteLimit() {
    return CLOUD_NOTE_LIMIT;
}

window.SC_ExportInfo = {
    registerExportInfo,
    collectExportData,
    downloadExportData,
    collectSettingsData,
    downloadSettingsData,
    parseSettingsFile,
    applySettingsData,
    encodeSettingsNote,
    encodeSettingsNoteHigh,
    decodeSettingsNote
};
