import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const DEFAULT_SOLVER_DIR = path.join(rootDir, "public", "data", "solver");

const STACK_BUCKETS_BB = [20, 40, 60, 80, 100, 120, 150, 200];
const BET_SIZE_ANCHORS = [
  { action: "bet-small", value: 33 },
  { action: "bet-medium", value: 58 },
  { action: "bet-large", value: 86 },
];
const RAISE_SIZE_ANCHORS = [
  { action: "raise-small", value: 75 },
  { action: "raise-large", value: 110 },
];

const DATASET_FILE_BY_DESCRIPTOR = Object.freeze({
  "flop|checked_to_hero": "heads-up-flop-checked.json",
  "flop|facing_bet": "heads-up-flop-facing.json",
  "turn|checked_to_hero": "heads-up-turn-checked.json",
  "turn|facing_bet": "heads-up-turn-facing.json",
});

function parseArgs(argv){
  const options = {
    dir: null,
    help: false,
  };

  for(let i = 0; i < argv.length; i += 1){
    const arg = argv[i];

    if(arg === "--dir"){
      options.dir = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if(arg.startsWith("--dir=")){
      options.dir = arg.slice("--dir=".length);
      continue;
    }

    if(arg === "--help" || arg === "-h"){
      options.help = true;
      continue;
    }

    if(arg.startsWith("-")){
      throw new Error(`Unknown argument: ${arg}`);
    }

    if(options.dir){
      throw new Error("Too many positional arguments. Expected at most one solver directory.");
    }

    options.dir = arg;
  }

  return options;
}

function printUsage(){
  console.log("Adapt raw hu-postflop solver files into app contract datasets");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/adapt-raw-solver-data.mjs [--dir <solverDir>]");
  console.log("  node scripts/adapt-raw-solver-data.mjs [solverDir]");
  console.log("");
  console.log(`Default solver directory: ${DEFAULT_SOLVER_DIR}`);
}

function resolveSolverDir(input){
  if(typeof input !== "string" || input.trim().length === 0) return DEFAULT_SOLVER_DIR;
  return path.isAbsolute(input) ? path.normalize(input) : path.resolve(rootDir, input);
}

function sanitizeToken(value){
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return text.length > 0 ? text : "unknown";
}

function nearestNumberWithHighTie(value, candidates){
  let best = candidates[0];
  let bestDelta = Math.abs(value - best);

  for(const candidate of candidates.slice(1)){
    const delta = Math.abs(value - candidate);
    if(delta < bestDelta || (delta === bestDelta && candidate > best)){
      best = candidate;
      bestDelta = delta;
    }
  }

  return best;
}

function nearestAnchorAction(value, anchors){
  const sorted = [...anchors].sort((a, b) => {
    const delta = Math.abs(value - a.value) - Math.abs(value - b.value);
    if(delta !== 0) return delta;
    return b.value - a.value;
  });

  return sorted[0]?.action ?? null;
}

function normalizeSpotType(value){
  const token = sanitizeToken(value);
  if(token === "checked_to_hero" || token === "facing_bet") return token;
  throw new Error(`Unsupported spot type token: ${value}`);
}

function spotTypeFromScenario(rawScenario){
  return normalizeSpotType(rawScenario);
}

function historyKeyFor(street, spotType){
  if(street === "flop") return "start";
  if(spotType === "checked_to_hero") return "flop_check__flop_check";
  return "flop_bet_small__flop_call";
}

function datasetFileFor(street, spotType){
  const key = `${street}|${spotType}`;
  const file = DATASET_FILE_BY_DESCRIPTOR[key];
  if(!file) throw new Error(`No dataset file mapping for descriptor: ${key}`);
  return file;
}

function normalizeActionToken(value){
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseActionAmount(rawAction){
  const text = String(rawAction ?? "");
  const paren = text.match(/\(([-+]?\d*\.?\d+)\)/);
  if(paren) return Number(paren[1]);

  const fallback = text.match(/[-+]?\d*\.?\d+/);
  if(fallback) return Number(fallback[0]);

  return Number.NaN;
}

function normalizeRawAction(rawAction, spotType){
  const token = normalizeActionToken(rawAction);

  if(token.includes("check")) return "check";
  if(token.includes("fold")) return "fold";
  if(token.includes("call")) return "call";

  const amount = parseActionAmount(rawAction);

  if(token.includes("bet")){
    if(!Number.isFinite(amount)) return null;
    return nearestAnchorAction(amount, BET_SIZE_ANCHORS);
  }

  if(token.includes("raise")){
    if(!Number.isFinite(amount)) return null;
    return nearestAnchorAction(amount, RAISE_SIZE_ANCHORS);
  }

  return null;
}

function getAllowedActionsForSpot(spotType){
  if(spotType === "checked_to_hero") return ["check", "bet-small", "bet-medium", "bet-large"];
  if(spotType === "facing_bet") return ["fold", "call", "raise-small", "raise-large"];
  return [];
}

function normalizeFrequencyMap(frequencies){
  const entries = Object.entries(frequencies)
    .map(([action, value]) => [action, Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value > 0);

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if(total <= 0) return {};

  const normalized = Object.fromEntries(entries.map(([action, value]) => [action, value / total]));
  return normalized;
}

function extractFrequenciesFromRaw(rawSpot, spotType){
  const actions = Array.isArray(rawSpot?.actions) ? rawSpot.actions : [];
  const strategy = Array.isArray(rawSpot?.strategy) ? rawSpot.strategy : [];
  const heroHands = Array.isArray(rawSpot?.hero_private_hands) ? rawSpot.hero_private_hands : [];

  if(actions.length === 0){
    throw new Error("raw spot missing actions array");
  }

  if(heroHands.length === 0){
    throw new Error("raw spot missing hero_private_hands array");
  }

  const expectedLength = actions.length * heroHands.length;
  if(strategy.length !== expectedLength){
    throw new Error(`strategy length mismatch (expected ${expectedLength}, got ${strategy.length})`);
  }

  const allowedActions = new Set(getAllowedActionsForSpot(spotType));
  const bucketed = {};

  for(let actionIndex = 0; actionIndex < actions.length; actionIndex += 1){
    const normalizedAction = normalizeRawAction(actions[actionIndex], spotType);
    if(!normalizedAction || !allowedActions.has(normalizedAction)) continue;

    let actionTotal = 0;
    for(let handIndex = 0; handIndex < heroHands.length; handIndex += 1){
      const vectorIndex = actionIndex * heroHands.length + handIndex;
      const value = Number(strategy[vectorIndex]);
      if(Number.isFinite(value) && value > 0){
        actionTotal += value;
      }
    }

    if(actionTotal > 0){
      bucketed[normalizedAction] = (bucketed[normalizedAction] ?? 0) + actionTotal;
    }
  }

  return normalizeFrequencyMap(bucketed);
}

function sortObjectKeys(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return value;

  const out = {};
  for(const key of Object.keys(value).sort()){
    out[key] = value[key];
  }

  return out;
}

async function readJson(filePath, label){
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON for ${label}: ${filePath}`);
  }
}

async function writeJson(filePath, value){
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildCanonicalSpotDescriptor(rawSpot){
  const street = sanitizeToken(rawSpot?.street);
  if(street !== "flop" && street !== "turn"){
    throw new Error(`Unsupported street: ${rawSpot?.street}`);
  }

  const spotType = spotTypeFromScenario(rawSpot?.scenario);
  const position = sanitizeToken(rawSpot?.position);
  const stackRaw = Number(rawSpot?.stack_bb);
  if(!Number.isFinite(stackRaw)){
    throw new Error(`Invalid stack_bb: ${rawSpot?.stack_bb}`);
  }

  const stackBucket = nearestNumberWithHighTie(stackRaw, STACK_BUCKETS_BB);
  const texture = sanitizeToken(rawSpot?.texture);
  const historyKey = historyKeyFor(street, spotType);

  const spotKey = `pos_${position}__stack_${stackBucket}bb__texture_${texture}__node_${street}_${spotType}__hist_${historyKey}`;
  const datasetFile = datasetFileFor(street, spotType);

  return { spotKey, street, spotType, datasetFile };
}

async function main(){
  const options = parseArgs(process.argv.slice(2));
  if(options.help){
    printUsage();
    return;
  }

  const solverDir = resolveSolverDir(options.dir);
  await fs.mkdir(solverDir, { recursive: true });

  const allFiles = await fs.readdir(solverDir);
  const rawFiles = allFiles
    .filter((name) => /^hu-postflop-.*\.json$/i.test(name))
    .sort();

  if(rawFiles.length === 0){
    console.log(`no raw solver files found in ${solverDir}`);
    console.log("raw adaptation skipped");
    return;
  }

  let previousManifest = null;
  try {
    previousManifest = await readJson(path.join(solverDir, "manifest.json"), "existing manifest");
  } catch {
    previousManifest = null;
  }

  const entriesByFile = {
    "heads-up-flop-checked.json": {},
    "heads-up-flop-facing.json": {},
    "heads-up-turn-checked.json": {},
    "heads-up-turn-facing.json": {},
  };
  const indexEntries = {};

  for(const rawFile of rawFiles){
    const rawPath = path.join(solverDir, rawFile);
    const rawSpot = await readJson(rawPath, `raw solver spot ${rawFile}`);

    const { spotKey, street, spotType, datasetFile } = buildCanonicalSpotDescriptor(rawSpot);

    if(indexEntries[spotKey]){
      throw new Error(`Duplicate canonical spot key detected: ${spotKey}`);
    }

    const frequencies = extractFrequenciesFromRaw(rawSpot, spotType);
    if(Object.keys(frequencies).length === 0){
      throw new Error(`No valid frequencies parsed from ${rawFile}`);
    }

    indexEntries[spotKey] = {
      file: datasetFile,
      street,
      spotType,
    };

    entriesByFile[datasetFile][spotKey] = {
      frequencies,
      meta: {
        source: "engine-native-adapter",
        rawFile,
        spotId: typeof rawSpot?.spot_id === "string" ? rawSpot.spot_id : null,
        iterations: Number.isFinite(rawSpot?.iterations) ? rawSpot.iterations : null,
      },
    };
  }

  const spotCount = Object.keys(indexEntries).length;

  const manifest = {
    schemaVersion: "1.0.0",
    solverVersion: typeof previousManifest?.solverVersion === "string" && previousManifest.solverVersion.length > 0
      ? previousManifest.solverVersion
      : "engine-native-adapted",
    generatedAt: new Date().toISOString(),
    coverage: typeof previousManifest?.coverage === "string" && previousManifest.coverage.length > 0
      ? previousManifest.coverage
      : "phase1-heads-up-postflop",
    thresholds: previousManifest?.thresholds && typeof previousManifest.thresholds === "object"
      ? previousManifest.thresholds
      : { bestMin: 0.5, acceptableMin: 0.15 },
    indexFile: "index.json",
    spotCount,
  };

  const index = {
    schemaVersion: "1.0.0",
    entries: sortObjectKeys(indexEntries),
  };

  await writeJson(path.join(solverDir, "manifest.json"), manifest);
  await writeJson(path.join(solverDir, "index.json"), index);

  for(const [fileName, entries] of Object.entries(entriesByFile)){
    await writeJson(path.join(solverDir, fileName), {
      schemaVersion: "1.0.0",
      entries: sortObjectKeys(entries),
    });
  }

  console.log(`adapted ${rawFiles.length} raw solver files`);
  console.log(`generated canonical spots: ${spotCount}`);
  for(const [fileName, entries] of Object.entries(entriesByFile)){
    console.log(`${fileName}: ${Object.keys(entries).length}`);
  }
}

main().catch((error) => {
  console.error("raw solver adaptation failed");
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
