import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const solverDir = path.join(rootDir, "public", "data", "solver");

const CHECKED_TO_HERO_ACTIONS = ["check", "bet-small", "bet-medium", "bet-large"];
const FACING_BET_ACTIONS = ["fold", "call", "raise-small", "raise-large"];
const VALID_ACTIONS = new Set([...CHECKED_TO_HERO_ACTIONS, ...FACING_BET_ACTIONS]);

function sanitizeToken(value){
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text.length > 0 ? text : "unknown";
}

function normalizeSpotType(value){
  const normalized = sanitizeToken(value).replace(/-/g, "_");
  if(normalized === "checked_to_hero" || normalized === "facing_bet") return normalized;
  return normalized;
}

function getAllowedActionsForSpot(spotType){
  const normalized = normalizeSpotType(spotType);
  if(normalized === "checked_to_hero") return CHECKED_TO_HERO_ACTIONS;
  if(normalized === "facing_bet") return FACING_BET_ACTIONS;
  return [...VALID_ACTIONS].sort();
}

function normalizeActionToken(raw){
  const token = sanitizeToken(raw);
  if(token === "bet-small" || token === "bet-smalls") return "bet-small";
  if(token === "bet-medium" || token === "bet-mediums") return "bet-medium";
  if(token === "bet-large" || token === "bet-larges") return "bet-large";
  if(token === "raise-small" || token === "raise-smalls") return "raise-small";
  if(token === "raise-large" || token === "raise-larges") return "raise-large";
  return token;
}

function normalizeFrequencyMap(frequencies, allowedActions = []){
  if(!frequencies || typeof frequencies !== "object") return {};
  const allowed = Array.isArray(allowedActions) && allowedActions.length > 0 ? new Set(allowedActions) : null;

  const entries = Object.entries(frequencies)
    .map(([action, value]) => [normalizeActionToken(action), Number(value)])
    .filter(([action, value]) => VALID_ACTIONS.has(action) && Number.isFinite(value) && value > 0)
    .filter(([action]) => !allowed || allowed.has(action));

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if(total <= 0) return {};

  return Object.fromEntries(entries.map(([action, value]) => [action, value / total]));
}

function bucketizeSolverFrequencies(decisions, spotType){
  const allowedActions = getAllowedActionsForSpot(spotType);
  if(!Array.isArray(decisions)) return {};

  const bucketed = {};
  for(const decision of decisions){
    const action = normalizeActionToken(decision?.action);
    const frequency = Number(decision?.frequency ?? decision?.freq);
    if(!allowedActions.includes(action) || !Number.isFinite(frequency) || frequency <= 0) continue;
    bucketed[action] = (bucketed[action] ?? 0) + frequency;
  }

  return normalizeFrequencyMap(bucketed, allowedActions);
}

async function readJson(filePath){
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function ensureObject(value){
  return value && typeof value === "object" && !Array.isArray(value);
}

function frequenciesFromDecision(decision, spotType){
  if(ensureObject(decision?.frequencies)){
    return normalizeFrequencyMap(decision.frequencies, getAllowedActionsForSpot(spotType));
  }

  if(Array.isArray(decision?.actions)){
    return bucketizeSolverFrequencies(decision.actions, spotType);
  }

  return {};
}

async function main(){
  const errors = [];

  const manifestPath = path.join(solverDir, "manifest.json");
  const manifest = await readJson(manifestPath);

  for(const key of ["schemaVersion", "solverVersion", "generatedAt", "indexFile"]){
    if(typeof manifest?.[key] !== "string" || manifest[key].length === 0){
      errors.push(`manifest missing required string field: ${key}`);
    }
  }

  const indexPath = path.join(solverDir, manifest.indexFile || "index.json");
  const index = await readJson(indexPath);

  if(!ensureObject(index.entries) || Object.keys(index.entries).length === 0){
    errors.push("index.entries must be a non-empty object");
  }

  const filesTouched = new Set();
  const coverageBySpotType = { checked_to_hero: 0, facing_bet: 0 };
  let validatedSpots = 0;

  for(const [spotKey, descriptor] of Object.entries(index.entries ?? {})){
    if(typeof descriptor?.file !== "string" || descriptor.file.length === 0){
      errors.push(`index entry ${spotKey} missing file`);
      continue;
    }

    const spotType = normalizeSpotType(descriptor.spotType);
    if(spotType !== "checked_to_hero" && spotType !== "facing_bet"){
      errors.push(`index entry ${spotKey} has unsupported spotType: ${descriptor.spotType}`);
      continue;
    }

    coverageBySpotType[spotType] += 1;

    const datasetPath = path.join(solverDir, descriptor.file);
    filesTouched.add(descriptor.file);

    let dataset;
    try {
      dataset = await readJson(datasetPath);
    } catch {
      errors.push(`dataset file missing or invalid JSON: ${descriptor.file}`);
      continue;
    }

    const decision = dataset?.entries?.[spotKey];
    if(!decision){
      errors.push(`dataset ${descriptor.file} missing decision for ${spotKey}`);
      continue;
    }

    const allowedActions = getAllowedActionsForSpot(spotType);
    const frequencies = frequenciesFromDecision(decision, spotType);

    if(Object.keys(frequencies).length === 0){
      errors.push(`spot ${spotKey} has no valid normalized frequencies`);
      continue;
    }

    for(const action of Object.keys(frequencies)){
      if(!allowedActions.includes(action)){
        errors.push(`spot ${spotKey} has invalid action token: ${action}`);
      }
    }

    const sum = Object.values(frequencies).reduce((acc, value) => acc + value, 0);
    if(Math.abs(sum - 1) > 0.02){
      errors.push(`spot ${spotKey} frequencies do not sum to 1 (sum=${sum.toFixed(4)})`);
    }

    validatedSpots += 1;
  }

  if(errors.length > 0){
    console.error("solver data validation failed");
    for(const issue of errors) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log("solver data validation passed");
  console.log(`schemaVersion: ${manifest.schemaVersion}`);
  console.log(`solverVersion: ${manifest.solverVersion}`);
  console.log(`validated spots: ${validatedSpots}`);
  console.log(`dataset files: ${[...filesTouched].sort().join(", ")}`);
  console.log(`checked_to_hero spots: ${coverageBySpotType.checked_to_hero}`);
  console.log(`facing_bet spots: ${coverageBySpotType.facing_bet}`);
}

main().catch((error) => {
  console.error("solver data validation crashed");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
