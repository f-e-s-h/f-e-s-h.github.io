import {
  DEFAULT_SOLVER_THRESHOLDS,
  gradeActionByFrequency,
  selectBestAction,
} from "./contract.js";

export const DEFAULT_SHADOW_PROMOTION_GATES = Object.freeze({
  minSamples: 120,
  maxUncoveredRate: 0.2,
  maxHardMismatchRate: 0.18,
  maxSoftMismatchRate: 0.35,
});

const ACTION_PROXIMITY_MAP = Object.freeze({
  "bet-small": Object.freeze(["bet-medium"]),
  "bet-medium": Object.freeze(["bet-small", "bet-large"]),
  "bet-large": Object.freeze(["bet-medium"]),
  "raise-small": Object.freeze(["raise-large"]),
  "raise-large": Object.freeze(["raise-small"]),
});

const FAMILY_MIXING_TOLERANCE = Object.freeze({
  flop_cbet_bluff: Object.freeze({ minFrequency: 0.1, maxFrequencyGap: 0.26 }),
  turn_pressure: Object.freeze({ minFrequency: 0.1, maxFrequencyGap: 0.24 }),
  flop_draw_defense: Object.freeze({ minFrequency: 0.12, maxFrequencyGap: 0.22 }),
});

function safeRate(numerator, denominator){
  const n = Number(numerator);
  const d = Number(denominator);
  if(!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return n / d;
}

function isStrictMismatchConflict(heuristicAction, solverAction){
  if(!heuristicAction || !solverAction || heuristicAction === solverAction) return false;
  if(heuristicAction === "check" || solverAction === "check") return true;
  if(heuristicAction === "fold" || solverAction === "fold") return true;
  return false;
}

function isProximalActionMismatch(heuristicAction, solverAction){
  if(!heuristicAction || !solverAction || heuristicAction === solverAction) return false;
  const direct = ACTION_PROXIMITY_MAP[heuristicAction] ?? [];
  if(direct.includes(solverAction)) return true;
  const reverse = ACTION_PROXIMITY_MAP[solverAction] ?? [];
  return reverse.includes(heuristicAction);
}

function isFamilyMixingSoftMismatch({
  familyId,
  heuristicAction,
  solverAction,
  heuristicFrequency,
  solverBestFrequency,
}){
  const id = typeof familyId === "string" ? familyId : "";
  const config = FAMILY_MIXING_TOLERANCE[id];
  if(!config) return false;
  if(isStrictMismatchConflict(heuristicAction, solverAction)) return false;

  const heuristicFreq = Number(heuristicFrequency);
  const solverFreq = Number(solverBestFrequency);
  if(!Number.isFinite(heuristicFreq) || !Number.isFinite(solverFreq)) return false;
  if(heuristicFreq < config.minFrequency) return false;

  const gap = solverFreq - heuristicFreq;
  return gap <= config.maxFrequencyGap;
}

function classifyMismatchStatus({
  familyId,
  heuristicBest,
  solverBest,
  heuristicGrade,
  heuristicFrequency,
  solverBestFrequency,
}){
  if(!heuristicBest || !solverBest || heuristicBest === solverBest) return "agreement";

  if(heuristicGrade?.category === "acceptable") return "soft_mismatch";

  if(isProximalActionMismatch(heuristicBest, solverBest) && !isStrictMismatchConflict(heuristicBest, solverBest)){
    return "soft_mismatch";
  }

  if(isFamilyMixingSoftMismatch({
    familyId,
    heuristicAction: heuristicBest,
    solverAction: solverBest,
    heuristicFrequency,
    solverBestFrequency,
  })){
    return "soft_mismatch";
  }

  return "hard_mismatch";
}

export function createShadowComparison({
  spotKey,
  node,
  scored,
  solverDecision,
  thresholds = DEFAULT_SOLVER_THRESHOLDS,
}){
  const timestamp = new Date().toISOString();
  const heuristicBest = scored?.bestAction ?? null;
  const userAction = scored?.action ?? null;
  const familyId = node?.postflopFamilyId ?? null;

  if(!solverDecision || !solverDecision.frequencies){
    return {
      timestamp,
      spotKey,
      street: node?.street ?? "unknown",
      spotType: node?.spotType ?? "unknown",
      familyId,
      covered: false,
      status: "uncovered",
      solverBest: null,
      heuristicBest,
      heuristicCategory: null,
      userAction,
      userCategory: null,
      solverBestFrequency: 0,
      heuristicFrequency: 0,
    };
  }

  const frequencies = solverDecision.frequencies;
  const solverBest = selectBestAction(frequencies);
  const heuristicGrade = heuristicBest ? gradeActionByFrequency(heuristicBest, frequencies, thresholds) : null;
  const userGrade = userAction ? gradeActionByFrequency(userAction, frequencies, thresholds) : null;
  const solverBestFrequency = Number(frequencies?.[solverBest] ?? 0);
  const heuristicFrequency = Number(frequencies?.[heuristicBest] ?? 0);

  const status = classifyMismatchStatus({
    familyId,
    heuristicBest,
    solverBest,
    heuristicGrade,
    heuristicFrequency,
    solverBestFrequency,
  });

  return {
    timestamp,
    spotKey,
    street: node?.street ?? "unknown",
    spotType: node?.spotType ?? "unknown",
    familyId,
    covered: true,
    status,
    solverBest,
    heuristicBest,
    heuristicCategory: heuristicGrade?.category ?? null,
    userAction,
    userCategory: userGrade?.category ?? null,
    solverBestFrequency,
    heuristicFrequency,
  };
}

export function summarizeShadowRecords(records){
  const summary = {
    total: 0,
    covered: 0,
    uncovered: 0,
    agreement: 0,
    soft_mismatch: 0,
    hard_mismatch: 0,
  };

  for(const record of Array.isArray(records) ? records : []){
    summary.total += 1;

    if(record?.covered) summary.covered += 1;
    else summary.uncovered += 1;

    if(record?.status === "agreement") summary.agreement += 1;
    if(record?.status === "soft_mismatch") summary.soft_mismatch += 1;
    if(record?.status === "hard_mismatch") summary.hard_mismatch += 1;
  }

  return summary;
}

export function evaluateShadowPromotionReadiness(summary, gates = DEFAULT_SHADOW_PROMOTION_GATES){
  const mergedGates = {
    ...DEFAULT_SHADOW_PROMOTION_GATES,
    ...(gates ?? {}),
  };

  const sampleCount = Math.max(0, Number(summary?.total ?? 0));
  const coveredCount = Math.max(0, Number(summary?.covered ?? 0));
  const uncoveredCount = Math.max(0, Number(summary?.uncovered ?? 0));
  const agreementCount = Math.max(0, Number(summary?.agreement ?? 0));
  const hardMismatchCount = Math.max(0, Number(summary?.hard_mismatch ?? 0));
  const softMismatchCount = Math.max(0, Number(summary?.soft_mismatch ?? 0));

  const coveredRate = safeRate(coveredCount, sampleCount);
  const uncoveredRate = safeRate(uncoveredCount, sampleCount);
  const agreementRate = safeRate(agreementCount, coveredCount);
  const hardMismatchRate = safeRate(hardMismatchCount, coveredCount);
  const softMismatchRate = safeRate(softMismatchCount, coveredCount);

  const blockers = [];
  if(sampleCount < mergedGates.minSamples){
    blockers.push(`Need at least ${mergedGates.minSamples} shadow samples (have ${sampleCount}).`);
  }

  if(coveredCount === 0){
    blockers.push("No covered spots measured yet.");
  }

  if(uncoveredRate > mergedGates.maxUncoveredRate){
    blockers.push(
      `Uncovered rate ${(uncoveredRate * 100).toFixed(1)}% exceeds ${(mergedGates.maxUncoveredRate * 100).toFixed(1)}%.`,
    );
  }

  if(hardMismatchRate > mergedGates.maxHardMismatchRate){
    blockers.push(
      `Hard mismatch rate ${(hardMismatchRate * 100).toFixed(1)}% exceeds ${(mergedGates.maxHardMismatchRate * 100).toFixed(1)}%.`,
    );
  }

  if(softMismatchRate > mergedGates.maxSoftMismatchRate){
    blockers.push(
      `Soft mismatch rate ${(softMismatchRate * 100).toFixed(1)}% exceeds ${(mergedGates.maxSoftMismatchRate * 100).toFixed(1)}%.`,
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    gates: mergedGates,
    metrics: {
      sampleCount,
      coveredCount,
      uncoveredCount,
      coveredRate,
      uncoveredRate,
      agreementRate,
      hardMismatchRate,
      softMismatchRate,
    },
  };
}

function normalizeClusterField(value, fallback){
  if(typeof value === "string" && value.length > 0) return value;
  return fallback;
}

function shadowClusterKey(record){
  const street = normalizeClusterField(record?.street, "unknown");
  const spotType = normalizeClusterField(record?.spotType, "unknown");
  const familyId = normalizeClusterField(record?.familyId, "none");
  const status = normalizeClusterField(record?.status, "unknown");
  return `${street}|${spotType}|${familyId}|${status}`;
}

export function clusterShadowRecords(records, maxClusters = 8){
  const counters = new Map();

  for(const record of Array.isArray(records) ? records : []){
    const key = shadowClusterKey(record);
    if(!counters.has(key)){
      counters.set(key, {
        key,
        street: normalizeClusterField(record?.street, "unknown"),
        spotType: normalizeClusterField(record?.spotType, "unknown"),
        familyId: normalizeClusterField(record?.familyId, "none"),
        status: normalizeClusterField(record?.status, "unknown"),
        count: 0,
      });
    }
    counters.get(key).count += 1;
  }

  return [...counters.values()]
    .sort((a, b) => {
      if(b.count !== a.count) return b.count - a.count;
      return a.key.localeCompare(b.key);
    })
    .slice(0, Math.max(1, maxClusters));
}

export function buildShadowDiagnosticReport(records, options = {}){
  const maxClusters = Number.isFinite(options?.maxClusters)
    ? Math.max(1, Math.round(options.maxClusters))
    : 8;

  const sourceRecords = Array.isArray(records) ? records : [];
  const summary = summarizeShadowRecords(sourceRecords);
  const readiness = evaluateShadowPromotionReadiness(summary, options?.gates);
  const topClusters = clusterShadowRecords(sourceRecords, maxClusters);
  const hardMismatchClusters = topClusters.filter((cluster) => cluster.status === "hard_mismatch");
  const softMismatchClusters = topClusters.filter((cluster) => cluster.status === "soft_mismatch");
  const uncoveredClusters = topClusters.filter((cluster) => cluster.status === "uncovered");

  return {
    generatedAt: new Date().toISOString(),
    summary,
    topClusters,
    hardMismatchClusters,
    softMismatchClusters,
    uncoveredClusters,
    readiness,
  };
}
