# Publishing Smashabout

The game's web page: **https://jeffatrive.github.io/rive-lab/smashabout/**

It plays the game full-window and keeps your progress in that browser. The small round "•••" button (bottom-left, on the title and map screens) copies your save, or pastes one from another device.

## How the pieces fit

- **The page** (`index.html`, `app.js`, `style.css`, icons, `manifest.webmanifest`) is kept in git like any other folder in rive-lab.
- **The game file** (`game.riv`, about 9 MB) is *not* in git. It's attached to a GitHub release called `smashabout-game`, and each update replaces it. Git keeps every version of every file forever, so this keeps the repo from growing with each update. `smashabout/.gitignore` stops it being committed by accident.
- **The loading animation** (`loader.riv`, about 30 KB: Lars stomping a row of buildings while `game.riv` downloads) *is* in git, next to the page. `app.js` streams the game file and feeds the real download percentage into the loader's `progress` number. Its source is a separate rive-cli project kept on Jeff's Mac (`kaiju/loader`: `build.sh` rebuilds it and copies the new `loader.riv` here). To watch it on a fast connection, add `?loaderdemo=1` to the address: it fakes a slow six-second download.
- **The game is the AnimaScript build** (since 2026-10-25): `publish.sh` builds `kaiju/game3d` (its `rive.yaml` names it `kaiju3d-as`, Editor file kaiju3d-as). Its sound effects come from a synth that needs Rive's threaded runtime, which needs the page to be *cross-origin isolated*: GitHub Pages can't send those headers, so `sw.js` (a small service worker of ours) adds them, and the first visit reloads once to come back through it. A browser that can't do that still plays the game, with the music and voices but no sound effects (the console says why). The last Luau version is the git tag `luau-final` in the kaiju repo.
- **The AnimaScript comparison copy** (`smashabout-as/`) was taken down on 2026-10-25 once the main page played the AnimaScript game. Its release, `smashabout-as-game`, is still on GitHub, unused.
- **GitHub Pages** publishes the site using a small script that GitHub runs for you, called a *workflow*: `.github/workflows/static.yml`. It runs every time you push to `main`, and whenever `publish.sh` asks it to. It takes the repo, copies the release's `game.riv` into `smashabout/`, and publishes the result.

## One-time setup

1. **Check the Pages setting.** Go to github.com/jeffatrive/rive-lab, then **Settings → Pages**. Under **Build and deployment → Source**, it should say **GitHub Actions**. That's already the setting, so normally there's nothing to change. Don't switch it to "Deploy from a branch", because then the game file never gets copied in.
2. **Let your GitHub login update workflows** (needed once, because this change edits the workflow file). In Terminal, run `gh auth refresh -h github.com -s workflow` and approve it in the browser. Without this, the push in step 3 is refused with "refusing to allow an OAuth App to create or update workflow".
3. **Put the page on `main` and push it:**
   ```
   cd ~/Documents/Dev/rive-lab
   git switch main
   git merge --ff-only smashabout-web
   git push origin main
   ```
   That push publishes the page. Until step 4 runs, the Smashabout page shows "The game file didn't load", and the Actions log gives a matching warning.
4. **Publish the game:** run `smashabout/publish.sh` (details below). The first run creates the `smashabout-game` release.

## Publishing an update

**The game changed?** From the rive-lab folder, run:

```
smashabout/publish.sh
```

It:
1. builds a signed game file in `kaiju/game3d` (`rive . --publish`, which writes only to `build/`) and copies it to `smashabout/game.riv`;
2. asks before uploading anything;
3. uploads it to the `smashabout-game` release, replacing the old one;
4. starts the Pages workflow, waits for it to finish (usually under a minute), and prints the link.

Options:
- `--no-build` uploads the `game.riv` that's already there.
- `--yes` skips the question.

You don't need to commit anything for a game update.

**The page changed** (`index.html`, `app.js`, `style.css`, icons)? Commit those files and push to `main`. When you change `app.js` or `style.css`, bump the `?v=` number on their links in `index.html` (e.g. `app.js?v=3`), so visitors get the new file at once instead of waiting out GitHub's 10-minute cache. The push publishes the change on its own. Commit only the files you mean to: rive-lab has lots of folders that aren't in git, so use `git add smashabout/app.js` rather than `git add .`.

**New app icon?** The icons come from the game's 3-D art. Regenerate them from `kaiju/game3d`:

```
PYTHONPATH=~/Documents/Dev/rive-lab/kaiju/blender python3 tools/app_icon.py
```

Then copy `build/icons/apple-touch-icon.png`, `icon-192.png` and `icon-512.png` into `smashabout/`, and commit and push. iPhones only pick up a new icon when you add the page to the Home Screen again.

## Did it go live?

- `publish.sh` ends with **Published.** when the deploy has finished.
- Every deploy is listed at github.com/jeffatrive/rive-lab/actions, under **Deploy static content to Pages**. Green means live. You can also re-run a deploy from there: **Run workflow** on `main`.
- **Timing:** about 30–60 seconds for the deploy. Then browsers may keep showing the old files for **up to 10 minutes**, because GitHub Pages tells them to cache that long. If it still looks old after that, do a hard reload (Shift-Reload on a computer). On iPhone, close the tab and open it again.
- Ignore the "errored" status in old Pages API output (see below). The Actions list is the thing to check.

## When something goes wrong

| What you see | Why | Fix |
|---|---|---|
| The page says "The game file didn't load" | No `game.riv` on the release, or the last deploy ran before the upload | Run `smashabout/publish.sh`. If the release looks fine, re-run the workflow from the Actions tab. |
| The game loads but 3-D models, shaders or scripts are missing; the console says "signature did not verify" | The file wasn't signed. Every other `rive .` run (a screenshot, the previewer) rewrites `build/kaiju3d.riv` **unsigned** | Run `publish.sh` again. It builds and copies in one go. Don't copy `build/kaiju3d.riv` by hand. |
| `publish.sh` stops with "missing or empty" (fonts or blobs) | `build/fonts` or `build/blobs` haven't been generated in game3d | Run `python3 tools/gen.py` in `kaiju/game3d` first (your usual step before a push). |
| `publish.sh` says gh isn't signed in | — | `gh auth login` |
| `git push` is refused: "... workflow ... without workflow scope" | Your GitHub login can't change workflow files | `gh auth refresh -h github.com -s workflow`, then push again |
| `git push` is refused: "rejected ... fetch first" | Someone (or the GitHub website) changed `main` | `git pull --ff-only`, then push again |
| A deploy is red in the Actions tab | Click it to read the error. GitHub sometimes has hiccups ("Multiple artifacts named github-pages") | **Re-run jobs** on that run. Don't add clean-up steps to the workflow: that's what broke it in July. |
| Progress vanished | Private browsing, or the browser's site data was cleared (Safari also clears it for sites you haven't visited in a few weeks) | Use "Paste a save" with a copy from another device. Before a paste, the page keeps the old save in localStorage under `smashabout.save.beforePaste`. |
| The page didn't change after a push | Browser cache | Wait 10 minutes, or hard reload |

## Things to know

- **Your save lives in the browser,** under the localStorage key `smashabout.save`. Each browser and each device has its own save. On iPhone, Safari and the Home Screen app each keep their own too. "Copy my save" and "Paste a save" move progress between them.
- **Rive runtime:** the page loads `@rive-app/webgl2@2.45.0` from jsDelivr, pinned to that exact version on purpose. That's the version Rive's hosted player used when this was tested. To upgrade, change the version in `index.html`, test locally, then push.
- **Testing locally:** `cd smashabout && python3 -m http.server 8765`, then open http://localhost:8765/?mute=1. `?mute=1` silences the game. You need a `game.riv` in the folder: `publish.sh` puts one there, so you can build and then answer "N" at the question.
- **What was wrong with Pages before:**
  - In July, the old "Deploy from a branch" build failed ("Page build failed"), so the site stayed on its March version.
  - It was then switched to GitHub Actions. The first two workflow runs failed: a one-off GitHub error, then a clean-up step that didn't work. The third run worked, and the site has been live since.
  - The workflow was added on the GitHub website, so your local `main` didn't have it. That's why the folder looked empty on the Mac.
  - The "errored" status the Pages API still reports is left over from the old branch build.
  - Most rive-lab folders were never committed, so they aren't on the site. Only what's in git and pushed gets published.

## Traffic

Cloudflare Web Analytics (Jeff's Cloudflare account, site `jeffatrive.github.io`; filter by the path
`/rive-lab/smashabout/`). The beacon script is at the end of index.html. Page views only (visits, referrers,
countries, devices, load speed), no cookies and no custom events; ad blockers hide some visits.
