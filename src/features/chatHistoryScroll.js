import './pageModuleConfig.js';

const ROOM = '.e1llepen1 [role="region"][tabindex="0"]';
const EXPAND = ':scope > div:last-child > div > button[type="button"][role="button"]';
const INTENT_MS = 750;
const WHEEL_GESTURE_IDLE_MS = INTENT_MS;
const REQUEST_START_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 30000;
const TOP_PX = 4;

let listeners;
let intent;
let touch;
let wheelGesture;
let restoreFocus;
let observerHookInstalled = false;
let historyStates = new WeakMap();
let permission;
const historyObservers = new WeakMap();
const activeHistoryRequests = new Set();

function roomOf(target) {
    return target?.closest?.(ROOM);
}

function sameRoom(state) {
    return state.room.isConnected && state.url === location.href &&
        state.label === state.room.getAttribute('aria-label');
}

function nearTop(room) {
    // In the game's column-reverse list, scrollTop is zero at the newest message.
    const max = Math.max(0, room.scrollHeight - room.clientHeight);
    const reversed = getComputedStyle(room).flexDirection === 'column-reverse';
    return (reversed ? max + room.scrollTop : room.scrollTop) <= TOP_PX;
}

function historyRoom(target) {
    const room = target?.parentElement;
    return room?.matches?.(ROOM) && target === room.lastElementChild &&
        room.querySelector('.e1llepen2') ? room : null;
}

function historyLoading(room) {
    // The native sentinel contains either the expand control, a loader, or nothing.
    return !!room.lastElementChild?.firstElementChild && !room.querySelector(EXPAND);
}

function historyState(room) {
    let state = historyStates.get(room);
    if (!state || !sameRoom(state)) {
        if (state) stopHistoryRequest(state);
        const label = room.getAttribute('aria-label');
        state = {
            room, url: location.href, label, until: 0,
            initial: !state || state.label !== label
        };
        historyStates.set(room, state);
    }
    return state;
}

function stopHistoryRequest(state) {
    if (!state.requestPending) return;
    state.requestPending = false;
    state.loadingSeen = false;
    clearTimeout(state.requestTimer);
    state.requestTimer = null;
    state.requestObserver?.disconnect();
    state.requestObserver = null;
    activeHistoryRequests.delete(state);
    if (wheelGesture?.room === state.room) wheelGesture = null;
}

function armHistoryRequest(state) {
    state.requestPending = true;
    state.awaitingObserver = true;
    state.loadingSeen = false;
    activeHistoryRequests.add(state);
    state.requestTimer = setTimeout(() => stopHistoryRequest(state), REQUEST_START_TIMEOUT_MS);
}

function watchHistoryRequest(state) {
    const check = () => {
        if (!state.requestPending) return;
        if (!sameRoom(state)) {
            stopHistoryRequest(state);
            return;
        }
        if (historyLoading(state.room)) {
            if (!state.loadingSeen) {
                state.loadingSeen = true;
                clearTimeout(state.requestTimer);
                state.requestTimer = setTimeout(() => stopHistoryRequest(state), REQUEST_TIMEOUT_MS);
            }
        } else if (state.loadingSeen) stopHistoryRequest(state);
    };

    state.awaitingObserver = false;
    state.loadingSeen = historyLoading(state.room);
    clearTimeout(state.requestTimer);
    state.requestTimer = setTimeout(() => stopHistoryRequest(state),
        state.loadingSeen ? REQUEST_TIMEOUT_MS : REQUEST_START_TIMEOUT_MS);
    if (typeof MutationObserver === 'function') {
        state.requestObserver = new MutationObserver(check);
        state.requestObserver.observe(state.room, { childList: true, subtree: true });
    }
}

function clearPermission() {
    if (!permission) return;
    const state = permission;
    state.until = 0;
    permission = null;
    if (!state.requestPending || !state.awaitingObserver) return;
    if (historyLoading(state.room)) {
        watchHistoryRequest(state);
    } else stopHistoryRequest(state);
}

function nextWheelGesture(room) {
    const now = performance.now();
    if (!wheelGesture || !sameRoom(wheelGesture) || wheelGesture.room !== room ||
        now - wheelGesture.lastAt > WHEEL_GESTURE_IDLE_MS) {
        wheelGesture = {
            room, url: location.href, label: room.getAttribute('aria-label'),
            lastAt: now, granted: false
        };
    } else wheelGesture.lastAt = now;
    return wheelGesture;
}

function permitHistory(room) {
    const state = historyState(room);
    if (state.requestPending || historyLoading(room)) return false;
    clearPermission();
    permission = state;
    permission.initial = false;
    permission.until = performance.now() + INTENT_MS;
    armHistoryRequest(state);
    return true;
}

function trackHistoryTarget(record, target) {
    const room = historyRoom(target);
    if (!room) return;
    record.rooms.set(target, { room, url: location.href, label: room.getAttribute('aria-label') });
    let observers = historyObservers.get(target);
    if (!observers) historyObservers.set(target, observers = new Set());
    observers.add(record);
}

function forgetHistoryTarget(record, target) {
    const observers = historyObservers.get(target);
    observers?.delete(record);
    if (observers?.size === 0) historyObservers.delete(target);
}

function allowHistoryEntry(record, entry) {
    const room = historyRoom(entry.target);
    let owner = record.rooms.get(entry.target);
    if (!room && !owner) return true;
    if (!owner && room) {
        trackHistoryTarget(record, entry.target);
        owner = record.rooms.get(entry.target);
    }
    if (!entry.isIntersecting && record.targets.has(entry.target) && owner) {
        const state = historyStates.get(owner.room);
        if (state?.awaitingObserver && permission === state) {
            stopHistoryRequest(state);
            clearPermission();
        }
        return false;
    }
    if (!record.targets.has(entry.target) || !room || !sameRoom(owner)) return false;

    const state = historyState(room);
    if (state.requestPending && (!state.awaitingObserver || permission !== state)) return false;
    const awaitingRequest = state.requestPending;
    const initial = state.initial;
    state.initial = false;
    if (historyLoading(room) || room.querySelector(EXPAND)) {
        state.until = 0;
        return false;
    }
    if (!initial && (document.hidden || !state.until || performance.now() > state.until)) return false;

    state.until = 0;
    if (awaitingRequest) state.awaitingObserver = false;
    if (permission === state) permission = null;
    if (intent?.room === room) intent = null;
    watchHistoryRequest(state);
    return true;
}

function installHistoryGuard() {
    if (observerHookInstalled) return;
    const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const NativeObserver = pageWindow.IntersectionObserver;
    if (typeof NativeObserver !== 'function') return;
    const records = new WeakMap();
    class HistoryObserver extends NativeObserver {
        constructor(callback, options) {
            const record = { observer: null, targets: new Set(), rooms: new WeakMap() };
            super(typeof callback !== 'function' ? callback : (entries, observer) => {
                if (!listeners) return callback.call(observer, entries, observer);
                const allowed = entries.filter(entry => allowHistoryEntry(record, entry));
                if (allowed.length) callback.call(observer, allowed.length === entries.length ? entries : allowed, observer);
            }, options);
            record.observer = this;
            records.set(this, record);
        }

        observe(target) {
            super.observe(target);
            const record = records.get(this);
            record.targets.add(target);
            trackHistoryTarget(record, target);
        }

        unobserve(target) {
            super.unobserve(target);
            const record = records.get(this);
            record.targets.delete(target);
            forgetHistoryTarget(record, target);
        }

        disconnect() {
            super.disconnect();
            const record = records.get(this);
            for (const target of record.targets) forgetHistoryTarget(record, target);
            record.targets.clear();
        }
    }
    // Existing native observers stay alive when disabled; the adapter then forwards unchanged.
    pageWindow.IntersectionObserver = HistoryObserver;
    observerHookInstalled = true;
}

function recheckHistory(room) {
    const target = room.lastElementChild;
    for (const record of [...(historyObservers.get(target) || [])]) {
        const owner = record.rooms.get(target);
        if (!record.targets.has(target) || owner?.label !== room.getAttribute('aria-label')) continue;
        record.observer.unobserve(target);
        record.observer.observe(target);
    }
}

function preserveInputFocus(room) {
    const input = document.activeElement;
    if (!input?.matches('input, textarea') && !input?.isContentEditable) return;

    restoreFocus?.();
    const focus = new AbortController();
    const options = { capture: true, signal: focus.signal };
    const timer = setTimeout(stop, 1000);
    restoreFocus = stop;
    room.addEventListener('focus', () => {
        stop();
        if (input.isConnected) input.focus({ preventScroll: true });
    }, { signal: focus.signal });
    // A new user action takes precedence over the prior focus.
    document.addEventListener('pointerdown', stop, options);
    document.addEventListener('keydown', stop, options);

    function stop() {
        clearTimeout(timer);
        focus.abort();
        restoreFocus = null;
    }
}

function expandAtTop(room) {
    if (intent?.room !== room || !sameRoom(intent) || performance.now() > intent.until) return;
    const { button, gesture } = intent;
    if (gesture?.granted) {
        intent = null;
        return;
    }
    if (document.hidden || historyState(room).requestPending || historyLoading(room) || !nearTop(room)) return;
    if (button && (button !== room.querySelector(EXPAND) || button.disabled ||
        button.closest('[hidden], [aria-hidden="true"], [inert]') || !button.getClientRects().length ||
        getComputedStyle(button).visibility !== 'visible')) return;
    intent = null;
    if (gesture) gesture.granted = true;
    if (!permitHistory(room)) return;
    if (button) {
        preserveInputFocus(room);
        button.click();
    } else recheckHistory(room);
}

function scrollTowardHistory(room, gesture) {
    if (!room?.querySelector('.e1llepen2')) return;
    if (gesture?.granted) {
        intent = null;
        return;
    }
    if (historyState(room).requestPending) {
        intent = null;
        return;
    }
    if (historyLoading(room)) {
        intent = null;
        clearPermission();
        return;
    }
    const button = room.querySelector(EXPAND);
    intent = {
        room, button, gesture, url: location.href,
        label: room.getAttribute('aria-label'), until: performance.now() + INTENT_MS
    };
    expandAtTop(room);
}

function onClick(event) {
    if (!event.isTrusted || document.hidden) return;
    const button = event.target?.closest?.('button[type="button"][role="button"]');
    const room = roomOf(button);
    if (!room || button !== room.querySelector(EXPAND) || button.disabled) return;
    intent = null;
    permitHistory(room);
}

function onWheel(event) {
    if (!event.isTrusted || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (event.deltaY < 0) {
        const room = roomOf(event.target);
        if (room) scrollTowardHistory(room, nextWheelGesture(room));
    }
    else {
        intent = null;
        wheelGesture = null;
        clearPermission();
    }
}

function onScroll(event) {
    if (event.target === intent?.room) expandAtTop(event.target);
}

function onKeyDown(event) {
    if (!event.isTrusted || event.repeat || !['ArrowUp', 'PageUp', 'Home'].includes(event.key) ||
        event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const room = roomOf(event.target);
    if (room) scrollTowardHistory(room, {
        room, url: location.href, label: room.getAttribute('aria-label'), granted: false
    });
}

function onTouchStart(event) {
    intent = touch = null;
    const room = roomOf(event.target);
    if (!event.isTrusted || !room || event.touches.length !== 1) return;
    const point = event.touches[0];
    touch = {
        room, url: location.href, label: room.getAttribute('aria-label'), id: point.identifier,
        x: point.clientX, y: point.clientY, granted: false
    };
}

function onTouchMove(event) {
    if (!event.isTrusted || !touch || !sameRoom(touch) || event.touches.length !== 1) return;
    const point = event.touches[0];
    if (point.identifier !== touch.id) return;
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return;
    touch.x = point.clientX;
    touch.y = point.clientY;
    if (dy > Math.abs(dx)) scrollTowardHistory(touch.room, touch);
    else {
        intent = null;
        clearPermission();
    }
}

function resetGesture() {
    intent = touch = null;
    wheelGesture = null;
    clearPermission();
    restoreFocus?.();
}

function init() {
    if (listeners) return;
    listeners = new AbortController();
    installHistoryGuard();
    const options = { capture: true, passive: true, signal: listeners.signal };
    document.addEventListener('wheel', onWheel, options);
    document.addEventListener('click', onClick, options);
    document.addEventListener('scroll', onScroll, options);
    document.addEventListener('keydown', onKeyDown, options);
    document.addEventListener('touchstart', onTouchStart, options);
    document.addEventListener('touchmove', onTouchMove, options);
    document.addEventListener('touchend', () => { touch = null; }, options);
    document.addEventListener('touchcancel', resetGesture, options);
    document.addEventListener('visibilitychange', resetGesture, options);
    window.addEventListener('pagehide', resetGesture, options);
}

function destroy() {
    listeners?.abort();
    listeners = null;
    resetGesture();
    for (const state of activeHistoryRequests) stopHistoryRequest(state);
    historyStates = new WeakMap();
}

function refresh() {
    if (window.isPageModuleEnabled('chatHistoryScroll')) init();
    else destroy();
}

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.chatHistoryScroll = { init, destroy, refresh };
refresh();
