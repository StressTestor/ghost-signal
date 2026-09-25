import { test, expect } from '@playwright/test';

// both #d and #t/#t2 declare markup attributes (text, status) statically, so on load the
// browser upgrades already-attributed elements: attributeChangedCallback fires before
// connectedCallback has built #span/#track. a regression here throws on the null internals.
test('declarative markup upgrades with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/test/e2e/pages/decode.html');
  await page.waitForSelector('gs-tape#t [part="track"]');
  expect(errors).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/decode.html');
  await page.waitForSelector('gs-tape#t [part="track"]');
});

test('decode plays over the decode token and lands on the text', async ({ page }) => {
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const el = document.getElementById('d');
    const frames = [];
    const mo = new MutationObserver(() => frames.push(el.textContent));
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    el.addEventListener('gs-decode-done', () => {
      // the final tick's mutation record is still queued; take it before disconnecting
      for (const r of mo.takeRecords()) frames.push(r.target.textContent);
      frames.push(el.textContent);
      mo.disconnect();
      resolve({ frames, playing: el.hasAttribute('data-playing') });
    }, { once: true });
    window.GS.seed(1);
    el.setAttribute('text', 'zero chill');
  }));
  expect(seen.frames.at(-1)).toBe('zero chill');
  expect(seen.frames.length).toBeGreaterThan(2);
  expect(seen.frames[0]).not.toBe('zero chill');
  expect(seen.playing).toBe(false);
  await expect(page.locator('#inline')).toHaveText('from content');
});

test('decode is instant at glitch 0', async ({ page }) => {
  const result = await page.evaluate(() => {
    document.documentElement.dataset.glitch = '0';
    const el = document.getElementById('d');
    el.setAttribute('text', 'instant');
    return { text: el.textContent, playing: el.hasAttribute('data-playing') };
  });
  expect(result).toEqual({ text: 'instant', playing: false });
});

test('tape repeats caps text an even number of times and picks the status color', async ({ page }) => {
  const info = await page.evaluate(() => {
    const t = document.getElementById('t');
    const t2 = document.getElementById('t2');
    const track = t.querySelector('[part="track"]').textContent;
    return {
      count: track.split('ZERO CHILL DETECTED').length - 1,
      lower: track.includes('zero'),
      color: t.style.getPropertyValue('--gs-tape-color'),
      color2: t2.style.getPropertyValue('--gs-tape-color'),
      bg2: getComputedStyle(t2).backgroundColor,
      animated: t.querySelector('[part="track"]').getAnimations().length,
    };
  });
  expect(info.count).toBeGreaterThanOrEqual(2);
  expect(info.count % 2).toBe(0);
  expect(info.lower).toBe(false);
  expect(info.color).toBe('var(--gs-color-bypass)');
  expect(info.color2).toBe('var(--gs-color-ok)');
  expect(info.bg2).toBe('rgb(12, 192, 203)');
  expect(info.animated).toBe(1);
});

test('an idle tape prints in the text color, not on-accent on the faint fill', async ({ page }) => {
  const idle = await page.evaluate(() => {
    const t = document.getElementById('t2');
    t.setAttribute('status', 'idle');
    const cs = getComputedStyle(t);
    return { color: cs.color, bg: cs.backgroundColor };
  });
  expect(idle).toEqual({ color: 'rgb(238, 241, 242)', bg: 'rgb(58, 62, 65)' });
});

test('tape is static at glitch 0', async ({ page }) => {
  const animated = await page.evaluate(() => {
    document.documentElement.dataset.glitch = '0';
    return document.querySelector('#t [part="track"]').getAnimations().length;
  });
  expect(animated).toBe(0);
});

test.describe('reduced motion', () => {
  // reducedMotion is only reachable through contextOptions (or page.emulateMedia) in the
  // pinned @playwright/test 1.58.2; test.use({ reducedMotion: 'reduce' }) is a no-op there.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('decode is instant and nothing animates', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.getElementById('d');
      el.setAttribute('text', 'quiet');
      return { text: el.textContent, animations: document.getAnimations().length, glitch: document.documentElement.dataset.glitch };
    });
    expect(result).toEqual({ text: 'quiet', animations: 0, glitch: '0' });
  });
});

test('a decode in a flex row holds its width on every scramble frame and shifts nothing', async ({ page }) => {
  const r = await page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    const shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime > t0) shifts.push(e.value); }).observe({ type: 'layout-shift', buffered: true });
    const el = document.getElementById('fd');
    const after = document.getElementById('after');
    const widths = [];
    const lefts = [];
    const mo = new MutationObserver(() => {
      widths.push(el.getBoundingClientRect().width);
      lefts.push(after.getBoundingClientRect().left);
    });
    mo.observe(el, { subtree: true, childList: true, characterData: true });
    el.addEventListener('gs-decode-done', () => {
      for (const rec of mo.takeRecords()) if (rec) widths.push(el.getBoundingClientRect().width);
      mo.disconnect();
      widths.push(el.getBoundingClientRect().width);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ widths, lefts, shifts, final: el.hasAttribute('data-final') })));
    }, { once: true });
    // the same text again: a new, longer text would change the width once by design. what must not
    // change it is the scramble, which draws in mono
    window.GS.seed(3);
    el.setAttribute('text', 'width holds');
  }));
  expect(r.widths.length).toBeGreaterThan(2);
  expect(new Set(r.widths).size).toBe(1);
  expect(new Set(r.lefts).size).toBe(1);
  expect(r.shifts).toEqual([]);
  expect(r.final).toBe(false);
});

// the overlay is sized to the final text in the host's font but draws in mono, which is wider. if it
// wrapped inside that box, overflow: hidden ate whole lines: "width holds" lost its second word for the
// entire scramble. so the overlay stays on one line and only its right edge clips. #nd wraps to two
// lines in the host font, which pins the trade-off: its lower line is blank while it plays
test('the scramble overlay never loses a line to the clip, single line or wrapping host', async ({ page }) => {
  const r = await page.evaluate(() => new Promise((resolve) => {
    const hosts = ['fd', 'nd'].map((id) => document.getElementById(id));
    const samples = { fd: [], nd: [] };
    const mo = new MutationObserver(() => {
      for (const el of hosts) {
        if (el.hasAttribute('data-playing') === false) continue;
        const s = el.querySelector('[part="text"]');
        samples[el.id].push({ sh: s.scrollHeight, ch: s.clientHeight });
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    let left = hosts.length;
    for (const el of hosts) {
      el.addEventListener('gs-decode-done', () => {
        left -= 1;
        if (left === 0) { mo.disconnect(); resolve(samples); }
      }, { once: true });
    }
    window.GS.seed(3);
    for (const el of hosts) el.setAttribute('text', el.getAttribute('text'));
  }));
  expect(r.fd.length).toBeGreaterThan(2);
  expect(r.nd.length).toBeGreaterThan(2);
  // the wrapping host really is taller than one line, or this case proves nothing
  expect(r.nd[0].ch).toBeGreaterThan(r.fd[0].ch * 1.5);
  expect(r.fd.filter((s) => s.sh > s.ch)).toEqual([]);
  expect(r.nd.filter((s) => s.sh > s.ch)).toEqual([]);
});
