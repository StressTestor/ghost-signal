import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/toast.html');
  await page.waitForFunction(() => window.ready === true);
});

// chromium drops an unsupported entry type from observe() without a word, so an empty list could be
// a dead observer. the control pushes a painted block down by layout first and has to record a
// shift; only then is the buffer cleared and the toast half measured. no control entry, no verdict XX
async function startShiftProbe() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const probe = { shifts: [], obs: null };
  const drain = () => { for (const e of probe.obs.takeRecords()) probe.shifts.push(e.value); };
  probe.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) probe.shifts.push(e.value); });
  probe.obs.observe({ type: 'layout-shift', buffered: true });
  const block = document.createElement('div');
  block.style.cssText = 'width: 200px; height: 40px; background: #888;';
  document.body.prepend(block);
  await frame();
  const spacer = document.createElement('div');
  spacer.style.height = '100px';
  block.before(spacer);
  await frame();
  drain();
  const control = probe.shifts.slice();
  spacer.remove();
  block.remove();
  await frame();
  drain();
  probe.shifts.length = 0;
  window.shiftProbe = probe;
  return { supported: PerformanceObserver.supportedEntryTypes.includes('layout-shift'), control };
}

// entries still queued when the scenario ends are read too, then the observer goes away
async function readShiftProbe() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const probe = window.shiftProbe;
  for (const e of probe.obs.takeRecords()) probe.shifts.push(e.value);
  probe.obs.disconnect();
  return probe.shifts;
}

async function expectLiveProbe(page) {
  const live = await page.evaluate(startShiftProbe);
  expect(live.supported).toBe(true);
  expect(live.control.length).toBeGreaterThan(0);
}

// slot boxes oldest first, read after two frames so a resize has laid out and restacked
async function slotRects(page) {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return [...document.querySelectorAll('#toasts > [part="slot"]')].map((s) => {
      const b = s.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, height: b.height };
    });
  });
}

// oldest on top: every slot starts at or below the bottom of the one before it
function expectNoOverlap(rects) {
  for (const b of rects) expect(b.height).toBeGreaterThan(0);
  for (let i = 1; i < rects.length; i++) expect(rects[i].top).toBeGreaterThanOrEqual(rects[i - 1].bottom);
}

test('a burst of five, then the middle one dismissed, records no layout shift of any kind', async ({ page }) => {
  await expectLiveProbe(page);
  const r = await page.evaluate(async () => {
    const toasts = document.getElementById('toasts');
    const items = ['deny', 'bypass', 'deny', 'bypass', 'deny'].map((status, i) => toasts.toast({ status, text: `toast number ${i}` }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    items[2].querySelector('[part="ok"]').click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const slots = [...toasts.querySelectorAll(':scope > [part="slot"]')];
    return { count: slots.length, transforms: slots.map((s) => s.style.transform), items: slots.map((s) => s.firstElementChild.getAttribute('part')) };
  });
  expect(await page.evaluate(readShiftProbe)).toEqual([]);
  expect(r.count).toBe(4);
  expect(r.items).toEqual(['item', 'item', 'item', 'item']);
  expect(r.transforms.at(-1)).toBe('translateY(0px)');
  expect(new Set(r.transforms).size).toBe(4);
});

// five toast() calls in one task make one layout, so the burst above never shifted on arrival even
// on the v0.1 column. a bridge delivers them one at a time: each lands after the last one painted (p7)
test('five arrivals a frame apart record no layout shift', async ({ page }) => {
  await expectLiveProbe(page);
  await page.evaluate(async () => {
    const toasts = document.getElementById('toasts');
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const [i, status] of ['deny', 'bypass', 'deny', 'bypass', 'deny'].entries()) {
      toasts.toast({ status, text: `toast number ${i}` });
      await frame();
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(await page.evaluate(readShiftProbe)).toEqual([]);
});

// deny and bypass stick until dismissed, so a resize that rewraps them has to restack the offsets
test('sticky toasts that rewrap on a narrower viewport never overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.evaluate(async () => {
    const toasts = document.getElementById('toasts');
    for (let i = 0; i < 3; i++) toasts.toast({ status: 'deny', text: `permission denied for the write to the config file number ${i} in the vault` });
    await new Promise((resolve) => setTimeout(resolve, 800));
  });
  const wide = await slotRects(page);
  await page.setViewportSize({ width: 300, height: 800 });
  const narrow = await slotRects(page);
  expect(wide).toHaveLength(3);
  expect(narrow).toHaveLength(3);
  // the text has to rewrap, or the overlap check below passes on nothing
  narrow.forEach((b, i) => expect(b.height).toBeGreaterThan(wide[i].height));
  expectNoOverlap(wide);
  expectNoOverlap(narrow);
});

test('toasts added while the anchor is hidden or detached restack once it renders', async ({ page }) => {
  await page.evaluate(() => {
    const toasts = document.getElementById('toasts');
    toasts.style.display = 'none';
    for (let i = 0; i < 3; i++) toasts.toast({ status: 'deny', text: `hidden ${i}` });
    toasts.style.display = '';
  });
  const hidden = await slotRects(page);
  await page.evaluate(() => {
    const toasts = document.getElementById('toasts');
    toasts.remove();
    for (let i = 0; i < 2; i++) toasts.toast({ status: 'deny', text: `detached ${i}` });
    document.body.append(toasts);
  });
  const detached = await slotRects(page);
  expect(hidden).toHaveLength(3);
  expect(detached).toHaveLength(5);
  expectNoOverlap(hidden);
  expectNoOverlap(detached);
});

// disconnect drops every observation. reattached with no new toast(), nothing else re-observes the
// old slots, so a rewrap after the reattach only restacks if connectedCallback observed them again
test('slots that survive a detach and reattach still restack when a resize rewraps them', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.evaluate(async () => {
    const toasts = document.getElementById('toasts');
    for (let i = 0; i < 3; i++) toasts.toast({ status: 'deny', text: `permission denied for the write to the config file number ${i} in the vault` });
    await new Promise((resolve) => setTimeout(resolve, 300));
    toasts.remove();
    document.body.append(toasts);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  const wide = await slotRects(page);
  await page.setViewportSize({ width: 300, height: 800 });
  const narrow = await slotRects(page);
  expect(narrow).toHaveLength(3);
  // no rewrap, no test: the overlap check needs heights that changed after the reattach
  narrow.forEach((b, i) => expect(b.height).toBeGreaterThan(wide[i].height));
  expectNoOverlap(narrow);
});

test('the anchor has no height and every slot is pinned to its bottom right', async ({ page }) => {
  const r = await page.evaluate(() => {
    const toasts = document.getElementById('toasts');
    toasts.toast({ status: 'deny', text: 'one' });
    const slot = toasts.querySelector('[part="slot"]');
    return { height: toasts.getBoundingClientRect().height, position: getComputedStyle(slot).position, bottom: getComputedStyle(slot).bottom };
  });
  expect(r).toEqual({ height: 0, position: 'absolute', bottom: '0px' });
});
