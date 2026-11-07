#!/bin/bash
# Publish the current Snack Storm game to https://jeffatrive.github.io/rive-lab/snack-storm-play/
#
#   snack-storm-play/publish.sh              build a signed game.riv in snack-storm/game, upload it, redeploy the site
#   snack-storm-play/publish.sh --no-build   upload the game.riv already in snack-storm-play/
#   snack-storm-play/publish.sh --yes        don't ask before uploading
#
# It's Smashabout's publish.sh pointed at this game (see PUBLISHING.md): its own release, `snack-storm-game`.
# GAME_DIR=... publishes from another copy of the game (a test snapshot such as snack-storm/work/host).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export SITE_DIR="$HERE"
export TAG=snack-storm-game
export RIV=snack-storm.riv
export GAME_DIR="${GAME_DIR:-$(dirname "$HERE")/snack-storm/game}"
exec "$(dirname "$HERE")/smashabout/publish.sh" --no-changelog "$@"
