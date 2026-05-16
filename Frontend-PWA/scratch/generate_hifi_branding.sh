#!/bin/bash
# Support both local Mac and CI environments
[ -d "/opt/homebrew/bin" ] && export PATH=$PATH:/opt/homebrew/bin
[ -d "/Users/adr/Library/Python/3.9/bin" ] && export PATH=$PATH:/Users/adr/Library/Python/3.9/bin


VIEWS=("roster" "headhunter" "laboratory" "settings")
THEMES=("light" "dark")

# Remove stale assets
for view in "${VIEWS[@]}"; do
  for theme in "${THEMES[@]}"; do
    rm -f "public/assets/branding/$view-$theme.png"
    rm -f "public/assets/branding/$view-$theme.webp"
  done
done

# Generate a single synchronized random count (1-50) for this entire run
COUNT=$(( ( RANDOM % 50 ) + 1 ))

for view in "${VIEWS[@]}"; do
  for theme in "${THEMES[@]}"; do
    echo "Capturing $view ($theme) with count $COUNT..."
    shot-scraper shot "http://localhost:5173/Clash-Manager/portfolio-stitch.html?theme=$theme&view=$view&count=$COUNT" \
      --width 1200 --height 4000 \
      --selector "#wrapper-$view" \
      --retina \
      --omit-background \
      --wait 12000 \
      -o "public/assets/branding/$view-$theme.png"

    # Convert to WebP with lossless transparency
    if [ -f "public/assets/branding/$view-$theme.png" ]; then
      cwebp -lossless -q 90 "public/assets/branding/$view-$theme.png" \
        -o "public/assets/branding/$view-$theme.webp"
      rm "public/assets/branding/$view-$theme.png"
      echo "  -> Converted to $view-$theme.webp"
    else
      echo "  -> Error: Capture failed for $view ($theme)"
    fi
  done
done
