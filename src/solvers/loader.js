import {
  bucketizeSolverFrequencies,
  buildCanonicalSpotKey,
  normalizeFrequencyMap,
  normalizeSpotType,
} from "./contract.js";

const DEFAULT_SOLVER_BASE_PATH = "/data/solver";

const manifestCache = new Map();
const indexCache = new Map();
const datasetCache = new Map();

function normalizeBasePath(basePath){
  if(typeof basePath !== "string" || basePath.trim().length === 0) return DEFAULT_SOLVER_BASE_PATH;
  const trimmed = basePath.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function getFetchImpl(fetchImpl){
  if(typeof fetchImpl === "function") return fetchImpl;
  if(typeof fetch === "function") return fetch;
  return null;
}

async function fetchJson(url, fetchImpl){
  const response = await fetchImpl(url);
  if(!response || !response.ok){
    const status = response ? `${response.status} ${response.statusText ?? ""}`.trim() : "no response";
    throw new Error(`Failed to load ${url}: ${status}`);
  }
  return response.json();
}

function normalizeRawDecision(rawDecision, spotType){
  if(!rawDecision || typeof rawDecision !== "object") return null;

  const allowedSpotType = normalizeSpotType(spotType);
  const frequenciesFromMap = normalizeFrequencyMap(rawDecision.frequencies, []);
  const frequencies = Object.keys(frequenciesFromMap).length > 0
    ? normalizeFrequencyMap(frequenciesFromMap, [])
    : bucketizeSolverFrequencies(rawDecision.actions, allowedSpotType);

  if(Object.keys(frequencies).length === 0) return null;

  return {
    frequencies,
    actions: Array.isArray(rawDecision.actions) ? rawDecision.actions : [],
    meta: rawDecision.meta ?? {},
  };
}

export async function loadSolverManifest(fetchImpl, basePath = DEFAULT_SOLVER_BASE_PATH){
  const normalizedBasePath = normalizeBasePath(basePath);
  if(manifestCache.has(normalizedBasePath)) return manifestCache.get(normalizedBasePath);

  const activeFetch = getFetchImpl(fetchImpl);
  if(!activeFetch){
    manifestCache.set(normalizedBasePath, null);
    return null;
  }

  try {
    const manifest = await fetchJson(`${normalizedBasePath}/manifest.json`, activeFetch);
    manifestCache.set(normalizedBasePath, manifest ?? null);
    return manifest ?? null;
  } catch {
    manifestCache.set(normalizedBasePath, null);
    return null;
  }
}

export async function loadSolverIndex(fetchImpl, basePath = DEFAULT_SOLVER_BASE_PATH){
  const normalizedBasePath = normalizeBasePath(basePath);
  if(indexCache.has(normalizedBasePath)) return indexCache.get(normalizedBasePath);

  const manifest = await loadSolverManifest(fetchImpl, normalizedBasePath);
  if(!manifest){
    indexCache.set(normalizedBasePath, null);
    return null;
  }

  const indexFile = typeof manifest.indexFile === "string" && manifest.indexFile.length > 0
    ? manifest.indexFile
    : "index.json";

  const activeFetch = getFetchImpl(fetchImpl);
  if(!activeFetch){
    indexCache.set(normalizedBasePath, null);
    return null;
  }

  try {
    const index = await fetchJson(`${normalizedBasePath}/${indexFile}`, activeFetch);
    indexCache.set(normalizedBasePath, index ?? null);
    return index ?? null;
  } catch {
    indexCache.set(normalizedBasePath, null);
    return null;
  }
}

export async function loadSolverDataset(fileName, fetchImpl, basePath = DEFAULT_SOLVER_BASE_PATH){
  const normalizedBasePath = normalizeBasePath(basePath);
  const key = `${normalizedBasePath}|${fileName}`;
  if(datasetCache.has(key)) return datasetCache.get(key);

  const activeFetch = getFetchImpl(fetchImpl);
  if(!activeFetch || typeof fileName !== "string" || fileName.length === 0){
    datasetCache.set(key, null);
    return null;
  }

  try {
    const dataset = await fetchJson(`${normalizedBasePath}/${fileName}`, activeFetch);
    datasetCache.set(key, dataset ?? null);
    return dataset ?? null;
  } catch {
    datasetCache.set(key, null);
    return null;
  }
}

export async function lookupSolverDecisionBySpotKey(spotKey, fetchImpl, basePath = DEFAULT_SOLVER_BASE_PATH){
  if(typeof spotKey !== "string" || spotKey.length === 0) return null;

  const index = await loadSolverIndex(fetchImpl, basePath);
  const entry = index?.entries?.[spotKey];
  if(!entry || typeof entry.file !== "string") return null;

  const dataset = await loadSolverDataset(entry.file, fetchImpl, basePath);
  const rawDecision = dataset?.entries?.[spotKey];
  if(!rawDecision) return null;

  const spotType = normalizeSpotType(entry.spotType ?? rawDecision.spotType);
  const normalizedDecision = normalizeRawDecision(rawDecision, spotType);
  if(!normalizedDecision) return null;

  return {
    spotKey,
    spotType,
    sourceFile: entry.file,
    ...normalizedDecision,
  };
}

export async function lookupSolverDecisionForNode(node, meta, fetchImpl, basePath = DEFAULT_SOLVER_BASE_PATH){
  const spotKey = buildCanonicalSpotKey(node, meta);
  const solverDecision = await lookupSolverDecisionBySpotKey(spotKey, fetchImpl, basePath);
  return { spotKey, solverDecision };
}

export function resetSolverLoaderCaches(){
  manifestCache.clear();
  indexCache.clear();
  datasetCache.clear();
}

export { DEFAULT_SOLVER_BASE_PATH };
