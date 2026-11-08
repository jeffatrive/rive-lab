#!/bin/bash
# Publish Skip Intro (VECTOR/9) to https://jeffatrive.github.io/rive-lab/skip-intro-site/
#
#   skip-intro-site/publish.sh              build a signed game.riv in skip-intro/shell, upload it, redeploy the site
#   skip-intro-site/publish.sh --no-build   upload the game.riv already in skip-intro-site/
#   skip-intro-site/publish.sh --yes        don't ask before uploading
#
# Like smashabout/publish.sh (see PUBLISHING.md): the file goes on the `skip-intro-game` release, and the Pages
# workflow copies it into the site. Page changes (index.html, app.js, ...) go live with a commit + push to main.
set -euo pipefail
REPO=jeffatrive/rive-lab
WORKFLOW=static.yml
TAG=skip-intro-game
SITE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(dirname "$SITE")/skip-intro/shell"
SITE_URL="https://jeffatrive.github.io/rive-lab/skip-intro-site/"
BUILD=1
ASK=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --yes|-y) ASK=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mStopped: %s\033[0m\n' "$1" >&2; exit 1; }

command -v gh >/dev/null || fail "the GitHub CLI (gh) isn't installed: brew install gh"
gh auth status >/dev/null 2>&1 || fail "gh isn't signed in: run  gh auth login"

if [ "$BUILD" = 1 ]; then
  step "Building a signed file in $SRC"
  LOG="$(mktemp)"
  (cd "$SRC" && rive . --publish 2>&1) | tee "$LOG" || true
  grep -q "published build/skip-intro.riv" "$LOG" || fail "the build didn't finish (see above)"
  grep -q ' 0 errors' "$LOG" || fail "the build reported errors (see above)"
  rm -f "$LOG"
  # copy straight away: any other `rive .` run rewrites build/skip-intro.riv unsigned, and web players refuse
  # unsigned scripts and shaders
  cp "$SRC/build/skip-intro.riv" "$SITE/game.riv"
fi

[ -s "$SITE/game.riv" ] || fail "no skip-intro-site/game.riv to upload"
SIZE=$(wc -c < "$SITE/game.riv" | tr -d ' ')
[ "$SIZE" -gt 100000 ] || fail "skip-intro-site/game.riv is only $SIZE bytes: that isn't the site"
printf 'game.riv: %s KB\n' "$((SIZE / 1024))"

if [ "$ASK" = 1 ]; then
  printf '\nUpload this game.riv and publish it to %s ? [y/N] ' "$SITE_URL"
  read -r answer
  case "$answer" in y|Y|yes) ;; *) echo "Nothing published."; exit 0 ;; esac
fi

step "Uploading game.riv to the $TAG release"
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$SITE/game.riv" -R "$REPO" --clobber
else
  gh release create "$TAG" "$SITE/game.riv" -R "$REPO" --latest=false \
    --title "Skip Intro site file" \
    --notes "The Rive file the page at $SITE_URL loads. Replaced by skip-intro-site/publish.sh on every update; the Pages workflow copies it into the site."
fi

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

step "Waiting for the deploy (usually under a minute)"
gh run watch "$RUN" -R "$REPO" --exit-status >/dev/null || fail "the deploy failed: https://github.com/$REPO/actions/runs/$RUN"

printf '\n\033[32mPublished.\033[0m %s\n' "$SITE_URL"
echo "(Browsers may keep the old file for up to 10 minutes; a reload after that picks up the new one.)"
