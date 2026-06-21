/**
 * gen-android-icons.mjs — Native Android launcher-icon generator for the
 * Bubblewrap (TWA) project.
 *
 * WHY THIS EXISTS
 * ----------------
 * Bubblewrap emits a broken default adaptive icon: the whole logo is stuffed
 * into the <background> layer on top of a solid WHITE fill, the <foreground>
 * is transparent, and there is no <monochrome> layer at all. On every Android
 * 8.0+ launcher that renders as a white blob with a tiny off-brand logo, and
 * Android 13+ "themed icons" are unsupported.
 *
 * This script replaces that with a correct, fully-native adaptive icon set,
 * generated from the canonical brand logo (logo.svg):
 *
 *   • background  -> solid brand color (@color/ic_launcher_background)
 *   • foreground  -> the logo, fitted by its TRUE HEIGHT into the safe zone
 *   • monochrome  -> a clean white silhouette for Android 13+ themed icons
 *   • legacy PNGs -> pre-masked square + round icons for API < 26
 *
 * The logo is intentionally fitted by HEIGHT, not by a naive uniform scale:
 * the mark is ~0.83:1 (taller than wide), so height is the binding dimension
 * for the circular safe zone. Fitting by height guarantees the tips never
 * clip and the icon is optically centered at every density.
 *
 * It is IDEMPOTENT and writes directly into the Bubblewrap res tree. Re-run it
 * any time after `bubblewrap update` / `bubblewrap build` regenerates the
 * project (which would otherwise restore Bubblewrap's broken default).
 *
 *   node gen-android-icons.mjs                 # generate into the res tree
 *   node gen-android-icons.mjs --preview       # also emit launcher previews
 *   ANDROID_RES_DIR=/path/to/res node gen-android-icons.mjs
 */

import sharp from "./Frontend-PWA/node_modules/sharp/lib/index.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Canonical brand mark (transparent background, square viewBox). */
const LOGO_SVG = path.join(
  __dirname,
  "Frontend-PWA/public/assets/branding/logo.svg",
);

/** Brand background — matches manifest.json, splash screen and theme color. */
const BG_COLOR = "#0B0E14";

/** Bubblewrap Android resource directory. */
const RES_DIR =
  process.env.ANDROID_RES_DIR ||
  path.join(os.homedir(), "bubblewrap-project/app/src/main/res");

const ANDROID_MANIFEST = path.resolve(RES_DIR, "../AndroidManifest.xml");

/**
 * Safe-zone fill ratios (logo HEIGHT as a fraction of the layer canvas).
 *
 * Adaptive layers are a 108dp canvas with a ~66–72dp circular safe zone.
 * Because the mark is taller than wide, the height fraction is what matters:
 *   0.64 * 108dp ≈ 69dp tall → tips sit just inside the 72dp safe circle on
 *   every mainstream launcher (Pixel squircle, Samsung OneUI, circle, etc.).
 */
const FG_HEIGHT_RATIO = 0.64; // adaptive foreground
const MONO_HEIGHT_RATIO = 0.62; // themed-icon monochrome (slightly tighter)
const LEGACY_HEIGHT_RATIO = 0.66; // pre-masked API < 26 icons

/** Adaptive layers are 108dp; densities below are px-per-dp scaled. */
const ADAPTIVE_SIZES = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

/** Legacy launcher icons are 48dp. */
const LEGACY_SIZES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

/** Render the logo at high resolution and trim to its tight content bbox. */
async function loadTightLogo() {
  const big = await sharp(LOGO_SVG, { density: 1200 })
    .resize(2048, 2048, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const trimmed = await sharp(big).trim({ threshold: 1 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  return { buf: trimmed, w: meta.width, h: meta.height };
}

/** Turn a logo into a pure white silhouette (RGB=white, alpha=coverage). */
async function toWhiteSilhouette({ buf, w, h }) {
  const alpha = await sharp(buf)
    .ensureAlpha()
    .extractChannel("alpha")
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const white = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return { buf: white, w, h };
}

/**
 * Compose a single icon layer: the logo scaled so its HEIGHT == ratio*size,
 * centered on a `size`×`size` canvas with the given background (transparent
 * for adaptive layers, opaque for legacy).
 */
async function composeLayer(logo, size, heightRatio, background, maskShape) {
  const targetH = Math.round(size * heightRatio);
  const targetW = Math.round(targetH * (logo.w / logo.h));
  const resized = await sharp(logo.buf)
    .resize(targetW, targetH, { fit: "fill" })
    .png()
    .toBuffer();

  let canvas = sharp({
    create: { width: size, height: size, channels: 4, background },
  }).composite([
    {
      input: resized,
      top: Math.round((size - targetH) / 2),
      left: Math.round((size - targetW) / 2),
    },
  ]);

  let out = await canvas.png().toBuffer();

  // Optional mask (legacy round / rounded-square) applied via dest-in.
  if (maskShape) {
    const mask = Buffer.from(maskSvg(size, maskShape));
    out = await sharp(out)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  }
  return out;
}

function maskSvg(size, shape) {
  if (shape === "circle") {
    const r = size / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`;
  }
  // rounded square (~18% corner radius), the modern legacy-launcher look
  const rad = Math.round(size * 0.18);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rad}" ry="${rad}" fill="#fff"/></svg>`;
}

function writeFile(rel, contents) {
  const dest = path.join(RES_DIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents);
  console.log(`  ✓ ${rel}`);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by gen-android-icons.mjs — do not hand-edit; re-run the script. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;

const BG_COLOR_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by gen-android-icons.mjs -->
<resources>
    <color name="ic_launcher_background">${BG_COLOR}</color>
</resources>
`;

/** Add android:roundIcon to <application> if it is missing. Idempotent. */
function patchManifestRoundIcon() {
  if (!fs.existsSync(ANDROID_MANIFEST)) {
    console.warn(`  ! AndroidManifest.xml not found at ${ANDROID_MANIFEST}`);
    return;
  }
  let xml = fs.readFileSync(ANDROID_MANIFEST, "utf8");
  if (xml.includes("android:roundIcon")) {
    console.log("  • roundIcon already present in manifest");
    return;
  }
  const patched = xml.replace(
    /(android:icon="@mipmap\/ic_launcher")/,
    `$1\n        android:roundIcon="@mipmap/ic_launcher_round"`,
  );
  if (patched === xml) {
    console.warn("  ! could not locate android:icon anchor to add roundIcon");
    return;
  }
  fs.writeFileSync(ANDROID_MANIFEST, patched);
  console.log("  ✓ added android:roundIcon to AndroidManifest.xml");
}

async function main() {
  const wantPreview = process.argv.includes("--preview");

  if (!fs.existsSync(RES_DIR)) {
    console.error(`Android res directory not found: ${RES_DIR}`);
    console.error("Set ANDROID_RES_DIR or run `bubblewrap build` first.");
    process.exit(1);
  }

  console.log(`Source logo : ${path.relative(__dirname, LOGO_SVG)}`);
  console.log(`Background   : ${BG_COLOR}`);
  console.log(`Res dir      : ${RES_DIR}\n`);

  const logo = await loadTightLogo();
  const mono = await toWhiteSilhouette(logo);
  console.log(`Logo content : ${logo.w}×${logo.h} (ratio ${(logo.w / logo.h).toFixed(3)})\n`);

  // 1. Adaptive layer XML (regular + round) ---------------------------------
  console.log("Adaptive icon definitions:");
  writeFile("mipmap-anydpi-v26/ic_launcher.xml", ADAPTIVE_XML);
  writeFile("mipmap-anydpi-v26/ic_launcher_round.xml", ADAPTIVE_XML);
  writeFile("values/ic_launcher_background.xml", BG_COLOR_XML);

  // 2. Foreground + monochrome density PNGs (108dp) -------------------------
  console.log("\nAdaptive foreground + monochrome layers:");
  for (const [dir, size] of Object.entries(ADAPTIVE_SIZES)) {
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    const fg = await composeLayer(logo, size, FG_HEIGHT_RATIO, transparent);
    writeFile(`${dir}/ic_launcher_foreground.png`, fg);
    const mn = await composeLayer(mono, size, MONO_HEIGHT_RATIO, transparent);
    writeFile(`${dir}/ic_launcher_monochrome.png`, mn);
  }

  // 3. Legacy pre-masked launcher icons (API < 26) --------------------------
  console.log("\nLegacy launcher icons (API < 26):");
  const opaque = { ...rgb(BG_COLOR), alpha: 1 };
  for (const [dir, size] of Object.entries(LEGACY_SIZES)) {
    const sq = await composeLayer(logo, size, LEGACY_HEIGHT_RATIO, opaque, "rounded");
    writeFile(`${dir}/ic_launcher.png`, sq);
    const rd = await composeLayer(logo, size, LEGACY_HEIGHT_RATIO, opaque, "circle");
    writeFile(`${dir}/ic_launcher_round.png`, rd);
  }

  // 4. Remove Bubblewrap's now-orphaned maskable PNGs -----------------------
  console.log("\nCleanup:");
  let removed = 0;
  for (const dir of Object.keys(ADAPTIVE_SIZES)) {
    const stale = path.join(RES_DIR, dir, "ic_maskable.png");
    if (fs.existsSync(stale)) {
      fs.unlinkSync(stale);
      removed++;
    }
  }
  console.log(`  ✓ removed ${removed} orphaned ic_maskable.png file(s)`);

  // 5. Manifest roundIcon ---------------------------------------------------
  console.log("\nManifest:");
  patchManifestRoundIcon();

  // 6. Optional previews of the real launcher render ------------------------
  if (wantPreview) {
    const outDir = path.join(__dirname, ".icon-preview");
    fs.mkdirSync(outDir, { recursive: true });
    const S = 432;
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    const fg = await composeLayer(logo, S, FG_HEIGHT_RATIO, transparent);
    const bg = await sharp({
      create: { width: S, height: S, channels: 4, background: { ...rgb(BG_COLOR), alpha: 1 } },
    }).png().toBuffer();
    const composed = await sharp(bg)
      .composite([{ input: fg }])
      .png()
      .toBuffer();
    for (const shape of ["circle", "rounded"]) {
      const masked = await sharp(composed)
        .composite([{ input: Buffer.from(maskSvg(S, shape)), blend: "dest-in" }])
        .png()
        .toBuffer();
      const f = path.join(outDir, `launcher-${shape}.png`);
      fs.writeFileSync(f, masked);
      console.log(`  ✓ preview ${path.relative(__dirname, f)}`);
    }
    // themed-icon preview: white mono on a representative dark themed bg
    const mn = await composeLayer(mono, S, MONO_HEIGHT_RATIO, transparent);
    const themed = await sharp({
      create: { width: S, height: S, channels: 4, background: { r: 30, g: 33, b: 40, alpha: 1 } },
    })
      .composite([{ input: mn }, { input: Buffer.from(maskSvg(S, "circle")), blend: "dest-in" }])
      .png()
      .toBuffer();
    const tf = path.join(outDir, "launcher-themed.png");
    fs.writeFileSync(tf, themed);
    console.log(`  ✓ preview ${path.relative(__dirname, tf)}`);
  }

  console.log("\nDone. Adaptive icon regenerated. Rebuild the APK to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
