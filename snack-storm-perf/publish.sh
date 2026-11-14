#!/bin/bash
# Publish the perf test build (snack-storm/work/perf-uat) to https://jeffatrive.github.io/rive-lab/snack-storm-perf/
#
#   snack-storm-perf/publish.sh              build a signed game.riv in snack-storm/work/perf-uat, upload it, redeploy the site
#   snack-storm-perf/publish.sh --no-build   upload the game.riv already in snack-storm-perf/
#   snack-storm-perf/publish.sh --yes        don't ask before uploading
#
# It's Smashabout's publish.sh pointed at the perf copy: its own release, `snack-storm-perf`.
# GAME_DIR=... publishes from another copy of the game (a test snapshot such as snack-storm/work/host).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export SITE_DIR="$HERE"
export TAG=snack-storm-perf
export RIV=snack-storm.riv
export GAME_DIR="${GAME_DIR:-$(dirname "$HERE")/snack-storm/work/perf-uat}"
exec "$(dirname "$HERE")/smashabout/publish.sh" --no-changelog "$@"
