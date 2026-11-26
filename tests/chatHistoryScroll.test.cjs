const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/features/chatHistoryScroll.js'), 'utf8')
    .replace("import './pageModuleConfig.js';", '');

function harness({ expanded = false, pulled = true, nativeBusyGuard = true } = {}) {
    const h = { expanded, pulled, loading: false, loadingIndicator: false, full: false, enabled: true, now: 100,
        nativeBusyGuard,
        loads: 0, clicks: 0, queue: [], handlers: new Map(), observers: [], mutations: [], timers: new Map(), nextTimer: 0 };
    const add = (owner, type, callback, options = {}) => {
        const key = owner + ':' + type;
        const handlers = h.handlers.get(key) || new Set();
        handlers.add(callback);
        h.handlers.set(key, handlers);
        options.signal?.addEventListener('abort', () => handlers.delete(callback), { once: true });
    };
    h.room = { isConnected: true, label: 'Room A', scrollTop: -700, scrollHeight: 1000, clientHeight: 300,
        getAttribute() { return this.label; },
        matches(selector) { return selector.includes('.e1llepen1'); },
        closest(selector) { return this.matches(selector) ? this : null; },
        querySelector(selector) {
            if (selector === '.e1llepen2') return {};
            return !h.expanded && h.pulled && !h.loading ? h.button : null;
        },
        addEventListener: (...args) => add('room', ...args)
    };
    h.top = { parentElement: h.room, get firstElementChild() {
        return h.loadingIndicator ? {} : h.room.querySelector('expand');
    } };
    h.room.lastElementChild = h.top;
    h.button = { disabled: false,
        closest(selector) {
            if (selector.includes('.e1llepen1')) return h.room;
            return selector.startsWith('button') ? this : null;
        },
        getClientRects: () => [{}],
        click() { h.clicks++; h.expanded = true; h.rebuild(); }
    };
    class NativeObserver {
        constructor(callback, options) {
            if (typeof callback !== 'function') throw new TypeError('callback');
            this.callback = callback;
            this.options = options;
            this.targets = new Set();
            h.observers.push(this);
        }
        observe(target) {
            this.targets.add(target);
            const intersecting = target !== h.top || h.room.scrollTop <= -696;
            h.queue.push(() => this.callback([{ target, isIntersecting: intersecting }], this));
        }
        unobserve(target) { this.targets.delete(target); }
        disconnect() { this.targets.clear(); }
        takeRecords() { return []; }
    }
    h.NativeObserver = NativeObserver;
    class TestMutationObserver {
        constructor(callback) { this.callback = callback; this.target = null; h.mutations.push(this); }
        observe(target) { this.target = target; }
        disconnect() { this.target = null; }
    }
    h.document = { hidden: false, activeElement: null, addEventListener: (...args) => add('doc', ...args) };
    h.window = { IntersectionObserver: NativeObserver, isPageModuleEnabled: () => h.enabled,
        addEventListener: (...args) => add('win', ...args) };
    h.location = { href: 'https://www.simcompanies.com/chat/' };
    const ctx = { window: h.window, unsafeWindow: h.window, document: h.document, location: h.location,
        MutationObserver: TestMutationObserver,
        AbortController, performance: { now: () => h.now },
        getComputedStyle: target => target === h.room ? { flexDirection: 'column-reverse' } : { visibility: 'visible' },
        setTimeout(callback, delay = 0) { const id = ++h.nextTimer; h.timers.set(id, { callback, at: h.now + delay }); return id; },
        clearTimeout: id => h.timers.delete(id)
    };
    vm.runInNewContext(source, ctx);
    h.module = h.window.SC_Modules.chatHistoryScroll;
    h.flush = () => { while (h.queue.length) h.queue.shift()(); };
    h.notifyMutation = () => {
        for (const observer of [...h.mutations]) if (observer.target === h.room) observer.callback([], observer);
    };
    h.advance = milliseconds => {
        const end = h.now + milliseconds;
        while (true) {
            const next = [...h.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            h.now = next[1].at;
            h.timers.delete(next[0]);
            next[1].callback();
        }
        h.now = end;
    };
    h.event = (type, props = {}) => {
        const event = { target: h.room, isTrusted: true, deltaX: 0, deltaY: -1, ctrlKey: false, ...props };
        for (const callback of [...(h.handlers.get('doc:' + type) || [])]) callback(event);
    };
    h.rebuild = () => {
        h.current?.unobserve(h.top);
        h.current = new h.window.IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting && (h.expanded || !h.pulled) && !h.full &&
                (!h.nativeBusyGuard || !h.loading)) {
                h.loads++;
                h.loading = true;
                if (h.nativeBusyGuard) h.loadingIndicator = true;
                h.notifyMutation();
            }
        });
        h.current.observe(h.top);
    };
    h.complete = () => {
        h.loading = false; h.loadingIndicator = false; h.pulled = true; h.notifyMutation();
        h.rebuild(); h.flush();
    };
    h.manualClick = () => { h.event('click', { target: h.button }); h.button.click(); h.flush(); };
    h.listenerCount = () => [...h.handlers.values()].reduce((total, handlers) => total + handlers.size, 0);
    h.mutationObserverCount = () => h.mutations.filter(observer => observer.target === h.room).length;
    return h;
}

test('手动展开只加载一批，等待及加载中的手势不累积下一批', () => {
    const h = harness();
    h.rebuild(); h.flush();
    assert.equal(h.loads, 0);
    h.manualClick();
    assert.equal(h.loads, 1);
    h.event('wheel');
    h.complete();
    assert.equal(h.loads, 1);
    h.event('scroll'); h.rebuild(); h.flush();
    assert.equal(h.loads, 1);
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
    assert.equal(h.clicks, 1);
});

test('加载完成后无须等待750毫秒即可继续加载', () => {
    const h = harness();
    h.rebuild(); h.flush();
    h.event('wheel'); h.flush();
    assert.equal(h.clicks, 1);
    assert.equal(h.loads, 1);
    h.complete();
    assert.equal(h.loads, 1);
    h.event('wheel'); h.flush(); h.complete();
    assert.equal(h.loads, 2);
    assert.equal(h.clicks, 1);
});

test('原生观察器回调尚未到达时的重复上滚不会重复授权', () => {
    const h = harness();
    h.rebuild(); h.flush();
    h.event('wheel');
    h.event('keydown', { key: 'PageUp' });
    h.flush();
    assert.equal(h.clicks, 1);
    assert.equal(h.loads, 1);
});

test('同一段连续上滚只允许一次，即使加载指示尚未渲染', () => {
    const h = harness();
    h.rebuild(); h.flush(); h.manualClick(); h.complete();
    h.nativeBusyGuard = false;
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
    h.advance(500);
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
    h.advance(751);
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
    h.loadingIndicator = true;
    h.notifyMutation();
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
    h.complete();
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 3);
});

test('加载状态未出现时有超时恢复，完成后无需等待冷却即可继续加载', () => {
    const h = harness({ nativeBusyGuard: false });
    h.rebuild(); h.flush(); h.manualClick();
    assert.equal(h.loads, 1);
    h.advance(4999);
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 1);
    h.advance(1);
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
});

test('授权后哨兵已离开视口时释放锁，重新到顶可加载', () => {
    const h = harness();
    h.rebuild(); h.flush(); h.manualClick(); h.complete();
    h.room.scrollTop = -650;
    h.event('wheel');
    h.flush();
    assert.equal(h.loads, 1);
    h.room.scrollTop = -700;
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
});

test('同一次触摸上滑只允许一批历史加载', () => {
    const h = harness();
    h.rebuild(); h.flush(); h.manualClick(); h.complete();
    const move = clientY => h.event('touchmove', {
        touches: [{ identifier: 1, clientX: 10, clientY }]
    });
    h.event('touchstart', { touches: [{ identifier: 1, clientX: 10, clientY: 10 }] });
    move(40); h.flush();
    assert.equal(h.loads, 2);
    move(70); h.flush();
    assert.equal(h.loads, 2);
});

test('首次进入的原生初次拉取正常，完成后不会连续拉取', () => {
    const h = harness({ pulled: false });
    h.rebuild(); h.flush();
    assert.equal(h.loads, 1);
    h.complete();
    assert.equal(h.loads, 1);
    h.manualClick();
    assert.equal(h.loads, 2);
});

test('未到顶部、程序滚动、水平滚动和合成手势不授权历史加载', () => {
    const h = harness();
    h.rebuild(); h.flush(); h.manualClick(); h.complete();
    h.room.scrollTop = -500;
    h.event('wheel');
    h.now += 751;
    h.room.scrollTop = -700;
    h.event('scroll'); h.flush();
    h.event('wheel', { isTrusted: false }); h.flush();
    h.event('wheel', { deltaX: 10 }); h.flush();
    h.event('wheel', { ctrlKey: true }); h.flush();
    assert.equal(h.loads, 1);
    h.room.scrollTop = -500; h.event('wheel');
    h.room.scrollTop = -700; h.event('scroll'); h.flush();
    assert.equal(h.loads, 2);
});

test('向下滚动、切换标签页和过期许可取消待触发的加载', () => {
    for (const cancel of [h => h.event('wheel', { deltaY: 1 }), h => h.event('visibilitychange'), h => { h.now += 751; }]) {
        const h = harness();
        h.rebuild(); h.flush(); h.manualClick(); h.complete();
        h.event('wheel'); cancel(h); h.flush();
        assert.equal(h.loads, 1);
    }
});

test('房间复用、SPA 跳转和断开的节点不会执行旧观察器回调', () => {
    for (const change of [h => { h.room.label = 'Room B'; }, h => { h.location.href += 'other/'; }, h => { h.room.isConnected = false; }]) {
        const h = harness();
        h.rebuild(); h.flush(); h.manualClick(); h.complete();
        h.event('wheel'); change(h); h.flush();
        assert.equal(h.loads, 1);
    }
});

test('已 unobserve 或 disconnect 的排队回调不会复活或发起请求', () => {
    for (const stop of [h => h.current.unobserve(h.top), h => h.current.disconnect()]) {
        const h = harness();
        h.rebuild(); h.flush(); h.manualClick(); h.complete();
        h.event('wheel'); stop(h); h.flush();
        assert.equal(h.loads, 1);
        h.event('wheel'); h.flush();
        assert.equal(h.loads, 1);
    }
});

test('关闭后原生观察器照常运行，重复启停不增加监听或包装层', () => {
    const h = harness();
    const installed = h.window.IntersectionObserver;
    const listeners = h.listenerCount();
    h.module.init();
    assert.equal(h.listenerCount(), listeners);
    h.rebuild(); h.flush(); h.manualClick(); h.complete();
    h.enabled = false; h.module.refresh();
    assert.equal(h.listenerCount(), 0);
    h.rebuild(); h.flush();
    assert.equal(h.loads, 2);
    h.loading = false;
    h.enabled = true; h.module.refresh();
    assert.equal(h.window.IntersectionObserver, installed);
    assert.equal(h.listenerCount(), listeners);
    h.event('wheel'); h.flush(); h.complete();
    assert.equal(h.loads, 3);
});

test('其他页面的观察器参数、this、实例类型及通知保持原样', () => {
    const h = harness();
    const target = {};
    const entries = [{ target, isIntersecting: false }];
    const options = { rootMargin: '10px', threshold: [0, 1] };
    let calls = 0;
    const observer = new h.window.IntersectionObserver(function (received, instance) {
        assert.equal(this, observer);
        assert.equal(instance, observer);
        assert.equal(received, entries);
        calls++;
    }, options);
    assert.ok(observer instanceof h.NativeObserver);
    assert.equal(observer.options, options);
    observer.callback(entries, observer);
    assert.equal(calls, 1);
    assert.throws(() => new h.window.IntersectionObserver(null), TypeError);
});

test('键盘和手机触摸继续支持，每次触发只加载一批', () => {
    const h = harness();
    h.rebuild(); h.flush();
    h.event('keydown', { key: 'PageUp' }); h.flush(); h.complete();
    assert.equal(h.loads, 1);
    h.event('keydown', { key: 'PageUp', repeat: true }); h.flush();
    assert.equal(h.loads, 1);
    h.event('touchstart', { touches: [{ identifier: 1, clientX: 10, clientY: 10 }] });
    h.event('touchmove', { touches: [{ identifier: 1, clientX: 10, clientY: 40 }] });
    h.flush(); h.complete();
    assert.equal(h.loads, 2);
});

test('加载失败后再次上滚可以重试，历史到底后不产生新请求', () => {
    const h = harness();
    h.rebuild(); h.flush(); h.manualClick();
    h.loading = false;
    h.loadingIndicator = false;
    h.notifyMutation();
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
    h.full = true; h.complete();
    h.event('wheel'); h.flush();
    assert.equal(h.loads, 2);
});
