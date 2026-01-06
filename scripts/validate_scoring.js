const fs = require('fs');
const path = require('path');

// Paths
const CONFIG_PATH = path.join(__dirname, '..', 'Backend-GAS', 'Configuration.gs.js');
const README_PATH = path.join(__dirname, '..', 'README.md');

const configText = fs.readFileSync(CONFIG_PATH, 'utf8');
const readmeText = fs.readFileSync(README_PATH, 'utf8');

function extractWeightsFromConfig(text) {
  const match = text.match(/WEIGHTS:\s*\{([^}]+)\}/m);
  if (!match) return null;
  const body = match[1];
  const re = /([A-Z_]+)\s*:\s*([0-9.eE+-]+)/g;
  const weights = {};
  let m;
  while ((m = re.exec(body)) !== null) {
    weights[m[1]] = Number(m[2]);
  }
  return weights;
}

function extractWeightsFromReadme(text) {
  // Look for pattern like (Current Fame × 3) or (\text{Current Fame} \times 3)
  const mapping = {
    FAME: /Current Fame[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    AVG_FAME: /Avg Fame[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    DONATION: /Donations[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    TROPHY: /Trophies[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    WAR_RATE: /War Rate[^0-9]*([0-9]+\.?[0-9eE-]*)/i
  };
  const out = {};
  Object.keys(mapping).forEach(k => {
    const m = text.match(mapping[k]);
    if (m) out[k] = Number(m[1]);
  });
  return out;
}

const cfgWeights = extractWeightsFromConfig(configText);
const docWeights = extractWeightsFromReadme(readmeText);

if (!cfgWeights) {
  console.error('Could not extract WEIGHTS from Configuration.gs.js');
  process.exit(2);
}

if (!docWeights || Object.keys(docWeights).length === 0) {
  console.error('Could not extract weights from README.md; ensure the scoring section contains weight numbers.');
  process.exit(2);
}

const keys = ['FAME', 'AVG_FAME', 'DONATION', 'TROPHY', 'WAR_RATE'];
let ok = true;
keys.forEach(k => {
  const cfgVal = cfgWeights[k];
  const docVal = docWeights[k];
  if (typeof cfgVal === 'undefined') {
    console.error(`Missing ${k} in Configuration (expected numeric).`);
    ok = false; return;
  }
  if (typeof docVal === 'undefined') {
    console.error(`Missing ${k} in README (document the weight explicitly).`);
    ok = false; return;
  }
  // Compare with tolerance for floats
  const a = Number(cfgVal);
  const b = Number(docVal);
  const diff = Math.abs(a - b);
  if (diff > 1e-6) {
    console.error(`Mismatch for ${k}: config=${a} vs doc=${b}`);
    ok = false;
  } else {
    console.log(`OK ${k}: ${a}`);
  }
});

if (!ok) process.exit(3);
console.log('Scoring weights are consistent between Configuration and README.');
process.exit(0);
