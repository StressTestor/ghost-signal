import { test, expect } from '@playwright/test';

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
  }));
  expect(r.observing).toBe(true);
  expect(r.visibility).toBe('visible');
  expect(r.shifts).toEqual([]);
});
