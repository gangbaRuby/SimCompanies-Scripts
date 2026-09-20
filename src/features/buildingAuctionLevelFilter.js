const AUCTIONS_URL = '/api/v2/building-auctions/';
const PANEL_ID = 'sc-building-auction-level-filter';
const MIN_ID = 'sc-building-auction-min-level';
const MAX_ID = 'sc-building-auction-max-level';
const ROBOTS_ID = 'sc-building-auction-robots';
const BIDS_ID = 'sc-building-auction-hide-bids';
const HIDDEN_ATTR = 'data-sc-building-auction-hidden';
const RANGE_KEY = 'SC_BuildingAuctionLevelRange';

const state = {
    auctions: new Map(),
    observer: null,
    renderTimer: null,
    min: null,
    max: null
    ,robotsOnly: false
    ,hideBids: false
    ,viewMode: null
    ,viewListener: null
};

function isAuctionListPage() {
    return /\/market\/building-auctions\/?$/.test(location.pathname);
}

function isMyBidsView() {
    const selectedRadio = document.querySelector('input[type="radio"][value="2"]:checked');
    if (selectedRadio) return true;
    const checked = document.querySelector('[role="radio"][aria-checked="true"]');
    return /my\s+bids|我的出价|我的竞标|我的投标/i.test(checked?.textContent || '');
}

function isAllView() {
    if (state.viewMode !== null) return state.viewMode === 0;
    const selectedRadio = document.querySelector('input[type="radio"][value="0"]:checked');
    if (selectedRadio) return true;
    const checked = document.querySelector('[role="radio"][aria-checked="true"]');
    return !!checked && /\ball\b|全部|所有/i.test(checked.textContent || '');
}

function updateViewModeFromDom() {
    const selectedRadio = document.querySelector('input[type="radio"]:checked');
    if (selectedRadio && ['0', '1', '2'].includes(selectedRadio.value)) {
        state.viewMode = Number(selectedRadio.value);
        return;
    }
    const checked = document.querySelector('[role="radio"][aria-checked="true"]');
    const text = checked?.textContent || '';
    if (/my\s+bids|我的出价|我的竞标|我的投标/i.test(text)) state.viewMode = 2;
    else if (/my\s+auctions|我的拍卖/i.test(text)) state.viewMode = 1;
    else if (/\ball\b|全部|所有/i.test(text)) state.viewMode = 0;
}

function handleViewClick(event) {
    const target = event.target.closest?.('button, label, [role="radio"], [role="tab"]') || event.target.parentElement;
    if (!target) return;
    const text = `${target.textContent || ''} ${target.getAttribute?.('aria-label') || ''}`;
    if (/my\s+bids|我的出价|我的竞标|我的投标/i.test(text)) state.viewMode = 2;
    else if (/my\s+auctions|我的拍卖/i.test(text)) state.viewMode = 1;
    else if (/\ball\b|全部|所有/i.test(text)) state.viewMode = 0;
    scheduleRender();
}

function auctionIdFromHref(href) {
    const match = String(href || '').match(/\/market\/building-auction\/(\d+)\/?(?:[?#].*)?$/);
    return match ? match[1] : null;
}

function hasBuildingRobots(auction) {
    return auction && Object.prototype.hasOwnProperty.call(auction, 'buildingRobots') &&
        typeof auction.buildingRobots === 'number' && Number.isFinite(auction.buildingRobots);
}

function cardHasBid(card) {
    return /你出的最高價|你的最高出价|Your max bid/i.test(card.textContent || '');
}

function rememberAuctions(data) {
    if (data && !Array.isArray(data)) {
        data = data.buildingAuctions;
    }
    if (!Array.isArray(data)) return;
    for (const auction of data) {
        const id = auction && auction.id;
        const level = Number(auction && auction.buildingSize);
        if (id != null && Number.isInteger(level) && level > 0) {
            state.auctions.set(String(id), {
                level,
                robots: hasBuildingRobots(auction)
            });
        }
    }
    scheduleRender();
}

function readStoredRange() {
    try {
        const value = JSON.parse(localStorage.getItem(RANGE_KEY) || '{}');
        state.min = readLevel(String(value.min ?? ''));
        state.max = readLevel(String(value.max ?? ''));
        state.robotsOnly = value.robotsOnly === true;
        state.hideBids = value.hideBids === true;
        if (state.min !== null && state.max !== null && state.min > state.max) {
            [state.min, state.max] = [state.max, state.min];
        }
    } catch (_) {
        state.min = null;
        state.max = null;
    }
}

function storeRange() {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ min: state.min, max: state.max, robotsOnly: state.robotsOnly, hideBids: state.hideBids }));
}

function hasActiveFilters() {
    return state.min !== null || state.max !== null || state.robotsOnly;
}

function hasAnyCustomFilter() {
    return hasActiveFilters() || state.hideBids;
}

function getFilterAuctionsText() {
    const link = document.querySelector('a[href*="/market/building-auctions/filter-settings/"]');
    return link?.textContent?.trim() || 'Filter Auctions';
}

function getBuildingAuctionsText() {
    const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find(element => {
        const text = element.textContent?.trim() || '';
        return /building auctions|建築拍賣|建筑拍卖/i.test(text);
    });
    const text = heading?.textContent?.trim() || 'Building auctions';
    const parts = text.split(/\s+/);
    if (parts.length % 2 === 0) {
        const half = parts.length / 2;
        if (parts.slice(0, half).join(' ') === parts.slice(half).join(' ')) {
            return parts.slice(0, half).join(' ');
        }
    }
    return text;
}

function updatePanelHint(allView) {
    const hint = document.querySelector(`#${PANEL_ID} [data-sc-auction-refresh-hint]`);
    if (!hint) return;
    const buttonText = getFilterAuctionsText();
    const pageText = getBuildingAuctionsText();
    hint.textContent = `设置后需点击“${buttonText}”按钮，再返回生效；切换到“${pageText}”的其它视图需要取消勾选，否则会显示不全`;
}

function filterAuctionPayload(data) {
    if (!isAllView()) return data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.buildingAuctions)) return data;
    return {
        ...data,
        buildingAuctions: data.buildingAuctions.filter(auction => {
            const level = Number(auction && auction.buildingSize);
            return Number.isInteger(level) && matchesRange(level) && (!state.robotsOnly || hasBuildingRobots(auction));
        })
    };
}

function captureResponse(response) {
    try {
        response.clone().json().then(rememberAuctions).catch(() => {});
    } catch (_) {
        // A response may not support cloning during navigation.
    }
}

async function filteredFetchResponse(response) {
    if (!hasActiveFilters()) return response;
    try {
        const payload = await response.clone().json();
        const filtered = filterAuctionPayload(payload);
        return new Response(JSON.stringify(filtered), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    } catch (_) {
        return response;
    }
}

function installNetworkCapture() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (!url) return response;
        if (!url.includes(AUCTIONS_URL)) return response;
        captureResponse(response);
        return filteredFetchResponse(response);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__scAuctionUrl = url;
        if (String(url).includes(AUCTIONS_URL)) {
            try {
                const textDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
                const responseDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
                if (textDescriptor?.get) {
                    Object.defineProperty(this, 'responseText', {
                        configurable: true,
                        get: () => transformXhrValue(textDescriptor.get.call(this), true)
                    });
                }
                if (responseDescriptor?.get) {
                    Object.defineProperty(this, 'response', {
                        configurable: true,
                        get: () => transformXhrValue(responseDescriptor.get.call(this), false)
                    });
                }
            } catch (_) {
                // Some browsers do not allow overriding XHR response accessors.
            }
        }
        return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (this.__scAuctionUrl && String(this.__scAuctionUrl).includes(AUCTIONS_URL)) {
            this.addEventListener('load', () => {
                try {
                    rememberAuctions(JSON.parse(this.responseText));
                } catch (_) {
                    // Ignore non-JSON or unavailable responses.
                }
            }, { once: true });
        }
        return originalSend.apply(this, args);
    };
}

function transformXhrValue(value, textResponse) {
    if (!hasActiveFilters()) return value;
    try {
        const payload = textResponse ? JSON.parse(value) : value;
        const filtered = filterAuctionPayload(payload);
        return textResponse ? JSON.stringify(filtered) : filtered;
    } catch (_) {
        return value;
    }
}

function readLevel(value) {
    if (value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeRange() {
    const minInput = document.getElementById(MIN_ID);
    const maxInput = document.getElementById(MAX_ID);
    if (!minInput || !maxInput) return;

    let min = readLevel(minInput.value);
    let max = readLevel(maxInput.value);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    state.min = min;
    state.max = max;
    storeRange();
    if (min !== null) minInput.value = String(min);
    if (max !== null) maxInput.value = String(max);
    scheduleRender();
}

function matchesRange(level) {
    return (state.min === null || level >= state.min) &&
        (state.max === null || level <= state.max);
}

function filterAuctionCards() {
    if (!isAuctionListPage()) return;
    const allView = isAllView();
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
        panel.style.display = 'inline-flex';
    }
    document.querySelectorAll('a[href*="/market/building-auction/"]').forEach(card => {
        const id = auctionIdFromHref(card.getAttribute('href'));
        const info = id ? state.auctions.get(id) : null;
        const hidden = allView && ((info !== undefined && info !== null && (!matchesRange(info.level) || (state.robotsOnly && !info.robots))) ||
            (state.hideBids && cardHasBid(card)));
        if (hidden) {
            card.setAttribute(HIDDEN_ATTR, 'true');
            card.style.display = 'none';
        } else {
            card.removeAttribute(HIDDEN_ATTR);
            card.style.removeProperty('display');
        }
    });
}

function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(filterAuctionCards, 0);
}

function createPanel() {
    if (!isAuctionListPage() || document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'display:inline-flex;gap:7px;align-items:center;flex-wrap:wrap;max-width:100%;margin-left:8px;color:inherit;font-size:13px;line-height:1;vertical-align:middle;';
    panel.innerHTML = '<span style="display:inline-flex;align-items:center;height:26px;white-space:nowrap;">等级</span><input id="' + MIN_ID + '" aria-label="最低等级" type="number" min="1" step="1" inputmode="numeric" placeholder="从" value="' + (state.min ?? '') + '" style="box-sizing:border-box;width:52px;height:26px;margin:0;padding:2px 5px;border:1px solid currentColor;border-radius:2px;background:transparent;color:inherit;line-height:20px;"><span style="display:inline-flex;align-items:center;height:26px;">–</span><input id="' + MAX_ID + '" aria-label="最高等级" type="number" min="1" step="1" inputmode="numeric" placeholder="到" value="' + (state.max ?? '') + '" style="box-sizing:border-box;width:52px;height:26px;margin:0;padding:2px 5px;border:1px solid currentColor;border-radius:2px;background:transparent;color:inherit;line-height:20px;"><label style="display:inline-flex;align-items:center;height:26px;margin:0;white-space:nowrap;"><input id="' + ROBOTS_ID + '" type="checkbox" style="margin:0 4px 0 0;" ' + (state.robotsOnly ? 'checked' : '') + '>机器人建筑</label><label style="display:inline-flex;align-items:center;height:26px;margin:0;white-space:nowrap;"><input id="' + BIDS_ID + '" type="checkbox" style="margin:0 4px 0 0;" ' + (state.hideBids ? 'checked' : '') + '>隐藏已投标</label><span data-sc-auction-refresh-hint style="display:inline-flex;align-items:center;min-height:26px;max-width:100%;opacity:.75;white-space:normal;line-height:18px;"></span>';
    const filterLink = document.querySelector('a[href*="/market/building-auctions/filter-settings/"]');
    if (!filterLink) return;
    filterLink.insertAdjacentElement('afterend', panel);
    panel.querySelectorAll('input[type="number"]').forEach(input => input.addEventListener('change', normalizeRange));
    panel.querySelector('#' + ROBOTS_ID).addEventListener('change', event => {
        state.robotsOnly = event.target.checked;
        storeRange();
        scheduleRender();
    });
    panel.querySelector('#' + BIDS_ID).addEventListener('change', event => {
        state.hideBids = event.target.checked;
        storeRange();
        scheduleRender();
    });
    updatePanelHint(true);
}

function init() {
    if (!isAuctionListPage()) return;
    readStoredRange();
    updateViewModeFromDom();
    document.removeEventListener('click', handleViewClick, true);
    document.addEventListener('click', handleViewClick, true);
    state.viewListener = handleViewClick;
    createPanel();
    state.observer?.disconnect();
    state.observer = new MutationObserver(() => {
        updateViewModeFromDom();
        createPanel();
        scheduleRender();
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    scheduleRender();
}

function destroy() {
    state.observer?.disconnect();
    state.observer = null;
    if (state.viewListener) document.removeEventListener('click', state.viewListener, true);
    state.viewListener = null;
    state.viewMode = null;
    clearTimeout(state.renderTimer);
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach(card => {
        card.removeAttribute(HIDDEN_ATTR);
        card.style.removeProperty('display');
    });
    document.getElementById(PANEL_ID)?.remove();
}

installNetworkCapture();

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.BuildingAuctionLevelFilter = { init, destroy };
