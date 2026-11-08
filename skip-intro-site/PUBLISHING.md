# Publishing Skip Intro

The site's accessible web page: **https://jeffatrive.github.io/rive-lab/skip-intro-site/**

It works like Earth Invasion's page (see `smashabout/PUBLISHING.md` for the full story):

- **The page** (`index.html`, `app.js`, `style.css`, `sw.js`, `accessibility.html`) is in git.
- **The site file** (`game.riv`) is not. It's on the GitHub release `skip-intro-game`; the Pages workflow
  (`.github/workflows/static.yml`) copies it in on every deploy.
- **The source** is `skip-intro/shell` (not part of the public repo).
- **What this page adds over rive.to:** Rive's accessibility layer (`semanticsMode: "enabled"`) and
  `focusOptions.allowFocusInterrupt` (so focus moved by the file comes back to the site), and it sets the file's
  `calm` (reduced motion) from the visitor's `prefers-reduced-motion`.
- **Sound** comes from a synth that needs Rive's threaded runtime, so the page must be cross-origin isolated. `sw.js`
  adds the headers GitHub Pages can't send; the first visit reloads once to come back through it.

## Publishing an update

From the rive-lab folder:

```
skip-intro-site/publish.sh
```

It builds a signed file in `skip-intro/shell` (`rive . --publish`), asks, uploads it to the release, redeploys the
site and waits. `--no-build` uploads the `game.riv` that's already there; `--yes` skips the question. Page changes go
live with a normal commit + push to `main`; bump the `?v=` on `app.js` / `style.css` in `index.html` when you change
them.

## Page options

- `?motion=off` / `?motion=on` overrides the visitor's reduced-motion setting.
- `?coi=0` runs without the service worker: no threads, so no sound.
- Testing locally: `cd skip-intro-site && python3 -m http.server 8798`, then http://localhost:8798/ (needs a
  `game.riv` in the folder: `publish.sh` puts one there; answer "N" at the question).
