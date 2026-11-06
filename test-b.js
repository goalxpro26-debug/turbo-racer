// test-b.js — 20-race chain for Turbo Dash.
// The whole chain runs inside ONE in-page evaluate (warp near each finish,
// hold gas via a real dispatched keydown, step the real update() at 1/60s,
// click Next via real DOM .click()) because Playwright round-trips on this
// contended VM take seconds each and 20 races x several round-trips each
// exceeds any timeout. Real Playwright clicks/keyboard for the same buttons
// and keys are already proven in test-a.js; this file proves the 20-level
// chain, the win screen and Race Again.
// Run: TMPDIR=$PWD/.tmp timeout 115 node test-b.js
const { chromium } = require('/home/hatch/workspace/tools/pw-shot/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const URL = 'file://' + path.join(DIR, 'index.html');
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hatch-webgl-allowed-domains-file=/home/hatch/workspace/tools/pw-shot/webgl-policy.txt', '--hatch-webgl-allowed-domains-sha256=dc8a0e5eec744f6590a4c1889139c00568ffedc3eced6d0a1a5127e35f9ccd16', '--autoplay-policy=no-user-gesture-required'];

(async () => {
  let browser;
  for (let a = 1; a <= 3; a++) {
    try { browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', headless: true, args: ARGS }); break; }
    catch (e) { console.log('launch attempt ' + a + ' failed, retrying...'); await new Promise(r => setTimeout(r, 2000)); }
  }
  if (!browser) throw new Error('browser launch failed');
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 800 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
    fs.mkdirSync(path.join(DIR, 'test-shots'), { recursive: true });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.click('#startBtn');
    await page.waitForTimeout(300);
    console.log('B1 START: ', JSON.stringify(await page.evaluate(() => ({ state: window.__game.state, level: window.__game.level, score: window.__game.score }))));

    const chain = await page.evaluate(() => {
      const log = [];
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      for (let lv = 1; lv <= 20; lv++) {
        window.__game.warpNearFinish();
        let done = false;
        for (let i = 0; i < 180; i++) { // up to 3s of game time per race
          window.__game.step(1 / 60);
          if (window.__game.state === 'levelDone') { done = true; break; }
        }
        log.push({ race: lv, finished: done, state: window.__game.state, score: window.__game.score });
        if (!done) break;
        document.getElementById('nextBtn').click();
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
      return { log, endState: window.__game.state, winVisible: !document.getElementById('winScreen').classList.contains('hidden'), winScore: document.getElementById('winScore').textContent };
    });
    chain.log.forEach(r => console.log('B2 race', r.race, 'finished=' + r.finished, 'state=' + r.state, 'score=' + r.score));
    console.log('B3 AFTER 20 RACES: state=', chain.endState, '| winScreen visible=', chain.winVisible, '| final score shown:', chain.winScore);
    try { await page.screenshot({ path: path.join(DIR, 'test-shots', '07-win.png'), timeout: 8000 }); console.log('   shot 07-win.png ok'); } catch (e) { console.log('   shot 07-win.png FAILED (non-fatal, env screenshot flake)'); }
    await page.click('#againBtn');
    await page.waitForTimeout(300);
    console.log('B4 RACE AGAIN: ', JSON.stringify(await page.evaluate(() => ({ state: window.__game.state, level: window.__game.level, score: window.__game.score }))));
    console.log('B5 CONSOLE/PAGE ERRORS:', errors.length ? errors.join(' | ') : 'NONE');
  } finally { await browser.close().catch(() => {}); }
  console.log('TEST-B DONE');
})().catch(e => { console.error('TEST-B FAILED:', String(e).slice(0, 300)); process.exit(1); });
