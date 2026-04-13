const CHECKED_TO_HERO_ACTIONS = Object.freeze(["check", "bet-small", "bet-medium", "bet-large"]);
const FACING_BET_ACTIONS = Object.freeze(["fold", "call", "raise-small", "raise-large"]);

const DEFAULT_SOLVER_THRESHOLDS = Object.freeze({
  bestMin: 0.5,
  acceptableMin: 0.15,
  acceptableScore: 0.65,
});

const DEFAULT_SOLVER_THRESHOLD_PROFILE = "standard";
const SOLVER_THRESHOLD_PROFILES = Object.freeze({
  beginner: Object.freeze({
    bestMin: 0.45,
    acceptableMin: 0.12,
    acceptableScore: 0.7,
  }),
  standard: Object.freeze({
    ...DEFAULT_SOLVER_THRESHOLDS,
  }),
  advanced: Object.freeze({
    bestMin: 0.58,
    acceptableMin: 0.18,
    acceptableScore: 0.6,
  }),
});

const STACK_BUCKETS_BB = Object.freeze([20, 40, 60, 80, 100, 120, 150, 200]);

const BET_SIZE_ANCHORS = Object.freeze([
  { action: "bet-small", value: 0.33 },
  { action: "bet-medium", value: 0.58 },
  { action: "bet-large", value: 0.86 },
]);

const RAISE_SIZE_ANCHORS = Object.freeze([
  { action: "raise-small", value: 0.75 },
  { action: "raise-large", value: 1.1 },
]);

const VALID_ACTIONS = new Set([...CHECKED_TO_HERO_ACTIONS, ...FACING_BET_ACTIONS]);
const SUPPORTED_SOLVER_STREETS = new Set(["flop", "turn"]);

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

function normalizeActionToken(value){
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return text.length > 0 ? text : "unknown";
}

export function sanitizeToken(value){
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return text.length > 0 ? text : "unknown";
}

export function normalizeSpotType(value){
  const token = sanitizeToken(value);
  if(token === "checked_to_hero" || token === "facing_bet") return token;
  return token;
}

export function getAllowedActionsForSpot(spotType){
  const normalized = normalizeSpotType(spotType);
  if(normalized === "checked_to_hero") return CHECKED_TO_HERO_ACTIONS;
  if(normalized === "facing_bet") return FACING_BET_ACTIONS;
  return [...VALID_ACTIONS].sort();
}

export function getSolverThresholdProfileKey(profile){
  const token = sanitizeToken(profile);
  return SOLVER_THRESHOLD_PROFILES[token] ? token : DEFAULT_SOLVER_THRESHOLD_PROFILE;
}

export function getSolverThresholdsForProfile(profile, overrides = null){
  const key = getSolverThresholdProfileKey(profile);
  return {
    ...SOLVER_THRESHOLD_PROFILES[key],
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };
}

export function isSolverEligibleNode(node){
  if(!node || typeof node !== "object") return false;

  const street = sanitizeToken(node.street);
  if(!SUPPORTED_SOLVER_STREETS.has(street)) return false;

  const spotType = normalizeSpotType(node.spotType);
  if(spotType !== "checked_to_hero" && spotType !== "facing_bet") return false;

  const ghostCount = Number.isFinite(node.activeGhostCount) ? Math.round(node.activeGhostCount) : 0;
  if(ghostCount > 0) return false;

  const effectivePlayers = Number.isFinite(node.effectivePlayers)
    ? Math.round(node.effectivePlayers)
    : Number.isFinite(node.numPlayers)
      ? Math.round(node.numPlayers)
      : 2;

  const numPlayers = Number.isFinite(node.numPlayers) ? Math.round(node.numPlayers) : effectivePlayers;

  return effectivePlayers === 2 && numPlayers === 2;
}

export function stackBucketFromBb(stackBb){
  if(!Number.isFinite(stackBb)) return "unknown";
  const nearest = nearestNumberWithHighTie(stackBb, STACK_BUCKETS_BB);
  return `${nearest}bb`;
}

export function buildActionHistoryKey(meta){
  const history = Array.isArray(meta?.history) ? meta.history : [];
  if(history.length === 0) return "start";

  return history
    .slice(-4)
    .map((item) => {
      if(typeof item === "string") return sanitizeToken(item);
      const street = sanitizeToken(item?.street ?? "street");
      const action = sanitizeToken(item?.action ?? "action");
      return `${street}_${action}`;
    })
    .join("__");
}

export function canonicalHistoryKeyForNode(node, meta = null){
  const street = sanitizeToken(node?.street ?? "street");
  const spotType = normalizeSpotType(node?.spotType);

  // Phase-1 solver data uses fixed canonical history buckets for flop/turn spots.
  if(street === "flop") return "start";
  if(street === "turn"){
    if(spotType === "checked_to_hero") return "flop_check__flop_check";
    if(spotType === "facing_bet") return "flop_bet_small__flop_call";
  }

  return buildActionHistoryKey(meta);
}

export function buildCanonicalSpotKey(node, meta = null){
  if(!node || typeof node !== "object") return "invalid_node";

  const position = sanitizeToken(node.heroPos ?? meta?.heroPos ?? node.heroSeat ?? "unknown");
  const stackValue = Number.isFinite(node.stackLeftBb)
    ? node.stackLeftBb
    : Number.isFinite(meta?.stackLeftBb)
      ? meta.stackLeftBb
      : Number.isFinite(node.stackBb)
        ? node.stackBb
        : Number.isFinite(meta?.stackBb)
          ? meta.stackBb
          : Number.NaN;

  const stackBucket = stackBucketFromBb(stackValue);
  const boardTexture = sanitizeToken(node.boardTexture ?? "unknown");
  const street = sanitizeToken(node.street ?? "street");
  const spotType = normalizeSpotType(node.spotType);
  const nodeType = `${street}_${spotType}`;
  const historyKey = canonicalHistoryKeyForNode(node, meta);

  return `pos_${position}__stack_${stackBucket}__texture_${boardTexture}__node_${nodeType}__hist_${historyKey}`;
}

export function mapSolverAmountToAction(spotType, amountPot){
  const normalizedSpotType = normalizeSpotType(spotType);
  if(!Number.isFinite(amountPot)) return null;

  if(normalizedSpotType === "checked_to_hero"){
    if(amountPot <= 0.01) return "check";
    return nearestAnchorAction(amountPot, BET_SIZE_ANCHORS);
  }

  if(normalizedSpotType === "facing_bet"){
    if(amountPot <= 0.01) return "call";
    return nearestAnchorAction(amountPot, RAISE_SIZE_ANCHORS);
  }

  return null;
}

export function normalizeSolverActionToken(rawAction, spotType, amountPot = Number.NaN){
  const token = normalizeActionToken(rawAction);

  if(VALID_ACTIONS.has(token)) return token;
  if(token.includes("check")) return "check";
  if(token.includes("fold")) return "fold";
  if(token.includes("call")) return "call";

  if(token.includes("bet-small") || token.includes("quarter") || token.includes("b33") || token.includes("b30")) return "bet-small";
  if(token.includes("bet-medium") || token.includes("half") || token.includes("b50") || token.includes("b58")) return "bet-medium";
  if(token.includes("bet-large") || token.includes("b75") || token.includes("pot") || token.includes("over")) return "bet-large";

  if(token.includes("raise-small") || token.includes("min-raise") || token.includes("minraise")) return "raise-small";
  if(token.includes("raise-large") || token.includes("jam") || token.includes("all-in") || token.includes("allin")) return "raise-large";

  if(token.includes("bet") || token.includes("raise")){
    return mapSolverAmountToAction(spotType, amountPot);
  }

  if(Number.isFinite(amountPot)){
    return mapSolverAmountToAction(spotType, amountPot);
  }

  return null;
}

export function normalizeFrequencyMap(frequencies, allowedActions = []){
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

export function bucketizeSolverFrequencies(decisions, spotType){
  if(!Array.isArray(decisions) || decisions.length === 0) return {};

  const allowedActions = getAllowedActionsForSpot(spotType);
  const bucketed = {};

  for(const decision of decisions){
    const frequency = Number(decision?.frequency ?? decision?.freq);
    if(!Number.isFinite(frequency) || frequency <= 0) continue;

    const amountPot = Number.isFinite(decision?.amountPot)
      ? decision.amountPot
      : Number.isFinite(decision?.sizePot)
        ? decision.sizePot
        : Number.isFinite(decision?.amount)
          ? decision.amount
          : Number.NaN;

    const action = normalizeSolverActionToken(decision?.action, spotType, amountPot);
    if(!action || !allowedActions.includes(action)) continue;

    bucketed[action] = (bucketed[action] ?? 0) + frequency;
  }

  return normalizeFrequencyMap(bucketed, allowedActions);
}

export function selectBestAction(frequencyMap){
  const entries = Object.entries(frequencyMap ?? {}).filter(([, value]) => Number.isFinite(value));
  if(entries.length === 0) return null;

  entries.sort((a, b) => {
    if(b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  return entries[0][0];
}

export function gradeActionByFrequency(action, frequencyMap, thresholds = DEFAULT_SOLVER_THRESHOLDS){
  const merged = {
    ...DEFAULT_SOLVER_THRESHOLDS,
    ...(thresholds ?? {}),
  };

  const token = normalizeActionToken(action);
  const frequency = Number(frequencyMap?.[token] ?? 0);

  if(frequency >= merged.bestMin){
    return { category: "best", score: 1, frequency };
  }

  if(frequency >= merged.acceptableMin){
    return { category: "acceptable", score: merged.acceptableScore, frequency };
  }

  return { category: "incorrect", score: 0, frequency };
}

export {
  CHECKED_TO_HERO_ACTIONS,
  FACING_BET_ACTIONS,
  DEFAULT_SOLVER_THRESHOLDS,
  DEFAULT_SOLVER_THRESHOLD_PROFILE,
  SOLVER_THRESHOLD_PROFILES,
};
