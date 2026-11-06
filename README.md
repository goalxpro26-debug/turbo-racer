# Turbo Dash: Obstacle Racer

An original one-thumb top-down obstacle racer. Mechanics only inspired by
the *genre* of one-thumb obstacle racers — no copied art, code, names,
characters, or assets. Every title, character, track, and sound is original
and procedurally drawn / synthesized.

## How to play

- **Hold to accelerate:** hold `Up` / `Space` / `W`, or press-and-hold the
  road (mouse or touch). Your car only accelerates while you hold.
- **Steer:** `Left` / `Right` (or `A` / `D`), or drag your finger/mouse
  toward the side you want to go.
- **Spinning barriers:** striped bars that sweep the road. Hitting one costs
  a wrench and slows you down.
- **Ramps:** yellow chevron pads — drive over them for a speed boost + 50 pts.
- **Rivals:** 3 rival cars per race (Ruby, Azure, Violet). Overtake one for
  +100 pts. They get faster every race.
- **Off-road:** grass slows you down — stay on the asphalt.
- **Win a race:** reach the chequered line before the 60-second clock runs out.
- **Wrenches:** 3 per race. Lose all 3 and the race is over — retry instantly.
- **Pause:** `P` or the ❚❚ button. **Mute:** `M` or the speaker button.

## Structure

- **20 races.** Each race is longer, twistier (bigger road sway), and has
  faster rivals and denser/faster-spinning barriers than the last.
  Race 1: 630 m, rivals ~15 m/s. Race 20: 1200 m, rivals ~25.5 m/s.
- **Score:** live distance points + overtake (+100) and ramp (+50) bonuses,
  plus finish bonuses (time remaining × 10, position bonus 500/300/150/50
  for 1st–4th). Best score / best race persist in `localStorage`.
- **Screens:** start menu (with How to Play), pause, level-complete
  (position, time, points, stars), game over / retry, and a champion
  screen after all 20 races.

## Tech

- Single self-contained `index.html` — plain HTML5 + vanilla JS + Canvas.
  No engine, no external assets, no network needed. Works from `file://`.
- All art is drawn with canvas primitives (cars, road, barriers, cones,
  ramps, HUD). No images, no emoji-only art.
- All audio is synthesized with WebAudio: engine hum tied to speed, crash
  noise, boost sweep, overtake blip, win/lose jingles, and an original
  upbeat music loop (C-major pentatonic lead over a I–vi–IV–V bass).
- Portrait-friendly (480×720 logical canvas, scales to fit), touch + mouse
  + keyboard. A rAF watchdog steps the game if the browser throttles
  `requestAnimationFrame` (e.g. background tabs), so gameplay stays in
  real time.

## How to run

Open `index.html` in any modern browser (desktop or mobile), or serve the
folder:

```bash
cd turbo-racer
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

## Files

- `index.html` — the whole game.
- `test-a.js` — headless test: core flows (see Test results).
- `test-b.js` — headless test: the 20-race chain + win screen.
- `test-shots/` — screenshots captured during testing.

## Test results

Tested headlessly with Playwright + the system Chromium
(`/opt/meta-chromium/chrome`), viewport 480×800, on 2026-11-06.
Run: `TMPDIR=$PWD/.tmp node test-a.js` and `node test-b.js`.

**test-a.js — all passed, zero console/page errors:**

| # | Check | Result |
|---|-------|--------|
| A1 | Page loads, menu visible | `state=menu`, menu visible |
| A2 | How-to-play opens (real click) | `howto` visible |
| A3 | Start race (real click) | `state=playing`, race 1 |
| A4 | Keyboard drive 3 s (real `ArrowUp` + Left/Right) | dist 41 m, speed 12 m/s (off-road slowdown after hard steering), score 40, 2 obstacles spawned, 3 rivals |
| A5 | Pointer hold + drag steer 3 s (real `PointerEvent`s on canvas) | dist 110 m, speed 26.4 m/s (top speed), score 110 |
| A6 | Pause (real click) + stepping while paused | `state=paused`, overlay shown, distance frozen at 122 m |
| A7 | Resume (real click) | `state=playing` |
| A8 | Mute toggle (real click) | 🔊 → 🔇 |
| A9 | Real barrier collision with 1 life left | `state=gameOver`, lives 0, game-over screen visible |
| A10 | Retry (real click) | race 1 restarts, lives 3, dist 0 |
| A11 | Real ramp collision | score 0 → 57 (+50 ramp + distance), speed 25.8 (boost) |
| A12 | Finish race 1 | `state=levelDone`, shown "1st / 1.2s / 1710 pts" |
| A13 | Next race (real click) | race 2, `state=playing`, lives 3 |
| A14 | Console / page errors | **NONE** |

**test-b.js — all passed, zero console/page errors:**

- All 20 races finished in sequence (scores 2010 → 45900, increasing
  every race), win screen shown (`state=win`, "Final score: 45900"),
  Race Again resets to race 1 with score 0.

**Screenshots verified visually:** `test-shots/01-menu.png` (title screen),
`03-driving.png` (road, rivals, HUD, progress bar), `06-leveldone.png`,
`07-win.png` (champion screen, 45900).

### Honest test notes

- **Warp-assisted finishes:** reaching a finish line by driving the full
  distance in real time would take ~30–60 s per race in the test harness,
  so the tests use a debug hook (`window.__game.warpNearFinish()`) to move
  the car near the line; the finish detection, position/score math, level
  flow, and win screen are all the real code paths.
- **Deterministic stepping:** this VM's headless Chromium throttles rAF to
  ~1 fps (measured: 2–4 frames in 3 s even on `about:blank`) and its
  timers starve under load, so wall-clock driving barely advances the
  game. The tests therefore step the real `update()` at fixed 1/60 s
  increments in-page (`window.__game.step()`). On a real device/browser
  the game runs on rAF at 60 fps. The watchdog in the game also keeps it
  in real time if rAF is throttled.
- **Environment flakiness:** the shared VM runs other agents' browsers
  concurrently; leftover Chrome processes from killed runs repeatedly
  exhausted RAM and killed the test browser mid-run (several runs died at
  a screenshot or a click with "target closed"). The passing runs above
  were done after clearing stray Chrome processes. One win screenshot
  failed once with a screenshot timeout and succeeded on retry — same
  cause, not a game defect.
- **Bugs found and fixed during testing:** (1) HUD score stayed 0 while
  driving — distance points are now live; (2) steering was too twitchy
  (road crossed in <1 s) — rate reduced and pointer steering softened;
  (3) retrying a failed race kept the failed attempt's points — retry
  now refunds them; (4) a negative frame delta (rAF timestamp vs
  `performance.now()`) could briefly corrupt score — delta now clamped
  to ≥ 0.

## Do not submit

Build only — nothing in this folder has been submitted to any portal.
