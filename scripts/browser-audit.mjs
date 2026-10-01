import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const WebSocket = globalThis.WebSocket ?? require('next/dist/compiled/ws').WebSocket;

export async function auditBrowser(base, cookie, buyerCookie) {
  const proc = spawn('/repl/tools/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = ''; const timeout = setTimeout(() => reject(new Error('Chromium startup timed out')), 15000);
      proc.stderr.on('data', data => { log += data; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
      proc.on('error', reject);
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject); });
    const failures = [];
    let id = 0; const pending = new Map();
    socket.on('message', data => { const response = JSON.parse(String(data)); if (!response.id) { if (response.method === 'Runtime.exceptionThrown') failures.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text); if (response.method === 'Network.responseReceived' && response.params.response.status >= 500) failures.push(`${response.params.response.status} ${response.params.response.url}`); return; } const entry = pending.get(response.id); if (!entry) return; pending.delete(response.id); response.error ? entry.reject(new Error(response.error.message)) : entry.resolve(response.result); });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
    for (const value of cookie.split('; ')) { const split = value.indexOf('='); await call('Network.setCookie', { name: value.slice(0, split), value: value.slice(split + 1), url: value.startsWith('__Secure-') ? base.replace('http:', 'https:') : base, secure: value.startsWith('__Secure-'), path: '/' }); }
    const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const goto = async route => { await call('Page.navigate', { url: `${base}${route}` }); for (let i = 0; i < 80; i++) { await pause(100); if (await evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(route.split('?')[0])}`)) break; } await pause(600); };
    await goto('/workspace/listings/new?category=cat_platform_fashion');
    assert.ok(await evaluate(`document.body.innerText.includes('New Fashion product')`));
    const choose = async (label, option) => {
      const trigger = await evaluate(`(() => { const label = [...document.querySelectorAll('[data-slot="label"]')].find(el => el.textContent.trim() === ${JSON.stringify(label)}); const select = label?.closest('[data-slot="select"]') || label?.parentElement; const trigger = select?.querySelector('button, [role="combobox"]') || document.getElementById(label?.getAttribute('for') ?? ''); if (!trigger) return false; trigger.click(); return true; })()`);
      assert.ok(trigger, `Select trigger: ${label}; ${await evaluate(`document.body.innerText.slice(0,1500)`)}; ${await evaluate(`[...document.querySelectorAll('[data-slot="select"]')].map(el => el.outerHTML.slice(0,1500)).join('')`)}`); await pause(250);
      assert.ok(await evaluate(`(() => { const item = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.trim().startsWith(${JSON.stringify(option)})); if (!item) return false; item.click(); return true; })()`), `Select option: ${option}`);
      await pause(250);
      assert.ok(await evaluate(`(() => { const label = [...document.querySelectorAll('[data-slot="label"]')].find(el => el.textContent.trim() === ${JSON.stringify(label)}); return label?.parentElement?.textContent.includes(${JSON.stringify(option)}); })()`), `Selection displayed: ${option}`);
    };
    await choose('Category', 'Electronics');
    await choose('Category', 'Fashion');
    await choose('Status', 'Published');
    const setField = async (label, value, formIndex = 0) => {
      assert.ok(await evaluate(`(() => { const form = document.querySelectorAll('form')[${formIndex}]; const text = [...form.querySelectorAll('[data-slot="label"]')].find(el => el.textContent.trim().startsWith(${JSON.stringify(label)})); const input = document.getElementById(text?.getAttribute('for') ?? '') || text?.parentElement?.querySelector('input,textarea'); if (!input) return false; Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`), `Field: ${label}`);
    };
    const save = async index => {
      for (let i = 0; i < 60; i++) { if (await evaluate(`!!document.querySelectorAll('form')[${index}]?.querySelector('button[type="submit"]:not(:disabled)')`)) break; await pause(100); }
      assert.ok(await evaluate(`(() => { const button = document.querySelectorAll('form')[${index}]?.querySelector('button[type="submit"]:not(:disabled)'); if (!button) return false; button.click(); return true; })()`), `Save button ready for form ${index}`); await pause(600);
    };
    await save(0);
    assert.ok(await evaluate(`document.body.innerText.includes('Product name required') && document.body.innerText.includes('Take me there')`));
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Take me there').click()`);
    assert.ok(await evaluate(`document.activeElement.closest('[data-form-field]')?.dataset.formField === 'name'`));
    await setField('Product name', 'Browser lifecycle product'); await setField('Price', '12.34'); await setField('Description', 'Saved browser description');
    await save(0); assert.ok(await evaluate(`document.body.innerText.includes('Product image required')`), await evaluate(`document.querySelector('form').innerText + '\\n' + [...document.querySelectorAll('form input')].map(el => el.value).join('|')`));
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Take me there').click()`);
    assert.ok(await evaluate(`document.activeElement.closest('[data-form-field]')?.dataset.formField === 'photos'`));
    const { root: dom } = await call('DOM.getDocument');
    const { nodeId } = await call('DOM.querySelector', { nodeId: dom.nodeId, selector: 'form input[type="file"]' });
    await call('DOM.setFileInputFiles', { nodeId, files: [`${process.cwd()}/public/brand/rush-cart-logo.png`] });
    for (let i = 0; i < 60; i++) { if (await evaluate(`!!document.querySelector('form img[src*="/api/files/"]')`)) break; await pause(200); }
    assert.ok(await evaluate(`!!document.querySelector('form img[src*="/api/files/"]')`), 'Real upload completes');
    await save(0);
    for (let i = 0; i < 60; i++) { if (await evaluate(`document.body.innerText.includes('Product saved')`)) break; await pause(200); }
    assert.ok(await evaluate(`document.body.innerText.includes('Product saved')`), 'Product saved without leaving repeated forms');
    await setField('Product name', 'Browser lifecycle updated'); await save(0);
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Add another product').click()`); await pause(200);
    await setField('Product name', 'Independent unfinished product', 1); await save(1);
    assert.ok(await evaluate(`document.querySelectorAll('form')[1].innerText.includes('Enter a valid price')`), 'Second product validation is independent');
    assert.ok(await evaluate(`document.querySelectorAll('form')[0].innerText.includes('Product saved')`));
    await goto('/workspace/listings');
    assert.ok(await evaluate(`document.body.innerText.includes('Browser lifecycle updated') && !document.body.innerText.includes('Browser lifecycle product') && !document.body.innerText.includes('Independent unfinished product')`), 'Repeated save updates exactly one existing product');
    const editHref = await evaluate(`[...document.querySelectorAll('a')].find(el => el.textContent.trim() === 'Browser lifecycle updated')?.getAttribute('href')`);
    assert.ok(editHref); await goto(editHref);
    assert.ok(await evaluate(`document.querySelector('form').innerText.includes('Fashion') && !!document.querySelector('form img[src*="/api/files/"]')`), 'Editor reload retains category and image');
    await setField('Description', 'Edited browser description'); await save(0); await goto(editHref);
    assert.ok(await evaluate(`[...document.querySelectorAll('textarea')].some(el => el.value === 'Edited browser description')`), 'Edited description persists after reload');
    await goto('/workspace/events/new');
    await save(0);
    assert.ok(await evaluate(`document.body.innerText.includes('Event name required') && document.body.innerText.includes('Take me there')`));
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Take me there').click()`);
    assert.ok(await evaluate(`document.activeElement.closest('[data-form-field]')?.dataset.formField === 'name'`));
    await setField('Event name', 'Browser curated event'); await choose('Status', 'Published'); await save(0);
    assert.ok(await evaluate(`document.body.innerText.includes('Select at least one product')`));
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Take me there').click()`);
    assert.ok(await evaluate(`document.activeElement.closest('[data-form-field]')?.dataset.formField === 'products'`));
    await evaluate(`[...document.querySelectorAll('form label')].find(el => el.textContent.includes('Audit Jacket'))?.querySelector('input[type="checkbox"]').click()`);
    await save(0);
    for (let i = 0; i < 60; i++) { if (await evaluate(`location.pathname.startsWith('/workspace/events/') && !location.pathname.endsWith('/new')`)) break; await pause(200); }
    const managedEvent = await evaluate(`location.pathname`); assert.ok(!managedEvent.endsWith('/new'));
    await setField('Description', 'Updated curated collection'); await save(0); await goto(managedEvent);
    assert.ok(await evaluate(`[...document.querySelectorAll('textarea')].some(el => el.value === 'Updated curated collection')`));
    await goto(managedEvent.replace('/workspace', ''));
    assert.ok(await evaluate(`document.body.innerText.includes('Browser curated event') && !!document.querySelector('[data-product-card="product"] a[href="/listing/product"]')`), 'Event explores actual existing products');
    await goto('/workspace/settings');
    const identity = await evaluate(`[...document.querySelectorAll('form')].findIndex(form => !!form.querySelector('input[name="slug"]'))`);
    assert.ok(identity >= 0); await setField('About your store', 'Updated storefront from browser audit', identity);
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Save storefront').click()`); await pause(1000);
    await goto('/@audit-store'); assert.ok(await evaluate(`document.querySelector('.store-identity').innerText.includes('Updated storefront from browser audit')`), 'Saved storefront updates public page');
    await goto('/workspace/settings');
    // This page's plain-form selectors must display defaults and new values.
    await choose('Currency', 'USD · US Dollar');
    const results = [];
    for (const route of ['/', '/products', '/stores', '/people', '/events', '/@audit-store', '/listing/product', '/events/event', '/workspace/listings', '/workspace/listings/product', '/workspace/events/new', '/search?q=Audit', '/privacy']) {
      await goto(route);
      for (const width of [320, 430, 768, 1280, 1600]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }); await pause(250);
        const geometry = await evaluate(`({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, badLogo: [...document.querySelectorAll('header a[href="/"] img[src="/brand/rush-cart-logo.png"]')].some(img => getComputedStyle(img).objectFit !== 'contain') })`);
        assert.ok(geometry.scroll <= geometry.width + 1, `${route} overflow at ${width}: ${JSON.stringify(geometry)}`); assert.equal(geometry.badLogo, false);
        const escaped = await evaluate(`(() => { const bad = []; for (const card of document.querySelectorAll('[data-product-card]')) { const box = card.getBoundingClientRect(); for (const control of card.querySelectorAll('button, a, img')) { const rect = control.getBoundingClientRect(); if (rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1)) bad.push(card.dataset.productCard + ':' + control.tagName); } } return bad; })()`);
        assert.deepEqual(escaped, [], `${route}: card boundary at ${width}`);
        if (route === '/@audit-store') assert.ok(await evaluate(`(() => { const img = document.querySelector('.store-identity span img'); const frame = img?.parentElement; return !!img && getComputedStyle(img).objectFit === 'cover' && getComputedStyle(img).padding === '0px' && frame.getBoundingClientRect().width === img.getBoundingClientRect().width && parseFloat(getComputedStyle(frame).borderRadius) >= frame.getBoundingClientRect().width / 2; })()`), 'Store avatar uses the same full-frame fit as Chat');
        if (route === '/@audit-store') {
          assert.ok(await evaluate(`!document.querySelector('.store-identity img:not(span img)') && !document.querySelector('.storefront img[alt*="cover"]')`), 'No shop cover or replacement hero image');
          assert.ok(await evaluate(`(() => { const rail = document.querySelector('.storefront .category-rail'); const links = [...rail.querySelectorAll('a')]; return getComputedStyle(rail).flexWrap === 'nowrap' && links.every(link => Math.abs(link.getBoundingClientRect().top - links[0].getBoundingClientRect().top) < 1) && rail.scrollWidth > rail.clientWidth; })()`), 'Shop categories stay on one scrollable row');
          assert.ok(await evaluate(`! /\\b\\d+\\s+(products?|items?)\\b/i.test(document.querySelector('.storefront').innerText)`), 'No storefront inventory counts');
        }
        if (route === '/@audit-store') assert.ok(await evaluate(`(() => { const search = document.querySelector('.shop-search-tools'); const rail = document.querySelector('.storefront .category-rail'); return search.getBoundingClientRect().top < rail.getBoundingClientRect().top && parseFloat(getComputedStyle(document.querySelector('.shop-search')).borderRadius) > 20; })()`), 'Curved Search + Filter precede categories');
        if (!route.startsWith('/workspace')) assert.ok(await evaluate(`![...document.querySelectorAll('[data-product-card]')].some(card => /ago|yesterday/i.test(card.innerText))`), 'No public product age');
        const shops = await evaluate(`(() => { const cards = [...document.querySelectorAll('[data-shop-card]')]; return cards.map(card => { const css = getComputedStyle(card); const rect = card.getBoundingClientRect(); const name = card.querySelector('h3'); return { width: rect.width, background: css.backgroundColor, shadow: css.boxShadow, border: css.borderWidth, nameSize: parseFloat(getComputedStyle(name).fontSize), previewLinks: [...card.querySelectorAll('nav a')].every(link => /^\\/listing\\//.test(link.getAttribute('href'))), counts: /\\b\\d+\\s+(products?|items?)\\b/i.test(card.innerText), animations: [...card.querySelectorAll('*'), card].some(el => getComputedStyle(el).animationName !== 'none') }; }); })()`);
        for (const shop of shops) { assert.ok(shop.width >= (width >= 1024 ? 440 : Math.min(width - 64, 500)), `${route}@${width}: expressive shop width ${shop.width}`); assert.equal(shop.background, 'rgba(0, 0, 0, 0)'); assert.equal(shop.shadow, 'none'); assert.equal(shop.border, '0px'); assert.ok(shop.nameSize >= 30); assert.equal(shop.previewLinks, true); assert.equal(shop.counts, false); assert.equal(shop.animations, false); }
        assert.ok(await evaluate(`[...document.querySelectorAll('[data-shop-card] .shop-discovery-frame')].every(frame => { const rect = frame.getBoundingClientRect(); return !rect.height || rect.width / rect.height >= 0.6; })`), `${route}@${width}: shop previews are never stretched into a sliver`);
        assert.ok(await evaluate(`[...document.querySelectorAll('.category-rail, .category-rail a')].every(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')`), 'Categories have no enclosing background plates or pills');
        results.push(`${route}@${width}`);
      }
    }
    assert.ok(await evaluate(`document.body.innerText.includes('Your privacy choices')`));
    await evaluate(`([...document.querySelectorAll('button')].find(el => el.textContent === 'Necessary only')).click()`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('rush-cart:privacy:v1')).optional`), false);
    await goto('/'); assert.ok(!(await evaluate(`document.body.innerText.includes('Your privacy choices')`)));
    const waitFor = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); } assert.fail(`${label}: ${await evaluate(`location.href + '\\n' + document.body.innerText.slice(-1800)`)}`); };
    const clickText = async text => { assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('.storefront .category-rail a, a,button')].filter(el => el.getClientRects().length).find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), `Clickable: ${text}`); };
    await goto('/'); assert.ok(!(await evaluate(`document.body.innerText.includes('Your privacy choices')`)), 'Rejection persists after reload');
    await clickText('Privacy preferences'); await clickText('Necessary only');
    await evaluate(`localStorage.removeItem('rush-cart:privacy:v1')`); await goto('/');
    assert.ok(!(await evaluate(`document.body.innerText.includes('Your privacy choices')`)), 'Cookie fallback prevents repeated prompt');
    await clickText('Privacy preferences'); await evaluate(`document.querySelector('[aria-label="Cookie and storage preferences"] input[type="checkbox"]').click()`); await clickText('Save preferences');
    await goto('/products'); await goto('/');
    assert.ok(!(await evaluate(`document.body.innerText.includes('Your privacy choices')`)), 'Allow persists across navigation and reload');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('rush-cart:privacy:v1')).optional`), true);
    assert.ok(await evaluate(`!document.querySelector('.rush-cube-top, .rush-cube-orbit, .rush-orb-two') && document.querySelectorAll('.rush-cube-face').length === 4 && document.querySelectorAll('.rush-orb-one').length === 1`), 'Only requested cube decoration removed');
    assert.deepEqual(await evaluate(`(() => { const orb = document.querySelector('.rush-orb-one'); const css = getComputedStyle(orb); return { width: css.width, height: css.height, right: css.right, top: css.top, opacity: css.opacity }; })()`), { width: '288px', height: '288px', right: '-64px', top: '-80px', opacity: '0.23' }, 'Top-right orb keeps dimensions/position with stronger opacity');
    if (process.env.AUDIT_FOCUS !== 'stores') {
    const preview = `document.querySelector('a[href="/events/event"]').closest('article')`;
    const frontProduct = async () => evaluate(`${preview}.querySelector('[data-front="true"]').dataset.eventProduct`);
    const firstPreviewProduct = await frontProduct();
    // A complete card per product, stacked rather than rotated, and no panel around the stack.
    const stackDiag = await evaluate(`(() => { const cards = [...${preview}.querySelectorAll('[data-event-product]')]; const front = ${preview}.querySelector('[data-front="true"]'); const angles = cards.filter(card => getComputedStyle(card).display !== 'none').map(card => { const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform); return Math.round(Math.abs(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI)); }); return { count: cards.length, hasFront: !!front, frontHref: front?.getAttribute('href') ?? null, priced: /[0-9]/.test(front?.textContent ?? ''), nested: !!front?.querySelector('[data-event-product]'), distinct: new Set(cards.map(card => getComputedStyle(card).transform)).size, visible: angles.length, maxAngle: angles.length ? Math.max(...angles) : 0 }; })()`);
    assert.ok(stackDiag.hasFront && stackDiag.count >= 2 && (stackDiag.frontHref ?? '').startsWith('/listing/') && stackDiag.priced && !stackDiag.nested && stackDiag.visible >= 3 && stackDiag.distinct >= 3 && stackDiag.maxAngle <= 15, `Event stack fans complete, controlled cards: ${JSON.stringify(stackDiag)}`);
    assert.ok(await evaluate(`(() => { const article = ${preview}; const stack = article.querySelector('[data-event-display]'); const css = getComputedStyle(article); return css.backgroundColor === 'rgba(0, 0, 0, 0)' && css.borderTopWidth === '0px' && !!stack; })()`), 'Event stack has no surrounding card or panel');
    await evaluate(`${preview}.querySelector('button[aria-label^="Next product"]').click()`); await pause(600);
    assert.notEqual(await frontProduct(), firstPreviewProduct, 'Next brings the next real product forward');
    await evaluate(`${preview}.querySelector('button[aria-label^="Previous product"]').click()`); await pause(600);
    assert.equal(await frontProduct(), firstPreviewProduct, 'Previous restores the same product');
    const dragPreview = async (touch, delta) => {
      await evaluate(`${preview}.querySelector('[data-event-display]').scrollIntoView({ block: 'center' })`); await pause(100);
      const point = await evaluate(`(() => { const rect = ${preview}.querySelector('[data-event-display]').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.45 }; })()`);
      if (touch) {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
        await pause(100);
        for (let step = 1; step <= 5; step++) { await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + delta * step / 5, y: point.y }] }); await pause(50); }
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        for (let step = 1; step <= 5; step++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + delta * step / 5, y: point.y, button: 'left', buttons: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + delta, y: point.y, button: 'left', clickCount: 1 });
      }
      await pause(650);
    };
    await dragPreview(false, -90); assert.notEqual(await frontProduct(), firstPreviewProduct, 'Mouse drag moves the front card away without opening a product');
    assert.equal(await evaluate(`location.pathname`), '/');
    await dragPreview(false, 90); assert.equal(await frontProduct(), firstPreviewProduct, 'Mouse drag back restores the stack');
    await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    // Touch is the same pointer gesture as a mouse drag. CDP touch emulation is not delivered as pointer events in this headless setup, so the touch path is driven with real PointerEvents on the stack.
    const swipePreview = async delta => {
      await evaluate(`${preview}.querySelector('[data-event-display]').scrollIntoView({ block: 'center' })`); await pause(100);
      await evaluate(`(() => { const el = ${preview}.querySelector('[data-event-display]'); const base = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 }; const y = el.getBoundingClientRect().top + el.getBoundingClientRect().height * 0.45; el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: 200, clientY: y })); for (let i = 1; i <= 5; i++) el.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: 200 + ${delta} * i / 5, clientY: y })); el.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: 200 + ${delta}, clientY: y })); return true; })()`);
      await pause(650);
    };
    await swipePreview(-70); assert.notEqual(await frontProduct(), firstPreviewProduct, 'Touch swipe moves the front card away');
    await swipePreview(70); assert.equal(await frontProduct(), firstPreviewProduct, 'Touch swipe back restores the stack');
    assert.ok(await evaluate(`getComputedStyle(${preview}.querySelector('[data-event-display]')).touchAction.includes('pan-y') && document.documentElement.scrollWidth <= 321`), 'Vertical scrolling remains enabled without viewport overflow');
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate(`${preview}.querySelector('button[aria-label^="Next product"]').click()`); await pause(100);
    assert.ok(await evaluate(`getComputedStyle(${preview}.querySelector('.event-stack-card')).transitionDuration === '0s'`), 'Reduced motion removes the stack transition without disabling selection');
    assert.notEqual(await frontProduct(), firstPreviewProduct);
    const selectedPreviewProduct = await frontProduct();
    await evaluate(`${preview}.querySelector('[data-front="true"]').click()`);
    await waitFor(`location.pathname === '/listing/${selectedPreviewProduct}'`, 'Front product opens actual detail');
    await call('Emulation.setEmulatedMedia', { features: [] }); await call('Emulation.setTouchEmulationEnabled', { enabled: false });
    await goto('/'); await evaluate(`${preview}.querySelector('a[href="/events/event"]').click()`);
    await waitFor(`location.pathname === '/events/event'`, 'Open Event navigates to normal exploration');
    assert.ok(await evaluate(`!document.querySelector('[data-event-display]') && document.querySelectorAll('[data-product-card]').length > 0`), 'Full Event page is vertical product discovery, not a stacked preview');
    await goto('/');
    }
    assert.ok(await evaluate(`!!document.querySelector('[data-shop-card="audit-store"] a[href="/listing/product"]')`), 'Shop preview uses actual product');
    await evaluate(`document.querySelector('[data-shop-card="audit-store"] a[href="/listing/product"]').click()`);
    await waitFor(`location.pathname === '/listing/product'`, 'Shop preview opens exact product');
    await call('Network.clearBrowserCookies');
    await goto('/listing/product');
    await clickText('Open Shop');
    await waitFor(`location.pathname === '/@audit-store' && !!document.querySelector('.store-identity')`, 'Guest Open Shop destination');
    await goto('/listing/product'); await clickText('Ask About This Product');
    await waitFor(`!!document.querySelector('[role="dialog"]')`, 'Guest message opens authentication');
    await goto('/');
    await evaluate(`document.querySelector('button[aria-label="Open menu"]').click()`); await pause(300);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[aria-label="Product categories"] a')].slice(0,3).map(el => el.textContent.trim())`), ['Fashion', 'Clothing', 'Shoes']);
    assert.ok(await evaluate(`!document.querySelector('[aria-label="Product categories"] button')`), 'Static categories, no collapse control');
    await evaluate(`document.querySelector('[aria-label="Product categories"] a[href*="cat_platform_fashion"]').click()`);
    await waitFor(`location.search.includes('cat_platform_fashion') && !!document.querySelector('[data-product-card="clothing"]')`, 'Fashion includes Clothing descendants');
    assert.ok(!(await evaluate(`!!document.querySelector('[data-product-card="electronics"]')`)));
    await evaluate(`document.querySelector('button[aria-label="Open menu"]').click()`); await pause(300); await evaluate(`document.querySelector('[aria-label="Product categories"] a[href*="cat_platform_electronics"]').click()`);
    await waitFor(`location.search.includes('cat_platform_electronics') && !!document.querySelector('[data-product-card="electronics"]')`, 'Electronics category navigation');
    await goto('/@audit-store');
    await evaluate(`document.querySelector('.storefront .category-rail a[href*="cat_platform_beauty"]').click()`);
    await waitFor(`location.search.includes('cat_platform_beauty') && !!document.querySelector('[data-product-card="beauty"]') && !document.querySelector('[data-product-card="product"]')`, 'Shop category URL and results');
    assert.ok(await evaluate(`document.querySelector('.storefront .category-rail [aria-current="page"]')?.textContent === 'Beauty'`), 'Active shop category');
    await clickText('Digital'); await waitFor(`document.body.innerText.includes('No products match this selection')`, 'Shop category empty state');
    await goto('/@audit-store');
    const typeInput = async (selector, value) => { await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`); };
    await typeInput('.shop-search input', 'cotton');
    await waitFor(`location.search.includes('cotton') && !!document.querySelector('#shop-catalogue [data-product-card="clothing"]') && !document.querySelector('#shop-catalogue [data-product-card="product"]')`, 'Live description search');
    await evaluate(`document.querySelector('[aria-label="Clear product search"]').click()`);
    await waitFor(`!location.search && !!document.querySelector('#shop-catalogue [data-product-card="product"]')`, 'Clear restores products');
    await clickText('Filter'); await pause(300);
    await typeInput('[aria-label="Minimum price"]', '15'); await typeInput('[aria-label="Maximum price"]', '25'); await clickText('Apply price');
    await waitFor(`location.search.includes('min=15') && !!document.querySelector('#shop-catalogue [data-product-card="beauty"]') && !document.querySelector('#shop-catalogue [data-product-card="clothing"]')`, 'Real price filter');
    await clickText('Clear filters'); await clickText('Done');
    await waitFor(`!document.querySelector('[role="dialog"]') && !location.search`, 'Filters dismiss and clear');
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await goto('/');
    assert.ok(await evaluate(`[...document.querySelectorAll('.rush-cube, .rush-gradient, .rush-orb')].every(el => getComputedStyle(el).animationName === 'none')`), 'Hero respects reduced motion');
    await call('Emulation.setEmulatedMedia', { features: [] });
    for (const value of buyerCookie.split('; ')) { const split = value.indexOf('='); await call('Network.setCookie', { name: value.slice(0, split), value: value.slice(split + 1), url: value.startsWith('__Secure-') ? base.replace('http:', 'https:') : base, secure: value.startsWith('__Secure-'), path: '/' }); }
    await goto('/listing/product'); await clickText('Open Shop'); await waitFor(`location.pathname === '/@audit-store'`, 'Buyer Open Shop');
    await evaluate(`document.querySelector('[aria-label="Shop catalogue"] [data-product-card="product"] button').click()`);
    await waitFor(`document.querySelector('[aria-label="Shop catalogue"] [data-product-card="product"]')?.innerText.includes('Added')`, 'Product card adds to real cart');
    await goto('/cart'); assert.ok(await evaluate(`document.body.innerText.includes('Audit Jacket')`), 'Added product appears in cart');
    await goto('/listing/product'); await clickText('Ask About This Product');
    await waitFor(`location.pathname.startsWith('/messages/')`, 'Buyer message opens actual seller thread');
    assert.deepEqual(failures, [], 'No browser runtime exceptions or HTTP 5xx responses');
    console.log(`Browser verified: product validation/focus/upload/create/edit/repeated-save lifecycle, independent multiple forms, guest/buyer shop and messaging flows, category navigation, cart action, card boundaries, avatar fitting, category/currency selection, persisted rejection, and ${results.length} responsive route geometries.`);
  } finally { socket?.close(); proc.kill('SIGTERM'); }
}
