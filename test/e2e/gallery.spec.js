import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const STATUSES = ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash'];

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto('/gallery/');
  await page.waitForSelector('html[data-gallery-ready]');
  return errors;
}

test('the probe app plugs in with no core change', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#probe-face')).toHaveAttribute('data-frame', 'probing');
  expect(await page.locator('body > svg symbol#gs-sigil').count()).toBe(1);
  await expect(page.locator('#probe')).toHaveAttribute('data-app', 'probe');
  const accentDark = await page.locator('#probe').evaluate((el) => getComputedStyle(el).getPropertyValue('--gs-color-accent-2').trim());
  expect(accentDark).toBe('#b78bff');
  await page.evaluate(() => window.gallery.setTheme('light'));
  const accentLight = await page.locator('#probe').evaluate((el) => getComputedStyle(el).getPropertyValue('--gs-color-accent-2').trim());
  expect(accentLight).toBe('#6b2fc9');
  // the consumer layout from the readme: data-app on <html> itself, not on a subtree
  const rootLight = await page.evaluate(() => {
    document.documentElement.dataset.app = 'probe';
    const v = getComputedStyle(document.documentElement).getPropertyValue('--gs-color-accent-2').trim();
    delete document.documentElement.dataset.app;
    return v;
  });
  expect(rootLight).toBe('#6b2fc9');
  await expect(page.locator('#probe-empty gs-decode[part="copy"]')).toHaveText('probe is listening. nothing has pinged yet');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('probe:status', { detail: { status: 'deny' } })));
  await expect(page.locator('#probe-status-face')).toHaveAttribute('data-frame', 'deny');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('run tests');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.gallery.lastCommand)).toEqual({ id: 'probe.tests', app: 'probe' });
  expect(await page.locator('#probe-empty gs-wallpaper gs-mosaic[data-drawn]').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('one sprite holds every registered icon, core and app, and re-injecting is idempotent', async ({ page }) => {
  const errors = await open(page);
  const state = await page.evaluate(async () => {
    const { injectIcons, listIcons } = await import('/src/gs.js');
    const first = injectIcons();
    const again = injectIcons();
    return {
      same: first === again,
      sprites: document.querySelectorAll('svg[data-gs-icons]').length,
      symbols: [...first.querySelectorAll('symbol')].map((s) => s.id).sort(),
      registered: listIcons().map((n) => `gs-${n}`),
    };
  });
  expect(state.same).toBe(true);
  expect(state.sprites).toBe(1);
  expect(state.symbols).toEqual(state.registered);
  expect(state.symbols).toContain('gs-ghost');
  expect(state.symbols).toContain('gs-sigil');
  expect(state.symbols).toHaveLength(21);
  expect(errors).toEqual([]);
});

test('doto is served from the bundle and used by the wordmark', async ({ page }) => {
  await open(page);
  const font = await page.evaluate(async () => {
    await document.fonts.load('900 34px Doto');
    return {
      loaded: document.fonts.check('900 34px Doto'),
      family: getComputedStyle(document.querySelector('.gs-wordmark')).fontFamily,
      sources: [...document.fonts].map((f) => f.family),
    };
  });
  expect(font.loaded).toBe(true);
  expect(font.family).toContain('Doto');
  expect(font.sources.some((f) => f.includes('Doto'))).toBe(true);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.reload();
  await page.waitForSelector('html[data-gallery-ready]');
  expect(requests.some((u) => u.includes('fonts.googleapis') || u.includes('fonts.gstatic'))).toBe(false);
});

test('every status renders on every gallery face and the chrome switches work', async ({ page }) => {
  await open(page);
  for (const s of STATUSES) {
    await page.evaluate((v) => window.gallery.setStatus(v), s);
    await expect(page.locator('#hero-face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
  }
  await page.locator('[data-glitch-pick="2"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-glitch', '2');
  await expect(page.locator('#row-list gs-row[status="deny"] [part="label"] gs-decode')).toHaveCount(1);
  await page.locator('[data-theme-pick="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(242, 244, 245)');
});

test('kaomoji in the face labels keep their case despite .gs-label lowercasing', async ({ page }) => {
  await open(page);
  const bypass = await page.locator('#face-grid gs-face[status="bypass"] + .gs-label').evaluate((el) => el.innerText);
  const crash = await page.locator('#face-grid gs-face[status="crash"] + .gs-label').evaluate((el) => el.innerText);
  expect(bypass).toContain('>:D');
  expect(crash).toContain('XX');
});

test('wallpaper fills its container edge to edge instead of a fixed patch pinned in the corner', async ({ page }) => {
  await open(page);
  for (const selector of ['#states gs-empty gs-wallpaper', '#states gs-splash gs-wallpaper', '#probe-empty gs-wallpaper']) {
    const coverage = await page.locator(selector).evaluate((wp) => {
      const box = wp.getBoundingClientRect();
      const canvas = wp.querySelector('canvas').getBoundingClientRect();
      return { w: canvas.width / box.width, h: canvas.height / box.height };
    });
    expect(coverage.w, `${selector} width coverage`).toBeGreaterThanOrEqual(0.9);
    expect(coverage.h, `${selector} height coverage`).toBeGreaterThanOrEqual(0.9);
  }
});

test('setGlitch(0) stops the wallpaper stepping without a remount', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.GS.seed(1));
  await page.evaluate(() => window.gallery.setGlitch(1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.gallery.setGlitch(0));
  const step0 = await page.locator('#states gs-splash gs-wallpaper').getAttribute('data-step');
  await page.waitForTimeout(600);
  const step1 = await page.locator('#states gs-splash gs-wallpaper').getAttribute('data-step');
  expect(step1).toBe(step0);
});

test('bypass and crash toasts do not double their kaomoji', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.gallery.toast('bypass'));
  const bypassItem = page.locator('#toasts [part="item"][data-status="bypass"]').first();
  await expect(bypassItem.locator('[part="kaomoji"]')).toHaveCount(0);
  // the decode scramble settles left to right, so ">:D" at the end of the string is the last
  // thing to land; wait for it rather than racing the animation
  await expect(bypassItem).toContainText('>:D');
  const bypassText = await bypassItem.evaluate((el) => el.innerText);
  expect((bypassText.match(/>:D/g) ?? []).length).toBe(1);
  await page.evaluate(() => window.gallery.toast('crash'));
  const crashItem = page.locator('#toasts [part="item"][data-status="crash"]').first();
  await expect(crashItem.locator('[part="kaomoji"]')).toHaveCount(1);
});

// the slice and smear copies print attr(data-t) as generated content, and chrome reads generated
// content into the accessibility tree. inside the toast's live region that is a second, scrambled
// copy of the line for a screen reader. innerText skips generated content, so this reads the ax
// tree over cdp while the copies are on screen
async function axTextDuringFx(page, status) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const selector = `#toasts [part="item"][data-status="${status}"]`;
  const read = (sel, fire = null) => page.evaluate(({ sel, fire }) => {
    if (fire !== null) window.gallery.toast(fire);
    const items = document.querySelectorAll(sel);
    const item = items[items.length - 1];
    return { t: item.dataset.t ?? null, before: getComputedStyle(item, '::before').content };
  }, { sel, fire });
  // the copies live only for the fx's length (180ms glitch, 420ms mosh). a snapshot only counts
  // when data-t was set before it and is still set after it
  for (let attempt = 0; attempt < 5; attempt++) {
    // gs-toast appends the item and fires the fx synchronously, so reading in the same evaluate
    // can't miss the window: a null here means the fx never fired
    const fired = await read(selector, status);
    if (fired.t === null) throw new Error(`${status} toast fired no fx copies`);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const still = await read(selector);
    if (still.t !== fired.t) continue;
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    const { node } = await cdp.send('DOM.describeNode', { nodeId: nodeIds[nodeIds.length - 1] });
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const texts = [];
    const walk = (n) => {
      if (n.role?.value === 'StaticText') texts.push(n.name?.value ?? '');
      for (const id of n.childIds ?? []) if (byId.has(id)) walk(byId.get(id));
    };
    walk(nodes.find((n) => n.backendDOMNodeId === node.backendNodeId));
    await cdp.detach();
    return { ...fired, texts };
  }
  throw new Error(`never caught the ${status} fx copies on screen in 5 tries`);
}

test('toast fx copies render but stay out of the accessibility tree', async ({ page }) => {
  await open(page);
  const crash = await axTextDuringFx(page, 'crash');
  // positive control: the copies are really painting the text while the ax tree is read
  expect(crash.before).toContain(JSON.stringify(crash.t));
  expect(crash.texts.filter((s) => s === crash.t), `crash ax text ${JSON.stringify(crash.texts)}`).toEqual([]);
  expect(crash.texts.filter((s) => s === 'XX')).toHaveLength(1);
  const bypass = await axTextDuringFx(page, 'bypass');
  expect(bypass.before).toContain(JSON.stringify(bypass.t));
  expect(bypass.texts.filter((s) => s === bypass.t), `bypass ax text ${JSON.stringify(bypass.texts)}`).toEqual([]);
});

test('the states row lays out in equal columns so the splash container is not collapsed to its content', async ({ page }) => {
  await open(page);
  const widths = await page.locator('#states .grid > *').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths).toHaveLength(3);
  const [empty, error, splash] = widths;
  expect(splash).toBeGreaterThan(150);
  expect(Math.abs(splash - empty)).toBeLessThan(2);
  expect(Math.abs(splash - error)).toBeLessThan(2);
});

test('ambient glitch fires on a data-gs-ambient element at glitch 1', async ({ page }) => {
  await open(page);
  const hit = await page.evaluate(() => new Promise((resolve) => {
    window.GS.seed(1);
    const targets = [...document.querySelectorAll('[data-gs-ambient]')];
    const mo = new MutationObserver(() => {
      const t = targets.find((el) => el.classList.contains('gs-glitch'));
      if (t) { mo.disconnect(); resolve(true); }
    });
    for (const t of targets) mo.observe(t, { attributes: true, attributeFilter: ['class'] });
    window.gallery.ambient({ min: 10, max: 30 });
    setTimeout(() => resolve(false), 2000);
  }));
  expect(hit).toBe(true);
});

test('glitchOnce hands the text to the slice copies for the glitch and takes it back after', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#wordmark')).toHaveText('ghost signal');
  const during = await page.evaluate(async () => {
    // same url as the gallery's own import, so this is the module instance the page runs
    const { glitchOnce } = await import('/src/gs.js');
    const word = document.querySelector('.gs-wordmark');
    const face = document.getElementById('hero-face');
    // a toast-like chip with its own fill: the copies must not inherit it and box over the text
    const chip = Object.assign(document.createElement('span'), { textContent: 'filled' });
    chip.style.backgroundColor = 'rgb(1, 2, 3)';
    document.body.append(chip);
    const fired = [glitchOnce(word), glitchOnce(face), glitchOnce(chip)];
    const before = getComputedStyle(word, '::before');
    const after = getComputedStyle(word, '::after');
    const result = {
      fired,
      t: word.dataset.t,
      faceT: face.dataset.t ?? null,
      content: [before.content, after.content],
      background: [getComputedStyle(chip, '::before').backgroundColor, getComputedStyle(chip, '::after').backgroundColor],
    };
    chip.remove();
    return result;
  });
  expect(during).toEqual({
    fired: [true, true, true],
    t: 'ghost signal',
    faceT: null,
    // the text, then the empty alt text that keeps the copies out of the accessibility tree
    content: ['"ghost signal" / ""', '"ghost signal" / ""'],
    background: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'],
  });
  await expect(page.locator('.gs-wordmark')).not.toHaveClass(/gs-glitch/, { timeout: 2000 });
  await expect(page.locator('.gs-wordmark')).not.toHaveAttribute('data-t');
  expect(errors).toEqual([]);
});

test('screenshots per theme and glitch level land in gallery/screenshots', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.GS.seed(1));
  for (const theme of ['dark', 'light']) {
    for (const glitch of [0, 1, 2]) {
      await page.evaluate(([t, g]) => { window.gallery.setTheme(t); window.gallery.setGlitch(g); }, [theme, glitch]);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `gallery/screenshots/${theme}-glitch${glitch}.png`, fullPage: true });
    }
  }
  // a full-page capture reflows the page, which resizes every wallpaper mid-run
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('cycles every status, fires bypass and crash toasts, and nothing animates', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('0');
    for (const s of STATUSES) {
      await page.evaluate((v) => window.gallery.setStatus(v), s);
      await expect(page.locator('#hero-face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
    }
    await page.evaluate(() => { window.gallery.toast('bypass'); window.gallery.toast('crash'); });
    await expect(page.locator('#toasts [part="item"]')).toHaveCount(2);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => ({
      animations: document.getAnimations().length,
      glitching: document.querySelectorAll('.gs-glitch, .gs-mosh, .gs-flare').length,
      glitch: document.documentElement.dataset.glitch,
      wordmark: document.getElementById('wordmark').textContent,
    }));
    expect(state).toEqual({ animations: 0, glitching: 0, glitch: '0', wordmark: 'ghost signal' });
  });
});

test('hover color is a cut: hovering and pressing a control starts no transition', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.gallery.setGlitch(0));
  // the shipped hover token is 0ms and a 0ms transition never spawns a CSSTransition, so a
  // transition line that sneaks back would be inert here. force the token long enough to still be
  // running when we count, and the leftover shows up (¬‿¬)
  await page.addStyleTag({ content: ':root { --gs-motion-hover: 1000ms !important; }' });
  const button = page.locator('#controls button').first();
  await button.hover();
  await page.mouse.down();
  const transitions = await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSTransition).length);
  // read the press while it's held. after mouse.up() every version of the css says none
  const held = await button.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();
  expect(transitions).toBe(0);
  expect(held).toBe('matrix(1, 0, 0, 1, 0, 1)');
  expect(await button.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
});

test('moshOnce hands the text to the band copies and smears only transform and opacity', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.gallery.ambient({ min: 1e9, max: 2e9 }));
  // the wordmark decodes on load, and data-t takes whatever text is there when the mosh fires
  await expect(page.locator('#wordmark')).toHaveText('ghost signal');
  const seen = await page.evaluate(async () => {
    const { moshOnce } = await import('/src/gs.js');
    const word = document.querySelector('.gs-wordmark');
    const fired = moshOnce(word);
    const anims = word.getAnimations({ subtree: true });
    const props = new Set();
    for (const a of anims) for (const f of a.effect.getKeyframes()) for (const k of Object.keys(f)) if (['offset', 'computedOffset', 'easing', 'composite'].includes(k) === false) props.add(k);
    return { fired, t: word.dataset.t, names: anims.map((a) => a.animationName).sort(), props: [...props].sort() };
  });
  expect(seen).toEqual({ fired: true, t: 'ghost signal', names: ['gs-event-mosh', 'gs-event-mosh-a', 'gs-event-mosh-b'], props: ['opacity', 'transform'] });
  await expect(page.locator('.gs-wordmark')).not.toHaveAttribute('data-t', { timeout: 2000 });
});

test('the gallery paints once, built: loading it records no layout shift', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ value: e.value, at: e.startTime }); }).observe({ type: 'layout-shift', buffered: true });
  });
  await open(page);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({
    observing: PerformanceObserver.supportedEntryTypes.includes('layout-shift'),
    visibility: getComputedStyle(document.body).visibility,
    shifts: window.__shifts,
    failed: 'galleryFailed' in document.documentElement.dataset,
  }));
  expect(r.observing).toBe(true);
  expect(r.visibility).toBe('visible');
  expect(r.shifts).toEqual([]);
  expect(r.failed).toBe(false);
});

test('a gallery that fails to build shows what it built and stays loud', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the probe's flavor sheet 404s, so mountProbe rejects the module's top-level await after the
  // faces are built and before ready is set
  await page.route('**/apps/probe/flavor.css', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/gallery/');
  await page.waitForSelector('html[data-gallery-failed]', { state: 'attached', timeout: 10_000 });
  const r = await page.evaluate(() => ({
    ready: 'galleryReady' in document.documentElement.dataset,
    visibility: getComputedStyle(document.body).visibility,
    faces: document.querySelectorAll('#face-grid gs-face').length,
  }));
  expect(r).toEqual({ ready: false, visibility: 'visible', faces: 7 });
  expect(errors).toEqual(['probe flavor.css failed to load']);
});

test('a gallery module that never loads still reveals the page', async ({ page }) => {
  // a 404 in the static import graph fails before any gallery.js line runs, and it fires on the
  // module script element, never on window
  await page.route('**/src/components/splash.js', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/gallery/');
  await page.waitForSelector('html[data-gallery-failed]', { state: 'attached', timeout: 10_000 });
  const r = await page.evaluate(() => ({
    ready: 'galleryReady' in document.documentElement.dataset,
    visibility: getComputedStyle(document.body).visibility,
  }));
  expect(r).toEqual({ ready: false, visibility: 'visible' });
});

test('query params land the gallery at a glitch level and theme with one navigation', async ({ page }) => {
  await page.goto('/gallery/?glitch=2&theme=light');
  await page.waitForSelector('html[data-gallery-ready]');
  expect(await page.evaluate(() => [document.documentElement.dataset.glitch, document.documentElement.dataset.theme])).toEqual(['2', 'light']);
});

// every gs-decode that ever gets data-playing, from the first byte of the page. a one-time sample
// at data-gallery-ready misses a decode that played and finished while the probe app and the fonts
// loaded, so it goes green on the very bug it pins whenever that gap outruns the 250ms decode
function recordDecodes() {
  window.__played = [];
  new MutationObserver((ms) => {
    for (const m of ms) if (m.target.hasAttribute('data-playing')) window.__played.push(m.target.id || m.target.getAttribute('text'));
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-playing'] });
}

test('?glitch=0 lands before the first decode upgrades, so nothing scrambles on load', async ({ page }) => {
  // the wordmark and the empty, error and splash copy are static <gs-decode>s in the html. they
  // upgrade when the component modules define them, before gallery.js's own body runs, so the
  // param has to be on <html> by then or they scramble at the html default level 1
  await page.addInitScript(recordDecodes);
  await page.goto('/gallery/?glitch=0');
  await page.waitForSelector('html[data-gallery-ready]');
  const r = await page.evaluate(() => ({
    glitch: document.documentElement.dataset.glitch,
    decodes: document.querySelectorAll('gs-decode').length,
    played: window.__played,
  }));
  expect(r.glitch).toBe('0');
  expect(r.decodes).toBeGreaterThanOrEqual(4);
  expect(r.played).toEqual([]);
});

test('reduced motion beats ?glitch=2', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(recordDecodes);
  await page.goto('/gallery/?glitch=2');
  await page.waitForSelector('html[data-gallery-ready]');
  expect(await page.evaluate(() => [document.documentElement.dataset.glitch, window.__played])).toEqual(['0', []]);
});

test('the motion section: a view enters from its side, the tab indicator follows, the list has 300 rows', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    window.gallery.view(2);
    const body = document.querySelector('#motion-view .motion-view-body');
    const a = body.getAnimations()[0];
    const current = document.querySelector('#motion-tabs [aria-current="page"]');
    return {
      view: body.dataset.view,
      id: a?.id,
      from: a?.effect.getKeyframes()[0].transform,
      current: current.dataset.view,
      bar: document.querySelector('#motion-tabs [part="indicator"]') !== null,
      rows: document.querySelectorAll('#motion-list > div:not(.motion-list-head)').length,
      values: document.querySelectorAll('#motion-bars [data-gs-value]').length,
    };
  });
  expect(r).toEqual({ view: '2', id: 'gs-move:view', from: 'translate(16px, 0px)', current: '2', bar: true, rows: 300, values: 3 });
  await page.locator('#motion-tabs [data-view="0"]').click();
  await expect(page.locator('#motion-view .motion-view-body')).toHaveAttribute('data-view', '0');
});

// two waves inside one observation window. a single burst can't catch a stack that moves slots by
// layout: all five slots are new in the same frame, so there's no earlier slot on screen to shift.
// the second wave restacks the first two after they've landed, which is where a layout move shows
async function twoWaveBurst() {
  const t0 = performance.now();
  const out = [];
  const keep = (entries) => { for (const e of entries) if (e.startTime > t0) out.push(e.value); };
  const po = new PerformanceObserver((l) => keep(l.getEntries()));
  po.observe({ type: 'layout-shift', buffered: true });
  window.gallery.burst(2);
  const entering = document.querySelectorAll('#toasts [data-entering]').length;
  // the 167ms enter has to land before the next restack, and a fixed sleep can lose that race on a
  // slow runner. poll the frames instead, and fail loud past 5s
  const deadline = performance.now() + 5000;
  while (document.querySelector('#toasts [data-entering]') !== null) {
    if (performance.now() > deadline) throw new Error('the first wave never landed');
    await new Promise((res) => requestAnimationFrame(res));
  }
  // the enter's finish resolves in the same frame's animation step, before these rAF callbacks, so
  // the landing restack isn't painted yet. a slot never painted at its landed place can't shift
  // from it, and the control below goes quiet. two more frames put the landed stack on screen
  for (let i = 0; i < 2; i++) await new Promise((res) => requestAnimationFrame(res));
  window.gallery.burst(3);
  await new Promise((res) => setTimeout(res, 600));
  // entries arrive async, so a shift late in the window can still be queued. drain it
  keep(po.takeRecords());
  po.disconnect();
  return {
    supported: PerformanceObserver.supportedEntryTypes.includes('layout-shift'),
    entering,
    items: document.querySelectorAll('#toasts [part="item"]').length,
    shifts: out,
  };
}

test('a toast burst from the motion section shifts nothing', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(twoWaveBurst);
  // an empty shift list only means something when the observer can see shifts, the first wave was
  // really entering (so the wait waited on something) and all five toasts drew
  expect(r).toEqual({ supported: true, entering: 2, items: 5, shifts: [] });
});

test('the toast burst scenario sees a shift when the stack moves slots by layout', async ({ page }) => {
  // positive control for the test above: same scenario, toast.js restacking through `bottom`
  // instead of transform. if this goes quiet, the empty list above proves nothing
  const src = readFileSync(new URL('../../src/components/toast.js', import.meta.url), 'utf8');
  const mutant = src.replace('s.style.transform = `translateY(${offsets[i]}px)`', 's.style.bottom = `${-offsets[i]}px`');
  expect(mutant).not.toBe(src);
  await page.route('**/src/components/toast.js', (r) => r.fulfill({ contentType: 'text/javascript', body: mutant }));
  await open(page);
  const r = await page.evaluate(twoWaveBurst);
  expect(r).toMatchObject({ supported: true, entering: 2, items: 5 });
  expect(r.shifts.length).toBeGreaterThan(0);
});
