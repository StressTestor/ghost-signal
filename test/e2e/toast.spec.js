import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/toast.html');
  await page.waitForFunction(() => window.ready === true);
});

test('a burst of five, then the middle one dismissed, records no layout shift of any kind', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) shifts.push(e.value); }).observe({ type: 'layout-shift', buffered: true });
    const toasts = document.getElementById('toasts');
    const items = ['deny', 'bypass', 'deny', 'bypass', 'deny'].map((status, i) => toasts.toast({ status, text: `toast number ${i}` }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    items[2].querySelector('[part="ok"]').click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const slots = [...toasts.querySelectorAll(':scope > [part="slot"]')];
    return { shifts, count: slots.length, transforms: slots.map((s) => s.style.transform), items: slots.map((s) => s.firstElementChild.getAttribute('part')) };
  });
  expect(r.shifts).toEqual([]);
  expect(r.count).toBe(4);
  expect(r.items).toEqual(['item', 'item', 'item', 'item']);
  expect(r.transforms.at(-1)).toBe('translateY(0px)');
  expect(new Set(r.transforms).size).toBe(4);
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
