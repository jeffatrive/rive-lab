# Publishing Snack Storm

The game's web page: **https://jeffatrive.github.io/rive-lab/snack-storm-play/**

It works like Earth Invasion's and Smashabout's pages (see `smashabout/PUBLISHING.md` for the full story and the
troubleshooting table):

- **The page** (`index.html`, `app.js`, `style.css`, `sw.js`, icons, `manifest.webmanifest`) is in git.
- **The game file** (`game.riv`, about 1.4 MB) is not. It's on the GitHub release `snack-storm-game`; the Pages
  workflow (`.github/workflows/static.yml`, the "Fetch the Snack Storm game file" step) copies it in on every deploy.
- **The game's source** is `snack-storm/game` (not part of rive-lab's git: only this folder is published).
- **Sound** comes from an AnimaScript synth that needs Rive's threaded runtime, so the page must be cross-origin
  isolated. `sw.js` adds the headers GitHub Pages can't send; the first visit reloads once to come back through it.
  The game starts its one AudioProcessor on its first frame, not in the World's `init`: `app.js firstStateMachine()`
  instances the default artboard once to read its state machine's name, and a start in `init` left a second processor
  behind (2026-11-07: the old build reported `processors: 2`, the new one 1). To check in a console:
  `(await rive.RuntimeLoader.awaitInstance()).riveScripting.audioState()`.
- **Progress** is kept in the browser under the localStorage key `snackStorm.save` (the game's own `save` string, see
  "The save bridge" below). Each browser and each device has its own save.

## First publish (one-time)

1. Commit and push the page and the workflow step: `git add snack-storm-play .github/workflows/static.yml`, commit,
   `git push origin main`. (Only those: `snack-storm/` must stay out of git.) The push deploys the page, which says
   "The game file didn't load" until step 2.
2. Run `snack-storm-play/publish.sh`. The first run creates the `snack-storm-game` release.

## Publishing an update

From the rive-lab folder:

```
snack-storm-play/publish.sh
```

It builds a signed file in `snack-storm/game` (`rive . --publish`), asks, uploads it to the release, redeploys the site
and waits for it. `--no-build` uploads the `game.riv` that's already there; `--yes` skips the question. (It's
`smashabout/publish.sh` pointed at this game.) Page changes go live with a normal commit + push to `main`; bump the
`?v=` on `app.js` / `style.css` in `index.html` when you change them.

`GAME_DIR=~/Documents/Dev/rive-lab/snack-storm/work/host snack-storm-play/publish.sh` publishes from another copy of
the game instead (a test snapshot).

## The save bridge (what the game and the page agree on)

GameVM properties the page uses:

| Property | Type | Who writes | When |
|---|---|---|---|
| `save` | string | page, then game | The page sets it from localStorage in `onLoad`, before the game's first frame (the player starts paused, then plays). The game reads it once on its first frame (`world.as load`) and rewrites it (`meta.as pack`, "SS7.<numbers>"; older SS4-SS6 saves still load) whenever progress changes; the page stores every change. An empty string from the game forgets the stored save. |
| `silent` | number | page | 1 while `?mute=1` or the page is hidden, else 0; set before the first frame and on every visibility change. The game reads it every frame. |
| `hasSave` | boolean | page | Optional. If the build has it, the page sets it in `onLoad` to whether a save was handed over. The game can also just look at `save`. |
| `safeTop` | number | page | The top safe-area inset in points (a phone notch or status bar; `env(safe-area-inset-top)` measured with a hidden fixed div). Set in `onLoad` before `seedData` (so `?data=safeTop=60` can override it for testing) and again on every resize or orientation change. The HUD, the Kitchen and the home / tutorial / info screens keep a spacer that tall at the top, and the camera's top inset adds it. 0 on a desktop. |

The page also copies `save` to localStorage when the page hides or unloads, and only ever stores strings that look like
a save (`SS<digits>` then dot-separated numbers).

## Page options

- `?mute=1` keeps the game silent (sets the game's `silent` before the first frame).
- `?reset=1` forgets the save in this browser and starts fresh (then drops the parameter from the address).
- `?coi=0` runs without the service worker: no threads, so no sound.
- `?data=name=value` sets a GameVM property before the first frame, like rive-cli's `--data=` (testing; repeat it for
  several: `?mute=1&data=openTab=1&data=autoplay=1`). `save` can't be seeded this way: localStorage owns it.
- In the console: `snackStorm.save()` shows the current save, `snackStorm.clearSave()` forgets it.
- Testing locally: `cd snack-storm-play && python3 -m http.server 8793`, then http://localhost:8793/?mute=1 (needs a
  `game.riv` in the folder: `publish.sh` puts one there; answer "N" at the question).

## Icons

`apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png` are the game's `App Icon` artboard rendered headless
at its native 256 px and resized (the 512 is an upscale; redo it bigger if the icon gets real art):

```
cd snack-storm/game && rive . --artboard="App Icon" --screenshot=/tmp/icon256.png --advance=0.1s
```

iPhones only pick up a new icon when you add the page to the Home Screen again.
