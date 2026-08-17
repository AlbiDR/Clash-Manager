#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR
#
# CLASH MANAGER - Manifest Screenshot Deriver
# ----------------------------------------------------------------------------
# Derives PWA install-dialog screenshots from the committed portfolio captures.
#
# Rationale:
#   manifest.json previously pointed `screenshots` straight at the portfolio
#   captures produced by scratch/generate_hifi_branding.sh. Those are deliberately
#   tall full-page shots (1228x2960 up to 1228x6820, i.e. 1:2.41 to 1:5.55).
#   Chrome only accepts manifest screenshots whose aspect ratio sits between
#   1:2.3 and 2.3:1, and requires every screenshot sharing a form_factor to have
#   the SAME ratio. All four failed both rules, so Chrome silently discarded them
#   and the rich install dialog never appeared.
#
# Approach:
#   Pad, never crop. Each capture is scaled to a common height and then padded
#   horizontally to a uniform 1:2 canvas using the theme's own background colour.
#   Cropping these would slice through the phone bezel in the mockup; padding
#   preserves the frame intact and yields the identical ratio Chrome demands.
#
#   This deliberately does NOT re-capture anything. It reads the committed webp
#   assets, so it stays a derivation step rather than a second capture pipeline.
#
# Scope:
#   Narrow (mobile) screenshots only. Android is the install target that matters
#   here, and narrow screenshots are what drive its rich install dialog. A `wide`
#   entry would need a genuine desktop-layout capture; padding a phone mockup out
#   to landscape would just letterbox a phone in a wide frame.
#
# Usage:
#   ./scripts/render_manifest_screenshots.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANDING_DIR="${SCRIPT_DIR}/../public/assets/branding"
WORK_DIR="$(mktemp -d)"

trap 'rm -rf "${WORK_DIR}"' EXIT

# Canonical canvas. Height stays well under Chrome's 3840px ceiling and the 1:2
# ratio sits comfortably inside the 1:2.3 limit.
CANVAS_HEIGHT=2800
CANVAS_WIDTH=1400

# Background fill per theme, matching lightTokens/darkTokens color.background.
LIGHT_PAD="FDFCFF"
DARK_PAD="0B0E14"

VIEWS=("roster" "headhunter")
THEMES=("light" "dark")

for tool in sips cwebp; do
  command -v "${tool}" >/dev/null || { echo "error: ${tool} not found" >&2; exit 1; }
done

for view in "${VIEWS[@]}"; do
  for theme in "${THEMES[@]}"; do
    source_asset="${BRANDING_DIR}/${view}-${theme}.webp"
    output_asset="${BRANDING_DIR}/screenshot-${view}-${theme}.webp"

    if [[ ! -f "${source_asset}" ]]; then
      echo "error: missing source capture ${source_asset}" >&2
      exit 1
    fi

    if [[ "${theme}" == "dark" ]]; then pad="${DARK_PAD}"; else pad="${LIGHT_PAD}"; fi

    sips -s format png "${source_asset}" --out "${WORK_DIR}/flat.png" >/dev/null
    sips --resampleHeight "${CANVAS_HEIGHT}" "${WORK_DIR}/flat.png" \
      --out "${WORK_DIR}/scaled.png" >/dev/null
    # sips echoes the parsed CGColor to stdout for --padColor; discard both streams.
    sips -p "${CANVAS_HEIGHT}" "${CANVAS_WIDTH}" --padColor "${pad}" \
      "${WORK_DIR}/scaled.png" --out "${WORK_DIR}/padded.png" >/dev/null 2>&1
    cwebp -quiet -q 90 "${WORK_DIR}/padded.png" -o "${output_asset}"

    echo "[Manifest] screenshot-${view}-${theme}.webp (${CANVAS_WIDTH}x${CANVAS_HEIGHT})"
  done
done

echo "[Manifest] Done. Keep manifest.json's declared sizes in step with the canvas above."
