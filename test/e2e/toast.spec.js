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

// slot boxes oldest first. two frames so a resize has laid out and the observer restacked, then
// until every slot has landed: with motion.css the restack eases and an arrival slides in, and a box
// read mid-flight overlaps its neighbour on nothing but timing. own animations only, so a decode or
// a glitch on the item can't hold the wait open
async function slotRects(page) {
  return page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await frame();
    const slots = () => [...document.querySelectorAll('#toasts > [part="slot"]')];
    const moving = () => slots().some((s) => s.hasAttribute('data-entering') || s.getAnimations().length > 0);
    for (let i = 0; i < 120 && moving(); i++) await frame();
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

// the cut path on purpose: with motion.css each enter restacks the stack when it lands, heights and
// all, and that alone passes this test with the observer and the reconnect restack both gone XX
test('toasts added while the anchor is hidden or detached restack once it renders', async ({ page }) => {
  await page.evaluate(async () => {
    document.querySelector('link[href$="motion.css"]').remove();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
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

test('a bypass toast glitches its item and never its slot; the slot only slides in', async ({ page }) => {
  const r = await page.evaluate(() => {
    const item = document.getElementById('toasts').toast({ status: 'bypass', text: 'something got through' });
    const slot = item.parentElement;
    return {
      slot: slot.getAnimations().map((a) => a.id),
      item: item.getAnimations().map((a) => a.animationName),
      from: slot.getAnimations()[0]?.effect.getKeyframes()[0].transform,
    };
  });
  expect(r.slot).toEqual(['gs-move:enter']);
  expect(r.item).toEqual(['gs-event-glitch-shift']);
  expect(r.from).toBe('translate(24px, 0px)');
});

test('dismissing the newest slides it out, removes it, then the older slot closes the gap', async ({ page }) => {
  await page.evaluate(() => {
    const t = document.getElementById('toasts');
    t.toast({ status: 'deny', text: 'one' });
    t.toast({ status: 'deny', text: 'two' });
  });
  // the first slot restacks only after its own 167ms enter, then eases 200ms: let both finish
  await page.waitForTimeout(700);
  // the newest sits at the bottom at translateY(0px) the whole time, so dismissing it is the case
  // where something has to move: the older slot, from above, down to 0
  const r = await page.evaluate(() => {
    const [older, newest] = document.querySelectorAll('#toasts [part="slot"]');
    const before = older.style.transform;
    newest.querySelector('[part="ok"]').click();
    return { before, ids: newest.getAnimations().map((a) => a.id), leaving: newest.hasAttribute('data-leaving') };
  });
  expect(r.before).not.toBe('translateY(0px)');
  expect({ ids: r.ids, leaving: r.leaving }).toEqual({ ids: ['gs-move:exit'], leaving: true });
  await expect(page.locator('#toasts [part="slot"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.querySelector('#toasts [part="slot"]').style.transform)).toBe('translateY(0px)');
  // and it got there on screen, not only in its style attribute
  await expect.poll(() => page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#toasts [part="slot"]')).transform).m42)).toBe(0);
});

// the arrival that lands on a slot still entering. the restack mustn't write that slot's offset
// until its enter lands, or the css transition starts under the web animation, runs out hidden,
// and the slot cuts to its place the frame the enter is cancelled. every other test here passes
// with that guard gone, so this one watches the older slot frame by frame (¬‿¬)
test('a slot still entering keeps offset 0 until it lands, then eases to its place', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const t = document.getElementById('toasts');
    const older = t.toast({ status: 'deny', text: 'one' }).parentElement;
    for (let i = 0; i < 3; i++) await raf();
    const enteringAtArrival = older.hasAttribute('data-entering');
    t.toast({ status: 'deny', text: 'two' });
    const y = () => new DOMMatrixReadOnly(getComputedStyle(older).transform).m42;
    const during = [];
    const snap = () => during.push({ transform: older.style.transform, ids: older.getAnimations().map((a) => a.id), y: y() });
    snap();
    for (let i = 0; i < 120 && older.hasAttribute('data-entering'); i++) {
      await raf();
      if (older.hasAttribute('data-entering')) snap();
    }
    const landed = older.getAnimations().map((a) => ({ id: a.id, property: a.transitionProperty ?? null }));
    const path = [y()];
    for (let i = 0; i < 120 && older.getAnimations().length > 0; i++) {
      await raf();
      path.push(y());
    }
    return { enteringAtArrival, during, landed, path, final: older.style.transform, stillEntering: older.hasAttribute('data-entering') };
  });
  // no enter still running when the second toast arrived, no case to test
  expect(r.enteringAtArrival).toBe(true);
  expect(r.stillEntering).toBe(false);
  expect(r.during.length).toBeGreaterThan(0);
  for (const d of r.during) expect(d).toEqual({ transform: 'translateY(0px)', ids: ['gs-move:enter'], y: 0 });
  // the enter is gone and the restack runs as a transform transition, from 0
  expect(r.landed).toEqual([{ id: '', property: 'transform' }]);
  const target = Number(/translateY\((-?[\d.]+)px\)/.exec(r.final)?.[1]);
  expect(target).toBeLessThan(0);
  // eased, not cut: at least one frame caught strictly between 0 and the place, then it settles there
  expect(r.path.some((v) => v < 0 && v > target)).toBe(true);
  expect(r.path.at(-1)).toBeCloseTo(target, 3);
});
