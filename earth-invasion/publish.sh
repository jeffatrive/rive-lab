#!/bin/bash
# Publish the current Earth Invasion game to https://jeffatrive.github.io/rive-lab/earth-invasion/
#
#   earth-invasion/publish.sh              build a signed game.riv in macaques/game, upload it, redeploy the site
#   earth-invasion/publish.sh --no-build   upload the game.riv already in earth-invasion/
#   earth-invasion/publish.sh --yes        don't ask before uploading
#
# It's Smashabout's publish.sh pointed at this game (see PUBLISHING.md): its own release, `earth-invasion-game`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export SITE_DIR="$HERE"
export TAG=earth-invasion-game
export RIV=earth-invasion.riv
export GAME_DIR="$(dirname "$HERE")/macaques/game"
exec "$(dirname "$HERE")/smashabout/publish.sh" --no-changelog "$@"
