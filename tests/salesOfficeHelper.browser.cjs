// 本地浏览器验证：Playwright 可通过 NODE_PATH 使用本机已安装的版本，无需改项目依赖。
// 全部地址由 route.fulfill 在本地响应，不连接游戏服务器。
const { chromium } = require('playwright');
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const root = path.resolve(__dirname, '..');
const fixture = readFileSync(path.join(__dirname, 'fixtures/sales-office.html'), 'utf8');
const source = readFileSync(path.join(root, 'src/features/salesOfficeHelper.js'), 'utf8');
const panel = '#sc-sales-office-helper';
const slot = group => `button[data-sc-sales-office-slot="${group}"]`;
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function setup() {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.route('**/*', route => {
        const isImage = route.request().resourceType() === 'image';
        return route.fulfill(isImage ? { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="#758da8"/><path d="M8 20h24M20 8v24" stroke="white" stroke-width="4"/></svg>' } : { contentType: 'text/html', body: fixture });
    });
    await page.goto('https://sales-office.test/b/42/');
    await page.addScriptTag({ content: source });
    await page.evaluate(() => window.SC_Modules.salesOfficeHelper.init());
    await page.waitForSelector(panel);
    return page;
}

test('合并总需求；共享库存只扣一次；剪贴板降级；识别失败时禁止复制', async () => {
    const page = await setup();
    try {
        await page.click('[data-sc-sales-office-copy="total"]');
        assert.equal(await page.evaluate(() => fixture.clipboard), 'BUYING\n:re-97: x280\n:re-98: x60');
        await page.click('[data-sc-sales-office-copy="missing"]');
        assert.equal(await page.evaluate(() => fixture.clipboard), 'BUYING\n:re-97: x180\n:re-98: x20');
        await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
        await page.click('[data-sc-sales-office-copy="total"]');
        assert.equal(await page.evaluate(() => fixture.fallbackCalls), 1);
        await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
        await page.click('[data-sc-sales-office-copy="missing"]');
        assert.equal(await page.evaluate(() => fixture.fallbackCalls), 2);
        await page.evaluate(() => { document.querySelector('.progress > span').textContent = '???'; });
        await page.waitForFunction(() => document.querySelector('[data-sc-sales-office-copy="total"]').disabled);
        assert.equal(await page.isDisabled('[data-sc-sales-office-copy="missing"]'), true);
    } finally { await page.close(); }
});

test('手动点击原按钮，每次只交付一笔；处理中锁定，成功后轮换并刷新库存', async () => {
    const page = await setup();
    try {
        assert.equal(await page.locator(slot('profit')).evaluate(el => el.closest('[data-order]').dataset.order), '1');
        assert.equal(await page.locator(slot('loss')).evaluate(el => el.closest('[data-order]').dataset.order), '2');
        await page.click(slot('profit'));
        await page.waitForFunction(() => !document.querySelector('[data-order="1"]'));
        await page.waitForFunction(() => document.querySelector('button[data-sc-sales-office-slot="profit"]')?.closest('[data-order]').dataset.order === '4');
        assert.deepEqual(await page.evaluate(() => fixture.clicks), [{ id: 1, trusted: true }]);
        assert.equal(await page.locator(slot('loss')).count(), 0);
        await page.click('[data-sc-sales-office-copy="missing"]');
        assert.equal(await page.evaluate(() => fixture.clipboard), 'BUYING\n:re-97: x180\n:re-98: x20');
        await page.click(slot('profit'));
        await page.waitForFunction(() => fixture.clicks.length === 2);
        assert.equal(await page.evaluate(() => fixture.clicks[1].id), 4);
    } finally { await page.close(); }
});

test('失败保留错误和重试位置；未知利润不归类；负零仍归亏损；品质切换重新分类', async () => {
    const page = await setup();
    try {
        await page.evaluate(() => { fixture.outcomes[1] = 'error'; });
        await page.click(slot('profit'));
        await page.waitForFunction(() => document.querySelector('.sc-sales-office-status').textContent.includes('交付失败'));
        assert.equal(await page.locator(slot('profit')).evaluate(el => el.closest('[data-order]').dataset.order), '1');
        await page.evaluate(() => { document.querySelector('[data-order="1"] tbody > tr:last-child td').textContent = '???'; });
        await page.waitForFunction(() => document.querySelector('button[data-sc-sales-office-slot="profit"]')?.closest('[data-order]').dataset.order === '4');
        await page.evaluate(() => { document.querySelector('[data-order="1"] tbody > tr:last-child td').textContent = '(-) $0'; });
        await page.waitForFunction(() => document.querySelector('button[data-sc-sales-office-slot="loss"]')?.closest('[data-order]').dataset.order === '1');
        await page.uncheck('[data-order="4"] input');
        await page.waitForFunction(() => !document.querySelector('button[data-sc-sales-office-slot="profit"]'));
    } finally { await page.close(); }
});

test('慢请求不切到其他订单；并发点击不会连续交付', async () => {
    const page = await setup();
    try {
        await page.evaluate(() => { fixture.outcomes[1] = 'pending'; });
        await page.click(slot('profit'));
        await page.waitForFunction(() => !document.querySelector('button[data-sc-sales-office-slot]'));
        await page.click('[data-order="2"] .btn-primary');
        assert.equal(await page.evaluate(() => fixture.clicks.length), 1);
        await page.waitForTimeout(1600);
        assert.match(await page.textContent('.sc-sales-office-status'), /处理中/);
        assert.equal(await page.isDisabled('[data-sc-sales-office-copy="total"]'), true);
    } finally { await page.close(); }
});

test('点击前重读盈亏，阻止在尚未刷新的盈利位置提交刚转亏的订单', async () => {
    const page = await setup();
    try {
        await page.evaluate(() => {
            const button = document.querySelector('button[data-sc-sales-office-slot="profit"]');
            button.closest('.ebrfvjt5').querySelector('tbody > tr:last-child td').textContent = '(-) $2,000';
            // 同一任务中触发事件，特意早于 MutationObserver 的刷新，仅用于模拟竞态。
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        assert.equal(await page.evaluate(() => fixture.clicks.length), 0);
        await page.waitForFunction(() => document.querySelector('button[data-sc-sales-office-slot="loss"]')?.closest('[data-order]').dataset.order === '1');
    } finally { await page.close(); }
});

test('重复初始化、节点替换、弹窗、开关、SPA 离开与返回均可恢复且不残留样式', async () => {
    const page = await setup();
    try {
        await page.evaluate(() => { SC_Modules.salesOfficeHelper.init(); SC_Modules.salesOfficeHelper.init(); fixture.replace(1); });
        await page.waitForFunction(() => document.querySelector('button[data-sc-sales-office-slot="profit"]')?.closest('[data-order]').dataset.order === '1');
        assert.equal(await page.locator(panel).count(), 1);
        await page.evaluate(() => { const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.textContent = '模拟游戏弹窗'; document.body.append(dialog); });
        await page.waitForSelector(panel, { state: 'hidden' });
        assert.equal(await page.locator('button[data-sc-sales-office-slot]').count(), 0);
        await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
        await page.waitForSelector(panel, { state: 'visible' });
        await page.evaluate(() => { fixture.enabled = false; SC_Modules.salesOfficeHelper.init(); });
        assert.equal(await page.locator(panel).count(), 0);
        assert.equal(await page.locator('[id^="sc-sales-office-"]').count(), 0);
        await page.evaluate(() => { fixture.enabled = true; SC_Modules.salesOfficeHelper.init(); });
        await page.waitForSelector(slot('profit'));
        await page.evaluate(() => { history.pushState({}, '', '/landscape/'); SC_Modules.salesOfficeHelper.destroy(); });
        assert.equal(await page.locator('button[data-sc-sales-office-slot]').count(), 0);
        assert.equal(await page.locator('style[id^="sc-sales-office-"]').count(), 0);
        await page.evaluate(() => { history.pushState({}, '', '/b/43/'); SC_Modules.salesOfficeHelper.init(); });
        // 新路由尚未换掉旧楼卡片时不能接管旧按钮。
        assert.equal(await page.locator(panel).count(), 0);
        await page.goto('https://sales-office.test/b/42/');
        await page.addScriptTag({ content: source });
        await page.evaluate(() => SC_Modules.salesOfficeHelper.init());
        await page.waitForSelector(slot('profit'));
    } finally { await page.close(); }
});

test('真实 pageObserver 路由分发：换楼不接管旧卡片，离开与返回自动销毁/初始化', async () => {
    const page = await setup();
    try {
        await page.addScriptTag({ content: readFileSync(path.join(root, 'src/features/pageObserver.js'), 'utf8') });
        await page.evaluate(() => { history.pushState({}, '', '/b/43/'); document.body.append(document.createTextNode(' ')); });
        await page.waitForSelector(panel, { state: 'detached' });
        await page.evaluate(() => fixture.replace(1));
        await page.waitForSelector(slot('profit'));
        assert.equal(await page.locator(slot('loss')).count(), 0);
        await page.evaluate(() => { history.pushState({}, '', '/landscape/'); document.body.append(document.createTextNode(' ')); });
        await page.waitForSelector(panel, { state: 'detached' });
        await page.evaluate(() => { history.pushState({}, '', '/b/42/'); fixture.replace(2); });
        await page.waitForSelector(slot('loss'));
    } finally { await page.close(); }
});

test('桌面/手机、深浅色及滚动后按钮位置一致且真实可点击；不支持的包含块恢复原位', async () => {
    const page = await setup();
    mkdirSync(path.join(root, 'dist/sales-office-check'), { recursive: true });
    try {
        for (const [name, width, height, dark] of [['desktop-light', 1440, 960, false], ['desktop-dark', 1440, 960, true], ['mobile-light', 390, 844, false], ['mobile-dark', 390, 844, true], ['mobile-narrow', 320, 640, false]]) {
            await page.setViewportSize({ width, height });
            await page.evaluate(dark => { document.body.classList.toggle('dark', dark); window.scrollTo(0, 700); }, dark);
            await page.waitForTimeout(150);
            for (const group of ['profit', 'loss']) {
                const aligned = await page.evaluate(group => {
                    const button = document.querySelector(`button[data-sc-sales-office-slot="${group}"]`);
                    const target = document.querySelector(`[data-group="${group}"] .sc-sales-office-slot`);
                    const a = button.getBoundingClientRect(), b = target.getBoundingClientRect();
                    return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 &&
                        document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2) === button && a.left >= 0 && a.right <= innerWidth;
                }, group);
                assert.equal(aligned, true, `${name} / ${group}`);
            }
            await page.screenshot({ path: path.join(root, `dist/sales-office-check/${name}.png`) });
            await page.locator(panel).screenshot({ path: path.join(root, `dist/sales-office-check/${name}-panel.png`) });
        }
        await page.evaluate(() => { document.querySelector('main').style.transform = 'translateZ(0)'; });
        await page.waitForFunction(() => !document.querySelector('button[data-sc-sales-office-slot]'));
        assert.match(await page.textContent('.sc-sales-office-status'), /布局不支持/);
    } finally { await page.close(); }
});
