import { test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// a camera, not a test: every space motion and every event motion at glitch 0, 1 and 2, one clip
// each, for joe's eye before the tag (spec 13, risk 8). nothing here asserts anything. glitch 0
// clips of event motions show nothing on purpose: that's what glitch 0 is (¬‿¬)
const OUT = 'gallery/showcase/raw';
const pause = (page, ms = 700) => page.waitForTimeout(ms);
const into = (page, sel) => page.locator(sel).first().scrollIntoViewIfNeeded();
const click = (page, sel) => page.locator(sel).first().click();

const SPACE = {
  'tab-view-switch': async (page) => {
    await into(page, '#motion');
    for (const v of ['1', '2', '0']) { await click(page, `#motion-tabs [data-view="${v}"]`); await pause(page); }
  },
  'palette-open-highlight-close': async (page) => {
    await page.keyboard.press('Control+k');
    await pause(page, 400);
    for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowDown'); await pause(page, 140); }
    await page.keyboard.type('the');
    await pause(page, 400);
    await page.keyboard.press('Escape');
  },
  'window-open-close': async (page) => {
    await into(page, '#open-window');
    await click(page, '#open-window');
    await pause(page);
    await click(page, '#window-no');
  },
  'row-drawer': async (page) => {
    await into(page, '#row-list');
    const head = '#row-list gs-row[status="ok"] [part="head"]';
    await click(page, head);
    await pause(page);
    await click(page, head);
  },
  'toast-burst-and-restack': async (page) => {
    await into(page, '#toast-burst');
    await click(page, '#toast-burst');
    await pause(page, 4800);
  },
  'toast-dismiss': async (page) => {
    await into(page, '#toast-buttons');
    await click(page, '[data-toast-pick="deny"]');
    await click(page, '[data-toast-pick="deny"]');
    await pause(page);
    await click(page, '#toasts [part="ok"]');
  },
  'flip-row-on-top': async (page) => {
    await into(page, '#motion-shuffle');
    for (let i = 0; i < 3; i++) { await click(page, '#motion-shuffle'); await pause(page, 350); }
  },
  'value-bars': async (page) => {
    await into(page, '#motion-bars-new');
    for (let i = 0; i < 3; i++) { await click(page, '#motion-bars-new'); await pause(page, 400); }
  },
  'scroll-edge': async (page) => {
    await into(page, '#motion-list');
    await page.locator('#motion-list').hover();
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await pause(page, 150); }
  },
};

const EVENT = {
  'face-status-glitch': async (page) => {
    await into(page, '#status-buttons');
    for (const s of ['deny', 'bypass', 'crash', 'ok']) { await click(page, `[data-status-pick="${s}"]`); await pause(page, 500); }
  },
  'bypass-toast-glitch': async (page) => { await into(page, '#toast-buttons'); await click(page, '[data-toast-pick="bypass"]'); },
  'crash-toast-mosh': async (page) => { await into(page, '#toast-buttons'); await click(page, '[data-toast-pick="crash"]'); },
  'deny-row-flare': async (page) => {
    await into(page, '#row-list');
    // the deny row already flared on connect, and that flare's timer strips gs-flare mid-way
    // through a restarted one. wait it out or the clip shows 250ms of a 640ms flare >:[
    await page.waitForFunction(() => !document.querySelector('#row-list gs-row[status="deny"]').classList.contains('gs-flare'));
    await page.evaluate(async () => {
      const { flareOnce } = await import('/src/gs.js');
      flareOnce(document.querySelector('#row-list gs-row[status="deny"]'));
    });
  },
  'decode-reveal': async (page) => {
    await into(page, '#wordmark');
    // both reveals are awaited here: a page-side setTimeout outran the 900ms tail and the clip ended mid-scramble
    await page.evaluate(() => document.getElementById('wordmark').setAttribute('text', 'zero chill detected'));
    await pause(page, 700);
    await page.evaluate(() => document.getElementById('wordmark').setAttribute('text', 'ghost signal'));
    await pause(page, 600);
  },
  'ambient-micro-glitch': async (page) => {
    await into(page, '#wordmark');
    await page.evaluate(() => window.gallery.ambient({ min: 250, max: 500 }));
    await pause(page, 1500);
  },
  'tape-and-wallpaper': async (page) => {
    await into(page, '#chrome gs-tape');
    await pause(page, 900);
    await into(page, '#states');
  },
};

for (const glitch of ['0', '1', '2']) {
  test.describe(`glitch ${glitch}`, () => {
    for (const [family, moves] of [['space', SPACE], ['event', EVENT]]) {
      for (const [name, act] of Object.entries(moves)) {
        test(`${family} ${name} at glitch ${glitch}`, async ({ page }) => {
          test.setTimeout(60_000);
          await page.goto(`/gallery/?glitch=${glitch}`);
          await page.waitForSelector('html[data-gallery-ready]');
          await page.evaluate(() => window.GS.seed(1));
          await pause(page, 300);
          await act(page);
          await pause(page, 900);
          const video = page.video();
          await page.close();
          await mkdir(OUT, { recursive: true });
          await video.saveAs(`${OUT}/${family}-${name}-glitch${glitch}.webm`);
        });
      }
    }
  });
}
