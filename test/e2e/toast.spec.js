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
  const r = await page.evaluate(async () => {
    const item = document.getElementById('toasts').toast({ status: 'bypass', text: 'something got through' });
    const slot = item.parentElement;
    // the slot's enter starts in the burst's one restack, a microtask after toast() returns
    await Promise.resolve();
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

// a burst restacks as it arrives (spec 4.1, and 6.6 as amended 2026-09-27): a same-task burst of
// three takes three places on its first frame, and a second wave 60ms later moves the first one up
// from wherever its enter has it, with no cut. a third wave 60ms after that lands while the first
// wave's retargeted enter still runs, which is when a slot handed back to the stack too early would
// get a transition under its enter. the pile-up this replaces parked every slot of a burst on the
// anchor until its own enter landed, then healed by the end, so only a frame-by-frame read sees it.
// between waves a mover crosses the newcomers' boxes on its way up; that's the restack itself, so
// overlap is only judged inside a wave and on the places (¬‿¬)
test('a burst restacks as it arrives: each slot takes its place at once, and a second wave moves the first from where it is', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const t = document.getElementById('toasts');
    const gap = parseFloat(getComputedStyle(t).getPropertyValue('--gs-space-2')) || 8;
    const all = () => [...t.querySelectorAll(':scope > [part="slot"]')];
    const placeOf = (s) => Number(/translateY\((-?[\d.]+)px\)/.exec(s.style.transform)?.[1]);
    const frames = [];
    const snap = (wave) => {
      const anchor = t.getBoundingClientRect().bottom;
      frames.push({
        wave,
        slots: all().map((s) => {
          const anims = s.getAnimations();
          // one transform animation per carrier: a css transition under a running enter plays out
          // hidden, and the slot cuts to it the frame the enter is cancelled
          const mixed = anims.some((a) => a instanceof CSSTransition) && anims.some((a) => a.id.startsWith('gs-move:'));
          return { wave: Number(s.dataset.wave), place: placeOf(s), y: s.getBoundingClientRect().bottom - anchor, height: s.offsetHeight, entering: s.hasAttribute('data-entering'), mixed };
        }),
      });
    };
    const arrive = (n, wave) => {
      for (let i = 0; i < n; i++) t.toast({ status: 'deny', text: `wave ${wave}, toast ${i + 1}` }).parentElement.dataset.wave = String(wave);
    };
    const moving = () => all().some((s) => s.hasAttribute('data-entering') || s.getAnimations().length > 0);
    const t0 = performance.now();
    arrive(3, 1);
    do {
      await raf();
      snap(1);
    } while (performance.now() - t0 < 60);
    arrive(2, 2);
    const enteringAtWave2 = all().filter((s) => s.dataset.wave === '1').map((s) => s.hasAttribute('data-entering'));
    do {
      await raf();
      snap(2);
    } while (performance.now() - t0 < 120);
    arrive(1, 3);
    const movingAtWave3 = all().filter((s) => s.dataset.wave === '1').map((s) => s.getAnimations().some((a) => a.id.startsWith('gs-move:')));
    for (let i = 0; i < 120 && moving(); i++) {
      await raf();
      snap(3);
    }
    await raf();
    snap(3);
    return { gap, frames, enteringAtWave2, movingAtWave3 };
  });
  // wave 2 has to land on a first wave still entering, and wave 3 on its retargeted enter, or
  // neither case ran
  expect(r.enteringAtWave2).toEqual([true, true, true]);
  expect(r.movingAtWave3).toEqual([true, true, true]);
  const first = r.frames[0];
  const wave2 = r.frames.filter((f) => f.wave === 2);
  const after = r.frames.filter((f) => f.wave >= 2);
  expect(first.slots.length).toBe(3);
  expect(wave2.length).toBeGreaterThanOrEqual(2);
  expect(wave2[0].slots.length).toBe(5);
  const bad = [];
  for (const [n, f] of r.frames.entries()) {
    const s = f.slots;
    for (const [i, x] of s.entries()) if (x.mixed) bad.push(`frame ${n}: slot ${i} runs a transition under its enter`);
    for (let i = 1; i < s.length; i++) {
      // places: the stack's own offsets from the first frame on, never two slots on the anchor
      if (s[i - 1].place > s[i].place - s[i].height - r.gap + 0.5) bad.push(`frame ${n}: slots ${i - 1} and ${i} share a place (${s[i - 1].place}, ${s[i].place})`);
      // slots that arrived together move together and never overlap on screen
      if (s[i - 1].wave === s[i].wave && s[i - 1].y > s[i].y - s[i].height + 0.5) bad.push(`frame ${n}: wave ${s[i].wave} slots ${i - 1} and ${i} overlap (${s[i - 1].y}, ${s[i].y})`);
    }
  }
  expect(bad).toEqual([]);
  // an arrival renders at its place on its first frame: it slides in from the right, never from the anchor
  for (const s of first.slots) expect(s.y).toBeCloseTo(s.place, 0);
  for (const s of wave2[0].slots.filter((x) => x.wave === 2)) expect(s.y).toBeCloseTo(s.place, 0);
  // the first wave rides up from where it was: on the wave's first frame it hasn't cut to its new
  // place, it only ever moves up, and it gets there
  const firstWave = (f) => f.slots.filter((x) => x.wave === 1);
  const before = firstWave(r.frames.filter((f) => f.wave === 1).at(-1));
  for (const [i, s] of firstWave(wave2[0]).entries()) {
    expect(s.y).toBeGreaterThan(s.place + 1);
    expect(s.y).toBeLessThanOrEqual(before[i].y + 0.5);
  }
  for (let n = 1; n < after.length; n++) {
    for (const [i, s] of firstWave(after[n]).entries()) expect(s.y).toBeLessThanOrEqual(firstWave(after[n - 1])[i].y + 0.5);
  }
  // --gs-ease-enter only decelerates, so between arrivals every slot only slows down. a slot handed
  // back to the stack mid enter rides its old enter to its old place, all but stops, then cuts to
  // the new one when that enter is cancelled. a dropped frame can double a step; a cut is 50px after
  // a near stop. the first frame of each wave is exempt, where a retarget starts at full speed
  const cuts = [];
  for (let n = 2; n < r.frames.length; n++) {
    if (r.frames[n].wave !== r.frames[n - 1].wave || r.frames[n - 1].wave !== r.frames[n - 2].wave) continue;
    for (const [i, s] of r.frames[n].slots.entries()) {
      const a = r.frames[n - 2].slots[i];
      const b = r.frames[n - 1].slots[i];
      if (a === undefined || b === undefined) continue;
      const step = Math.abs(s.y - b.y);
      const prev = Math.abs(b.y - a.y);
      if (step > prev * 2.5 + 2) cuts.push(`frame ${n}: slot ${i} stepped ${step.toFixed(1)}px after ${prev.toFixed(1)}px`);
    }
  }
  expect(cuts).toEqual([]);
  const last = r.frames.at(-1).slots;
  expect(last.length).toBe(6);
  for (const s of last) expect(s.entering).toBe(false);
  for (const s of last) expect(s.y).toBeCloseTo(s.place, 0);
  for (let i = 1; i < last.length; i++) expect(last[i].y - last[i].height).toBeGreaterThanOrEqual(last[i - 1].y - 0.5);
});
