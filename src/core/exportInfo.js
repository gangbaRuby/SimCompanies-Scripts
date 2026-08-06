import { getRealmIdFromLink } from './storage.js';

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

window.SC_ExportInfo = {
    registerExportInfo,
    collectExportData,
    downloadExportData
};
