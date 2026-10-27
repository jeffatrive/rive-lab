#!/bin/bash
# Publish the current Smashabout game to https://jeffatrive.github.io/rive-lab/smashabout/
#
#   smashabout/publish.sh              build a signed game.riv, upload it, redeploy the site
#   smashabout/publish.sh --no-build   upload the game.riv already in smashabout/ (skip the build)
#   smashabout/publish.sh --yes        don't ask before uploading
#   smashabout/publish.sh --no-changelog  skip the changelog check (a rebuild with no game change)
#
# What it does (see PUBLISHING.md):
#   0. checks the game's changelog has a dated entry for every change since the last one (the game's
#      tools/changelog_check.py, when it has one; Jeff 2026-10-27), and stops with what's missing;
#   1. builds a signed .riv in kaiju/game3d (`rive . --publish`, writes only build/) and copies it
#      to smashabout/game.riv (git ignores that file: it never goes into the repo's history);
#   2. uploads it to the `smashabout-game` release on GitHub, replacing the old one;
#   3. runs the Pages workflow, which copies the release's game.riv into the site and deploys it;
#   4. waits for the deploy and prints the link.
# Changes to the page itself (index.html, app.js, ...) go live with a normal commit + push to main.
set -euo pipefail

# (SITE_DIR, TAG, RIV and GAME_DIR let another copy of the page use this script: smashabout-as/publish.sh, the
# AnimaScript build, Jeff 2026-10-25)
REPO=jeffatrive/rive-lab
WORKFLOW=static.yml
SITE="${SITE_DIR:-$(cd "$(dirname "$0")" && pwd)}"
TAG="${TAG:-smashabout-game}"
RIV="${RIV:-kaiju3d-as.riv}"
SITE_URL="https://jeffatrive.github.io/rive-lab/$(basename "$SITE")/"
GAME="${GAME_DIR:-$(dirname "$SITE")/kaiju/game3d}"
BUILD=1
ASK=1
CHANGELOG=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --yes|-y) ASK=0 ;;
    --no-changelog) CHANGELOG=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mStopped: %s\033[0m\n' "$1" >&2; exit 1; }

command -v gh >/dev/null || fail "the GitHub CLI (gh) isn't installed: brew install gh"
gh auth status >/dev/null 2>&1 || fail "gh isn't signed in: run  gh auth login"

# 0. the changelog (WHAT'S NEW in the game's menu): a dated entry for what changed
if [ "$BUILD" = 1 ] && [ "$CHANGELOG" = 1 ] && [ -f "$GAME/tools/changelog_check.py" ]; then
  step "Checking the changelog"
  (cd "$GAME" && python3 tools/changelog_check.py) || fail "the changelog needs an entry first (or pass --no-changelog)"
fi

# 1. build
if [ "$BUILD" = 1 ]; then
  step "Building a signed game file in $GAME"
  command -v rive >/dev/null || fail "rive-cli isn't installed"
  LOG="$(mktemp)"
  (cd "$GAME" && rive . --publish 2>&1) | tee "$LOG" || true
  grep -q "published build/$RIV" "$LOG" || fail "the build didn't finish (see above). Missing build/blobs or build/fonts? Run  python3 tools/gen.py  in game3d first."
  grep -q ' 0 errors' "$LOG" || fail "the build reported errors (see above)"
  rm -f "$LOG"
  # copy straight away: any other `rive .` run (a screenshot, the previewer) rewrites
  # build/kaiju3d.riv UNSIGNED, and web players refuse unsigned scripts and shaders
  cp "$GAME/build/$RIV" "$SITE/game.riv"
fi

[ -s "$SITE/game.riv" ] || fail "no smashabout/game.riv to upload"
SIZE=$(wc -c < "$SITE/game.riv" | tr -d ' ')
[ "$SIZE" -gt 1000000 ] || fail "smashabout/game.riv is only $SIZE bytes: that isn't the game"
printf 'game.riv: %s MB\n' "$(awk "BEGIN { printf \"%.1f\", $SIZE / 1048576 }")"

if [ "$ASK" = 1 ]; then
  printf '\nUpload this game.riv and publish it to %s ? [y/N] ' "$SITE_URL"
  read -r answer
  case "$answer" in y|Y|yes) ;; *) echo "Nothing published."; exit 0 ;; esac
fi

# 2. upload to the release (made the first time)
step "Uploading game.riv to the $TAG release"
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$SITE/game.riv" -R "$REPO" --clobber
else
  gh release create "$TAG" "$SITE/game.riv" -R "$REPO" --latest=false \
    --title "Smashabout game file ($(basename "$SITE"))" \
    --notes "The game file the page at $SITE_URL loads. Replaced by its publish.sh on every update; the Pages workflow copies it into the site."
fi

# 3. redeploy the site with it
step "Running the Pages workflow"
BEFORE=$(gh run list -R "$REPO" --workflow "$WORKFLOW" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
gh workflow run "$WORKFLOW" -R "$REPO" --ref main
RUN=""
for _ in $(seq 1 30); do
  sleep 2
  RUN=$(gh run list -R "$REPO" --workflow "$WORKFLOW" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$RUN" ] && [ "$RUN" != "$BEFORE" ] && break
done
[ -n "$RUN" ] && [ "$RUN" != "$BEFORE" ] || fail "the workflow didn't start. Check https://github.com/$REPO/actions"

# 4. wait for it
step "Waiting for the deploy (usually under a minute)"
gh run watch "$RUN" -R "$REPO" --exit-status >/dev/null || fail "the deploy failed: https://github.com/$REPO/actions/runs/$RUN"

printf '\n\033[32mPublished.\033[0m %s\n' "$SITE_URL"
echo "(Browsers may keep the old game for up to 10 minutes; a reload after that picks up the new one.)"
