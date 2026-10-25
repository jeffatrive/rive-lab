#!/bin/bash
# Publish the AnimaScript build of Smashabout to https://jeffatrive.github.io/rive-lab/smashabout-as/, a copy of the
# Smashabout page for comparing the two (Jeff 2026-10-25). Same steps as ../smashabout/publish.sh (it runs it): builds
# a signed .riv from the AnimaScript port (kaiju/agents/animascript), uploads it to the `smashabout-as-game` release
# and redeploys the site. Options as there: --no-build, --yes.
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$HERE" TAG=smashabout-as-game RIV=kaiju3d-as.riv \
  GAME_DIR="${GAME_DIR:-$(dirname "$HERE")/kaiju/agents/animascript}" exec "$(dirname "$HERE")/smashabout/publish.sh" "$@"
