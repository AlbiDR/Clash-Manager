import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PORTFOLIO CAPTURE SCRIPT
 * ----------------------------------------------------------------------------
 * Rationale: Automates the generation of high-fidelity, framed screenshots
 * for the project README and marketing materials.
 * ----------------------------------------------------------------------------
 */

const args = process.argv.slice(2);
const THEME = args.includes('--dark') ? 'dark' : 'light';

// Extract the view parameter, e.g. --view=roster
const viewArg = args.find(arg => arg.startsWith('--view='));
const VIEW = viewArg ? viewArg.split('=')[1] : null;

// Extract the scale parameter, e.g. --scale=4
const scaleArg = args.find(arg => arg.startsWith('--scale='));
const SCALE = scaleArg ? scaleArg.split('=')[1] : '3';

let TARGET_URL = `http://localhost:5173/Clash-Manager/portfolio-stitch.html?theme=${THEME}&scale=${SCALE}`;
if (VIEW) {
  TARGET_URL += `&view=${VIEW}`;
}

const SUFFIX_THEME = THEME === 'dark' ? '-dark' : '';
const PREFIX_VIEW = VIEW ? `${VIEW}` : 'portfolio-master';
const OUTPUT_PATH = path.join(__dirname, `../public/assets/branding/${PREFIX_VIEW}${SUFFIX_THEME}.png`);

console.log("--------------------------------------------------");
console.log(`🖼️  GENERATING PORTFOLIO SHOT (${THEME.toUpperCase()}${VIEW ? ' - ' + VIEW.toUpperCase() : ' - FULL STITCH'}) @ ${SCALE}x SCALE`);
console.log("--------------------------------------------------");

try {
  console.log(`🔗 Target: ${TARGET_URL}`);
  console.log(`📂 Output: ${OUTPUT_PATH}`);
  
  // Calculate a generous width and height based on scale
  const baseWidth = VIEW ? 800 : 1600;
  const viewportWidth = baseWidth * Number(SCALE);
  const viewportHeight = 1200 * Number(SCALE);
  
  // Execute shot-scraper via absolute path with webkit for better stability
  // We use CSS scaling via URL parameter instead of --scale-factor since webkit ignores it
  // --omit-background makes background transparent
  // --selector perfectly crops and centers the output
  execSync(`/Users/adr/Library/Python/3.9/bin/shot-scraper "${TARGET_URL}" \
    --browser webkit \
    --width ${viewportWidth} \
    --height ${viewportHeight} \
    --omit-background \
    --selector "#portfolio-container" \
    --wait 8000 \
    --output "${OUTPUT_PATH}"`, { stdio: 'inherit' });

  console.log(`\n✅ PORTFOLIO GENERATION COMPLETE: ${OUTPUT_PATH}`);
} catch (error) {
  console.error("\n❌ FAILED TO GENERATE SCREENSHOT");
  console.error("Reason: Ensure your dev server is running at http://localhost:5173");
  process.exit(1);
}
