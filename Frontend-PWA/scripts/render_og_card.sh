#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR
#
# CLASH MANAGER - Social Card Rasterizer
# ----------------------------------------------------------------------------
# Renders the Open Graph card SSOT (og-card.svg) to the 1200x630 PNG that
# unfurlers actually consume (og-card.png).
#
# Rationale:
#   og:image cannot be an SVG. Facebook, X, Discord, WhatsApp, LinkedIn, Slack,
#   and Reddit all reject it, which is why every shared link previously rendered
#   as a bare text link. The SVG stays the editable source of truth; this script
#   produces the raster artefact that ships.
#
# Contract:
#   The output MUST stay exactly 1200x630. HtmlEntry.ts declares those numbers in
#   og:image:width / og:image:height, and an unfurler that reserves layout from a
#   declaration the bytes then contradict renders a cropped or letterboxed card.
#
# Usage:
#   ./scripts/render_og_card.sh
#
# Requires a Chromium-family browser. Headless Chrome is used rather than
# qlmanage/sips because it honours the SVG viewport verbatim; qlmanage rasterises
# into a square thumbnail box at an unpredictable scale factor.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANDING_DIR="${SCRIPT_DIR}/../public/assets/branding"
SOURCE_SVG="${BRANDING_DIR}/og-card.svg"
OUTPUT_PNG="${BRANDING_DIR}/og-card.png"
PROFILE_DIR="$(mktemp -d)"

trap 'rm -rf "${PROFILE_DIR}"' EXIT

resolve_chrome() {
  local candidate
  for candidate in \
    "${CHROME_BIN:-}" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome || true)" \
    "$(command -v google-chrome-stable || true)" \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)"
  do
    if [[ -n "${candidate}" && -x "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

if ! CHROME="$(resolve_chrome)"; then
  echo "error: no Chromium-family browser found. Set CHROME_BIN to override." >&2
  exit 1
fi

if [[ ! -f "${SOURCE_SVG}" ]]; then
  echo "error: missing card source at ${SOURCE_SVG}" >&2
  exit 1
fi

# Chrome reliably writes the screenshot but can hang on shutdown in headless
# mode, so cap the run and judge success by the artefact rather than the exit
# code. `|| true` keeps `set -e` from aborting on that shutdown hang.
timeout 60 "${CHROME}" \
  --headless \
  --disable-gpu \
  --no-sandbox \
  --hide-scrollbars \
  --force-device-scale-factor=1 \
  --user-data-dir="${PROFILE_DIR}" \
  --window-size=1200,630 \
  --screenshot="${OUTPUT_PNG}" \
  "file://${SOURCE_SVG}" >/dev/null 2>&1 || true

if [[ ! -f "${OUTPUT_PNG}" ]]; then
  echo "error: render produced no output at ${OUTPUT_PNG}" >&2
  exit 1
fi

echo "[Social] Rendered og-card.png (1200x630) from og-card.svg."
