# Publishing Earth Invasion

The game's web page: **https://jeffatrive.github.io/rive-lab/earth-invasion/**

It works like Smashabout's page (see `smashabout/PUBLISHING.md` for the full story and the troubleshooting table):

- **The page** (`index.html`, `app.js`, `style.css`, `sw.js`, icons, `manifest.webmanifest`) is in git.
- **The game file** (`game.riv`, about 3 MB) is not. It's on the GitHub release `earth-invasion-game`; the Pages
  workflow (`.github/workflows/static.yml`) copies it in on every deploy.
- **The game's source** is `macaques/game` (its own git repo, not part of rive-lab).
- **Sound** comes from a synth that needs Rive's threaded runtime, so the page must be cross-origin isolated. `sw.js`
  adds the headers GitHub Pages can't send; the first visit reloads once to come back through it.

## Publishing an update

From the rive-lab folder:

```
earth-invasion/publish.sh
```

It builds a signed file in `macaques/game` (`rive . --publish`), asks, uploads it to the release, redeploys the site
and waits for it. `--no-build` uploads the `game.riv` that's already there; `--yes` skips the question. (It's
`smashabout/publish.sh` pointed at this game.) Page changes go live with a normal commit + push to `main`; bump the
`?v=` on `app.js` / `style.css` in `index.html` when you change them.

## Page options

- `?mute=1` keeps the game silent (sets the game's `hostMute` before the first frame).
- `?coi=0` runs without the service worker: no threads, so no sound.
- Testing locally: `cd earth-invasion && python3 -m http.server 8791`, then http://localhost:8791/?mute=1 (needs a
  `game.riv` in the folder: `publish.sh` puts one there; answer "N" at the question).
