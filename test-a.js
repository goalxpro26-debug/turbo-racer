// test-a.js — core flows for Turbo Dash, headless.
// Real Playwright input where it matters: DOM clicks (menu/how-to/start/
// pause/resume/mute/retry/next) and real keyboard (ArrowUp gas + steering).
// The simulation is stepped deterministically in-page (60 x 1/60s per second
// of game time) because this VM's headless Chromium throttles rAF to ~1fps
// and timers under load — wall-clock driving would not advance the game.
// Pointer hold/steer is exercised by dispatching real PointerEvents on the
// canvas, which run through the game's own pointer handlers.
// Run: TMPDIR=$PWD/.tmp timeout 115 node test-a.js
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
    const g = () => page.evaluate(() => ({ state: window.__game.state, level: window.__game.level, score: window.__game.score, lives: window.__game.lives, dist: Math.round(window.__game.dist), speed: Math.round(window.__game.speed * 10) / 10, timeLeft: Math.round(window.__game.timeLeft), obs: window.__game.obstacles, rivals: window.__game.rivals }));
    const vis = id => page.evaluate(id => !document.getElementById(id).classList.contains('hidden'), id);
    const shot = async n => { try { await page.screenshot({ path: path.join(DIR, 'test-shots', n), timeout: 8000 }); console.log('   shot ' + n + ' ok'); } catch (e) { console.log('   shot ' + n + ' FAILED (non-fatal, env screenshot flake)'); } };
    // step the real update() N times at 1/60s inside the page
    const drive = sec => page.evaluate(s => { let r; for (let i = 0; i < Math.round(s * 60); i++) r = window.__game.step(1 / 60); return r; }, sec);
    const log = (...a) => console.log(...a);
    fs.mkdirSync(path.join(DIR, 'test-shots'), { recursive: true });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    log('A1 LOAD: state=', (await g()).state, '| menu visible=', await vis('menu'));
    await shot('01-menu.png');
    await page.click('#howBtn');
    await page.waitForTimeout(300);
    log('A2 HOW-TO: visible=', await vis('howto'), '| state=', (await g()).state);
    await page.click('#howBackBtn');
    await page.waitForTimeout(300);
    log('A3 START (via How-to Got-it): state=', (await g()).state, '| level=', (await g()).level);

    // --- keyboard gas + steering, 3s of game time ---
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowRight');
    await drive(1.5);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowLeft');
    await drive(1.5);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
    const kb = await g();
    log('A4 KEYBOARD drive 3s: dist=', kb.dist, ' speed=', kb.speed, ' score=', kb.score, ' obs=', kb.obs, ' rivals=', kb.rivals, ' lives=', kb.lives);

    // --- pointer hold (gas) + drag steer via real PointerEvents, 3s ---
    await page.evaluate(() => {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      window.__ptrR = r;
    });
    await drive(1.5);
    await page.evaluate(() => {
      const c = document.getElementById('game'); const r = window.__ptrR;
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.7, clientY: r.top + r.height / 2, bubbles: true }));
    });
    await drive(1.5);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    const pt = await g();
    log('A5 POINTER hold+steer 3s: dist=', pt.dist, ' speed=', pt.speed, ' score=', pt.score, ' lives=', pt.lives);
    await shot('03-driving.png');

    // --- pause / resume via real button clicks ---
    await page.click('#pauseBtn');
    await page.waitForTimeout(300);
    log('A6 PAUSE: state=', (await g()).state, '| overlay=', await vis('paused'));
    const pausedDist = (await g()).dist;
    await drive(1); // stepping while paused must NOT advance the race
    log('A6b PAUSED stepping: dist before=', pausedDist, ' after=', (await g()).dist);
    await page.click('#resumeBtn');
    await page.waitForTimeout(300);
    log('A7 RESUME: state=', (await g()).state);

    // --- mute toggle ---
    const mb = await page.evaluate(() => document.getElementById('muteBtn').textContent);
    await page.click('#muteBtn');
    await page.waitForTimeout(200);
    const ma = await page.evaluate(() => document.getElementById('muteBtn').textContent);
    log('A8 MUTE: before=', JSON.stringify(mb), ' after=', JSON.stringify(ma));

    // --- real crash -> game over -> retry ---
    await page.evaluate(() => { window.__game.setLives(1); window.__game.spawnAtPlayer('barrier'); });
    await drive(0.5);
    const crash = await g();
    log('A9 CRASH (real collision, 1 life): state=', crash.state, ' lives=', crash.lives, '| gameOver visible=', await vis('gameOver'));
    await page.click('#retryBtn');
    await page.waitForTimeout(300);
    const retry = await g();
    log('A10 RETRY: state=', retry.state, ' level=', retry.level, ' lives=', retry.lives, ' dist=', retry.dist);

    // --- ramp boost (real collision path) ---
    const sb = (await g()).score;
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.__game.spawnAtPlayer('ramp'));
    await drive(0.5);
    await page.keyboard.up('ArrowUp');
    const ramp = await g();
    log('A11 RAMP: score before=', sb, ' after=', ramp.score, ' speed=', ramp.speed);

    // --- finish race 1 (warp-assisted) + next race ---
    await page.evaluate(() => window.__game.warpNearFinish());
    await page.keyboard.down('ArrowUp');
    await drive(1.5);
    await page.keyboard.up('ArrowUp');
    const done = await g();
    log('A12 FINISH race 1 (warp-assisted): state=', done.state, '| levelDone=', await vis('levelDone'),
      '| shown:', await page.evaluate(() => [document.getElementById('ldPos').textContent, document.getElementById('ldTime').textContent, document.getElementById('ldPts').textContent].join(' / ')));
    await shot('06-leveldone.png');
    await page.click('#nextBtn');
    await page.waitForTimeout(300);
    const l2 = await g();
    log('A13 NEXT RACE: state=', l2.state, ' level=', l2.level, ' dist=', l2.dist, ' lives=', l2.lives);
    log('A14 CONSOLE/PAGE ERRORS:', errors.length ? errors.join(' | ') : 'NONE');
  } finally { await browser.close().catch(() => {}); }
  console.log('TEST-A DONE');
})().catch(e => { console.error('TEST-A FAILED:', String(e).slice(0, 300)); process.exit(1); });
