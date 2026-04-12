import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const solverDir = path.join(rootDir, "public", "data", "solver");

const POSITIONS = ["ip", "oop"];
const STACK_BUCKETS = [40, 60, 80, 100, 120];
const TEXTURES = ["dry", "semi_wet", "wet", "paired", "monotone"];
const STREETS = ["flop", "turn"];
const SPOT_TYPES = ["checked_to_hero", "facing_bet"];

function buildSpotKey({ position, stackBucket, texture, street, spotType, historyKey }){
  return `pos_${position}__stack_${stackBucket}bb__texture_${texture}__node_${street}_${spotType}__hist_${historyKey}`;
}

function historyKeyFor(street, spotType){
  if(street === "flop") return "start";
  if(spotType === "checked_to_hero") return "flop_check__flop_check";
  return "flop_bet_small__flop_call";
}

function normalizeToOne(freqMap){
  const total = Object.values(freqMap).reduce((sum, value) => sum + value, 0);
  if(total <= 0) return freqMap;

  const normalized = {};
  for(const [action, value] of Object.entries(freqMap)){
    normalized[action] = Number((value / total).toFixed(6));
  }

  const keys = Object.keys(normalized);
  const drift = 1 - keys.reduce((sum, key) => sum + normalized[key], 0);
  const maxKey = keys.sort((a, b) => normalized[b] - normalized[a])[0];
  normalized[maxKey] = Number((normalized[maxKey] + drift).toFixed(6));
  return normalized;
}

function checkedFrequencies({ texture, position, stackBucket, street }){
  let check = 0.28;
  let betSmall = 0.22;
  let betMedium = 0.3;
  let betLarge = 0.2;

  if(texture === "dry"){
    check += 0.08;
    betSmall += 0.06;
    betLarge -= 0.08;
  }

  if(texture === "wet" || texture === "monotone"){
    check -= 0.04;
    betMedium += 0.03;
    betLarge += 0.07;
    betSmall -= 0.06;
  }

  if(texture === "paired"){
    check += 0.06;
    betLarge -= 0.04;
  }

  if(position === "oop"){
    check += 0.05;
    betSmall -= 0.02;
    betLarge -= 0.03;
  }

  if(street === "turn"){
    check += 0.03;
    betSmall -= 0.02;
    betMedium += 0.01;
    betLarge -= 0.02;
  }

  if(stackBucket >= 100){
    check += 0.02;
    betMedium += 0.01;
    betLarge -= 0.03;
  }

  return normalizeToOne({
    check: Math.max(0.05, check),
    "bet-small": Math.max(0.05, betSmall),
    "bet-medium": Math.max(0.05, betMedium),
    "bet-large": Math.max(0.05, betLarge),
  });
}

function facingFrequencies({ texture, position, stackBucket, street }){
  let fold = 0.22;
  let call = 0.46;
  let raiseSmall = 0.2;
  let raiseLarge = 0.12;

  if(texture === "wet" || texture === "monotone"){
    fold += 0.04;
    call += 0.03;
    raiseLarge -= 0.03;
    raiseSmall -= 0.04;
  }

  if(texture === "dry"){
    fold -= 0.03;
    raiseSmall += 0.03;
  }

  if(position === "ip"){
    fold -= 0.02;
    call += 0.02;
  }

  if(street === "turn"){
    fold += 0.03;
    raiseLarge += 0.02;
    call -= 0.03;
    raiseSmall -= 0.02;
  }

  if(stackBucket >= 100){
    raiseLarge += 0.03;
    fold += 0.01;
    call -= 0.02;
    raiseSmall -= 0.02;
  }

  return normalizeToOne({
    fold: Math.max(0.05, fold),
    call: Math.max(0.05, call),
    "raise-small": Math.max(0.05, raiseSmall),
    "raise-large": Math.max(0.05, raiseLarge),
  });
}

function decisionFor(spotType, context){
  if(spotType === "checked_to_hero"){
    return {
      frequencies: checkedFrequencies(context),
      meta: {
        source: "prototype-generator",
        note: "Synthetic educational mix; replace with real solver exports.",
      },
    };
  }

  return {
    frequencies: facingFrequencies(context),
    meta: {
      source: "prototype-generator",
      note: "Synthetic educational mix; replace with real solver exports.",
    },
  };
}

async function writeJson(filePath, value){
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(){
  const entriesByFile = {
    "heads-up-flop-checked.json": {},
    "heads-up-flop-facing.json": {},
    "heads-up-turn-checked.json": {},
    "heads-up-turn-facing.json": {},
  };

  const indexEntries = {};

  for(const position of POSITIONS){
    for(const stackBucket of STACK_BUCKETS){
      for(const texture of TEXTURES){
        for(const street of STREETS){
          for(const spotType of SPOT_TYPES){
            const historyKey = historyKeyFor(street, spotType);
            const spotKey = buildSpotKey({
              position,
              stackBucket,
              texture,
              street,
              spotType,
              historyKey,
            });

            const fileName = `heads-up-${street}-${spotType === "checked_to_hero" ? "checked" : "facing"}.json`;
            const context = { position, stackBucket, texture, street };
            entriesByFile[fileName][spotKey] = decisionFor(spotType, context);

            indexEntries[spotKey] = {
              file: fileName,
              street,
              spotType,
            };
          }
        }
      }
    }
  }

  const spotCount = Object.keys(indexEntries).length;

  const manifest = {
    schemaVersion: "1.0.0",
    solverVersion: "prototype-2026-04-10-coverage100",
    generatedAt: new Date().toISOString(),
    coverage: "phase1-heads-up-postflop",
    thresholds: {
      bestMin: 0.5,
      acceptableMin: 0.15,
    },
    indexFile: "index.json",
    spotCount,
  };

  const index = {
    schemaVersion: "1.0.0",
    entries: indexEntries,
  };

  await fs.mkdir(solverDir, { recursive: true });
  await writeJson(path.join(solverDir, "manifest.json"), manifest);
  await writeJson(path.join(solverDir, "index.json"), index);

  for(const [fileName, entries] of Object.entries(entriesByFile)){
    await writeJson(path.join(solverDir, fileName), {
      schemaVersion: "1.0.0",
      entries,
    });
  }

  console.log(`generated solver prototype data with ${spotCount} spots`);
  for(const [fileName, entries] of Object.entries(entriesByFile)){
    console.log(`${fileName}: ${Object.keys(entries).length}`);
  }
}

main().catch((error) => {
  console.error("failed to generate solver prototype data");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
