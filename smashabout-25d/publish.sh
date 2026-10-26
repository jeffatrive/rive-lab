#!/bin/bash
# Publish the 2.5D planning prototype (kaiju/agents/plan25d, branch agent/plan25d) to
# https://jeffatrive.github.io/rive-lab/smashabout-25d/, a test copy of the Smashabout page (Jeff 2026-10-26: "publish a
# test page"). Same steps as ../smashabout/publish.sh (it runs it): builds a signed .riv, uploads it to the
# `smashabout-25d-game` release and redeploys the site. Options as there: --no-build, --yes.
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$HERE" TAG=smashabout-25d-game RIV=kaiju3d-25d.riv \
  GAME_DIR="${GAME_DIR:-$(dirname "$HERE")/kaiju/agents/plan25d}" exec "$(dirname "$HERE")/smashabout/publish.sh" "$@"
