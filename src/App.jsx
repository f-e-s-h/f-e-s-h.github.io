import { useState, useEffect, useRef } from "react";

function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const SUITS_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_RED  = { s: false, h: true, d: true, c: false };
const RS = r => ({11: 'J', 12: 'Q', 13: 'K', 14: 'A'}[r] ?? String(r));
const POSITIONS = ['utg', 'utg1', 'hj', 'co', 'btn', 'sb', 'bb'];
const POS_INFO = {
  utg:  { short: 'UTG',   name: 'Under the Gun', color: '#cc5050' },
  utg1: { short: 'UTG+1', name: 'UTG+1',         color: '#cc7040' },
  hj:   { short: 'HJ',    name: 'Hijack',        color: '#c0a030' },
  co:   { short: 'CO',    name: 'Cutoff',        color: '#70a840' },
  btn:  { short: 'BTN',   name: 'Button',        color: '#4090c8' },
  sb:   { short: 'SB',    name: 'Small Blind',   color: '#7060c0' },
  bb:   { short: 'BB',    name: 'Big Blind',     color: '#5080b0' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// POT ODDS — logic
// ═══════════════════════════════════════════════════════════════════════════════
const PO_SUITS = ['s', 'h', 'd', 'c'];

function shuffle(arr) {
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = ~~(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeck(){
  const d = [];
  for(const s of PO_SUITS) for(let r = 2; r <= 14; r++) d.push({r, s});
  return shuffle(d);
}

function pickN(deck, pred, n){
  const out = [];
  for(let i = 0; i < deck.length && out.length < n; i++){
    if(pred(deck[i])){
      out.push(...deck.splice(i, 1));
      i--;
    }
  }
  return out;
}

const pickOne = (deck, pred) => pickN(deck, pred, 1)[0] ?? null;

function genFlushDraw(street){
  const suit = PO_SUITS[~~(Math.random() * 4)];
  const deck = makeDeck();
  const s4 = shuffle(pickN(deck, c => c.s === suit, 4));
  if(s4.length < 4) throw 0;
  const pad = pickN(deck, c => c.s !== suit, street === 'flop' ? 1 : 2);
  return {drawName: 'Flush Draw', outs: 9, desc: `4 ${SUITS_SYM[suit]} cards — need one more for the flush`, holeCards: [s4[0], s4[1]], communityCards: shuffle([s4[2], s4[3], ...pad])};
}

function genOESD(street){
  const st = ~~(Math.random() * 9) + 2;
  const cycled = shuffle(PO_SUITS);
  const deck = makeDeck();
  const ranks = shuffle([st, st+1, st+2, st+3]);
  const s4 = ranks.map((r, i) => pickOne(deck, c => c.r === r && c.s === cycled[i]) ?? pickOne(deck, c => c.r === r)).filter(Boolean);
  if(s4.length < 4) throw 0;
  const blockLowest = st - 2 === 1 ? 14 : st - 2;
  const lowOut = st - 1 === 1 ? 14 : st - 1;
  const bad = new Set([blockLowest, lowOut, st+4, st+5]);
  const pad = pickN(deck, c => !bad.has(c.r), street === 'flop' ? 1 : 2);
  return {drawName: 'Open-Ended Straight Draw', outs: 8, desc: `${RS(st)}-${RS(st+1)}-${RS(st+2)}-${RS(st+3)} — need a ${RS(lowOut)} or ${RS(st+4)}`, holeCards: [s4[0], s4[1]], communityCards: shuffle([s4[2], s4[3], ...pad])};
}

function genGutshot(street){
  const st = ~~(Math.random() * 9) + 2;
  const f5 = [st, st+1, st+2, st+3, st+4];
  const ri = ~~(Math.random() * 3) + 1;
  const missing = f5[ri];
  const cycled = shuffle(PO_SUITS);
  const ranks = shuffle(f5.filter((_, i) => i !== ri));
  const deck = makeDeck();
  const s4 = ranks.map((r, i) => pickOne(deck, c => c.r === r && c.s === cycled[i]) ?? pickOne(deck, c => c.r === r)).filter(Boolean);
  if(s4.length < 4) throw 0;
  const bad = new Set(f5);
  const pad = pickN(deck, c => !bad.has(c.r), street === 'flop' ? 1 : 2);
  return {drawName: 'Gutshot Straight Draw', outs: 4, desc: `Inside straight — only a ${RS(missing)} completes it`, holeCards: [s4[0], s4[1]], communityCards: shuffle([s4[2], s4[3], ...pad])};
}

function genTwoOvercards(street){
  const deck = makeDeck();
  const hrs = shuffle([12, 13, 14]).slice(0, 2).sort((a, b) => b - a);
  const hole = hrs.map(r => pickOne(deck, c => c.r === r)).filter(Boolean);
  if(hole.length < 2) throw 0;
  const min = Math.min(...hrs);
  const n = street === 'flop' ? 3 : 4;
  const board = pickN(deck, c => c.r < min - 1, n);
  if(board.length < n) throw 0;
  return {drawName: 'Two Overcards', outs: 6, desc: `${RS(hrs[0])}-${RS(hrs[1])} both beat the board — need to pair up`, holeCards: hole, communityCards: board};
}

function genOneOvercard(street){
  const deck = makeDeck();
  const ace = pickOne(deck, c => c.r === 14);
  const low = pickOne(deck, c => c.r <= 7);
  if(!ace || !low) throw 0;
  const n = street === 'flop' ? 3 : 4;
  const board = pickN(deck, c => c.r >= 8 && c.r <= 9 && c.r !== low.r, n);
  if(board.length < n){
    board.length = 0;
    const candidates = pickN(deck, c => c.r >= 8 && c.r <= 13 && c.r !== low.r, n + 3);
    const safe = [];
    for(const c of candidates){
      const ranks = [...safe, c].map(x => x.r).sort((a, b) => a - b);
      if(ranks.filter(r => r >= 10).length < 3) safe.push(c);
      if(safe.length === n) break;
    }
    if(safe.length < n) throw 0;
    board.push(...safe);
  }
  return {drawName: 'One Overcard', outs: 3, desc: `Only the Ace can improve your hand — thin draw`, holeCards: [ace, low], communityCards: board};
}

function genSetDraw(street){
  const deck = makeDeck();
  const rank = ~~(Math.random() * 13) + 2;
  const pair = pickN(deck, c => c.r === rank, 2);
  if(pair.length < 2) throw 0;
  const n = street === 'flop' ? 3 : 4;
  const board = pickN(deck, c => c.r !== rank, n);
  if(board.length < n) throw 0;
  return {drawName: 'Pocket Pair → Trips', outs: 2, desc: `Pocket ${RS(rank)}s — only 2 outs left to hit three of a kind`, holeCards: pair, communityCards: board};
}

function genFlushGutshot(street){
  const suit = PO_SUITS[~~(Math.random() * 4)];
  const st = ~~(Math.random() * 9) + 2;
  const f5 = [st, st+1, st+2, st+3, st+4];
  const ri = ~~(Math.random() * 3) + 1;
  const missing = f5[ri];
  const ranks = shuffle(f5.filter((_, i) => i !== ri));
  const deck = makeDeck();
  const s4 = ranks.map(r => pickOne(deck, c => c.r === r && c.s === suit)).filter(Boolean);
  if(s4.length < 4) throw 0;
  const n = street === 'flop' ? 1 : 2;
  const bad = new Set(f5);
  const pad = pickN(deck, c => !bad.has(c.r) && c.s !== suit, n);
  if(pad.length < n) throw 0;
  return {drawName: 'Flush Draw + Gutshot', outs: 12, desc: `4 ${SUITS_SYM[suit]} flush draw + inside straight — need ${RS(missing)} or any ${SUITS_SYM[suit]}`, holeCards: [s4[0], s4[1]], communityCards: shuffle([s4[2], s4[3], ...pad])};
}

function genFlushPair(street){
  const suit = PO_SUITS[~~(Math.random() * 4)];
  const deck = makeDeck();
  const h1r = Math.random() > 0.5 ? 14 : 13;
  const h1 = pickOne(deck, c => c.r === h1r && c.s === suit);
  if(!h1) throw 0;
  const mr = ~~(Math.random() * 5) + 8;
  const h2 = pickOne(deck, c => c.r === mr && c.s === suit);
  if(!h2) throw 0;
  const pc = pickOne(deck, c => c.r === mr && c.s !== suit);
  if(!pc) throw 0;
  const b2 = pickOne(deck, c => c.s === suit && c.r !== h1r && c.r !== mr);
  if(!b2) throw 0;
  const b3 = pickOne(deck, c => c.s === suit && c.r !== h1r && c.r !== mr && c.r !== b2.r);
  if(!b3) throw 0;
  const community = [pc, b2, b3];
  if(street === 'turn'){
    const pad = pickOne(deck, c => c.s !== suit && c.r !== mr && c.r !== h1r);
    if(!pad) throw 0;
    community.push(pad);
  }
  return {drawName: 'Flush Draw + Pair', outs: 15, desc: `4 ${SUITS_SYM[suit]} flush draw + pair of ${RS(mr)}s — many ways to improve`, holeCards: [h1, h2], communityCards: shuffle(community)};
}

function analyzeHand(holeCards, communityCards){
  const all = [...holeCards, ...communityCards];
  const boardRanks = communityCards.map(c => c.r);
  const suitCounts = {};
  for(const c of all) suitCounts[c.s] = (suitCounts[c.s] || 0) + 1;
  const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] === 4) ?? null;
  const hasFlushDraw = !!flushSuit;
  const hasPair = holeCards.some(h => boardRanks.includes(h.r));
  const pairedRank = hasPair ? holeCards.find(h => boardRanks.includes(h.r)).r : null;
  const uniqueRanks = [...new Set(all.map(c => c.r))];
  let hasOESD = false, hasGutshot = false, missingRank = null;
  for(let lo = 2; lo <= 10; lo++){
    const window = [lo, lo+1, lo+2, lo+3, lo+4];
    const hits = window.filter(r => uniqueRanks.includes(r));
    if(hits.length === 4){
      const miss = window.find(r => !uniqueRanks.includes(r));
      if(miss === lo || miss === lo+4) hasOESD = true;
      else { hasGutshot = true; missingRank = miss; }
    }
  }
  return {hasFlushDraw, flushSuit, hasPair, pairedRank, hasOESD, hasGutshot, missingRank};
}

function validateCards(raw){
  const d = analyzeHand(raw.holeCards, raw.communityCards);
  const name = raw.drawName;
  if(name === 'Flush Draw' && d.hasFlushDraw && d.hasPair && !d.hasOESD && !d.hasGutshot)
    return {...raw, drawName: 'Flush Draw + Pair', outs: 15, desc: `4 ${SUITS_SYM[d.flushSuit]} flush draw + pair of ${RS(d.pairedRank)}s — many ways to improve`};
  if(name === 'Flush Draw' && d.hasFlushDraw && d.hasGutshot && !d.hasPair && !d.hasOESD)
    return {...raw, drawName: 'Flush Draw + Gutshot', outs: 12, desc: `4 ${SUITS_SYM[d.flushSuit]} flush draw + inside straight — need ${RS(d.missingRank)} or any ${SUITS_SYM[d.flushSuit]}`};
  
  const extras = {
    'Flush Draw': d.hasOESD || (d.hasGutshot && d.hasPair),
    'Open-Ended Straight Draw': d.hasFlushDraw || d.hasPair,
    'Gutshot Straight Draw': d.hasFlushDraw || d.hasPair || d.hasOESD,
    'Two Overcards': d.hasFlushDraw || d.hasOESD || d.hasGutshot,
    'One Overcard': d.hasFlushDraw || d.hasOESD || d.hasGutshot || d.hasPair,
    'Pocket Pair → Trips': d.hasFlushDraw || d.hasOESD || d.hasGutshot,
    'Flush Draw + Gutshot': d.hasPair,
    'Flush Draw + Pair': d.hasOESD || d.hasGutshot
  };
  return (extras[name] ?? false) ? null : raw;
}

const PO_GENS = [genFlushDraw, genOESD, genGutshot, genTwoOvercards, genOneOvercard, genSetDraw, genFlushGutshot, genFlushPair];
const PO_DRAW_KEYS = ['Flush Draw', 'Open-Ended Straight Draw', 'Gutshot Straight Draw', 'Two Overcards', 'One Overcard', 'Pocket Pair → Trips', 'Flush Draw + Gutshot', 'Flush Draw + Pair'];

function weightedPick(keys, weights) {
  const w = keys.map(k => weights[k] ?? 1);
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for(let i = 0; i < keys.length; i++){
    r -= w[i];
    if(r <= 0) return i;
  }
  return keys.length - 1;
}

function buildWeights(keys, tracker) {
  return Object.fromEntries(keys.map(k => {
    const t = tracker[k];
    if(!t || t.total < 3) return [k, 1.5];
    const err = 1 - (t.correct / t.total);
    return [k, 1 + err * 3]; 
  }));
}

function randItem(arr){ return arr[~~(Math.random() * arr.length)]; }

function genPotOddsScenario(tracker = {}){
  const street = Math.random() > 0.5 ? 'flop' : 'turn';
  const weights = buildWeights(PO_DRAW_KEYS, tracker);
  const idx = weightedPick(PO_DRAW_KEYS, weights);
  const gen = PO_GENS[idx];
  let cards = null;
  for(let i = 0; i < 25 && !cards; i++){
    try{ const raw = gen(street); cards = validateCards(raw); }catch{}
  }
  if(!cards) cards = genFlushDraw(street);
  const numPlayers = randItem([2, 2, 3, 3, 4]);
  const pot = Math.max(10, Math.round((Math.random() * 180 + 20) / 5) * 5);
  const bet = Math.max(5, Math.round((pot * (Math.random() + 0.2)) / 5) * 5);
  const equity = cards.outs * (street === 'flop' ? 4 : 2);
  const effectiveEquity = Math.max(equity - Math.round(equity * Math.max(numPlayers - 2, 0) * 0.15), 2);
  const potOdds = Math.round(bet / (pot + bet) * 100);
  return {...cards, street, numPlayers, pot, bet, equity, effectiveEquity, potOdds, correct: effectiveEquity >= potOdds ? 'call' : 'fold'};
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREFLOP — logic
// ═══════════════════════════════════════════════════════════════════════════════
const BB = 2;
const HAND_TIERS = {
  premium: {label: 'Premium', color: '#d4af37', hands: [{r1: 14, r2: 14, suited: false, label: 'AA'}, {r1: 13, r2: 13, suited: false, label: 'KK'}, {r1: 12, r2: 12, suited: false, label: 'QQ'}, {r1: 14, r2: 13, suited: false, label: 'AKo'}, {r1: 14, r2: 13, suited: true, label: 'AKs'}]},
  strong: {label: 'Strong', color: '#70a840', hands: [{r1: 11, r2: 11, suited: false, label: 'JJ'}, {r1: 10, r2: 10, suited: false, label: 'TT'}, {r1: 14, r2: 12, suited: false, label: 'AQo'}, {r1: 14, r2: 12, suited: true, label: 'AQs'}, {r1: 14, r2: 11, suited: true, label: 'AJs'}, {r1: 13, r2: 12, suited: true, label: 'KQs'}]},
  medium: {label: 'Medium', color: '#c0a030', hands: [{r1: 9, r2: 9, suited: false, label: '99'}, {r1: 8, r2: 8, suited: false, label: '88'}, {r1: 7, r2: 7, suited: false, label: '77'}, {r1: 14, r2: 10, suited: false, label: 'ATo'}, {r1: 14, r2: 10, suited: true, label: 'ATs'}, {r1: 13, r2: 11, suited: false, label: 'KJo'}, {r1: 13, r2: 11, suited: true, label: 'KJs'}, {r1: 13, r2: 10, suited: true, label: 'KTs'}, {r1: 12, r2: 11, suited: true, label: 'QJs'}, {r1: 11, r2: 10, suited: true, label: 'JTs'}]},
  speculative: {label: 'Speculative', color: '#cc7040', hands: [{r1: 6, r2: 6, suited: false, label: '66'}, {r1: 5, r2: 5, suited: false, label: '55'}, {r1: 14, r2: 9, suited: true, label: 'A9s'}, {r1: 14, r2: 8, suited: true, label: 'A8s'}, {r1: 14, r2: 7, suited: true, label: 'A7s'}, {r1: 10, r2: 9, suited: true, label: 'T9s'}, {r1: 9, r2: 8, suited: true, label: '98s'}, {r1: 8, r2: 7, suited: true, label: '87s'}]},
  weak: {label: 'Weak', color: '#cc5050', hands: [{r1: 14, r2: 4, suited: false, label: 'A4o'}, {r1: 14, r2: 5, suited: false, label: 'A5o'}, {r1: 14, r2: 6, suited: false, label: 'A6o'}, {r1: 13, r2: 10, suited: false, label: 'KTo'}, {r1: 12, r2: 10, suited: false, label: 'QTo'}, {r1: 11, r2: 9, suited: false, label: 'J9o'}, {r1: 7, r2: 2, suited: false, label: '72o'}, {r1: 8, r2: 3, suited: false, label: '83o'}]},
};

function posGroup(pos){
  if(pos === 'utg' || pos === 'utg1') return 'early';
  if(pos === 'hj') return 'mid';
  if(pos === 'co' || pos === 'btn') return 'late';
  return 'blind';
}

function getDecision(tier, pos, situation, raiseAmt){
  const g = posGroup(pos);
  const r = raiseAmt ? `$${raiseAmt}` : '';
  const openSizeBb = Number(raiseAmt) || 0;
  
  if(tier === 'premium'){
    if(situation === 'unopened') return {action: 'raise', why: 'Premium hand — always raise to build the pot and thin the field.'};
    if(situation === 'limper') return {action: 'raise', why: "Premium hand — raise over the limper. Don't let them see a cheap flop."};
    if(situation === 'raise') return {action: 'raise', why: `Premium hand — re-raise (3-bet) over their ${r}. You want to play a big pot.`};
    return {action: 'raise', why: `Premium hand — 3-bet even with a caller. You're ahead of both ranges.`};
  }
  if(tier === 'strong'){
    if(situation === 'unopened') return {action: 'raise', why: 'Strong hand — open raise from any position.'};
    if(situation === 'limper') return {action: 'raise', why: 'Strong hand — raise to isolate the limper and take control.'};
    if(situation === 'raise'){
      if(g === 'early') return {action: 'call', why: `Strong but not premium — just call the ${r} raise from early position.`};
      return {action: 'raise', why: `Strong hand — 3-bet the ${r} raise from late position. Position + strong hand.`};
    }
    if(situation === 'raise_caller'){
      if(g === 'early') return {action: 'fold', why: 'Strong hand but facing a raise + caller from early — too much heat. Fold.'};
      return {action: 'call', why: 'Strong hand — call facing a raise and a caller. A 3-bet can bloat the pot unnecessarily.'};
    }
  }
  if(tier === 'medium'){
    if(situation === 'unopened'){
      if(g === 'early') return {action: 'fold', why: 'Medium hand from early position — fold. Too many players left to act.'};
      if(g === 'mid') return {action: 'raise', why: "Medium hand from the hijack — open raise. You're picking up position."};
      return {action: 'raise', why: 'Medium hand in late position — raise. Position is on your side.'};
    }
    if(situation === 'limper'){
      if(g === 'early') return {action: 'fold', why: "Medium hand, early position, limper in — fold. Out of position, not strong enough."};
      if(g === 'mid') return {action: 'call', why: 'Medium hand, middle position, one limper — call and see a cheap flop.'};
      return {action: 'raise', why: 'Medium hand in late position — raise to isolate the limper.'};
    }
    if(situation === 'raise'){
      if(g === 'early' || g === 'mid') return {action: 'fold', why: `Medium hand facing a ${r} raise — fold. Likely dominated.`};
      if(pos === 'btn') return {action: 'call', why: `Medium hand on the button — call the ${r} as baseline and mix occasional 3-bets versus wide ranges.`};
      return {action: 'fold', why: `Medium hand — fold to the ${r} raise. Not strong enough out of position.`};
    }
    return {action: 'fold', why: 'Medium hand facing a raise and a caller — fold.'};
  }
  if(tier === 'speculative'){
    if(situation === 'unopened'){
      if(g === 'early' || g === 'mid') return {action: 'fold', why: 'Speculative hand early — fold. Need position and a big pot to be profitable.'};
      return {action: 'raise', why: 'Speculative hand in late position — raise. These hands play well when you act last.'};
    }
    if(situation === 'limper'){
      if(g === 'late') return {action: 'raise', why: 'Speculative hand late, one limper — raise to take control.'};
      if(g === 'blind') return {action: 'call', why: 'In the blind with a limper — call cheaply and see a flop.'};
      return {action: 'fold', why: 'Speculative hand, no position — fold. These hands bleed money out of position.'};
    }
    if(situation === 'raise'){
      if(pos === 'btn' && (openSizeBb === 0 || openSizeBb <= 4)) return {action: 'call', why: `Speculative hand on the button can defend versus a ${r} open. Baseline call, with occasional 3-bet mix versus wide ranges.`};
      return {action: 'fold', why: "Speculative hands don't fare well against a raise — fold."};
    }
    return {action: 'fold', why: "Speculative hands don't fare well against a raise — fold."};
  }
  if(tier === 'weak'){
    if(situation === 'unopened' && (pos === 'btn' || pos === 'co')) return {action: 'raise', why: 'Weak hand but stealing from late position — a raise can take the blinds uncontested.'};
    if(situation === 'unopened' && pos === 'sb') return {action: 'raise', why: 'On the small blind with only BB left — steal here with a raise.'};
    return {action: 'fold', why: "Weak hand — fold. This hand can't play profitably."};
  }
}

const PF_TIER_KEYS = ['premium', 'strong', 'medium', 'speculative', 'weak'];
const PF_POS_KEYS = ['early', 'mid', 'late', 'blind'];

function genPreflopScenario(tierTracker = {}, posTracker = {}){
  const tierWeights = buildWeights(PF_TIER_KEYS, tierTracker);
  const posWeights = buildWeights(PF_POS_KEYS, posTracker);
  const tierKey = PF_TIER_KEYS[weightedPick(PF_TIER_KEYS, tierWeights)];
  const posGroupKey = PF_POS_KEYS[weightedPick(PF_POS_KEYS, posWeights)];
  const posMap = { early: ['utg', 'utg1'], mid: ['hj'], late: ['co', 'btn'], blind: ['sb', 'bb'] };
  const pos = randItem(posMap[posGroupKey]);
  const tier = HAND_TIERS[tierKey];
  const hand = randItem(tier.hands);
  let situation = randItem(['unopened', 'limper', 'raise', 'raise_caller']);
  if(pos === 'utg') situation = 'unopened';
  if(pos === 'utg1' && situation === 'raise_caller') situation = randItem(['unopened', 'limper', 'raise']);
  if(pos === 'bb' && situation === 'unopened') situation = randItem(['limper', 'raise', 'raise_caller']);
  const raiseAmt = ((2.5 + Math.round(Math.random() * 2)) * BB).toFixed(0);
  const raiseSit = situation === 'raise' || situation === 'raise_caller';
  const villain = raiseSit ? randItem(['tight', 'loose', 'unknown']) : 'unknown';
  const numPlayers = situation === 'unopened' ? 2 : randItem([2, 2, 3, 3, 4]);
  const villainLabels = {tight: 'Tight player', loose: 'Loose player (plays lots of hands)', unknown: 'Unknown player'};
  const villainColors = {tight: '#cc7040', loose: '#70a840', unknown: '#8080a0'};

  let situationDesc = '';
  if(situation === 'unopened') situationDesc = `You are first to act preflop from ${POS_INFO[pos]?.short ?? pos.toUpperCase()}.`;
  if(situation === 'limper') situationDesc = `One player limped. ${numPlayers > 2 ? `${numPlayers} players in the hand.` : ''}`;
  if(situation === 'raise') situationDesc = `${villainLabels[villain]} raised to $${raiseAmt}. ${numPlayers > 2 ? `${numPlayers} players total.` : ''}`;
  if(situation === 'raise_caller') situationDesc = `${villainLabels[villain]} raised to $${raiseAmt}, one caller. ${numPlayers > 2 ? `${numPlayers} players total.` : ''}`;

  const tierOrder = ['premium', 'strong', 'medium', 'speculative', 'weak'];
  let effectiveTier = tierKey;
  if(raiseSit){
    const idx = tierOrder.indexOf(tierKey);
    if(villain === 'tight' && idx < 4) effectiveTier = tierOrder[Math.min(idx + 1, 4)];
    if(villain === 'loose' && idx > 0) effectiveTier = tierOrder[Math.max(idx - 1, 0)];
  }
  if(numPlayers > 2){
    const idx2 = tierOrder.indexOf(effectiveTier);
    const bump = Math.floor((numPlayers - 2) / 2);
    effectiveTier = tierOrder[Math.min(idx2 + bump, 4)];
  }

  const {action, why} = getDecision(effectiveTier, pos, situation, raiseAmt);
  return {tierKey, tierLabel: tier.label, tierColor: tier.color, hand, pos, posGroup: posGroupKey, situation, situationDesc, raiseAmt, villain, villainColor: villainColors[villain], numPlayers, correct: action, why};
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIONS — data
// ═══════════════════════════════════════════════════════════════════════════════
const ROLE_INFO = {
  btn:  {short: 'BTN', name: 'Button', color: '#4090c8', emoji: '👑', subtitle: 'Acts last postflop — best seat', strategy: "The best seat at the table. You act last on every postflop street. You can play almost any two reasonable cards here. The power of position means you can profitably play hands you'd fold anywhere else.", range: 'Almost any two cards with potential — pairs, suited connectors, broadways, suited Aces.'},
  sb:   {short: 'SB', name: 'Small Blind', color: '#7060c0', emoji: '🟣', subtitle: 'Acts first postflop — positional disadvantage', strategy: "You've already put half a bet in, which looks like good pot odds — but you act FIRST on every postflop street, which is brutal. Play tighter than it feels like you should.", range: 'AA–88, AKs, AKo, AQs, AJs, ATs, KQs'},
  bb:   {short: 'BB', name: 'Big Blind', color: '#5080b0', emoji: '🔵', subtitle: 'Last preflop, first postflop', strategy: "Last to act preflop (special case) but first postflop. You already have a full bet in. Against a raise you're getting pot odds to call — factor that in. Fold clear trash, but defend wider than other positions.", range: 'Defend wider vs raises due to pot odds. Fold clear trash like 72o, 83o.'},
  utg:  {short: 'UTG', name: 'Under the Gun', color: '#cc5050', emoji: '🔴', subtitle: 'Acts first preflop — worst position', strategy: 'The worst seat. You act first preflop with no information about what anyone else will do. Play only your strongest hands: AA, KK, QQ, JJ, TT, AK, AQ. Fold everything else.', range: 'AA, KK, QQ, JJ, TT, AKs, AKo, AQs'},
  utg1: {short: 'UTG+1', name: 'Under the Gun +1', color: '#cc7040', emoji: '🟠', subtitle: 'Still very early — most of table acts after you', strategy: 'Still very early. Only one player has acted before you but most of the table still acts after. Slightly wider than UTG but still tight. Add AJs, KQs.', range: 'AA, KK, QQ, JJ, TT, 99, AKs, AKo, AQs, AJs, KQs'},
  hj:   {short: 'HJ', name: 'Hijack', color: '#c0a030', emoji: '🟡', subtitle: 'Middle position', strategy: "Middle position. You're starting to get more information. Can open up a bit — add hands like 88, 77, ATs, KJs. Still fold weak aces and offsuit connectors.", range: 'AA–77, AKs, AKo, AQs, AJs, ATs, KQs, KJs, QJs'},
  co:   {short: 'CO', name: 'Cutoff', color: '#70a840', emoji: '🟢', subtitle: 'One before the button — very good', strategy: "One seat before the button — a very good position. Only BTN acts after you postflop. Widen significantly. Suited connectors, pocket pairs down to 66, AXs hands all become playable.", range: 'AA–66, AKo, AQo, AJs+, AXs, KQo, KJs+, QJs, JTs, T9s, 98s'},
};
const PREFLOP_ORDER = ['utg', 'utg1', 'hj', 'co', 'btn', 'sb', 'bb'];
const NUM_SEATS = 7;
const SEAT_ANGLES = Array.from({length: NUM_SEATS}, (_, i) => (i * 360) / NUM_SEATS);
const ROLE_OFFSETS = ['btn', 'sb', 'bb', 'utg', 'utg1', 'hj', 'co'];
const TABLE_CENTER_X = 160;
const TABLE_CENTER_Y = 108;
const TABLE_SEAT_RADIUS_X = 125;
const TABLE_SEAT_RADIUS_Y = 84;

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function PlayingCard({r, s, hero}){
  const color = SUIT_RED[s] ? '#b91c1c' : '#0f172a';
  return (
    <div style={{width: hero ? 64 : 58, height: hero ? 90 : 82, borderRadius: 9, background: 'linear-gradient(150deg,#fffef5,#ede8d8)', border: '1px solid rgba(0,0,0,0.16)', boxShadow: hero ? '0 0 0 2px #c9a83c, 0 6px 18px rgba(0,0,0,0.6)' : '0 4px 14px rgba(0,0,0,0.55)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', flexShrink: 0}}>
      <div style={{position: 'absolute', top: 4, left: 6, fontSize: hero ? 12 : 11, fontWeight: 900, color, lineHeight: 1.15, fontFamily: 'Georgia,serif', textAlign: 'center'}}>{RS(r)}<br/>{SUITS_SYM[s]}</div>
      <div style={{fontSize: hero ? 26 : 22, color, fontFamily: 'Georgia,serif', opacity: 0.8}}>{SUITS_SYM[s]}</div>
      <div style={{position: 'absolute', bottom: 4, right: 6, fontSize: hero ? 12 : 11, fontWeight: 900, color, lineHeight: 1.15, fontFamily: 'Georgia,serif', textAlign: 'center', transform: 'rotate(180deg)'}}>{RS(r)}<br/>{SUITS_SYM[s]}</div>
    </div>
  );
}

function StatsBar({stats, streak, best}){
  const acc = stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : null;
  return (
    <div style={{display: 'flex', gap: 18, marginBottom: 14, background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 20px'}}>
      {[['Correct', stats.correct], ['Total', stats.total], ['Accuracy', acc != null ? `${acc}%` : '—'], ['Streak', streak], ['Best', best]].map(([l, v]) => (
        <div key={l} style={{textAlign: 'center'}}>
          <div style={{fontSize: 17, fontWeight: 700, color: '#ede0c0', fontFamily: 'Georgia,serif'}}>{v}</div>
          <div style={{fontSize: 9, color: '#50784a', letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'sans-serif'}}>{l}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: POT ODDS
// ═══════════════════════════════════════════════════════════════════════════════
const TIMER_DEFAULT = 15;

function PotOddsTab(){
  const [tracker, setTracker] = useState({});
  const [sc, setSc] = useState(() => genPotOddsScenario({}));
  const [result, setResult] = useState(null);
  const [stats, setStats] = useLocalStorageState('poker_stats_0', {correct: 0, total: 0});
  const [streak, setStreak] = useLocalStorageState('poker_streak_0', 0);
  const [best, setBest] = useLocalStorageState('poker_best_0', 0);
  const [fade, setFade] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [speedMode, setSpeedMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_DEFAULT);
  const intervalRef = useRef(null);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if(!speedMode || result) return;
    setTimeLeft(TIMER_DEFAULT);
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if(t <= 1){
          clearInterval(intervalRef.current);
          const dk2 = sc.drawName;
          setTracker(tr => ({...tr, [dk2]: {correct: (tr[dk2]?.correct || 0), total: (tr[dk2]?.total || 0) + 1}}));
          setResult({action: 'timeout', ok: false});
          setStats(s => ({correct: s.correct, total: s.total + 1}));
          setStreak(0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [sc, speedMode, result]);

  const act = (action) => {
    clearInterval(intervalRef.current);
    const ok = action === sc.correct;
    setResult({action, ok});
    setStats(s => ({correct: s.correct + (ok ? 1 : 0), total: s.total + 1}));
    const dk = sc.drawName;
    setTracker(t => ({...t, [dk]: {correct: (t[dk]?.correct || 0) + (ok ? 1 : 0), total: (t[dk]?.total || 0) + 1}}));
    if(ok){
      const ns = streak + 1;
      setStreak(ns);
      if(ns > best) setBest(ns);
    } else setStreak(0);
  };
  const next = (tr) => {
    clearInterval(intervalRef.current);
    setFade(false);
    setTimeout(() => {
      setSc(genPotOddsScenario(tr || tracker));
      setResult(null);
      setFade(true);
    }, 180);
  };
  const toggleSpeed = () => {
    clearInterval(intervalRef.current);
    setSpeedMode(m => !m);
    setResult(null);
    setSc(genPotOddsScenario(tracker));
  };

  const {drawName, outs, desc, street, holeCards, communityCards, pot, bet, equity, potOdds, correct} = sc;

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>

      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
        <button onClick={toggleSpeed} style={{display:'flex',alignItems:'center',gap:7,background:speedMode?'rgba(200,120,30,0.15)':'rgba(0,0,0,0.2)',border:`1px solid ${speedMode?'rgba(200,140,40,0.45)':'rgba(255,255,255,0.07)'}`,borderRadius:20,padding:'5px 14px',cursor:'pointer',color:speedMode?'#d4a040':'#3d6040',fontSize:11,letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',transition:'all 0.2s'}}>
          <span style={{fontSize:13}}>⏱</span>{speedMode?`Speed ON (${TIMER_DEFAULT}s)`:'Speed OFF'}
        </button>
        {speedMode && !result && <div style={{fontSize:11,color:timeLeft<=5?'#cc6060':'#7a6030',fontFamily:'sans-serif'}}>{timeLeft}s</div>}
      </div>

      {Object.keys(tracker).length >= 3 && (() => {
        const worst = PO_DRAW_KEYS.filter(k => tracker[k]?.total >= 3).sort((a,b) => {
          const ea = 1 - (tracker[a].correct / tracker[a].total);
          const eb = 1 - (tracker[b].correct / tracker[b].total);
          return eb - ea;
        })[0];
        if(!worst) return null;
        const acc = Math.round(tracker[worst].correct / tracker[worst].total * 100);
        if(acc >= 85) return null;
        return (
          <div style={{marginBottom:12,background:'rgba(180,100,30,0.12)',border:'1px solid rgba(180,120,40,0.3)',borderRadius:10,padding:'8px 14px',display:'flex',alignItems:'center',gap:8,fontFamily:'sans-serif'}}>
            <span style={{fontSize:14}}>🎯</span>
            <div>
              <span style={{fontSize:11,color:'#c89040',letterSpacing:1}}>Focusing on your weak spot: </span>
              <span style={{fontSize:11,color:'#e0b060',fontWeight:700}}>{worst}</span>
              <span style={{fontSize:11,color:'#8a6030'}}> ({acc}% accuracy)</span>
            </div>
          </div>
        );
      })()}

      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:speedMode&&!result?`2px solid rgba(200,140,40,${timeLeft<=5?'0.6':'0.25'})`:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease,border-color 0.3s ease'}}>
        {speedMode && !result && <div style={{height:3,borderRadius:2,marginBottom:16,background:'rgba(0,0,0,0.25)',overflow:'hidden'}}><div style={{height:'100%',width:`${(timeLeft/TIMER_DEFAULT)*100}%`,background:timeLeft<=5?'linear-gradient(90deg,#cc4040,#ff6040)':'linear-gradient(90deg,#c8a040,#e0c060)',transition:'width 0.9s linear,background 0.3s',borderRadius:2}}/></div>}

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <span style={{background:street==='flop'?'rgba(90,155,70,0.14)':'rgba(180,130,40,0.14)',border:`1px solid ${street==='flop'?'rgba(90,155,70,0.38)':'rgba(180,130,40,0.38)'}`,color:street==='flop'?'#78b060':'#b88830',padding:'3px 12px',borderRadius:20,fontSize:10,letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif'}}>{street === 'flop' ? 'On the Flop' : 'On the Turn'}</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {sc.numPlayers > 2 && <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'2px 8px',borderRadius:20,fontSize:10,fontFamily:'sans-serif'}}>👥 {sc.numPlayers}-way</span>}
            <span style={{color:'#3d6040',fontSize:11,fontFamily:'sans-serif'}}>{street === 'flop' ? '2 cards to come' : '1 card to come'}</span>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:'#426040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:7}}>Your Hand</div>
          <div style={{display:'flex',gap:9,marginBottom:16}}>{holeCards.map((c,i)=><PlayingCard key={i} r={c.r} s={c.s} hero={true}/>)}</div>
          <div style={{fontSize:9,color:'#426040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:7}}>Community Cards</div>
          <div style={{display:'flex',gap:8}}>{communityCards.map((c,i)=><PlayingCard key={i} r={c.r} s={c.s} hero={false}/>)}</div>
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,marginBottom:16,borderLeft:'3px solid #507848',overflow:'hidden'}}>
          <div onClick={()=>setShowHint(h=>!h)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',cursor:'pointer',userSelect:'none'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#c0e0a8',fontFamily:'Georgia,serif'}}>{showHint ? `${drawName} — ${outs} outs` : 'Hint hidden — figure it out!'}</div>
            <div style={{fontSize:11,color:'#507848',fontFamily:'sans-serif',display:'flex',alignItems:'center',gap:5}}>
              <span style={{display:'inline-block',transform:showHint?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.2s'}}>▶</span>{showHint ? 'hide' : 'show'}
            </div>
          </div>
          {showHint && <div style={{padding:'0 14px 12px',fontSize:12,color:'#507848',fontFamily:'sans-serif'}}>{desc}</div>}
        </div>

        <div style={{display:'flex',gap:10,marginBottom:18}}>
          <div style={{flex:1,background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'12px 0',textAlign:'center',border:'1px solid rgba(255,255,255,0.04)'}}>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:3}}>Pot</div>
            <div style={{fontSize:26,fontWeight:700,color:'#ede0c0',fontFamily:'Georgia,serif'}}>${pot}</div>
          </div>
          <div style={{flex:1,background:'rgba(140,50,50,0.10)',borderRadius:10,padding:'12px 0',textAlign:'center',border:'1px solid rgba(140,50,50,0.20)'}}>
            <div style={{fontSize:9,color:'#7a4040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:3}}>Bet to Call</div>
            <div style={{fontSize:26,fontWeight:700,color:'#e0b0b0',fontFamily:'Georgia,serif'}}>${bet}</div>
          </div>
        </div>

        {!result ? (
          <>
            <div style={{textAlign:'center',fontSize:12,color:'#507848',marginBottom:12,fontFamily:'sans-serif'}}>Call or fold?</div>
            <div style={{display:'flex',gap:10}}>
              {[['call','linear-gradient(135deg,#2a6a38,#1a5228)','#a8dea0'],['fold','linear-gradient(135deg,#6a2828,#521818)','#e8a0a0']].map(([a,bg,color])=>(
                <button key={a} onClick={()=>act(a)} style={{flex:1,padding:'14px 0',borderRadius:10,border:'none',cursor:'pointer',background:bg,color,fontSize:15,fontWeight:700,letterSpacing:2,fontFamily:'sans-serif',boxShadow:'0 4px 14px rgba(0,0,0,0.35)'}}
                  onMouseDown={e=>e.currentTarget.style.transform='scale(0.96)'}
                  onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
                >{a.toUpperCase()}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{textAlign:'center',padding:'14px',borderRadius:12,marginBottom:14,background:result.ok?'rgba(50,130,50,0.15)':'rgba(180,100,20,0.15)',border:`1px solid ${result.ok?'rgba(50,200,50,0.28)':result.action==='timeout'?'rgba(200,130,30,0.28)':'rgba(200,50,50,0.28)'}`}}>
              <div style={{fontSize:26,marginBottom:2}}>{result.ok ? '✓' : result.action==='timeout' ? '⏰' : '✗'}</div>
              <div style={{fontSize:16,fontWeight:700,color:result.ok?'#68cc68':result.action==='timeout'?'#d4902a':'#cc6868',fontFamily:'sans-serif'}}>
                {result.ok ? 'Correct!' : result.action==='timeout' ? `Time's up — should have ${correct}ed` : `Wrong — should have ${correct}ed`}
              </div>
            </div>
            <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:9,color:'#3a6038',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:10}}>The Math</div>
              <div style={{display:'flex',flexDirection:'column',gap:7,fontFamily:'sans-serif',fontSize:13}}>
                {[['Your outs', `${outs}`], [`Equity (${outs}×${street==='flop'?4:2})`, `~${equity}%`], ...(sc.numPlayers > 2 ? [[`Multiway penalty (${sc.numPlayers}-way)`, `−${equity-sc.effectiveEquity}% → ~${sc.effectiveEquity}%`]] : [])].map(([l,v])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between'}}><span style={{color:l.startsWith('Multi')?'#9090c0':'#507848'}}>{l}</span><span style={{color:l.startsWith('Multi')?'#b0b0d8':'#ddd0b0',fontWeight:600}}>{v}</span></div>
                ))}
                <div style={{height:1,background:'rgba(255,255,255,0.05)',margin:'2px 0'}}/>
                <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#507848'}}>{`Need ($${bet}÷$${pot+bet})`}</span><span style={{color:'#ddd0b0',fontWeight:600}}>{potOdds}% to break even</span></div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
                  <span style={{color:'#90c888'}}>Verdict</span>
                  <span style={{fontWeight:700,color:correct==='call'?'#68cc68':'#cc6868'}}>{sc.effectiveEquity}% {sc.effectiveEquity>=potOdds?'≥':'<'} {potOdds}% → {correct.toUpperCase()}</span>
                </div>
              </div>
            </div>
            <button onClick={()=>next()} style={{width:'100%',padding:'13px',borderRadius:10,cursor:'pointer',background:'rgba(90,150,80,0.08)',border:'1px solid rgba(90,150,80,0.28)',color:'#78b060',fontSize:14,fontWeight:600,letterSpacing:1,fontFamily:'sans-serif'}}>Next Hand →</button>
          </>
        )}
      </div>

      <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:9}}>Quick Reference</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px 12px'}}>
          {[['Flush draw','9'],['OESD','8'],['Flush+Gutshot','12'],['Two overcards','6'],['Gutshot','4'],['One overcard','3'],['Flush+Pair','15'],['Pocket pair','2']].map(([d,o])=>(
            <div key={d} style={{fontSize:11,color:'#436040'}}><span style={{color:'#507848'}}>{d}</span> = {o} outs</div>
          ))}
        </div>
        <div style={{fontSize:11,color:'#2e4a2c',marginTop:10,lineHeight:1.6}}>Outs × 4 (flop) or × 2 (turn) = equity %. If equity % ≥ bet÷(pot+bet)% → call.</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PREFLOP
// ═══════════════════════════════════════════════════════════════════════════════
const MCX = 90, MCY = 58, MRX = 70, MRY = 46;
function miniSeatXY(i){
  const angle = ((i * 360) / NUM_SEATS - 90) * Math.PI / 180;
  return {x: MCX + MRX * Math.cos(angle), y: MCY + MRY * Math.sin(angle)};
}
function MiniTable({heroPos, villainPos = null, compact = false, maxWidth = null, vivid = false}){
  const safeHeroPos = POSITIONS.includes(heroPos) ? heroPos : 'btn';
  const heroPosIdx = POSITIONS.indexOf(safeHeroPos);
  const scale = compact ? 1 : (vivid ? 1.18 : 1);
  const baseRadius = (compact ? 6 : 7) * scale;
  const heroRadius = (compact ? 8 : 9) * scale;
  const baseFont = (compact ? 3.6 : 4) * scale;
  const heroFont = (compact ? 4.5 : 5) * scale;
  const tableMaxWidth = maxWidth ?? (compact ? 150 : 220);
  return (
    <svg viewBox="0 0 180 116" style={{width: '100%', maxWidth: tableMaxWidth}}>
      <ellipse cx={MCX} cy={MCY} rx={58} ry={38} fill="#1a5c30" stroke="#2a7a40" strokeWidth={vivid ? 1.4 : 1}/>
      <ellipse cx={MCX} cy={MCY} rx={58} ry={38} fill="none" stroke="#4a3010" strokeWidth={vivid ? 4.8 : 4} strokeOpacity={0.66}/>
      {POSITIONS.map((pos, i) => {
        const displayIdx = (i - heroPosIdx + 2 + NUM_SEATS) % NUM_SEATS;
        const {x, y} = miniSeatXY(displayIdx);
        const info = POS_INFO[pos];
        const isHero = pos === safeHeroPos;
        const isVillain = !!villainPos && pos === villainPos && !isHero;
        const seatColor = isHero ? info.color : isVillain ? '#7a5330' : '#1a3828';
        const strokeColor = isHero ? info.color : isVillain ? '#d0a070' : info.color;
        const textColor = isHero ? '#fff' : isVillain ? '#e0c090' : info.color;
        return (
          <g key={pos}>
            <circle cx={x} cy={y} r={isHero ? heroRadius : baseRadius} fill={seatColor} stroke={strokeColor} strokeWidth={isHero ? 0 : (vivid ? 1.2 : 1)} opacity={isHero ? 1 : 0.78}/>
            <text x={x} y={y+0.5} textAnchor="middle" dominantBaseline="middle" fontSize={isHero ? heroFont : baseFont} fontWeight="700" fill={textColor} fontFamily="Georgia,serif" style={{userSelect: 'none'}}>{isVillain ? 'V' : info.short}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PositionMapOverlay({open, onClose, heroSeat, villainSeat, heroPos, preflopOpen = false}){
  if(!open) return null;

  const safeHeroSeat = POSITIONS.includes(heroSeat) ? heroSeat : 'btn';
  const safeVillainSeat = POSITIONS.includes(villainSeat) && villainSeat !== safeHeroSeat ? villainSeat : null;
  const heroInfo = POS_INFO[safeHeroSeat] ?? POS_INFO.btn;
  const villainInfo = safeVillainSeat ? (POS_INFO[safeVillainSeat] ?? null) : null;
  const heroContextText = preflopOpen ? 'First to Act' : (heroPos === 'ip' ? 'In Position' : 'Out of Position');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="position-map-dialog-title"
      onClick={onClose}
      style={{position:'fixed',inset:0,zIndex:999,background:'rgba(2,8,6,0.78)',display:'flex',alignItems:'center',justifyContent:'center',padding:'18px'}}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{width:'min(680px,96vw)',maxHeight:'90vh',overflowY:'auto',background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.24)',borderRadius:16,padding:'18px 18px 20px',boxShadow:'0 26px 70px rgba(0,0,0,0.7)'}}
      >
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:10}}>
          <div>
            <div id="position-map-dialog-title" style={{fontSize:16,color:'#c8e8b0',fontWeight:700,fontFamily:'Georgia,serif'}}>Expanded Position Map</div>
            <div style={{fontSize:12,color:'#7fa37a',fontFamily:'sans-serif',marginTop:2}}>Hero: {heroInfo.short} ({heroContextText}) {villainInfo ? `· Villain: ${villainInfo.short}` : ''}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close position map"
            style={{border:'1px solid rgba(170,140,90,0.45)',background:'rgba(0,0,0,0.24)',borderRadius:8,color:'#d9b16f',cursor:'pointer',fontSize:12,fontFamily:'sans-serif',padding:'6px 10px'}}
          >
            Close
          </button>
        </div>

        <div style={{display:'flex',justifyContent:'center',padding:'6px 0 12px'}}>
          <MiniTable heroPos={safeHeroSeat} villainPos={safeVillainSeat} compact={false} vivid={true} maxWidth={340}/>
        </div>

        <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:11,fontFamily:'sans-serif'}}>
          <span style={{background:`${heroInfo.color}22`,border:`1px solid ${heroInfo.color}55`,color:heroInfo.color,padding:'3px 10px',borderRadius:20}}>You: {heroInfo.name}</span>
          {villainInfo && <span style={{background:'rgba(170,120,70,0.15)',border:'1px solid rgba(170,120,70,0.35)',color:'#d0a070',padding:'3px 10px',borderRadius:20}}>Villain: {villainInfo.name}</span>}
          <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9aa4d0',padding:'3px 10px',borderRadius:20}}>Tap outside panel or press Escape to close</span>
        </div>
      </div>
    </div>
  );
}

function PreflopTab(){
  const [tierTracker, setTierTracker] = useLocalStorageState('poker_tt', {});
  const [posTracker, setPosTracker] = useLocalStorageState('poker_pt', {});
  const [sc, setSc] = useState(() => genPreflopScenario({}, {}));
  const [result, setResult] = useState(null);
  const [stats, setStats] = useLocalStorageState('poker_stats_1', {correct: 0, total: 0});
  const [streak, setStreak] = useLocalStorageState('poker_streak_1', 0);
  const [best, setBest] = useLocalStorageState('poker_best_1', 0);
  const [fade, setFade] = useState(true);

  const act = (action) => {
    const ok = action === sc.correct;
    setResult({action, ok});
    setStats(s => ({correct: s.correct + (ok ? 1 : 0), total: s.total + 1}));
    const tk = sc.tierKey, pk = sc.posGroup;
    setTierTracker(t => ({...t, [tk]: {correct: (t[tk]?.correct || 0) + (ok ? 1 : 0), total: (t[tk]?.total || 0) + 1}}));
    setPosTracker(p => ({...p, [pk]: {correct: (p[pk]?.correct || 0) + (ok ? 1 : 0), total: (p[pk]?.total || 0) + 1}}));
    if(ok){
      const ns = streak + 1;
      setStreak(ns);
      if(ns > best) setBest(ns);
    } else setStreak(0);
  };
  const next = (tt, pt) => {
    setFade(false);
    setTimeout(() => {
      setSc(genPreflopScenario(tt || tierTracker, pt || posTracker));
      setResult(null);
      setFade(true);
    }, 180);
  };

  const {tierLabel, tierColor, hand, pos, situationDesc, correct, why} = sc;
  const posInfo = POS_INFO[pos];
  const suits = hand.suited ? ['h', 'h'] : ['s', 'h'];

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>
      {(Object.keys(tierTracker).length + Object.keys(posTracker).length) >= 4 && (() => {
        const worstTier = PF_TIER_KEYS.filter(k => tierTracker[k]?.total >= 3).sort((a,b) => {
          const ea = 1 - (tierTracker[a].correct / tierTracker[a].total);
          const eb = 1 - (tierTracker[b].correct / tierTracker[b].total);
          return eb - ea;
        })[0];
        const worstPos = PF_POS_KEYS.filter(k => posTracker[k]?.total >= 3).sort((a,b) => {
          const ea = 1 - (posTracker[a].correct / posTracker[a].total);
          const eb = 1 - (posTracker[b].correct / posTracker[b].total);
          return eb - ea;
        })[0];
        const msgs = [];
        if(worstTier){ const acc = Math.round(tierTracker[worstTier].correct / tierTracker[worstTier].total * 100); if(acc < 85) msgs.push(`${HAND_TIERS[worstTier].label} hands (${acc}%)`); }
        if(worstPos){ const acc = Math.round(posTracker[worstPos].correct / posTracker[worstPos].total * 100); if(acc < 85) msgs.push(`${worstPos} position (${acc}%)`); }
        if(!msgs.length) return null;
        return (
          <div style={{marginBottom:12,background:'rgba(180,100,30,0.12)',border:'1px solid rgba(180,120,40,0.3)',borderRadius:10,padding:'8px 14px',display:'flex',alignItems:'center',gap:8,fontFamily:'sans-serif'}}>
            <span style={{fontSize:14}}>🎯</span>
            <div><span style={{fontSize:11,color:'#c89040',letterSpacing:1}}>Focusing: </span><span style={{fontSize:11,color:'#e0b060',fontWeight:700}}>{msgs.join(' · ')}</span></div>
          </div>
        );
      })()}

      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:4}}>Your Position</div>
            <div style={{fontSize:20,fontWeight:700,color:posInfo.color,fontFamily:'Georgia,serif'}}>{posInfo.name}</div>
            <div style={{fontSize:11,color:'#3d6040',fontFamily:'sans-serif',marginTop:2}}>{pos==='btn'?'Acts last postflop':pos==='sb'||pos==='bb'?'Acts first postflop':pos==='utg'||pos==='utg1'?'Acts first preflop':'Middle-late position'}</div>
          </div>
          <div style={{width:120}}><MiniTable heroPos={pos}/></div>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:10,textAlign:'center'}}>Your Hand</div>
          <div style={{display:'flex',gap:10,justifyContent:'center',marginBottom:8}}>
            {[hand.r1, hand.r2].map((r,i) => <PlayingCard key={i} r={r} s={suits[i]} hero={true}/>)}
          </div>
          <div style={{textAlign:'center'}}>
            <span style={{background:`${tierColor}22`,border:`1px solid ${tierColor}55`,color:tierColor,padding:'3px 12px',borderRadius:20,fontSize:11,fontFamily:'sans-serif',letterSpacing:1}}>{tierLabel}</span>
          </div>
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'12px 14px',marginBottom:18,borderLeft:'3px solid #507848'}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:5}}>Situation</div>
          <div style={{fontSize:14,color:'#c8e8b0',fontFamily:'sans-serif',marginBottom:sc.villain&&sc.villain!=='unknown'?10:0}}>{situationDesc}</div>
          {sc.villain && sc.villain !== 'unknown' && (sc.situation === 'raise' || sc.situation === 'raise_caller') && (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
              <span style={{background:`${sc.villainColor}22`,border:`1px solid ${sc.villainColor}55`,color:sc.villainColor,padding:'2px 10px',borderRadius:20,fontSize:11,fontFamily:'sans-serif'}}>
                {sc.villain === 'tight' ? '🔴 Tight raiser' : '🟢 Loose raiser'}
              </span>
              {sc.numPlayers > 2 && <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'2px 10px',borderRadius:20,fontSize:11,fontFamily:'sans-serif'}}>
                👥 {sc.numPlayers}-way pot
              </span>}
            </div>
          )}
          {sc.numPlayers > 2 && sc.situation === 'unopened' && (
            <div style={{marginTop:6}}>
              <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'2px 10px',borderRadius:20,fontSize:11,fontFamily:'sans-serif'}}>
                👥 {sc.numPlayers}-way pot
              </span>
            </div>
          )}
        </div>

        {!result ? (
          <>
            <div style={{textAlign:'center',fontSize:12,color:'#507848',marginBottom:12,fontFamily:'sans-serif'}}>What do you do?</div>
            <div style={{display:'flex',gap:8}}>
              {[['fold','linear-gradient(135deg,#6a2828,#521818)','#e8a0a0'],['call','linear-gradient(135deg,#2a5a6a,#1a4858)','#a0c8e8'],['raise','linear-gradient(135deg,#2a6a38,#1a5228)','#a8dea0']].map(([a,bg,color])=>(
                <button key={a} onClick={()=>act(a)} style={{flex:1,padding:'13px 0',borderRadius:10,border:'none',cursor:'pointer',background:bg,color,fontSize:14,fontWeight:700,letterSpacing:1,fontFamily:'sans-serif',boxShadow:'0 4px 14px rgba(0,0,0,0.35)'}}
                  onMouseDown={e=>e.currentTarget.style.transform='scale(0.96)'}
                  onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
                >{a.toUpperCase()}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{textAlign:'center',padding:'14px',borderRadius:12,marginBottom:14,background:result.ok?'rgba(50,130,50,0.15)':'rgba(160,45,45,0.15)',border:`1px solid ${result.ok?'rgba(50,200,50,0.28)':'rgba(200,50,50,0.28)'}`}}>
              <div style={{fontSize:26,marginBottom:2}}>{result.ok ? '✓' : '✗'}</div>
              <div style={{fontSize:16,fontWeight:700,color:result.ok?'#68cc68':result.action==='timeout'?'#d4902a':'#cc6868',fontFamily:'sans-serif'}}>
                {result.ok ? 'Correct!' : `Wrong — correct play was ${correct.toUpperCase()}`}
              </div>
            </div>
            <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:9,color:'#3a6038',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8}}>Why</div>
              <div style={{fontSize:13,color:'#a0c890',fontFamily:'sans-serif',lineHeight:1.6}}>{why}</div>
              <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                {[['Hand tier',tierLabel,tierColor],['Position',posInfo.name,posInfo.color],
                  ...(sc.villain&&sc.villain!=='unknown'?[['Villain',sc.villain==='tight'?'Tight (raise range narrow)':'Loose (raise range wide)',sc.villainColor]]:[]),
                  ...(sc.numPlayers>2?[['Players',`${sc.numPlayers}-way pot`,'#9090c0']]:[]),
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'sans-serif',marginTop:5}}><span style={{color:'#507848'}}>{l}</span><span style={{color:c,fontWeight:600}}>{v}</span></div>
                ))}
              </div>
            </div>
            <button onClick={()=>next()} style={{width:'100%',padding:'13px',borderRadius:10,cursor:'pointer',background:'rgba(90,150,80,0.08)',border:'1px solid rgba(90,150,80,0.28)',color:'#78b060',fontSize:14,fontWeight:600,letterSpacing:1,fontFamily:'sans-serif'}}>Next Hand →</button>
          </>
        )}
      </div>

      <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:9}}>Hand Tiers</div>
        {[['Premium','#d4af37','AA KK QQ AK'],['Strong','#70a840','JJ TT AQo AQs AJs KQs'],['Medium','#c0a030','99–77 ATo ATs KJ QJs JTs'],['Speculative','#cc7040','66–55 A9s–A7s T9s 98s 87s'],['Weak','#cc5050','A4o–A6o KTo offsuit trash']].map(([tier,color,hands])=>(
          <div key={tier} style={{display:'flex',gap:8,fontSize:11,alignItems:'baseline',marginBottom:4}}><span style={{color,fontWeight:600,minWidth:80}}>{tier}</span><span style={{color:'#3d5038'}}>{hands}</span></div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: POSTFLOP
// ═══════════════════════════════════════════════════════════════════════════════
const PFV2_STORAGE_VERSION = 'v2';
const PFV2_STATS_KEY = `poker_postflop_${PFV2_STORAGE_VERSION}_stats`;
const PFV2_STREAK_KEY = `poker_postflop_${PFV2_STORAGE_VERSION}_streak`;
const PFV2_BEST_KEY = `poker_postflop_${PFV2_STORAGE_VERSION}_best`;
const PFV2_WEAKNESS_KEY = `poker_postflop_${PFV2_STORAGE_VERSION}_weakness`;

const PFV2_PLAYER_DISTRIBUTION = [2, 2, 2, 2, 3, 3, 4];
const PFV2_START_STREET_DISTRIBUTION = [1, 1, 1, 1, 2, 2, 3];
const PFV2_STACK_DISTRIBUTION = [50, 70, 90, 110, 130];

const PFV2_FAMILIES = [
  {id: 'flop_cbet_bluff', label: 'Flop C-Bet Bluff', spotType: 'checked_to_hero', skillBucket: 'bluffing', players: [2], handClasses: ['air', 'draw'], streets: [1], priority: 70},
  {id: 'flop_value_build', label: 'Flop Value & Protection', spotType: 'checked_to_hero', skillBucket: 'value', players: [2, 3, 4], handClasses: ['strong', 'monster'], streets: [1], priority: 80},
  {id: 'flop_draw_defense', label: 'Flop Draw Defense', spotType: 'facing_bet', skillBucket: 'draw_defense', players: [2, 3, 4], handClasses: ['draw'], streets: [1], priority: 92},
  {id: 'turn_pressure', label: 'Turn Pressure Spot', spotType: 'checked_to_hero', skillBucket: 'value', players: [2, 3, 4], handClasses: ['air', 'marginal', 'strong', 'monster'], streets: [2], priority: 96},
  {id: 'river_bluffcatch', label: 'River Bluff-Catcher', spotType: 'facing_bet', skillBucket: 'postflop_defense', players: [2, 3, 4], handClasses: ['marginal', 'strong'], streets: [3], priority: 108},
  {id: 'multiway_branch', label: 'Multiway Branch Pot', spotType: 'facing_bet', skillBucket: 'postflop_defense', players: [3, 4], handClasses: ['draw', 'marginal', 'strong'], streets: [1, 2], priority: 118},
];

function postflopFamilyById(id){
  return PFV2_FAMILIES.find(f => f.id === id) ?? PFV2_FAMILIES[0];
}

function postflopFamilyWeight(familyId, weakness = {}){
  const rec = weakness[familyId];
  if(!rec || rec.total < 3) return 1.3;
  const err = 1 - (rec.correct / Math.max(rec.total, 1));
  return 1 + err * 3 + (rec.misses ?? 0) * 0.12;
}

function postflopPickFamily(weakness = {}){
  const entries = PFV2_FAMILIES.map(f => [f.id, postflopFamilyWeight(f.id, weakness)]);
  const id = weightedPickFromEntries(entries) ?? PFV2_FAMILIES[0].id;
  return postflopFamilyById(id);
}

function postflopFamilyRotation(weakness = {}, leadFamilyId = null){
  const ranked = PFV2_FAMILIES
    .map(f => ({family: f, weight: postflopFamilyWeight(f.id, weakness)}))
    .sort((a, b) => {
      if(b.weight !== a.weight) return b.weight - a.weight;
      return (b.family.priority ?? 0) - (a.family.priority ?? 0);
    })
    .map(r => r.family);

  if(!leadFamilyId) return ranked;
  const lead = ranked.find(f => f.id === leadFamilyId);
  if(!lead) return ranked;
  return [lead, ...ranked.filter(f => f.id !== lead.id)];
}

function postflopStreetIndex(street){
  return AS_STREETS.indexOf(street);
}

function postflopFamilyMatchesNode(node, family){
  if(!node || !family || node.street === 'preflop') return false;
  const streetIndex = postflopStreetIndex(node.street);
  const playerCount = allSkillsEffectivePlayers(node);
  if(streetIndex < 1) return false;
  if(family.spotType && node.spotType !== family.spotType) return false;
  if(Array.isArray(family.streets) && family.streets.length > 0 && !family.streets.includes(streetIndex)) return false;
  if(Array.isArray(family.players) && family.players.length > 0 && !family.players.includes(playerCount)) return false;
  if(Array.isArray(family.handClasses) && family.handClasses.length > 0 && !family.handClasses.includes(node.handClass)) return false;
  return true;
}

function postflopFamilyMatchScore(node, family){
  const streetIndex = postflopStreetIndex(node?.street ?? '');
  const playerCount = allSkillsEffectivePlayers(node);
  let score = family.priority ?? 0;
  if(family.spotType === node?.spotType) score += 12;
  if(Array.isArray(family.streets) && family.streets.includes(streetIndex)) score += 9;
  if(Array.isArray(family.players) && family.players.includes(playerCount)) score += 7;
  if(Array.isArray(family.handClasses) && family.handClasses.includes(node?.handClass)) score += 5;
  return score;
}

function postflopClassifyFamily(node, preferredFamilyId = null){
  if(!node || node.street === 'preflop'){
    return {family: null, familyId: null, matched: false, matchCount: 0, matchedIds: []};
  }

  const matches = PFV2_FAMILIES
    .filter(f => postflopFamilyMatchesNode(node, f))
    .sort((a, b) => postflopFamilyMatchScore(node, b) - postflopFamilyMatchScore(node, a));

  if(matches.length === 0){
    const fallback = preferredFamilyId ? postflopFamilyById(preferredFamilyId) : PFV2_FAMILIES[0];
    return {family: fallback, familyId: fallback.id, matched: false, matchCount: 0, matchedIds: []};
  }

  if(preferredFamilyId){
    const preferred = matches.find(f => f.id === preferredFamilyId);
    if(preferred){
      return {family: preferred, familyId: preferred.id, matched: true, matchCount: matches.length, matchedIds: matches.map(f => f.id)};
    }
  }

  const family = matches[0];
  return {family, familyId: family.id, matched: true, matchCount: matches.length, matchedIds: matches.map(f => f.id)};
}

function postflopPickStartStreet(family){
  if(Array.isArray(family?.streets) && family.streets.length > 0) return randItem(family.streets);
  return randItem(PFV2_START_STREET_DISTRIBUTION);
}

function postflopBuildMetaCandidate(family, startStreetIndex){
  const deck = makeDeck();
  const heroCards = deck.splice(0, 2);
  const boardCards = deck.splice(0, 5);
  const numPlayers = Array.isArray(family?.players) && family.players.length > 0 ? randItem(family.players) : randItem(PFV2_PLAYER_DISTRIBUTION);
  const activeOpponents = Math.max(numPlayers - 1, 1);
  const heroPos = Math.random() > 0.45 ? 'ip' : 'oop';
  const heroSeat = allSkillsResolvePosition(heroPos);
  const villainSeat = allSkillsResolveVillainSeat(heroSeat, heroPos);
  const villainType = allSkillsPickVillainType();
  const villainModel = allSkillsCreateVillainModel(villainType, numPlayers);
  const stackBb = randItem(PFV2_STACK_DISTRIBUTION);
  const startPotBb = asRound(3 + Math.random() * 6, 10);
  const stageMult = startStreetIndex === 1 ? (1.8 + Math.random() * 0.5) : startStreetIndex === 2 ? (2.7 + Math.random() * 0.6) : (3.6 + Math.random() * 0.8);
  const currentPotBb = asRound(startPotBb * stageMult * (1 + Math.max(numPlayers - 2, 0) * 0.14), 10);
  const stackLeftBb = asRound(Math.max(stackBb - currentPotBb * 0.32, 10), 10);

  return {
    id: allSkillsNextHandId(),
    targetFamilyId: family.id,
    familyId: family.id,
    familyLabel: family.label,
    villainType,
    villainModel,
    numPlayers,
    activeOpponents,
    heroPos,
    heroSeat,
    villainSeat,
    stackBb,
    stackLeftBb,
    startPotBb,
    currentPotBb,
    startStreetIndex,
    targetStreet: 3,
    focus: {
      key: family.id,
      street: AS_STREETS[startStreetIndex],
      spotType: family.spotType,
      skillBucket: family.skillBucket,
    },
    heroCards,
    boardCards,
    streetIndex: startStreetIndex,
    ended: false,
    history: [],
  };
}

function postflopCreateState(weakness = {}){
  const requestedFamily = postflopPickFamily(weakness);
  const familyQueue = postflopFamilyRotation(weakness, requestedFamily.id);
  const attemptsPerFamily = 24;
  const telemetry = {
    requestedFamilyId: requestedFamily.id,
    requestedFamilyLabel: requestedFamily.label,
    attempts: 0,
    familyAttempts: {},
    familyMisses: {},
  };
  let fallback = null;

  for(const family of familyQueue){
    for(let i = 0; i < attemptsPerFamily; i++){
      telemetry.attempts += 1;
      telemetry.familyAttempts[family.id] = (telemetry.familyAttempts[family.id] ?? 0) + 1;

      const startStreetIndex = postflopPickStartStreet(family);
      const meta = postflopBuildMetaCandidate(family, startStreetIndex);
      const node = allSkillsBuildNode(meta);
      const classified = postflopClassifyFamily(node, family.id);

      if(!fallback) fallback = {meta, node, classified, familyId: family.id};

      const matchedTarget = classified.matched && classified.familyId === family.id;
      if(!matchedTarget){
        telemetry.familyMisses[family.id] = (telemetry.familyMisses[family.id] ?? 0) + 1;
        continue;
      }

      const resolvedFamily = postflopFamilyById(classified.familyId);
      return {
        meta: {
          ...meta,
          familyId: resolvedFamily.id,
          familyLabel: resolvedFamily.label,
          generation: {
            ...telemetry,
            fallbackUsed: resolvedFamily.id !== requestedFamily.id,
            unresolved: false,
            resolvedFamilyId: resolvedFamily.id,
            resolvedFamilyLabel: resolvedFamily.label,
            matchCount: classified.matchCount,
          },
        },
        node,
        result: null,
      };
    }
  }

  const fallbackFamilyId = fallback?.classified?.familyId ?? fallback?.familyId ?? requestedFamily.id;
  const fallbackFamily = postflopFamilyById(fallbackFamilyId);
  const fallbackMeta = fallback?.meta ?? postflopBuildMetaCandidate(fallbackFamily, postflopPickStartStreet(fallbackFamily));
  const fallbackNode = fallback?.node ?? allSkillsBuildNode(fallbackMeta);
  const fallbackClassified = fallback?.classified ?? postflopClassifyFamily(fallbackNode, fallbackFamily.id);

  return {
    meta: {
      ...fallbackMeta,
      familyId: fallbackFamily.id,
      familyLabel: fallbackFamily.label,
      generation: {
        ...telemetry,
        fallbackUsed: true,
        unresolved: true,
        resolvedFamilyId: fallbackClassified.familyId,
        resolvedFamilyLabel: fallbackClassified.family?.label ?? fallbackFamily.label,
        matchCount: fallbackClassified.matchCount,
      },
    },
    node: fallbackNode,
    result: null,
  };
}

function postflopActionTheme(action){
  if(action === 'fold' || action === 'check/fold') return {bg: 'linear-gradient(135deg,#6a2828,#521818)', color: '#e8a0a0'};
  if(action === 'check') return {bg: 'linear-gradient(135deg,#2a5a6a,#1a4858)', color: '#a0c8e8'};
  if(action === 'call' || action === 'check/call') return {bg: 'linear-gradient(135deg,#2a5a6a,#1a4858)', color: '#a0c8e8'};
  if(action.startsWith('raise') || action.startsWith('bet')) return {bg: 'linear-gradient(135deg,#2a6a38,#1a5228)', color: '#a8dea0'};
  return {bg: 'rgba(0,0,0,0.24)', color: '#8ab880'};
}

function postflopHistoryText(entry){
  if(!entry) return '';
  return `${allSkillsStreetTitle(entry.street)}: ${allSkillsActionLabel(entry.action)} (${entry.isCorrect ? '✓' : '✗'})`;
}

function PostflopTab(){
  const [weakness, setWeakness] = useLocalStorageState(PFV2_WEAKNESS_KEY, {});
  const [stats, setStats] = useLocalStorageState(PFV2_STATS_KEY, {correct: 0, total: 0, points: 0, hands: 0});
  const [streak, setStreak] = useLocalStorageState(PFV2_STREAK_KEY, 0);
  const [best, setBest] = useLocalStorageState(PFV2_BEST_KEY, 0);
  const [fade, setFade] = useState(true);
  const [state, setState] = useState(() => postflopCreateState(weakness));

  const boardCount = state.meta.streetIndex === 1 ? 3 : state.meta.streetIndex === 2 ? 4 : 5;
  const boardNow = state.meta.boardCards.slice(0, boardCount);
  const street = AS_STREETS[state.meta.streetIndex];
  const summary = state.meta.ended ? allSkillsSummarize(state.meta) : null;
  const targetFamily = postflopFamilyById(state.meta.targetFamilyId ?? state.meta.familyId);
  const family = postflopFamilyById(state.node.postflopFamilyId ?? state.meta.familyId);
  const activeOpponents = Math.max(state.meta.activeOpponents ?? Math.max(state.meta.numPlayers - 1, 1), 1);
  const streetProgress = [1, 2, 3].map(idx => {
    const streetLabel = allSkillsStreetTitle(AS_STREETS[idx]);
    return {
      idx,
      streetLabel,
      reached: state.meta.streetIndex >= idx,
      current: state.meta.streetIndex === idx,
      skippedStart: idx < state.meta.startStreetIndex,
    };
  });
  const heroInfo = POS_INFO[state.meta.heroSeat] ?? POS_INFO.btn;
  const villainInfo = POS_INFO[state.meta.villainSeat] ?? POS_INFO.bb;

  const act = (action) => {
    if(state.result) return;
    if(!state.node.options.includes(action)) return;

    const scoredBase = allSkillsScoreAction(state.node, action);
    const fatalInfo = allSkillsDetectFatal(state.node, action);
    const scored = fatalInfo.isFatal
      ? {...scoredBase, isCorrect: false, score: 0, reason: `${fatalInfo.message} ${scoredBase.reason}`}
      : scoredBase;

    const resolved = allSkillsResolve(state.meta, state.node, scored, fatalInfo);
    const isCorrect = scored.isCorrect && !resolved.fatal;
    const score = resolved.fatal ? 0 : scored.score;

    setStats(s => ({
      ...s,
      correct: s.correct + (isCorrect ? 1 : 0),
      total: s.total + 1,
      points: asRound((s.points ?? 0) + score, 100),
      hands: s.hands + (resolved.ended ? 1 : 0),
    }));

    setStreak(prev => {
      const next = isCorrect ? prev + 1 : 0;
      setBest(b => Math.max(b, next));
      return next;
    });

    setWeakness(w => {
      const key = state.node.postflopFamilyId ?? state.meta.familyId;
      const cur = w[key] ?? {correct: 0, total: 0, misses: 0};
      const missDelta = (isCorrect ? 0 : 1) + (resolved.fatal ? 1 : 0);
      return {...w, [key]: {correct: cur.correct + (isCorrect ? 1 : 0), total: cur.total + 1, misses: cur.misses + missDelta}};
    });

    setState(s => ({
      ...s,
      meta: resolved.meta,
      result: {
        ...scored,
        isCorrect,
        score,
        ended: resolved.ended,
        fatal: resolved.fatal,
        handText: resolved.text,
      },
    }));
  };

  const next = () => {
    setFade(false);
    setTimeout(() => {
      if(state.meta.ended) setState(postflopCreateState(weakness));
      else setState(s => {
        const node = allSkillsBuildNode(s.meta);
        const liveFamilyId = node.postflopFamilyId ?? s.meta.familyId;
        const liveFamily = postflopFamilyById(liveFamilyId);
        return {
          ...s,
          meta: {
            ...s.meta,
            familyId: liveFamily.id,
            familyLabel: liveFamily.label,
            numPlayers: node.numPlayers,
            activeOpponents: node.activeOpponents,
          },
          node,
          result: null,
        };
      });
      setFade(true);
    }, 130);
  };

  const weakFamilyId = Object.keys(weakness)
    .filter(k => (weakness[k]?.total ?? 0) >= 3)
    .sort((a, b) => {
      const A = weakness[a], B = weakness[b];
      const eA = 1 - (A.correct / Math.max(A.total, 1));
      const eB = 1 - (B.correct / Math.max(B.total, 1));
      return eB - eA;
    })[0] ?? null;

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>

      {weakFamilyId && (() => {
        const rec = weakness[weakFamilyId];
        const acc = Math.round(rec.correct / Math.max(rec.total, 1) * 100);
        if(acc >= 85) return null;
        const weakFamily = postflopFamilyById(weakFamilyId);
        return (
          <div style={{marginBottom:12,background:'rgba(180,100,30,0.12)',border:'1px solid rgba(180,120,40,0.3)',borderRadius:10,padding:'8px 14px',display:'flex',alignItems:'center',gap:8,fontFamily:'sans-serif'}}>
            <span style={{fontSize:14}}>🎯</span>
            <div>
              <span style={{fontSize:11,color:'#c89040',letterSpacing:1}}>Focus family: </span>
              <span style={{fontSize:11,color:'#e0b060',fontWeight:700}}>{weakFamily.label}</span>
              <span style={{fontSize:11,color:'#8a6030'}}> ({acc}% accuracy)</span>
            </div>
          </div>
        );
      })()}

      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease'}}>
        <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
          <span style={{background:'rgba(90,155,70,0.14)',border:'1px solid rgba(90,155,70,0.38)',color:'#78b060',padding:'4px 11px',borderRadius:20,fontSize:10,letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif'}}>{street}</span>
          <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'4px 11px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>👥 {state.meta.numPlayers}-way · {activeOpponents} live</span>
          <span style={{background:'rgba(170,120,70,0.15)',border:'1px solid rgba(170,120,70,0.32)',color:'#d0a070',padding:'4px 11px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>Focus: {targetFamily.label}</span>
          {family.id !== targetFamily.id && (
            <span style={{background:'rgba(120,100,170,0.15)',border:'1px solid rgba(130,110,190,0.32)',color:'#b8a0dd',padding:'4px 11px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>Live node: {family.label}</span>
          )}
        </div>

        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {streetProgress.map(step => (
            <span
              key={`pf-step-${step.idx}`}
              style={{
                minWidth:64,
                textAlign:'center',
                padding:'4px 8px',
                borderRadius:8,
                fontSize:10,
                letterSpacing:1,
                textTransform:'uppercase',
                fontFamily:'sans-serif',
                border: step.current
                  ? '1px solid rgba(120,200,120,0.42)'
                  : step.reached
                    ? '1px solid rgba(140,170,200,0.38)'
                    : '1px solid rgba(120,120,120,0.24)',
                background: step.current
                  ? 'rgba(70,120,70,0.22)'
                  : step.reached
                    ? 'rgba(60,80,110,0.18)'
                    : 'rgba(0,0,0,0.14)',
                color: step.current
                  ? '#9ed09a'
                  : step.reached
                    ? '#a8bddd'
                    : '#688068',
                opacity: step.skippedStart ? 0.62 : 1,
              }}
            >
              {step.streetLabel}
            </span>
          ))}
        </div>

        {state.meta.generation?.fallbackUsed && (
          <div style={{marginBottom:14,background:'rgba(140,110,50,0.14)',border:'1px solid rgba(180,140,70,0.3)',borderRadius:10,padding:'8px 12px',fontFamily:'sans-serif'}}>
            <div style={{fontSize:10,color:'#d8b06a',letterSpacing:1,textTransform:'uppercase',marginBottom:3}}>Scenario guardrail</div>
            <div style={{fontSize:11,color:'#b89a64',lineHeight:1.45}}>
              {state.meta.generation.unresolved
                ? 'Used fallback candidate due repeated strict family mismatches.'
                : 'Adjusted to a deterministic fallback family to keep scenario and node family aligned.'}
            </div>
          </div>
        )}

        <div style={{display:'flex',justifyContent:'space-between',marginBottom:14,gap:10,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:2}}>Hero Seat</div>
            <div style={{fontSize:16,fontWeight:700,color:heroInfo.color,fontFamily:'Georgia,serif'}}>{heroInfo.name}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:2}}>Villain Seat</div>
            <div style={{fontSize:16,fontWeight:700,color:villainInfo.color,fontFamily:'Georgia,serif'}}>{villainInfo.name}</div>
          </div>
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:14,borderLeft:'3px solid #507848'}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:6}}>Situation</div>
          <div style={{fontSize:13,color:'#c8e8b0',fontFamily:'sans-serif',lineHeight:1.6}}>
            {state.node.spotType === 'checked_to_hero'
              ? `${state.meta.villainModel.name} checks to you on a ${state.node.boardTexture} ${street} board.`
              : `${state.meta.villainModel.name} bets ${state.node.sizeBucket} (${state.node.betBb}bb) into ${state.node.potBb}bb on a ${state.node.boardTexture} ${street} board.`}
          </div>
          <div style={{fontSize:11,color:'#7fa37a',marginTop:8,fontFamily:'sans-serif'}}>Pot: {state.node.potBb}bb · Effective stack: {state.meta.stackLeftBb}bb · Active opponents: {activeOpponents}</div>
          <div style={{fontSize:11,color:'#7ea181',marginTop:4,fontFamily:'sans-serif'}}>
            Branch: {activeOpponents > 1 ? 'Multiway line still active. Keep ranges tight.' : 'Heads-up branch. Wider pressure lines are available.'}
          </div>
          {state.node.spotType === 'facing_bet' && (
            <div style={{fontSize:11,color:'#86a882',marginTop:4,fontFamily:'sans-serif'}}>
              Pot odds: {state.node.potOdds}% · Discounted equity: {state.node.effectiveEquity}%
            </div>
          )}
        </div>

        <div style={{display:'flex',justifyContent:'center',gap:16,marginBottom:14,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8,textAlign:'center'}}>Hero</div>
            <div style={{display:'flex',gap:6}}>{state.meta.heroCards.map((c,i)=><PlayingCard key={`${state.meta.id}-h-${i}`} r={c.r} s={c.s} hero={true}/>)}</div>
          </div>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8,textAlign:'center'}}>Board</div>
            <div style={{display:'flex',gap:6}}>{boardNow.map((c,i)=><PlayingCard key={`${state.meta.id}-b-${i}`} r={c.r} s={c.s} hero={false}/>)}</div>
          </div>
        </div>

        {state.meta.history.length > 0 && (
          <div style={{background:'rgba(0,0,0,0.18)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,padding:'10px 10px 8px',marginBottom:14,maxHeight:124,overflowY:'auto'}}>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:6}}>Hand Line</div>
            {state.meta.history.slice(-3).map((h, i) => (
              <div key={`${h.street}-${h.action}-${i}`} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,fontSize:11,color:'#8fb486',fontFamily:'sans-serif',lineHeight:1.45,marginBottom:i===2?0:5}}>
                <span>{postflopHistoryText(h)}</span>
                <span style={{fontSize:10,color:'#6f8f72',whiteSpace:'nowrap'}}>{h.numPlayers ? `${h.numPlayers}-way` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {!state.result ? (
          <>
            <div style={{textAlign:'center',fontSize:12,color:'#507848',marginBottom:11,fontFamily:'sans-serif'}}>Choose your action</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(148px,1fr))',gap:8}}>
              {state.node.options.map(opt => {
                const theme = postflopActionTheme(opt);
                return (
                  <button key={opt} onClick={()=>act(opt)} style={{padding:'14px 12px',minHeight:56,borderRadius:10,border:'1px solid rgba(0,0,0,0.2)',cursor:'pointer',background:theme.bg,color:theme.color,fontFamily:'sans-serif',textAlign:'left',boxShadow:'0 4px 14px rgba(0,0,0,0.35)'}}>
                    <div style={{fontSize:13,fontWeight:700}}>{allSkillsActionLabel(opt)}</div>
                    <div style={{fontSize:10,opacity:0.85}}>{allSkillsSizeBucket(opt) ?? 'standard'}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div style={{textAlign:'center',padding:'14px',borderRadius:12,marginBottom:14,background:state.result.fatal?'rgba(180,120,30,0.17)':state.result.isCorrect?'rgba(50,130,50,0.15)':'rgba(160,45,45,0.15)',border:`1px solid ${state.result.fatal?'rgba(200,150,40,0.34)':state.result.isCorrect?'rgba(50,200,50,0.28)':'rgba(200,50,50,0.28)'}`}}>
              <div style={{fontSize:24,marginBottom:2}}>{state.result.fatal ? '⚠' : state.result.isCorrect ? '✓' : '✗'}</div>
              <div style={{fontSize:15,fontWeight:700,color:state.result.fatal?'#d9a24a':state.result.isCorrect?'#68cc68':'#cc6868',fontFamily:'sans-serif'}}>
                {state.result.fatal
                  ? 'Fatal error — hand score capped'
                  : state.result.isCorrect
                    ? 'Correct line'
                    : `Not optimal — best: ${allSkillsActionLabel(state.result.bestAction)}`}
              </div>
              <div style={{fontSize:11,color:'#7fa37a',fontFamily:'sans-serif',marginTop:6}}>Street score: +{state.result.score.toFixed(1)} pts</div>
            </div>

            <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:12}}>
              <div style={{fontSize:9,color:'#3a6038',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8}}>Why</div>
              <div style={{fontSize:13,color:'#a0c890',fontFamily:'sans-serif',lineHeight:1.6,marginBottom:8}}>{state.result.reason}</div>
              <div style={{fontSize:10,color:'#70946b',fontFamily:'sans-serif'}}>Skill tag: {state.result.skillTag}</div>
              {state.node.postflopFamilyId && <div style={{fontSize:10,color:'#88aa84',fontFamily:'sans-serif',marginTop:4}}>Family: {family.label}</div>}
            </div>

            <div style={{fontSize:12,color:'#6f926b',marginBottom:12,fontFamily:'sans-serif',textAlign:'center'}}>{state.result.handText}</div>
            <button onClick={next} style={{width:'100%',padding:'13px',borderRadius:10,cursor:'pointer',background:'rgba(90,150,80,0.08)',border:'1px solid rgba(90,150,80,0.28)',color:'#78b060',fontSize:14,fontWeight:600,letterSpacing:1,fontFamily:'sans-serif'}}>{state.result.ended ? 'Next Hand →' : 'Continue →'}</button>
          </>
        )}
      </div>

      {summary && (
        <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
          <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:8}}>Hand Summary</div>
          <div style={{fontSize:13,color:'#9bc892',marginBottom:8}}>Hand score: <strong style={{color:'#ede0c0'}}>{summary.points.toFixed(1)}</strong> / {summary.maxPoints.toFixed(1)}</div>
          <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:11,color:'#8aaa84',marginBottom:10,flexWrap:'wrap'}}>
            {[['Flop', summary.streetMarks.flop], ['Turn', summary.streetMarks.turn], ['River', summary.streetMarks.river]].map(([name, mark]) => (
              <div key={name} style={{display:'flex',alignItems:'center',gap:4}}>
                <span>{name}</span>
                <span style={{color:'#ede0c0',fontWeight:700}}>{mark}</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:'#7fa37a',marginBottom:6}}>Biggest leak this hand: <span style={{color:'#b0d2a6'}}>{summary.biggestLeak}</span></div>
          <div style={{fontSize:11,color:'#7fa37a'}}>Cue: <span style={{color:'#b0d2a6'}}>{summary.improvementCue}</span></div>
        </div>
      )}

      <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:9}}>Postflop v2 Heuristics</div>
        {[['Street planning','Set your plan on flop, then adapt to turn and river changes.'],['Multiway discipline','Bluff less multiway; continue with stronger equity and cleaner blockers.'],['Pressure math','Facing bets: compare discounted equity vs pot odds before defending.'],['Value over ego','On later streets, maximize value from worse hands before forcing hero calls.']].map(([rule,desc])=>(
          <div key={rule} style={{display:'flex',gap:8,fontSize:11,marginBottom:5}}>
            <span style={{color:'#70a840',fontWeight:600,minWidth:102}}>{rule}</span>
            <span style={{color:'#3d5038'}}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: BET SIZING
// ═══════════════════════════════════════════════════════════════════════════════
const BS_SITUATIONS = [
  {id: 'value_top', label: 'You have top pair on a dry board', strength: 'strong', bluff: false, numPlayers: 2, street: 'flop', why: "Value bet 50–75% pot. You want calls from worse hands. Too small lets draws in cheap, too big folds everything."},
  {id: 'value_set', label: 'You flopped a set, one opponent', strength: 'monster', bluff: false, numPlayers: 2, street: 'flop', why: "Value bet 50–75% pot. Don't slowplay — build the pot and charge draws. Overbetting looks suspicious."},
  {id: 'value_multiway', label: 'You have top pair, 3 players in the pot', strength: 'strong', bluff: false, numPlayers: 3, street: 'flop', why: "Bet bigger multiway — 60–75% pot. More players means more chance someone has a draw or second pair. Charge them."},
  {id: 'cbet_miss', label: 'You raised preflop, missed the flop, heads up', strength: 'air', bluff: true, numPlayers: 2, street: 'flop', why: "C-bet 40–60% pot. You have initiative. Opponent misses ~65% of flops. Small bet risks little and takes it down often."},
  {id: 'bluff_river', label: 'Missed draw on the river, heads up, checked to you', strength: 'air', bluff: true, numPlayers: 2, street: 'river', why: "If you bluff, bet 60–75% pot — enough to make calling uncomfortable. Match your value bet sizing so you're not transparent."},
  {id: 'draw_flop', label: 'You have a flush draw, villain bets into you', strength: 'draw', bluff: false, numPlayers: 2, street: 'flop', why: "Call or raise, don't fold. If raising as a semi-bluff, size it to 2.5–3x their bet. Enough fold equity without over-committing."},
  {id: 'thinvalue_river', label: 'You have second pair on the river, heads up', strength: 'medium', bluff: false, numPlayers: 2, street: 'river', why: "Bet small for thin value — 25–40% pot. You want calls from worse but don't want to bloat the pot in case you're behind."},
  {id: 'value_turn', label: 'You have an overpair, villain checked the turn', strength: 'strong', bluff: false, numPlayers: 2, street: 'turn', why: "Bet 50–65% pot. Keep building value, protect your hand from cheap draws seeing the river."},
];

const BS_OPTIONS = [
  {label: 'Min bet', pct: 10, key: 'minbet'},
  {label: '25% pot', pct: 25, key: 'quarter'},
  {label: '50% pot', pct: 50, key: 'half'},
  {label: '75% pot', pct: 75, key: 'threequarter'},
  {label: 'Pot', pct: 100, key: 'pot'},
  {label: 'Overbet', pct: 150, key: 'over'},
];

function correctBetSize(sit){
  if(sit.bluff && sit.street === 'river') return ['half', 'threequarter', 'over'];
  if(sit.bluff) return ['quarter', 'half'];
  if(sit.strength === 'monster') return ['half', 'threequarter', 'over'];
  if(sit.strength === 'strong' && sit.numPlayers >= 3) return ['half', 'threequarter'];
  if(sit.strength === 'strong') return ['half', 'threequarter'];
  if(sit.strength === 'medium') return ['quarter', 'half'];
  if(sit.strength === 'draw') return ['threequarter', 'pot'];
  return ['half'];
}

function BetSizingTab(){
  const [sitIdx, setSitIdx] = useState(() => ~~(Math.random() * BS_SITUATIONS.length));
  const [result, setResult] = useState(null);
  const [stats, setStats] = useLocalStorageState('poker_stats_3', {correct: 0, total: 0});
  const [streak, setStreak] = useLocalStorageState('poker_streak_3', 0);
  const [best, setBest] = useLocalStorageState('poker_best_3', 0);
  const [fade, setFade] = useState(true);
  const pot = 80;

  const sit = BS_SITUATIONS[sitIdx];
  const correct = correctBetSize(sit);

  const act = (key) => {
    const ok = correct.includes(key);
    setResult({key, ok});
    setStats(s => ({correct: s.correct + (ok ? 1 : 0), total: s.total + 1}));
    if(ok){ const ns = streak + 1; setStreak(ns); if(ns > best) setBest(ns); } else setStreak(0);
  };

  const next = () => {
    setFade(false);
    setTimeout(() => {
      setSitIdx(i => { let n = i; while(n === i) n = ~~(Math.random() * BS_SITUATIONS.length); return n; });
      setResult(null);
      setFade(true);
    }, 180);
  };

  const correctLabels = correct.map(k => BS_OPTIONS.find(o => o.key === k).label).join(' or ');

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>
      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease'}}>
        <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          <span style={{background:'rgba(90,155,70,0.14)',border:'1px solid rgba(90,155,70,0.38)',color:'#78b060',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif'}}>{sit.street}</span>
          <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif'}}>👥 {sit.numPlayers}-way</span>
          {sit.bluff && <span style={{background:'rgba(150,80,80,0.15)',border:'1px solid rgba(180,80,80,0.3)',color:'#c08080',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif'}}>bluff spot</span>}
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:18,borderLeft:'3px solid #507848'}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:6}}>Situation</div>
          <div style={{fontSize:15,color:'#c8e8b0',fontFamily:'sans-serif',lineHeight:1.5}}>{sit.label}</div>
          <div style={{fontSize:12,color:'#507848',fontFamily:'sans-serif',marginTop:8}}>Pot size: <span style={{color:'#ede0c0',fontWeight:700}}>${pot}</span></div>
        </div>

        {!result ? (
          <>
            <div style={{fontSize:12,color:'#507848',textAlign:'center',marginBottom:12,fontFamily:'sans-serif'}}>How much do you bet?</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {BS_OPTIONS.map(({label,pct,key}) => (
                <button key={key} onClick={()=>act(key)} style={{padding:'12px 8px',borderRadius:10,border:'1px solid rgba(90,150,90,0.2)',cursor:'pointer',background:'rgba(0,0,0,0.2)',color:'#8ab880',fontFamily:'sans-serif',textAlign:'left'}}
                  onMouseDown={e=>e.currentTarget.style.transform='scale(0.97)'}
                  onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
                >
                  <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{label}</div>
                  <div style={{fontSize:11,color:'#507848'}}>${Math.round(pot*pct/100)}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{textAlign:'center',padding:'14px',borderRadius:12,marginBottom:14,background:result.ok?'rgba(50,130,50,0.15)':'rgba(160,45,45,0.15)',border:`1px solid ${result.ok?'rgba(50,200,50,0.28)':'rgba(200,50,50,0.28)'}`}}>
              <div style={{fontSize:26,marginBottom:2}}>{result.ok ? '✓' : '✗'}</div>
              <div style={{fontSize:16,fontWeight:700,color:result.ok?'#68cc68':'#cc6868',fontFamily:'sans-serif'}}>{result.ok ? 'Correct!' : `Wrong — correct size: ${correctLabels}`}</div>
            </div>
            <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:9,color:'#3a6038',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8}}>Why</div>
              <div style={{fontSize:13,color:'#a0c890',fontFamily:'sans-serif',lineHeight:1.6}}>{sit.why}</div>
            </div>
            <button onClick={next} style={{width:'100%',padding:'13px',borderRadius:10,cursor:'pointer',background:'rgba(90,150,80,0.08)',border:'1px solid rgba(90,150,80,0.28)',color:'#78b060',fontSize:14,fontWeight:600,letterSpacing:1,fontFamily:'sans-serif'}}>Next →</button>
          </>
        )}
      </div>

      <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:9}}>Sizing Rules</div>
        {[['Value bet','50–75% pot. Get paid, charge draws.'],['Bluff / C-bet','40–60% pot. Risk little, take it often.'],['Thin value','25–40% pot. Extract from marginal hands.'],['Semi-bluff raise',"2.5-3x villain's bet. Fold equity + draw equity."],['Never','Min bet (too weak) or random overbets.']].map(([rule,desc])=>(
          <div key={rule} style={{display:'flex',gap:8,fontSize:11,marginBottom:5}}>
            <span style={{color:'#70a840',fontWeight:600,minWidth:90}}>{rule}</span>
            <span style={{color:'#3d5038'}}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ALL SKILLS
// ═══════════════════════════════════════════════════════════════════════════════
const AS_STREETS = ['preflop', 'flop', 'turn', 'river'];
const AS_STACKS = [40, 60, 80, 100, 120];
const AS_TEXTURES = ['dry', 'semi-wet', 'wet', 'paired', 'monotone'];
const AS_START_STREET_WEIGHTS = [[0, 0.55], [1, 0.3], [2, 0.15]];
const AS_HEADS_UP_ONLY = true;
const AS_MULTIWAY_DISTRIBUTION = AS_HEADS_UP_ONLY ? [2] : [2, 2, 2, 2, 2, 2, 3, 4];
const AS_GHOST_DISTRIBUTION = [0, 0, 0, 0, 0, 0, 1, 2];
const AS_MAX_GHOST_COUNT = 3;
const AS_FADE_DELAY_MS = 130;
const AS_MIN_SAMPLES_FOR_FOCUS_PICK = 3;
const AS_MIN_SAMPLES_FOR_FOCUS_CUE = 4;
const AS_VILLAIN_WEIGHT_JITTER_MIN = 0.9;
const AS_VILLAIN_WEIGHT_JITTER_RANGE = 0.2;
const AS_ADAPTIVE_ERROR_MULT = 4;
const AS_ADAPTIVE_MISS_MULT = 0.12;
const AS_IP_BIAS_THRESHOLD = 0.45;
const AS_MIN_START_POT_BB = 3;
const AS_START_POT_RANGE_BB = 5;
const AS_DEEP_STREET_FOLD_MULT = 0.45;
const AS_FATAL_COMMIT_RATIO = 0.45;
const AS_FATAL_CAP_MULT = 0.4;
const AS_MULTIWAY_EQUITY_PENALTY = 0.15;

const AS_STORAGE_VERSION = 'v1';
const AS_WEAKNESS_KEY = 'poker_allskills_weakness';
const AS_STATS_KEY = 'poker_allskills_stats';
const AS_STREAK_KEY = 'poker_allskills_streak';
const AS_BEST_KEY = 'poker_allskills_best';
const AS_EXAM_KEY = 'poker_allskills_exam';
const AS_POSTFLOP_FAMILY_WEAKNESS_KEY = `poker_allskills_${AS_STORAGE_VERSION}_postflop_family_weakness`;

const AS_VILLAIN_PROFILES = {
  tag: {label: 'TAG', name: 'Tight-Aggressive', baseWeight: 1.15, aggression: 0.58, looseness: 0.35, foldToAggro: 0.46, small: 0.25, medium: 0.5, large: 0.25},
  lag: {label: 'LAG', name: 'Loose-Aggressive', baseWeight: 1.05, aggression: 0.75, looseness: 0.7, foldToAggro: 0.31, small: 0.22, medium: 0.45, large: 0.33},
  lp: {label: 'LP', name: 'Loose-Passive', baseWeight: 1.0, aggression: 0.35, looseness: 0.72, foldToAggro: 0.38, small: 0.45, medium: 0.42, large: 0.13},
  maniac: {label: 'Maniac', name: 'Maniac', baseWeight: 0.8, aggression: 0.9, looseness: 0.86, foldToAggro: 0.24, small: 0.2, medium: 0.4, large: 0.4},
};

const AS_VILLAIN_HINTS = {
  tag: 'Plays tighter ranges and applies pressure with stronger holdings.',
  lag: 'Plays many hands and applies frequent aggression.',
  lp: 'Calls wide preflop and postflop, but bluffs less often.',
  maniac: 'Over-aggressive profile with wider bluffs and bigger swings.',
};

const AS_ACTION_LABELS = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  limp: 'Limp',
  'bet-small': 'Bet Small',
  'bet-medium': 'Bet Medium',
  'bet-large': 'Bet Large',
  'raise-small': 'Raise Small',
  'raise-medium': 'Raise Medium',
  'raise-large': 'Raise Large',
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const asRound = (n, p = 1) => Math.round(n * p) / p;

function allSkillsNormalizeGhostCount(value){
  if(!Number.isFinite(value)) return 0;
  return clamp(Math.round(value), 0, AS_MAX_GHOST_COUNT);
}

function allSkillsGhostCount(source){
  return allSkillsNormalizeGhostCount(source?.activeGhostCount);
}

function allSkillsEffectivePlayers(source){
  const physicalPlayers = Math.max(Number.isFinite(source?.numPlayers) ? Math.round(source.numPlayers) : 2, 2);
  return Math.max(physicalPlayers, 2 + allSkillsGhostCount(source));
}

function allSkillsGhostContextLine(source){
  const ghostCount = allSkillsGhostCount(source);
  if(ghostCount <= 0) return '';
  const effectivePlayers = allSkillsEffectivePlayers(source);
  return ` Ghost pressure: +${ghostCount} virtual player${ghostCount === 1 ? '' : 's'} (${effectivePlayers}-way dynamics).`;
}

function allSkillsActionLabel(action){ return AS_ACTION_LABELS[action] ?? action; }
function allSkillsStreetTitle(street){ return street === 'preflop' ? 'Preflop' : street[0].toUpperCase() + street.slice(1); }
function allSkillsIsAggro(action){ return action.startsWith('bet') || action.startsWith('raise'); }
function allSkillsVillainHint(villainType){ return AS_VILLAIN_HINTS[villainType] ?? 'Watch bet sizing and showdowns to profile this opponent.'; }
function allSkillsSizeBucket(action){
  if(action.endsWith('small')) return 'small';
  if(action.endsWith('medium')) return 'medium';
  if(action.endsWith('large')) return 'large';
  return null;
}

function weightedPickFromEntries(entries){
  if(entries.length === 0) return null;
  const safeEntries = entries.map(([k, w]) => [k, Number.isFinite(w) && w > 0 ? w : 0]);
  const total = safeEntries.reduce((s, [, w]) => s + w, 0);
  if(total <= 0) return safeEntries[0]?.[0] ?? null;
  let r = Math.random() * total;
  for(const [key, w] of safeEntries){
    r -= w;
    if(r <= 0) return key;
  }
  return safeEntries[safeEntries.length - 1][0];
}

function allSkillsPickVillainType(){
  const entries = Object.entries(AS_VILLAIN_PROFILES).map(([k, v]) => {
    const jittered = v.baseWeight * (AS_VILLAIN_WEIGHT_JITTER_MIN + Math.random() * AS_VILLAIN_WEIGHT_JITTER_RANGE);
    return [k, jittered];
  });
  return weightedPickFromEntries(entries) ?? 'lp';
}

function allSkillsPickFocus(weakness = {}){
  const keys = Object.keys(weakness).filter(k => (weakness[k]?.total ?? 0) >= AS_MIN_SAMPLES_FOR_FOCUS_PICK);
  if(keys.length === 0) return null;
  const entries = keys.map(k => {
    const rec = weakness[k];
    const err = 1 - (rec.correct / Math.max(rec.total, 1));
    const weight = 1 + err * AS_ADAPTIVE_ERROR_MULT + (rec.misses ?? 0) * AS_ADAPTIVE_MISS_MULT;
    return [k, weight];
  });
  const key = weightedPickFromEntries(entries);
  if(!key) return null;
  const [street, spotType, skillBucket] = key.split('|');
  return {key, street, spotType, skillBucket};
}

function allSkillsPickStartStreet(focus = null){
  if(focus?.street === 'turn' && Math.random() < 0.55) return 2;
  if(focus?.street === 'flop' && Math.random() < 0.5) return 1;
  if(focus?.street === 'preflop' && Math.random() < 0.55) return 0;
  return weightedPickFromEntries(AS_START_STREET_WEIGHTS) ?? 0;
}

function allSkillsPickTargetStreet(startStreet){
  if(startStreet >= 2) return 3;
  if(startStreet === 1) return weightedPickFromEntries([[2, 0.45], [3, 0.55]]) ?? 2;
  return weightedPickFromEntries([[1, 0.2], [2, 0.45], [3, 0.35]]) ?? 2;
}

function allSkillsNextHandId(){
  if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hiRes = typeof performance !== 'undefined' ? Math.round(performance.now()).toString(36) : '0';
  return `${Date.now().toString(36)}-${hiRes}-${Math.random().toString(36).slice(2, 16)}`;
}

function allSkillsNormalizeSizingModel(villain){
  const small = clamp(villain.small, 0.05, 0.9);
  const medium = clamp(villain.medium, 0.05, 0.9);
  const large = clamp(villain.large, 0.05, 0.9);
  const total = small + medium + large;
  return {...villain, small: small / total, medium: medium / total, large: large / total};
}

function allSkillsCreateVillainModel(villainType, numPlayers){
  const base = AS_VILLAIN_PROFILES[villainType] ?? AS_VILLAIN_PROFILES.lp;
  const pressure = Math.max(numPlayers - 2, 0);
  return allSkillsNormalizeSizingModel({
    ...base,
    aggression: clamp(base.aggression + (Math.random() - 0.5) * 0.16 - pressure * 0.04, 0.16, 0.95),
    looseness: clamp(base.looseness + (Math.random() - 0.5) * 0.16 - pressure * 0.05, 0.14, 0.95),
    foldToAggro: clamp(base.foldToAggro + (Math.random() - 0.5) * 0.16 - pressure * 0.06, 0.08, 0.82),
    small: clamp(base.small + (Math.random() - 0.5) * 0.16 + pressure * 0.03, 0.08, 0.85),
    medium: clamp(base.medium + (Math.random() - 0.5) * 0.16, 0.08, 0.85),
    large: clamp(base.large + (Math.random() - 0.5) * 0.16 - pressure * 0.02, 0.08, 0.85),
  });
}

function createAllSkillsHandMeta(weakness = {}){
  const focus = allSkillsPickFocus(weakness);
  const startStreetIndex = allSkillsPickStartStreet(focus);
  const deck = makeDeck();
  const heroCards = deck.splice(0, 2);
  const boardCards = deck.splice(0, 5);
  const villainType = allSkillsPickVillainType();
  const numPlayers = AS_HEADS_UP_ONLY ? 2 : randItem(AS_MULTIWAY_DISTRIBUTION);
  const activeGhostCount = AS_HEADS_UP_ONLY
    ? allSkillsNormalizeGhostCount(randItem(AS_GHOST_DISTRIBUTION))
    : Math.max(numPlayers - 2, 0);
  const effectivePlayers = Math.max(numPlayers, 2 + activeGhostCount);
  const heroPos = Math.random() > AS_IP_BIAS_THRESHOLD ? 'ip' : 'oop';
  const heroSeat = allSkillsResolvePosition(heroPos);
  const villainSeat = allSkillsResolveVillainSeat(heroSeat, heroPos);
  const stackBb = randItem(AS_STACKS);
  const startPotBb = asRound(AS_MIN_START_POT_BB + Math.random() * AS_START_POT_RANGE_BB, 10);
  const stageMult = startStreetIndex === 0 ? 1 : startStreetIndex === 1 ? (1.8 + Math.random() * 0.4) : (2.5 + Math.random() * 0.6);
  const currentPotBb = asRound(startPotBb * stageMult * (1 + Math.max(effectivePlayers - 2, 0) * 0.12), 10);
  const stackLeftBb = asRound(Math.max(stackBb - currentPotBb * 0.28, 12), 10);
  return {
    id: allSkillsNextHandId(),
    villainType,
    villainModel: allSkillsCreateVillainModel(villainType, effectivePlayers),
    numPlayers,
    activeGhostCount,
    effectivePlayers,
    heroPos,
    heroSeat,
    villainSeat,
    stackBb,
    stackLeftBb,
    startPotBb,
    currentPotBb,
    startStreetIndex,
    targetStreet: allSkillsPickTargetStreet(startStreetIndex),
    focus,
    heroCards,
    boardCards,
    streetIndex: startStreetIndex,
    ended: false,
    history: [],
  };
}

function allSkillsBoardTexture(boardCards){
  if(boardCards.length < 3) return 'dry';
  const ranks = boardCards.map(c => c.r);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  const rankCounts = {};
  const suitCounts = {};
  for(const c of boardCards){
    rankCounts[c.r] = (rankCounts[c.r] || 0) + 1;
    suitCounts[c.s] = (suitCounts[c.s] || 0) + 1;
  }
  if(Object.values(rankCounts).some(v => v >= 2)) return 'paired';
  const maxSuit = Math.max(...Object.values(suitCounts));
  const span = uniqueRanks[uniqueRanks.length - 1] - uniqueRanks[0];
  const connected = uniqueRanks.length >= 3 && span <= 4;
  if(maxSuit >= 3) return 'monotone';
  if(maxSuit === 2 && connected) return 'wet';
  if(maxSuit === 2 || connected) return 'semi-wet';
  return randItem(AS_TEXTURES.slice(0, 2));
}

function allSkillsResolvePosition(heroPos){
  if(heroPos === 'ip') return randItem(['co', 'btn']);
  return randItem(['utg', 'utg1', 'hj', 'sb', 'bb']);
}

function allSkillsResolveVillainSeat(heroSeat, heroPos){
  const pool = heroPos === 'ip' ? ['sb', 'bb', 'hj'] : ['co', 'btn'];
  const filtered = pool.filter(p => p !== heroSeat);
  if(filtered.length > 0) return randItem(filtered);
  return randItem(POSITIONS.filter(p => p !== heroSeat));
}

function allSkillsSeatsBefore(heroSeat){
  const idx = PREFLOP_ORDER.indexOf(heroSeat);
  if(idx <= 0) return [];
  return PREFLOP_ORDER.slice(0, idx);
}

function allSkillsSeatsAfter(heroSeat){
  const idx = PREFLOP_ORDER.indexOf(heroSeat);
  if(idx < 0 || idx >= PREFLOP_ORDER.length - 1) return [];
  return PREFLOP_ORDER.slice(idx + 1);
}

function allSkillsResolvePreflopVillainSeat(heroSeat, spotType){
  if(spotType === 'preflop_open'){
    const behind = allSkillsSeatsAfter(heroSeat);
    if(behind.length > 0) return randItem(behind);
  }
  if(spotType === 'preflop_facing_open'){
    const before = allSkillsSeatsBefore(heroSeat);
    if(before.length > 0) return randItem(before);
  }
  return null;
}

function allSkillsCanHaveCallerBeforeHero(heroSeat, openerSeat){
  const heroIdx = PREFLOP_ORDER.indexOf(heroSeat);
  const openerIdx = PREFLOP_ORDER.indexOf(openerSeat);
  if(heroIdx <= 0 || openerIdx < 0) return false;
  if(openerIdx >= heroIdx) return false;
  return (heroIdx - openerIdx) > 1;
}

function allSkillsPickSizing(villain){
  return weightedPickFromEntries([
    ['small', villain.small],
    ['medium', villain.medium],
    ['large', villain.large],
  ]) ?? 'medium';
}

function allSkillsPickPostflopClass(street, focus = null, numPlayers = 2){
  const extra = Math.max(numPlayers - 2, 0);
  const base = {air: 1.2, draw: 1.4, marginal: 1.8 + extra * 0.2, strong: 1.3, monster: 0.7};
  if(street === 'turn'){ base.draw = 1.2; base.strong = 1.45; }
  if(street === 'river'){ base.draw = 0.35; base.marginal = 1.45; base.strong = 1.6; base.monster = 0.95; }
  if(extra > 0){ base.strong += 0.2; base.draw -= 0.12 * extra; }
  if(focus?.skillBucket === 'bluffing') base.air += 0.65;
  if(focus?.skillBucket === 'value') base.strong += 0.7;
  return weightedPickFromEntries(Object.entries(base)) ?? 'marginal';
}

function allSkillsStraightHigh(ranks){
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if(unique.includes(14)) unique.unshift(1);

  let best = null;
  for(let i = 0; i <= unique.length - 5; i++){
    let straight = true;
    for(let j = 1; j < 5; j++){
      if(unique[i + j] !== unique[i] + j){
        straight = false;
        break;
      }
    }
    if(straight) best = unique[i] + 4;
  }
  return best;
}

function allSkillsRankFive(cards){
  const ranks = cards.map(c => c.r);
  const suits = cards.map(c => c.s);
  const countMap = {};
  for(const r of ranks) countMap[r] = (countMap[r] || 0) + 1;

  const groups = Object.entries(countMap)
    .map(([rank, count]) => ({rank: Number(rank), count}))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const sortedRanks = [...ranks].sort((a, b) => b - a);
  const flush = new Set(suits).size === 1;
  const straightHigh = allSkillsStraightHigh(ranks);

  if(flush && straightHigh != null) return {category: 8, tiebreak: [straightHigh]};

  if(groups[0].count === 4){
    const kicker = groups.find(g => g.count === 1)?.rank ?? 0;
    return {category: 7, tiebreak: [groups[0].rank, kicker]};
  }

  if(groups[0].count === 3 && groups[1]?.count === 2){
    return {category: 6, tiebreak: [groups[0].rank, groups[1].rank]};
  }

  if(flush) return {category: 5, tiebreak: sortedRanks};
  if(straightHigh != null) return {category: 4, tiebreak: [straightHigh]};

  if(groups[0].count === 3){
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return {category: 3, tiebreak: [groups[0].rank, ...kickers]};
  }

  if(groups[0].count === 2 && groups[1]?.count === 2){
    const pairRanks = groups.filter(g => g.count === 2).map(g => g.rank).sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1)?.rank ?? 0;
    return {category: 2, tiebreak: [pairRanks[0], pairRanks[1], kicker]};
  }

  if(groups[0].count === 2){
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return {category: 1, tiebreak: [groups[0].rank, ...kickers]};
  }

  return {category: 0, tiebreak: sortedRanks};
}

function allSkillsCompareRanks(a, b){
  if(a.category !== b.category) return a.category - b.category;
  const maxLen = Math.max(a.tiebreak.length, b.tiebreak.length);
  for(let i = 0; i < maxLen; i++){
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if(av !== bv) return av - bv;
  }
  return 0;
}

function allSkillsBestFive(cards){
  if(!Array.isArray(cards) || cards.length < 5) return null;

  let best = null;
  for(let a = 0; a < cards.length - 4; a++){
    for(let b = a + 1; b < cards.length - 3; b++){
      for(let c = b + 1; c < cards.length - 2; c++){
        for(let d = c + 1; d < cards.length - 1; d++){
          for(let e = d + 1; e < cards.length; e++){
            const indices = [a, b, c, d, e];
            const rank = allSkillsRankFive(indices.map(i => cards[i]));
            if(!best || allSkillsCompareRanks(rank, best.rank) > 0) best = {rank, indices};
          }
        }
      }
    }
  }
  return best;
}

function allSkillsDrawProfile(heroCards, boardCards){
  const drawState = analyzeHand(heroCards, boardCards);
  if(drawState.hasFlushDraw && drawState.hasOESD) return {type: 'combo_flush_oesd', outs: 15, label: 'Flush draw + OESD'};
  if(drawState.hasFlushDraw && drawState.hasGutshot) return {type: 'combo_flush_gutshot', outs: 12, label: 'Flush draw + gutshot'};
  if(drawState.hasFlushDraw) return {type: 'flush_draw', outs: 9, label: 'Flush draw'};
  if(drawState.hasOESD) return {type: 'oesd', outs: 8, label: 'Open-ended straight draw'};
  if(drawState.hasGutshot) return {type: 'gutshot', outs: 4, label: 'Gutshot straight draw'};
  return {type: 'none', outs: 0, label: 'No draw'};
}

function allSkillsDrawEquityFromOuts(outs, street){
  if(street === 'flop') return clamp(outs * 4, 1, 65);
  if(street === 'turn') return clamp(outs * 2, 1, 40);
  return 0;
}

function allSkillsEvaluatePostflopCards(heroCards, boardCards, street){
  if(!Array.isArray(heroCards) || heroCards.length < 2 || !Array.isArray(boardCards) || boardCards.length < 3){
    return {
      handClass: 'air',
      madeHand: 'high-card',
      drawType: 'none',
      drawOuts: 0,
      drawLabel: 'No draw',
      heroCardsUsed: 0,
      equity: street === 'river' ? 8 : 14,
    };
  }

  const allCards = [...heroCards, ...boardCards];
  const best = allSkillsBestFive(allCards);
  const draw = allSkillsDrawProfile(heroCards, boardCards);

  const boardRanks = boardCards.map(c => c.r);
  const holeRanks = heroCards.map(c => c.r).sort((a, b) => b - a);
  const boardTop = Math.max(...boardRanks);
  const pocketPair = heroCards[0].r === heroCards[1].r;
  const heroPairsBoard = holeRanks.filter(r => boardRanks.includes(r));
  const category = best?.rank.category ?? 0;
  const heroCardsUsed = best ? best.indices.filter(i => i < 2).length : 0;

  let handClass = 'air';
  let madeHand = 'high-card';

  if(category >= 5){
    handClass = heroCardsUsed === 0 ? 'strong' : 'monster';
    madeHand = category === 8 ? 'straight-flush' : category === 7 ? 'quads' : category === 6 ? 'full-house' : 'flush';
  } else if(category === 4){
    handClass = heroCardsUsed === 0 ? 'strong' : 'monster';
    madeHand = 'straight';
  } else if(category === 3){
    const tripRank = best?.rank.tiebreak[0] ?? 0;
    const boardTrips = boardCards.filter(c => c.r === tripRank).length >= 3;
    handClass = boardTrips ? (heroCardsUsed === 0 ? 'marginal' : 'strong') : 'monster';
    madeHand = 'trips';
  } else if(category === 2){
    const pairRanks = best?.rank.tiebreak.slice(0, 2) ?? [];
    const heroContrib = heroCards.some(c => pairRanks.includes(c.r));
    handClass = heroContrib ? 'strong' : 'marginal';
    madeHand = 'two-pair';
  } else if(category === 1){
    const pairRank = best?.rank.tiebreak[0] ?? 0;
    const overpair = pocketPair && holeRanks[0] === pairRank && pairRank > boardTop;
    const topPair = heroPairsBoard.includes(boardTop) && pairRank === boardTop;
    const kicker = holeRanks.find(r => r !== pairRank) ?? holeRanks[0];
    handClass = (overpair || (topPair && kicker >= 10)) ? 'strong' : 'marginal';
    madeHand = overpair ? 'overpair' : topPair ? 'top-pair' : 'pair';
  } else if(draw.outs > 0 && street !== 'river'){
    handClass = 'draw';
    madeHand = 'draw';
  }

  let equity = 0;
  if(handClass === 'monster') equity = street === 'river' ? 86 : 76;
  else if(handClass === 'strong') equity = street === 'river' ? 68 : 58;
  else if(handClass === 'marginal') equity = street === 'river' ? 30 : 36;
  else if(handClass === 'draw') equity = allSkillsDrawEquityFromOuts(draw.outs, street);
  else equity = street === 'river' ? 8 : 14;

  if(handClass !== 'draw' && draw.outs > 0){
    const bonus = street === 'flop' ? Math.min(draw.outs, 12) * 0.4 : street === 'turn' ? Math.min(draw.outs, 12) * 0.25 : 0;
    equity += bonus;
  }

  return {
    handClass,
    madeHand,
    drawType: draw.type,
    drawOuts: draw.outs,
    drawLabel: draw.label,
    heroCardsUsed,
    equity: Math.round(clamp(equity, 1, 95)),
  };
}

function allSkillsMatchTierFromCards(heroCards){
  if(!Array.isArray(heroCards) || heroCards.length < 2) return null;
  const c1 = heroCards[0];
  const c2 = heroCards[1];
  if(!c1 || !c2 || !Number.isFinite(c1.r) || !Number.isFinite(c2.r) || !c1.s || !c2.s) return null;

  const high = Math.max(c1.r, c2.r);
  const low = Math.min(c1.r, c2.r);
  const suited = c1.s === c2.s;

  for(const tier of PF_TIER_KEYS){
    const pool = HAND_TIERS[tier]?.hands ?? [];
    for(const hand of pool){
      const hHigh = Math.max(hand.r1, hand.r2);
      const hLow = Math.min(hand.r1, hand.r2);
      if(high !== hHigh || low !== hLow) continue;

      if(hand.r1 === hand.r2) return tier;
      if(Boolean(hand.suited) === suited) return tier;
    }
  }

  if(high === low){
    if(high >= 12) return 'premium';
    if(high >= 10) return 'strong';
    if(high >= 7) return 'medium';
    if(high >= 5) return 'speculative';
    return 'weak';
  }

  if(suited){
    if(high === 14 && low >= 11) return 'strong';
    if(high === 14 && low >= 8) return 'medium';
    if(high - low === 1 && high >= 9) return 'speculative';
    if(high >= 11 && low >= 9) return 'speculative';
    return 'weak';
  }

  if(high === 14 && low >= 11) return 'strong';
  if(high >= 13 && low >= 11) return 'medium';
  if(high >= 11 && low >= 10) return 'speculative';
  return 'weak';
}

function allSkillsPickPreflopClass(meta){
  const fromCards = allSkillsMatchTierFromCards(meta.heroCards);
  if(fromCards) return fromCards;

  const inLate = meta.heroPos === 'ip';
  const extra = Math.max((meta.numPlayers ?? 2) - 2, 0);
  return weightedPickFromEntries([
    ['premium', 0.6 + extra * 0.3],
    ['strong', 1.2 + extra * 0.4],
    ['medium', (inLate ? 1.8 : 1.2) + extra * 0.1],
    ['speculative', Math.max((inLate ? 1.4 : 0.9) - extra * 0.25, 0.35)],
    ['weak', Math.max((inLate ? 0.9 : 1.4) - extra * 0.22, 0.4)],
  ]) ?? 'medium';
}

function allSkillsTightenTier(tier, numPlayers){
  const order = ['premium', 'strong', 'medium', 'speculative', 'weak'];
  const idx = order.indexOf(tier);
  if(idx === -1) return 'medium';
  const bump = Math.max(Math.min(numPlayers - 2, 2), 0);
  return order[Math.min(idx + bump, order.length - 1)];
}

function allSkillsPreflopDecisionTier(node){
  if(node?.street !== 'preflop') return node?.handClass ?? 'medium';

  const order = ['premium', 'strong', 'medium', 'speculative', 'weak'];
  const idx = order.indexOf(node.handClass);
  if(idx === -1) return 'medium';

  if(node.spotType === 'preflop_open'){
    // First-in spots should tighten with field size, but not as aggressively as facing-open defense.
    const bump = Math.max(Math.min((node.numPlayers ?? 2) - 2, 1), 0);
    return order[Math.min(idx + bump, order.length - 1)];
  }

  return allSkillsTightenTier(node.handClass, node.numPlayers);
}

function allSkillsEstimateEquity(node){
  let equity = 0;
  if(node.postflopEval && node.street !== 'preflop') equity = node.postflopEval.equity;
  else if(node.handClass === 'monster') equity = 84;
  else if(node.handClass === 'strong') equity = node.street === 'river' ? 68 : 62;
  else if(node.handClass === 'marginal') equity = node.street === 'river' ? 30 : 36;
  else if(node.handClass === 'draw') equity = node.street === 'flop' ? 32 : node.street === 'turn' ? 18 : 8;
  else equity = node.street === 'river' ? 10 : 15;

  const extra = Math.max(node.numPlayers - 2, 0);
  let effectiveEquity = equity;
  if(node.handClass === 'draw') effectiveEquity = Math.max(2, Math.round(equity - equity * extra * AS_MULTIWAY_EQUITY_PENALTY));
  if(node.handClass === 'marginal') effectiveEquity = Math.max(2, Math.round(equity - equity * extra * 0.1));
  if(node.handClass === 'air') effectiveEquity = Math.max(1, Math.round(equity - equity * extra * 0.08));

  const potOdds = node.betBb ? Math.round(node.betBb / (node.potBb + node.betBb) * 100) : 0;
  return {equity, effectiveEquity, potOdds};
}

function allSkillsApplyGhostEquityPressure(math, node){
  const ghostCount = allSkillsGhostCount(node);
  if(ghostCount <= 0) return {...math, ghostEquityPenalty: 0};

  const mult = node.handClass === 'draw'
    ? 0.14
    : node.handClass === 'marginal'
      ? 0.11
      : node.handClass === 'air'
        ? 0.09
        : 0.05;
  const penalty = Math.round((math.effectiveEquity ?? math.equity ?? 0) * ghostCount * mult);
  const effectiveEquity = Math.max(1, (math.effectiveEquity ?? math.equity ?? 0) - penalty);
  return {...math, effectiveEquity, ghostEquityPenalty: penalty};
}

function allSkillsSizingStrength(handClass){
  if(handClass === 'monster') return 'monster';
  if(handClass === 'strong') return 'strong';
  if(handClass === 'marginal') return 'medium';
  if(handClass === 'draw') return 'draw';
  return 'air';
}

function allSkillsPreferredBetAction(node){
  const correctBands = correctBetSize({
    bluff: node.handClass === 'air',
    street: node.street,
    strength: allSkillsSizingStrength(node.handClass),
    numPlayers: node.numPlayers,
  });
  if(correctBands.some(k => k === 'threequarter' || k === 'pot' || k === 'over')) return node.options.includes('bet-large') ? 'bet-large' : 'bet-medium';
  if(correctBands.includes('half')) return node.options.includes('bet-medium') ? 'bet-medium' : 'bet-small';
  if(correctBands.includes('quarter')) return node.options.includes('bet-small') ? 'bet-small' : 'check';
  return node.options.includes('bet-medium') ? 'bet-medium' : 'check';
}

function allSkillsSkillBucket(node){
  if(node.street === 'preflop') return node.spotType === 'preflop_open' ? 'preflop_open' : 'preflop_defense';
  if(node.spotType === 'checked_to_hero'){
    if(node.handClass === 'air' || node.handClass === 'draw') return 'bluffing';
    return 'value';
  }
  if(node.handClass === 'draw') return 'draw_defense';
  return 'postflop_defense';
}

function postflopFamilyFromNode(node, preferredFamilyId = null){
  return postflopClassifyFamily(node, preferredFamilyId);
}

function allSkillsBuildNode(meta){
  const street = AS_STREETS[meta.streetIndex];
  const focusMatch = !!meta.focus && meta.focus.street === street;
  let activeOpponents = Math.max(meta.activeOpponents ?? Math.max((meta.numPlayers ?? 2) - 1, 1), 1);
  let numPlayers = activeOpponents + 1;
  if(AS_HEADS_UP_ONLY){
    activeOpponents = 1;
    numPlayers = 2;
  }
  const activeGhostCount = allSkillsGhostCount(meta);
  const effectivePlayers = Math.max(numPlayers, 2 + activeGhostCount);
  const boardCount = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  const boardNow = meta.boardCards.slice(0, boardCount);
  const boardTexture = street === 'preflop' ? 'n/a' : allSkillsBoardTexture(boardNow);
  const postflopEval = street === 'preflop' ? null : allSkillsEvaluatePostflopCards(meta.heroCards, boardNow, street);
  let potBb = asRound(meta.currentPotBb, 10);
  const stackLeftBb = asRound(meta.stackLeftBb, 10);

  let spotType = 'checked_to_hero';
  let handClass = 'marginal';
  let sizeBucket = null;
  let betBb = null;
  let raiseOpenBb = null;
  let preflopPos = null;
  let preflopSituation = null;
  let preflopVillainSeat = meta.villainSeat;
  let options = ['check', 'bet-small', 'bet-medium'];

  if(street === 'preflop'){
    handClass = allSkillsPickPreflopClass(meta);
    preflopPos = meta.heroSeat;
    const facingOpenChance = clamp(meta.villainModel.looseness * 0.62 + meta.villainModel.aggression * 0.24 + (meta.heroPos === 'oop' ? 0.1 : 0) + Math.max(effectivePlayers - 2, 0) * 0.06, 0.15, 0.9);
    spotType = (focusMatch && meta.focus.spotType?.startsWith('preflop')) ? meta.focus.spotType : (Math.random() < facingOpenChance ? 'preflop_facing_open' : 'preflop_open');
    if(spotType === 'preflop_facing_open' && allSkillsSeatsBefore(meta.heroSeat).length === 0) spotType = 'preflop_open';
    if(spotType === 'preflop_open' && allSkillsSeatsAfter(meta.heroSeat).length === 0) spotType = 'preflop_facing_open';
    preflopVillainSeat = allSkillsResolvePreflopVillainSeat(meta.heroSeat, spotType) ?? meta.villainSeat;
    if(spotType === 'preflop_open'){
      preflopSituation = 'unopened';
      raiseOpenBb = asRound(2.3 + Math.max(effectivePlayers - 2, 0) * 0.25, 10);
      potBb = 1.5;
      options = ['fold', 'limp', 'raise-small', 'raise-medium'];
    } else {
      sizeBucket = allSkillsPickSizing(meta.villainModel);
      raiseOpenBb = asRound(2.4 + (sizeBucket === 'small' ? 0.2 : sizeBucket === 'medium' ? 0.9 : 1.6) + Math.max(effectivePlayers - 2, 0) * 0.35, 10);
      betBb = raiseOpenBb;
      const callerPossible = allSkillsCanHaveCallerBeforeHero(meta.heroSeat, preflopVillainSeat);
      const withCaller = !AS_HEADS_UP_ONLY && numPlayers > 2 && callerPossible;
      preflopSituation = withCaller ? 'raise_caller' : 'raise';
      potBb = asRound(1.5 + raiseOpenBb + (withCaller ? raiseOpenBb : 0), 10);
      options = ['fold', 'call', 'raise-large'];
    }
  } else {
    handClass = postflopEval?.handClass ?? allSkillsPickPostflopClass(street, meta.focus, effectivePlayers);
    const betFreq = clamp(meta.villainModel.aggression * 0.63 + (meta.heroPos === 'oop' ? 0.09 : 0) + Math.max(effectivePlayers - 2, 0) * 0.04, 0.18, 0.9);
    spotType = (focusMatch && meta.focus.spotType && !meta.focus.spotType.startsWith('preflop'))
      ? meta.focus.spotType
      : (Math.random() < betFreq ? 'facing_bet' : 'checked_to_hero');
    if(spotType === 'checked_to_hero'){
      if(handClass === 'monster' || handClass === 'strong') options = ['check', 'bet-small', 'bet-medium', 'bet-large'];
      else if(handClass === 'draw') options = ['check', 'bet-small', 'bet-medium', 'bet-large'];
      else if(handClass === 'marginal') options = ['check', 'bet-small', 'bet-medium'];
      else options = ['check', 'bet-small', 'bet-medium'];
    } else {
      sizeBucket = allSkillsPickSizing(meta.villainModel);
      const pct = sizeBucket === 'small' ? 0.33 : sizeBucket === 'medium' ? 0.58 : 0.86;
      const pressure = 1 + Math.max(effectivePlayers - 2, 0) * 0.06;
      betBb = asRound(potBb * pct * pressure, 10);
      options = ['fold', 'call', 'raise-small', 'raise-large'];
    }
  }

  let node = {
    street,
    spotType,
    handClass,
    boardTexture,
    potBb,
    betBb,
    sizeBucket,
    raiseOpenBb,
    preflopPos,
    preflopSituation,
    stackLeftBb,
    options,
    heroSeat: meta.heroSeat,
    villainSeat: street === 'preflop' ? preflopVillainSeat : meta.villainSeat,
    heroPos: meta.heroPos,
    villainType: meta.villainType,
    villainLabel: meta.villainModel.label,
    villainModel: meta.villainModel,
    numPlayers,
    activeOpponents,
    activeGhostCount,
    effectivePlayers,
    postflopEval,
  };

  if(spotType === 'facing_bet'){
    const headsUpMath = allSkillsEstimateEquity(node);
    const ghostMath = allSkillsApplyGhostEquityPressure(headsUpMath, node);
    node = {...node, ...ghostMath, headsUpEffectiveEquity: headsUpMath.effectiveEquity};
  }

  const headsUpBaselineNode = allSkillsGhostCount(node) > 0
    ? {
      ...node,
      activeGhostCount: 0,
      effectivePlayers: node.numPlayers,
      effectiveEquity: node.headsUpEffectiveEquity ?? node.effectiveEquity,
    }
    : node;
  const baseline = allSkillsBaselineDecision(headsUpBaselineNode);
  const ghostAdjustedBaseline = allSkillsApplyGhostPressure(node, baseline);
  const exploit = allSkillsExploitDecision(node, ghostAdjustedBaseline);
  const skillBucket = allSkillsSkillBucket(node);
  const familyClass = postflopFamilyFromNode(node, meta.familyId ?? meta.targetFamilyId ?? meta.focus?.key ?? null);
  return {
    ...node,
    baseline: ghostAdjustedBaseline,
    baselineHeadsUp: baseline,
    ghostAdjustedBaseline,
    ghostApplied: !!ghostAdjustedBaseline.ghostApplied,
    ghostReason: ghostAdjustedBaseline.ghostReason ?? '',
    exploit,
    skillBucket,
    postflopFamilyId: familyClass.familyId,
    postflopFamilyMatched: familyClass.matched,
    postflopFamilyMatchCount: familyClass.matchCount,
    focusKey: `${street}|${spotType}|${skillBucket}`,
  };
}

function allSkillsMapPreflopDecision(node, decision){
  if(node.spotType === 'preflop_open'){
    if(decision.action === 'raise'){
      if(node.handClass === 'speculative') return {action: 'raise-small', reason: decision.why};
      return {action: 'raise-medium', reason: decision.why};
    }
    if(decision.action === 'call') return {action: 'limp', reason: decision.why};
    return {action: 'fold', reason: decision.why};
  }
  if(decision.action === 'raise') return {action: 'raise-large', reason: decision.why};
  if(decision.action === 'call') return {action: 'call', reason: decision.why};
  return {action: 'fold', reason: decision.why};
}

function allSkillsBaselineDecision(node){
  const ip = node.heroPos === 'ip';
  if(node.street === 'preflop'){
    const tightTier = allSkillsPreflopDecisionTier(node);
    const raiseAmt = Math.max(2, Math.round(node.raiseOpenBb ?? 3));
    const decision = getDecision(tightTier, node.preflopPos, node.preflopSituation, raiseAmt);
    const mapped = allSkillsMapPreflopDecision(node, decision);
    const pressureNote = node.numPlayers > 2
      ? (node.spotType === 'preflop_open'
        ? `${Math.max(node.numPlayers - 1, 1)} players behind — tighten up here.`
        : `${node.numPlayers}-way pot — tighten up here.`)
      : '';
    const reason = pressureNote ? `${mapped.reason} ${pressureNote}` : mapped.reason;
    return {action: mapped.action, reason, decisionTier: tightTier};
  }

  if(node.spotType === 'checked_to_hero'){
    if(node.handClass === 'monster') {
      const reasons = [
        `Nutted (very strong) hands must push for value and deny free cards on a ${node.boardTexture} board.`,
        `You have a monster on a ${node.boardTexture} board. Build the pot now; don't give cheap cards.`,
        `With a massive hand, bet to extract value from worse hands and protect your equity.`
      ];
      return {action: node.boardTexture === 'wet' ? 'bet-large' : allSkillsPreferredBetAction(node), reason: randItem(reasons)};
    }
    if(node.handClass === 'strong') {
      const reasons = [
        `Strong made hands should value-bet while protecting against bad runouts.`,
        `Charge them to see the next card. Strong hands need value and protection.`,
        `You're likely ahead. Bet to get called by worse and defend against draws.`
      ];
      return {action: allSkillsPreferredBetAction(node), reason: randItem(reasons)};
    }
    if(node.handClass === 'draw'){
      if(node.numPlayers > 2) {
        const reasons = [
          `In a ${node.numPlayers}-way pot, your draw equity shrinks. Avoid over-bluffing.`,
          `Multiway pressure means folds are less likely. Pot control and try to hit cheaply.`,
          `With multiple opponents, checking your draw is safer than aggressively semi-bluffing.`
        ];
        return {action: 'check', reason: randItem(reasons)};
      }
      const reasons = [
        `Semi-bluffing your draw gives you two ways to win: they fold, or you hit.`,
        `Apply pressure with your draw. Fold equity plus real equity makes this profitable.`,
        `Betting your draw builds the pot for when you hit and can force folds right now.`
      ];
      return {action: allSkillsPreferredBetAction(node), reason: randItem(reasons)};
    }
    if(node.handClass === 'marginal') {
      const reasons = [
        `Marginal showdown value (like middle pair) prefers pot control. Check to keep the pot small.`,
        `A marginal hand usually folds out worse and gets called by better if you bet. Check it.`,
        `You have some value but not enough to bet. Check and try to get to showdown cheaply.`
      ];
      return {action: 'check', reason: randItem(reasons)};
    }
    const reasons = ip && node.boardTexture === 'dry' ? [
      `Air (no value) can profitably stab dry boards when in position.`,
      `In position on a dry board, a small bet often takes it down even with air.`,
      `Use your positional advantage to bluff this dry texture.`
    ] : [
      `With air (nothing but hope) out of position or on a messy board, just give up and check.`,
      `You missed completely. Check and prepare to fold.`,
      `Don't force a bluff without position or equity. Checking is the baseline line here.`
    ];
    return {action: ip && node.boardTexture === 'dry' ? 'bet-small' : 'check', reason: randItem(reasons)};
  }

  const hasPrice = (node.effectiveEquity ?? 0) >= (node.potOdds ?? 100);
  if(node.handClass === 'monster') {
    const reasons = [
      `Monsters versus a bet should raise to build the pot quickly.`,
      `You have a premium hand. Punish their aggression by raising.`,
      `Don't slowplay massive hands against action—get the money in.`
    ];
    return {action: 'raise-large', reason: randItem(reasons)};
  }
  if(node.handClass === 'strong'){
    if(node.sizeBucket === 'small' && node.options.includes('raise-small')) {
      const reasons = [
        `Strong hand versus a small sizing can extract value with a raise.`,
        `Their bet is small enough that a value raise is highly profitable here.`,
        `Punish small bets with your strong hands to deny good odds.`
      ];
      return {action: 'raise-small', reason: randItem(reasons)};
    }
    const reasons = [
      `A strong hand acts as a great bluff-catcher or value hand; comfortably call here.`,
      `Call with your strong hand. Keep their bluffs in and control the pot size.`,
      `You are well ahead of their bluffs. Just call to see the next street.`
    ];
    return {action: 'call', reason: randItem(reasons)};
  }
  if(node.handClass === 'draw'){
    if(hasPrice) {
      const reasons = [
        `Pot odds require ${node.potOdds}% and your discounted draw equity is ~${node.effectiveEquity}%. Easy call.`,
        `You are getting the right price (${node.potOdds}%) to chase your draw (~${node.effectiveEquity}%).`,
        `The math checks out. Call to complete your draw.`
      ];
      return {action: 'call', reason: randItem(reasons)};
    }
    const reasons = [
      `You need ${node.potOdds}% but discounted draw equity is only ~${node.effectiveEquity}%. Fold.`,
      `The bet is too big. Your draw (~${node.effectiveEquity}%) misses the required odds (${node.potOdds}%).`,
      `You aren't getting the right price to chase this draw. Let it go.`
    ];
    return {action: 'fold', reason: randItem(reasons)};
  }
  if(node.handClass === 'marginal'){
    if(hasPrice) {
      const reasons = node.sizeBucket === 'small'
        ? [
          `Small sizing gives enough price (${node.potOdds}%) to defend this marginal bluff-catcher.`,
          `You can afford to look them up with marginal value because the bet is small.`,
          `At these odds, your bluff-catcher is a profitable call.`
        ]
        : [
          `You need ${node.potOdds}% and your discounted equity is ~${node.effectiveEquity}%. Defend with a call.`,
          `Price is acceptable here (${node.potOdds}% required vs ~${node.effectiveEquity}% equity). Calling is best.`,
          `This is a marginal bluff-catcher, but the pot odds justify a call at this sizing.`
        ];
      return {action: 'call', reason: randItem(reasons)};
    }
    const reasons = [
      `Marginal hands should fold to heavy pressure unless the price is amazing.`,
      `Your hand is too weak to call a real bet. Fold and wait for a better spot.`,
      `Don't pay off big bets with mere bluff-catchers.`
    ];
    return {action: 'fold', reason: randItem(reasons)};
  }
  const reasonsAir = [
    `Air (no showdown value) should instantly fold against aggression.`,
    `You have nothing, and they bet. It's a clear fold.`,
    `Don't get stubborn with air. Fold and move on.`
  ];
  return {action: 'fold', reason: randItem(reasonsAir)};
}

function allSkillsActionLadder(node){
  if(node.street === 'preflop' && node.spotType === 'preflop_open') return ['fold', 'limp', 'raise-small', 'raise-medium'];
  if(node.street === 'preflop') return ['fold', 'call', 'raise-large'];
  if(node.spotType === 'checked_to_hero') return ['check', 'bet-small', 'bet-medium', 'bet-large'];
  return ['fold', 'call', 'raise-small', 'raise-large'];
}

function allSkillsStepAction(node, action, direction){
  const ladder = allSkillsActionLadder(node).filter(a => node.options.includes(a));
  const idx = ladder.indexOf(action);
  if(idx === -1) return action;
  return ladder[clamp(idx + direction, 0, ladder.length - 1)];
}

function allSkillsContextCue(node){
  const handLabel = {
    premium: 'a premium hand',
    medium: 'a medium-strength hand',
    speculative: 'a speculative hand',
    air: 'air',
    draw: 'a draw',
    marginal: 'a marginal made hand',
    strong: 'a strong made hand',
    monster: 'a monster hand',
    weak: 'a weak hand',
  };

  const handTier = node.street === 'preflop' ? allSkillsPreflopDecisionTier(node) : node.handClass;

  const spot = node.street === 'preflop'
    ? (node.spotType === 'preflop_open' ? 'first-in preflop' : `preflop defense versus a ${node.sizeBucket ?? 'standard'} open`)
    : (node.spotType === 'checked_to_hero'
      ? `checked-to-you ${allSkillsStreetTitle(node.street).toLowerCase()} spot`
      : `facing a ${node.sizeBucket ?? 'standard'} bet on the ${node.street}`);

  const texture = node.street === 'preflop' ? 'preflop dynamics' : `${node.boardTexture} board`;
  const textureClause = node.street === 'preflop' ? `in ${texture}` : `on a ${texture}`;
  const effectivePlayers = allSkillsEffectivePlayers(node);
  const players = node.street === 'preflop' && node.spotType === 'preflop_open'
    ? `${Math.max(effectivePlayers, 2)}-max dynamics with ${Math.max(effectivePlayers - 1, 1)} behind`
    : (effectivePlayers > 2 ? `${effectivePlayers}-way dynamics` : 'heads-up pot');
  return `${spot} with ${handLabel[handTier] ?? handTier} ${textureClause} in a ${players}.`;
}

function allSkillsBuildSituationText(node, meta, heroSeat, villainSeat, villainName){
  const heroSeatInfo = POS_INFO[heroSeat];
  const villainSeatInfo = POS_INFO[villainSeat];
  const ghostLine = allSkillsGhostContextLine(node);

  if(node.street === 'preflop'){
    if(node.spotType === 'preflop_open'){
      return `You are first to act preflop in ${heroSeatInfo?.short ?? heroSeat.toUpperCase()}. ${villainName} is the likely defender from ${villainSeatInfo?.short ?? villainSeat.toUpperCase()}.` + ghostLine;
    }

    const callerNote = node.preflopSituation === 'raise_caller' ? ' One player has already called the open.' : '';
    return `${villainName} opens ${node.sizeBucket} to ${node.betBb}bb from ${villainSeatInfo?.short ?? villainSeat.toUpperCase()}. You act from ${heroSeatInfo?.short ?? heroSeat.toUpperCase()} (${meta.heroPos === 'ip' ? 'IP' : 'OOP'}).${callerNote}` + ghostLine;
  }

  if(node.spotType === 'checked_to_hero'){
    return `${villainName} checks on a ${node.boardTexture} board. Pick your continuation action.` + ghostLine;
  }

  return `${villainName} bets ${node.sizeBucket} (${node.betBb}bb) into ${node.potBb}bb on a ${node.boardTexture} board.` + ghostLine;
}

function allSkillsFallbackExploitReason(node){
  const context = allSkillsContextCue(node);
  return randItem([
    `No exploit adjustment is selected for this exact combo, so keep the baseline line (your default solid strategy). ${context}`,
    `Villain profile is accounted for, but this hand class and price point keep baseline best. ${context}`,
    `Exploit lane is neutral for this node, so stay with baseline strategy. ${context}`,
  ]);
}

function allSkillsRepetitionBooster(node){
  if(node.street === 'preflop'){
    if(node.spotType === 'preflop_open') return 'Quick check: position first, hand tier second.';
    return 'Quick check: defend tighter out of position and versus larger opens.';
  }

  if(node.spotType === 'facing_bet'){
    if(node.handClass === 'draw') return 'Quick check: continue only when discounted equity beats pot odds.';
    if(node.handClass === 'marginal') return 'Quick check: list realistic bluffs before calling with bluff-catchers.';
    return 'Quick check: compare their sizing with how thin their value range can be.';
  }

  if(node.spotType === 'checked_to_hero'){
    if(node.handClass === 'air') return 'Quick check: bluff more on dry heads-up boards and less in sticky pools.';
    if(node.handClass === 'strong' || node.handClass === 'monster') return 'Quick check: choose the largest size worse hands still call.';
    return 'Quick check: decide between value, bluff, or pot control before clicking.';
  }

  return 'Quick check: anchor to position, hand class, and player count.';
}

function allSkillsSkillTagFocus(skillTag){
  if(!skillTag) return 'General decision quality and consistency.';

  const [street, spotType, skillBucket] = skillTag.split('|');
  const spotMap = {
    preflop_open: 'opening first-in ranges',
    preflop_facing_open: 'defending versus opens',
    checked_to_hero: 'initiative and c-bet planning',
    facing_bet: 'bet defense and bluff-catching',
  };
  const bucketMap = {
    preflop_open: 'opening discipline',
    preflop_defense: 'preflop defense',
    value: 'value extraction and sizing',
    bluffing: 'bluff selectivity',
    draw_defense: 'draw math under pressure',
    postflop_defense: 'postflop bluff-catcher discipline',
  };

  const streetLabel = allSkillsStreetTitle(street ?? 'preflop');
  const bucketLabel = bucketMap[skillBucket] ?? (skillBucket ? skillBucket.replace(/_/g, ' ') : 'decision quality');
  const spotLabel = spotMap[spotType] ?? 'spot execution';
  return `${streetLabel}: ${bucketLabel}. Primary focus: ${spotLabel}.`;
}

function allSkillsApplyGhostPressure(node, baseline){
  const ghostCount = allSkillsGhostCount(node);
  if(ghostCount <= 0) return {...baseline, ghostApplied: false, ghostReason: ''};

  const effectivePlayers = allSkillsEffectivePlayers(node);
  let action = baseline.action;
  let ghostReason = '';

  if(node.street === 'preflop'){
    if(node.spotType === 'preflop_open'){
      if((node.handClass === 'speculative' || node.handClass === 'weak') && action !== 'fold' && node.options.includes('fold')){
        action = 'fold';
        ghostReason = `extra field pressure trims speculative first-in opens`;
      } else if(node.handClass === 'medium' && ghostCount >= 2 && action.startsWith('raise') && node.options.includes('fold')){
        action = 'fold';
        ghostReason = `medium first-in opens are over-defended less often in crowded dynamics`;
      }
    } else if(node.spotType === 'preflop_facing_open' && action === 'call' && node.options.includes('fold')){
      const tightenSpeculative = node.handClass === 'speculative' && ghostCount >= 1;
      const tightenMedium = node.handClass === 'medium' && (ghostCount >= 2 || node.sizeBucket === 'large');
      if(tightenSpeculative || tightenMedium){
        action = 'fold';
        ghostReason = `defense frequencies tighten as extra players increase squeeze and domination risk`;
      }
    }
  } else if(node.spotType === 'checked_to_hero'){
    if(node.handClass === 'air' && allSkillsIsAggro(action)){
      action = 'check';
      ghostReason = `fold equity drops when more ranges can continue`;
    } else if(node.handClass === 'draw' && allSkillsIsAggro(action) && ghostCount >= 2){
      action = 'check';
      ghostReason = `semi-bluffs lose too much realization in larger fields`;
    }
  } else if(node.spotType === 'facing_bet'){
    if(action === 'call' && node.options.includes('fold')){
      const foldDraw = node.handClass === 'draw' && node.sizeBucket !== 'small';
      const foldMarginal = node.handClass === 'marginal' && (ghostCount >= 2 || node.sizeBucket === 'large');
      if(foldDraw || foldMarginal){
        action = 'fold';
        ghostReason = `continuing ranges must be stronger against ghost multiway pressure`;
      }
    }
    if(node.handClass === 'draw' && action.startsWith('raise') && node.options.includes('call')){
      action = 'call';
      ghostReason = `draw raises lose EV when additional ranges can continue`;
    }
  }

  if(action === baseline.action) return {...baseline, ghostApplied: false, ghostReason: ''};
  if(!node.options.includes(action)) return {...baseline, ghostApplied: false, ghostReason: ''};

  const reason = `${baseline.reason} Ghost adjustment (${effectivePlayers}-way dynamics): ${ghostReason}.`;
  return {action, reason, decisionTier: baseline.decisionTier, ghostApplied: true, ghostReason};
}

function allSkillsExploitDecision(node, baseline){
  const v = node.villainType;
  const effectivePlayers = allSkillsEffectivePlayers(node);
  const hasGhostPressure = allSkillsGhostCount(node) > 0;
  let action = baseline.action;
  let reason = baseline.reason;

  if(node.street === 'preflop' && node.spotType === 'preflop_facing_open'){
    if(v === 'maniac'){
      if((node.handClass === 'medium' || node.handClass === 'speculative') && node.preflopPos === 'btn' && node.options.includes('call') && node.sizeBucket !== 'large'){
        action = 'call';
        reason = randItem([
          `Exploit trigger active: Maniac opens wide from this seat. Defend wider in position; call is best with occasional 3-bet mix.`,
          `Maniac profile widens your profitable defense range. Call this in position and mix some 3-bets over time.`,
          `Against a Maniac open, this combo performs well enough in position to defend by calling.`
        ]);
      }
      if(node.handClass === 'strong' && node.options.includes('raise-large') && node.sizeBucket !== 'large'){
        action = 'raise-large';
        reason = randItem([
          `Exploit trigger active: versus a Maniac, pressure strong hands with more preflop 3-bets.`,
          `Maniac opens too wide, so strong hands can 3-bet more aggressively for value.`,
          `Punish the Maniac's loose open with a value-heavy 3-bet.`
        ]);
      }
    }
    if(v === 'lag' && node.options.includes('call')){
      if((node.handClass === 'medium' || node.handClass === 'speculative') && (node.preflopPos === 'btn' || node.preflopPos === 'co') && node.sizeBucket === 'small'){
        action = 'call';
        reason = randItem([
          `Exploit trigger active: LAG opens wider and smaller here. Defend this combo in position by calling.`,
          `Against a LAG small open, this hand can profitably continue in position as a call.`,
          `LAG pressure is high but range is wide; continue by calling and realize equity in position.`
        ]);
      }
    }
    if(v === 'tag' && (node.handClass === 'medium' || node.handClass === 'speculative') && baseline.action === 'call'){
      action = 'fold';
      reason = randItem([
        `Exploit trigger active: TAG opens tighter, so trim this preflop defense and fold.`,
        `TAG range strength is higher here; fold this borderline defend hand preflop.`,
        `Respect the TAG's tighter opening range and avoid a marginal defend.`
      ]);
    }
  }

  if(v === 'lp'){
    if(node.spotType === 'checked_to_hero' && (node.handClass === 'strong' || node.handClass === 'monster') && allSkillsIsAggro(action)){
      action = allSkillsStepAction(node, action, 1);
      reason = randItem([
        `Loose-passive players call too wide. Size up your value bets.`,
        `${node.villainLabel}s hate folding. Bet bigger for max value.`,
        `Exploit their loose calling range by making your value bets larger.`
      ]);
    }
    if(node.spotType === 'checked_to_hero' && node.handClass === 'air' && allSkillsIsAggro(action)){
      action = 'check';
      reason = randItem([
        `Loose-passive players under-fold, so don't run low-equity bluffs.`,
        `Never bluff a calling station. Check your air.`,
        `${node.villainLabel}s will look you up. Give up the bluff.`
      ]);
    }
  }

  if(v === 'tag'){
    if(node.spotType === 'checked_to_hero' && node.handClass === 'air' && allSkillsIsAggro(action)){
      action = allSkillsStepAction(node, action, -1);
      reason = randItem([
        `TAG ranges defend properly. Trim down your speculative stabs.`,
        `Don't over-bluff solid players. Reduce sizing or give up.`,
        `Against a TAG, bluffing requires caution. Scale back.`
      ]);
    }
    if(node.spotType === 'facing_bet' && node.handClass === 'marginal' && action === 'call'){
      action = 'fold';
      reason = randItem([
        `Tight aggression means their value range is heavy. Fold marginal catchers.`,
        `TAGs don't bluff enough here to justify calling with a marginal hand.`,
        `Respect the TAG's bet—your bluff-catcher is likely dead.`
      ]);
    }
  }

  if(v === 'lag'){
    if(node.spotType === 'facing_bet' && node.handClass === 'strong' && action === 'call' && node.options.includes('raise-small')){
      action = 'raise-small';
      reason = randItem([
        `LAGs over-barrel. Punish them with thin value raises.`,
        `${node.villainLabel}s bet too much. Raise them for extra value.`,
        `Extract from their wide bluffing range by raising.`
      ]);
    }
    if(node.spotType === 'facing_bet' && node.handClass === 'draw' && action === 'fold' && node.sizeBucket !== 'large'){
      action = 'call';
      reason = randItem([
        `Wide aggression means you have better implied odds for draws.`,
        `LAGs overplay early streets, making your draw more profitable.`,
        `Continue against LAGs wider; your draw has extra value if you hit.`
      ]);
    }
  }

  if(v === 'maniac'){
    if(node.spotType === 'facing_bet' && node.handClass === 'strong'){
      action = node.sizeBucket === 'large' ? 'call' : 'raise-small';
      reason = randItem([
        `Maniacs over-bluff drastically. Defend wider and punish small bets.`,
        `Let the Maniac hang themselves with bluffs, or raise if they bet small.`,
        `Extract max value from the Maniac's crazy range.`
      ]);
    }
    if(node.spotType === 'checked_to_hero' && node.handClass === 'monster' && node.options.includes('bet-large')){
      action = 'bet-large';
      reason = randItem([
        `Versus mania, maximize value with large, punishing bets.`,
        `Maniacs don't respect sizing. Bet as big as possible with your monster.`,
        `Go for maximum extraction against a player who loves to click buttons.`
      ]);
    }
  }

  if(effectivePlayers > 2){
    if(node.spotType === 'facing_bet' && (node.handClass === 'draw' || node.handClass === 'marginal') && action === 'call' && node.sizeBucket !== 'small'){
      action = 'fold';
      reason = randItem([
        `${effectivePlayers}-way pressure tightens defense logic. Fold here.`,
        `With multiple players, bluffs drop. Respect the bet and fold marginal hands.`,
        `Multiway pots demand stronger hands to continue. Let it go.`
      ]);
    }
    if(node.handClass === 'air' && allSkillsIsAggro(action)){
      action = allSkillsStepAction(node, action, -1);
      reason = randItem([
        `${effectivePlayers}-way dynamics reduce bluff success. Scale back aggression.`,
        `Don't run big bluffs into crowded fields. Reduce your sizing.`,
        `Fewer bluffs work against multiple opponents. Tone it down.`
      ]);
    }
    if(node.handClass === 'draw' && action.startsWith('raise')){
      action = 'call';
      reason = randItem([
        `Multiway pots discount draw equity. Prefer calling over variance-heavy raises.`,
        `Don't bloat the pot with a draw against multiple opponents. Just call.`,
        `Keep it cheap with your draw in a crowded pot.`
      ]);
    }
  }

  if(!node.options.includes(action)) return {action: baseline.action, reason: baseline.reason};
  const changed = action !== baseline.action || reason !== baseline.reason;
  if(!changed) return {action: baseline.action, reason: allSkillsFallbackExploitReason(node)};
  if(hasGhostPressure) reason = `${reason} Ghost-aware baseline considered ${effectivePlayers}-way dynamics.`;
  return {action, reason};
}

function allSkillsDetectFatal(node, action){
  if(node.spotType === 'preflop_open' && action === 'limp' && node.handClass === 'weak'){
    return {isFatal: true, code: 'limp_trash', message: 'Fatal error: open-limping weak trash is a major leak.'};
  }
  if(node.spotType === 'facing_bet' && node.sizeBucket === 'small' && (node.handClass === 'strong' || node.handClass === 'monster') && action === 'fold'){
    return {isFatal: true, code: 'fold_strong_small', message: 'Fatal error: folding a strong hand to a small bet is a severe under-defense.'};
  }
  if(node.spotType === 'facing_bet' && node.handClass === 'air' && (action === 'call' || action.startsWith('raise')) && node.betBb && node.stackLeftBb > 0 && (node.betBb / node.stackLeftBb) >= AS_FATAL_COMMIT_RATIO){
    return {isFatal: true, code: 'air_stack_off', message: 'Fatal error: committing a large stack share with air is a hard punt.'};
  }
  return {isFatal: false, code: null, message: ''};
}

function allSkillsScoreAction(node, action){
  const baseline = node.baseline.action;
  const exploit = node.exploit.action;
  const isBest = action === exploit;
  const isBaseline = action === baseline;
  const isCorrect = isBest || isBaseline;
  const score = isBest ? 1 : isBaseline ? 0.8 : 0;
  let reason = '';
  const actionLabel = allSkillsActionLabel(action);
  const exploitLabel = allSkillsActionLabel(exploit);

  if(isBest) reason = `Decision: ${exploitLabel}. Principle: ${node.baseline.reason} Exploit note: ${node.exploit.reason}`;
  else if(isBaseline) reason = `Decision: ${actionLabel} (baseline-correct). Principle: baseline means your default solid strategy: ${node.baseline.reason} Exploit note: versus ${node.villainLabel}, the higher-EV adjustment was ${exploitLabel}. ${node.exploit.reason}`;
  else reason = `Decision: ${actionLabel} was not optimal. Principle: ${node.baseline.reason} Exploit note: best line was ${exploitLabel}. ${node.exploit.reason}`;

  return {action, isCorrect, score, reason, bestAction: exploit, baselineAction: baseline, skillTag: `${node.street}|${node.spotType}|${node.skillBucket}`};
}

function allSkillsActionCommit(node, action){
  if(typeof action !== 'string' || action.length === 0) return 0;
  if(action === 'fold' || action === 'check') return 0;
  if(action === 'limp') return 1;

  if(node.street === 'preflop'){
    const effectivePlayers = allSkillsEffectivePlayers(node);
    if(node.spotType === 'preflop_open'){
      if(action === 'raise-small') return asRound(2.4 + Math.max(effectivePlayers - 2, 0) * 0.2, 10);
      if(action === 'raise-medium') return asRound(3.1 + Math.max(effectivePlayers - 2, 0) * 0.3, 10);
    }
    if(action === 'call') return asRound(node.betBb ?? 2.6, 10);
    if(action === 'raise-large') return asRound((node.betBb ?? 2.8) * 2.4, 10);
  }

  if(action === 'call') return asRound(node.betBb ?? (node.potBb * 0.4), 10);

  if(action.startsWith('bet')){
    const pct = action.endsWith('small') ? 0.3 : action.endsWith('medium') ? 0.58 : 0.85;
    return asRound(node.potBb * pct, 10);
  }

  if(action.startsWith('raise')){
    const pct = action.endsWith('small') ? 0.55 : action.endsWith('medium') ? 0.8 : 1.1;
    const base = node.betBb ?? asRound(node.potBb * 0.45, 10);
    return asRound(base + node.potBb * pct, 10);
  }

  // Unknown action token should not affect stack/pot progression.
  return 0;
}

function allSkillsNextPot(node, action, commit){
  if(action === 'fold' || action === 'check') return asRound(node.potBb, 10);
  if(action === 'limp') return asRound(node.potBb + commit * Math.max(node.numPlayers - 1, 1), 10);
  if(action === 'call'){
    const toCall = node.betBb ?? commit;
    return asRound(node.potBb + toCall * 2, 10);
  }
  if(allSkillsIsAggro(action)) return asRound(node.potBb + commit * 2, 10);
  return asRound(node.potBb + commit, 10);
}

function allSkillsActiveOpponents(meta){
  const raw = Number.isFinite(meta?.activeOpponents)
    ? meta.activeOpponents
    : (meta?.numPlayers ?? 2) - 1;
  return Math.max(1, Math.round(raw));
}

function allSkillsApplyOpponentAttrition(activeOpponents, chance, minRemaining = 1){
  if(activeOpponents <= minRemaining) return activeOpponents;
  let remaining = activeOpponents;
  const foldChance = clamp(chance, 0.02, 0.92);
  for(let i = 0; i < activeOpponents; i++){
    if(remaining <= minRemaining) break;
    if(Math.random() < foldChance) remaining -= 1;
  }
  return clamp(remaining, minRemaining, activeOpponents);
}

function allSkillsOpponentWord(count){
  return count === 1 ? 'opponent' : 'opponents';
}

function allSkillsResolve(meta, node, scored, fatalInfo){
  const startingOpponents = allSkillsActiveOpponents(meta);
  const startingGhostCount = allSkillsGhostCount(meta);
  const startingEffectivePlayers = Math.max(startingOpponents + 1, 2 + startingGhostCount);
  const entry = {
    street: node.street,
    spotType: node.spotType,
    skillBucket: node.skillBucket,
    numPlayers: node.numPlayers,
    activeOpponents: startingOpponents,
    activeGhostCount: startingGhostCount,
    effectivePlayers: startingEffectivePlayers,
    postflopFamilyId: node.postflopFamilyId ?? null,
    action: scored.action,
    isCorrect: scored.isCorrect,
    score: scored.score,
    reason: scored.reason,
    bestAction: scored.bestAction,
    baselineAction: scored.baselineAction,
    fatal: fatalInfo.isFatal,
    fatalCode: fatalInfo.code,
    fatalReason: fatalInfo.message,
  };
  let nextMeta = {...meta, history: [...meta.history, entry]};

  if(fatalInfo.isFatal){
    nextMeta = {...nextMeta, ended: true, activeGhostCount: startingGhostCount, effectivePlayers: startingEffectivePlayers};
    return {meta: nextMeta, ended: true, fatal: true, text: 'Fatal error detected. Hand terminated and score capped.'};
  }

  if(scored.action === 'fold'){
    nextMeta = {...nextMeta, ended: true, activeGhostCount: startingGhostCount, effectivePlayers: startingEffectivePlayers};
    return {meta: nextMeta, ended: true, fatal: false, text: 'You folded. Hand ends immediately.'};
  }

  const heroCommitRaw = allSkillsActionCommit(node, scored.action);
  const heroCommit = asRound(Math.min(heroCommitRaw, meta.stackLeftBb), 10);
  const nextPot = allSkillsNextPot(node, scored.action, heroCommit);
  const nextStack = asRound(Math.max(meta.stackLeftBb - heroCommit, 0), 10);
  let nextActiveOpponents = startingOpponents;
  let transitionNote = '';

  if(allSkillsIsAggro(scored.action)){
    const size = allSkillsSizeBucket(scored.action);
    const sizeAdj = size === 'large' ? 0.14 : size === 'small' ? -0.06 : 0;
    let foldChance = clamp(meta.villainModel.foldToAggro + sizeAdj + (Math.random() - 0.5) * 0.08, 0.08, 0.85);
    if(startingEffectivePlayers > 2) foldChance *= clamp(1 - (startingEffectivePlayers - 2) * 0.09, 0.65, 1);
    if(meta.streetIndex <= meta.targetStreet) foldChance *= AS_DEEP_STREET_FOLD_MULT;
    if(Math.random() < foldChance){
      if(startingOpponents <= 1){
        nextMeta = {...nextMeta, ended: true, currentPotBb: nextPot, stackLeftBb: nextStack, activeOpponents: 0, numPlayers: 1, activeGhostCount: startingGhostCount, effectivePlayers: Math.max(1, 2 + startingGhostCount)};
        return {meta: nextMeta, ended: true, fatal: false, text: 'Villain folds to pressure. Hand ends.'};
      }

      const crowdFoldChance = size === 'large' ? 0.56 : size === 'small' ? 0.36 : 0.47;
      nextActiveOpponents = allSkillsApplyOpponentAttrition(startingOpponents, crowdFoldChance, 0);
      if(nextActiveOpponents <= 0){
        nextMeta = {...nextMeta, ended: true, currentPotBb: nextPot, stackLeftBb: nextStack, activeOpponents: 0, numPlayers: 1, activeGhostCount: startingGhostCount, effectivePlayers: Math.max(1, 2 + startingGhostCount)};
        return {meta: nextMeta, ended: true, fatal: false, text: 'Your pressure folds out the whole field. Hand ends.'};
      }

      if(nextActiveOpponents >= startingOpponents) nextActiveOpponents = startingOpponents - 1;
      const folded = startingOpponents - nextActiveOpponents;
      transitionNote = `${folded} ${allSkillsOpponentWord(folded)} folded to pressure. ${nextActiveOpponents} ${allSkillsOpponentWord(nextActiveOpponents)} continue.`;
    }
  }

  if(nextActiveOpponents > 1){
    const attritionChance = node.spotType === 'facing_bet' ? 0.18 : 0.12;
    const afterAttrition = allSkillsApplyOpponentAttrition(nextActiveOpponents, attritionChance, 1);
    if(afterAttrition < nextActiveOpponents){
      const peeled = nextActiveOpponents - afterAttrition;
      nextActiveOpponents = afterAttrition;
      const attritionNote = `${peeled} ${allSkillsOpponentWord(peeled)} peeled off this street.`;
      transitionNote = transitionNote ? `${transitionNote} ${attritionNote}` : attritionNote;
    }
  }

  const nextNumPlayers = Math.max(nextActiveOpponents + 1, 2);
  const nextEffectivePlayers = Math.max(nextNumPlayers, 2 + startingGhostCount);

  if(nextStack <= 0){
    nextMeta = {...nextMeta, ended: true, currentPotBb: nextPot, stackLeftBb: nextStack, activeOpponents: nextActiveOpponents, numPlayers: nextNumPlayers, activeGhostCount: startingGhostCount, effectivePlayers: nextEffectivePlayers};
    return {meta: nextMeta, ended: true, fatal: false, text: 'Stacks are in. Hand goes to showdown.'};
  }

  if(meta.streetIndex >= 3){
    nextMeta = {...nextMeta, ended: true, currentPotBb: nextPot, stackLeftBb: nextStack, activeOpponents: nextActiveOpponents, numPlayers: nextNumPlayers, activeGhostCount: startingGhostCount, effectivePlayers: nextEffectivePlayers};
    return {meta: nextMeta, ended: true, fatal: false, text: 'River complete. Hand goes to showdown.'};
  }

  nextMeta = {
    ...nextMeta,
    streetIndex: meta.streetIndex + 1,
    currentPotBb: nextPot,
    stackLeftBb: nextStack,
    activeOpponents: nextActiveOpponents,
    numPlayers: nextNumPlayers,
    activeGhostCount: startingGhostCount,
    effectivePlayers: nextEffectivePlayers,
  };
  const fieldNote = nextEffectivePlayers !== allSkillsEffectivePlayers(node) ? `Field now ${nextEffectivePlayers}-way dynamics.` : '';
  const travelText = `Proceed to ${allSkillsStreetTitle(AS_STREETS[nextMeta.streetIndex])}.`;
  const text = [transitionNote, fieldNote, travelText].filter(Boolean).join(' ');
  return {meta: nextMeta, ended: false, fatal: false, text};
}

function allSkillsSummarize(meta){
  const history = meta.history;
  const maxPoints = 4 - meta.startStreetIndex;
  const rawPoints = history.reduce((s, h) => s + h.score, 0);
  const fatalEntry = history.find(h => h.fatal);
  const fatalCapPoints = asRound(AS_FATAL_CAP_MULT * maxPoints, 10);
  const points = fatalEntry ? Math.min(rawPoints, fatalCapPoints) : rawPoints;

  const streetMarks = {preflop: '—', flop: '—', turn: '—', river: '—'};
  for(const h of history) streetMarks[h.street] = h.fatal ? '☠' : h.isCorrect ? '✓' : '✗';

  const leakWeights = {};
  const leakReasons = {};
  for(const h of history){
    if(h.isCorrect && !h.fatal) continue;
    const pen = h.fatal ? 2 : (1 - h.score);
    leakWeights[h.skillBucket] = (leakWeights[h.skillBucket] ?? 0) + pen;
    if(!leakReasons[h.skillBucket]) leakReasons[h.skillBucket] = h.reason;
  }
  const leakKey = Object.keys(leakWeights).sort((a, b) => leakWeights[b] - leakWeights[a])[0] ?? null;

  const leakLabel = {
    preflop_open: 'preflop opening discipline',
    preflop_defense: 'preflop defense decisions',
    value: 'value extraction spots',
    bluffing: 'bluff frequency control',
    draw_defense: 'draw defense under pressure',
    postflop_defense: 'postflop bluff-catch discipline',
  };

  const cueMap = {
    preflop_open: 'Tighten opens in crowded pots and avoid weak open-limps.',
    preflop_defense: 'Respect raise strength and position before defending.',
    value: 'When ahead, choose value sizes that still get called.',
    bluffing: 'Cut low-equity bluffs in multiway and against sticky profiles.',
    draw_defense: 'Use pot odds plus multiway discounts before continuing draws.',
    postflop_defense: 'Defend selectively; not every bluff-catcher is a call.',
  };

  let biggestLeak = 'No major leak this hand.';
  let improvementCue = 'Keep volume high. The engine will sharpen your weak spots.';
  if(fatalEntry){
    biggestLeak = `Fatal: ${fatalEntry.fatalReason}`;
    if(fatalEntry.fatalCode === 'limp_trash') improvementCue = 'Open-fold or open-raise weak hands. Avoid default limps.';
    if(fatalEntry.fatalCode === 'fold_strong_small') improvementCue = 'Do not over-fold strong hands versus small bets.';
    if(fatalEntry.fatalCode === 'air_stack_off') improvementCue = 'Avoid committing a large stack share with air.';
  } else if(leakKey){
    biggestLeak = `${leakLabel[leakKey] ?? leakKey}. ${leakReasons[leakKey] ?? ''}`;
    improvementCue = cueMap[leakKey] ?? improvementCue;
  }

  return {
    points,
    rawPoints,
    maxPoints,
    fatal: !!fatalEntry,
    fatalCapPoints,
    streetMarks,
    biggestLeak,
    improvementCue,
  };
}

function allSkillsBuildCoachTip(weakness = {}){
  const keys = Object.keys(weakness).filter(k => (weakness[k]?.total ?? 0) >= AS_MIN_SAMPLES_FOR_FOCUS_CUE);

  if(keys.length === 0){
    return {
      ready: false,
      focus: 'Profiling in progress',
      why: `The trainer needs at least ${AS_MIN_SAMPLES_FOR_FOCUS_CUE} samples in one spot before it gives targeted advice.`,
      next: 'Keep playing hands and focus on one clear reason behind each action.',
    };
  }

  keys.sort((a, b) => {
    const A = weakness[a], B = weakness[b];
    const eA = 1 - (A.correct / Math.max(A.total, 1));
    const eB = 1 - (B.correct / Math.max(B.total, 1));
    return eB - eA;
  });

  const key = keys[0];
  const rec = weakness[key];
  const [street, , skillBucket] = key.split('|');
  const acc = Math.round(rec.correct / Math.max(rec.total, 1) * 100);

  const focusMap = {
    preflop_open: 'preflop opening discipline',
    preflop_defense: 'preflop defense against opens',
    value: 'value betting and sizing',
    bluffing: 'bluff frequency control',
    draw_defense: 'draw defense under pressure',
    postflop_defense: 'postflop bluff-catcher decisions',
  };

  const whyMap = {
    preflop_open: 'Opening too loose early creates hard postflop spots and expensive folds.',
    preflop_defense: 'Defending too wide versus raises causes dominated hands and reverse implied odds.',
    value: 'Most long-term winrate comes from getting paid when ahead, not from fancy bluffs.',
    bluffing: 'Over-bluffing into sticky ranges burns chips, especially multiway.',
    draw_defense: 'Draws are profitable only when pot odds and equity line up.',
    postflop_defense: 'Calling too often with bluff-catchers leaks chips versus value-heavy ranges.',
  };

  const nextMap = {
    preflop_open: 'Before opening, confirm position first, then hand tier. Fold more from early seats.',
    preflop_defense: 'Versus opens, compare hand quality and position before you continue.',
    value: 'When strong, choose a size that worse hands can still call, then commit to it.',
    bluffing: 'Run fewer bluffs on wet or multiway boards; favor spots with fold equity.',
    draw_defense: 'Use the quick rule: continue only when your discounted equity beats pot odds.',
    postflop_defense: 'Ask what bluffs villain can realistically have before clicking call.',
  };

  return {
    ready: true,
    focus: `${allSkillsStreetTitle(street)} ${focusMap[skillBucket] ?? skillBucket}`,
    why: `Accuracy ${acc}% over ${rec.total} reps. ${whyMap[skillBucket] ?? 'This spot is currently costing points.'}`,
    next: nextMap[skillBucket] ?? 'Pick one simple adjustment and apply it next hand.',
  };
}

function AllSkillsTab(){
  const [weakness, setWeakness] = useLocalStorageState(AS_WEAKNESS_KEY, {});
  const [postflopFamilyWeakness, setPostflopFamilyWeakness] = useLocalStorageState(AS_POSTFLOP_FAMILY_WEAKNESS_KEY, {});
  const [stats, setStats] = useLocalStorageState(AS_STATS_KEY, {correct: 0, total: 0, points: 0, hands: 0});
  const [streak, setStreak] = useLocalStorageState(AS_STREAK_KEY, 0);
  const [best, setBest] = useLocalStorageState(AS_BEST_KEY, 0);
  const [examMode, setExamMode] = useLocalStorageState(AS_EXAM_KEY, false);
  const [fade, setFade] = useState(true);
  const [positionMapOpen, setPositionMapOpen] = useState(false);
  const [showMathHint, setShowMathHint] = useState(true);
  const lastFeedbackReasonRef = useRef('');

  const init = () => {
    const m = createAllSkillsHandMeta(weakness);
    return {meta: m, node: allSkillsBuildNode(m), result: null};
  };
  const [state, setState] = useState(() => init());

  useEffect(() => {
    if(!positionMapOpen) return;
    const onKeyDown = (e) => {
      if(e.key === 'Escape') setPositionMapOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [positionMapOpen]);

  useEffect(() => {
    setPositionMapOpen(false);
    lastFeedbackReasonRef.current = '';
  }, [state.meta.id]);

  const revealBoardCount = state.node.street === 'preflop' ? 0 : state.node.street === 'flop' ? 3 : state.node.street === 'turn' ? 4 : 5;
  const boardNow = state.meta.boardCards.slice(0, revealBoardCount);
  const summary = state.meta.ended ? allSkillsSummarize(state.meta) : null;

  const act = (action) => {
    if(state.result) return;
    if(!state.node.options.includes(action)) return;

    const scoredBase = allSkillsScoreAction(state.node, action);
    const fatalInfo = allSkillsDetectFatal(state.node, action);
    let scored = fatalInfo.isFatal
      ? {...scoredBase, isCorrect: false, score: 0, reason: `${fatalInfo.message} ${scoredBase.reason}`}
      : scoredBase;

    if(scored.reason === lastFeedbackReasonRef.current){
      scored = {...scored, reason: `${scored.reason} ${allSkillsRepetitionBooster(state.node)}`};
    }
    lastFeedbackReasonRef.current = scored.reason;

    const resolved = allSkillsResolve(state.meta, state.node, scored, fatalInfo);
    const isCorrect = scored.isCorrect && !resolved.fatal;
    const score = resolved.fatal ? 0 : scored.score;

    setStats(s => ({
      ...s,
      correct: s.correct + (isCorrect ? 1 : 0),
      total: s.total + 1,
      points: asRound((s.points ?? 0) + score, 100),
      hands: s.hands + (resolved.ended ? 1 : 0)
    }));

    setStreak(prev => {
      const next = isCorrect ? prev + 1 : 0;
      setBest(b => Math.max(b, next));
      return next;
    });

    setWeakness(w => {
      const k = state.node.focusKey;
      const cur = w[k] ?? {correct: 0, total: 0, misses: 0};
      const missDelta = (isCorrect ? 0 : 1) + (resolved.fatal ? 1 : 0);
      return {...w, [k]: {correct: cur.correct + (isCorrect ? 1 : 0), total: cur.total + 1, misses: cur.misses + missDelta}};
    });

    setPostflopFamilyWeakness(w => {
      const familyId = state.node.postflopFamilyId;
      if(!familyId || state.node.street === 'preflop') return w;
      const cur = w[familyId] ?? {correct: 0, total: 0, misses: 0};
      const missDelta = (isCorrect ? 0 : 1) + (resolved.fatal ? 1 : 0);
      return {...w, [familyId]: {correct: cur.correct + (isCorrect ? 1 : 0), total: cur.total + 1, misses: cur.misses + missDelta}};
    });

    setState(s => ({
      ...s,
      meta: resolved.meta,
      result: {
        ...scored,
        isCorrect,
        score,
        ended: resolved.ended,
        fatal: resolved.fatal,
        handText: resolved.text,
      }
    }));
  };

  const next = () => {
    setFade(false);
    setTimeout(() => {
      if(state.meta.ended){
        const m = createAllSkillsHandMeta(weakness);
        setState({meta: m, node: allSkillsBuildNode(m), result: null});
      } else {
        setState(s => ({...s, node: allSkillsBuildNode(s.meta), result: null}));
      }
      setFade(true);
    }, AS_FADE_DELAY_MS);
  };

  const showImmediate = !examMode || state.result?.ended;
  const coachTip = allSkillsBuildCoachTip(weakness);
  const villainName = state.meta.villainModel.name;
  const villainHint = allSkillsVillainHint(state.meta.villainType);
  const showFacingBetMath = state.node.spotType === 'facing_bet' && (examMode ? !!state.result : showMathHint);
  const showExamMathLockedNote = state.node.spotType === 'facing_bet' && examMode && !state.result;
  const heroSeat = state.node.heroSeat ?? state.meta.heroSeat ?? (state.meta.heroPos === 'ip' ? 'btn' : 'bb');
  const villainSeat = state.node.villainSeat ?? state.meta.villainSeat ?? (state.meta.heroPos === 'ip' ? 'bb' : 'btn');
  const heroSeatInfo = POS_INFO[heroSeat];
  const villainSeatInfo = POS_INFO[villainSeat];
  const activeGhostCount = allSkillsGhostCount(state.node);
  const effectivePlayers = allSkillsEffectivePlayers(state.node);
  const isPreflopOpen = state.node.street === 'preflop' && state.node.spotType === 'preflop_open';
  const heroPosLabel = isPreflopOpen ? 'First In' : (state.meta.heroPos === 'ip' ? 'IP' : 'OOP');
  const villainRoleLabel = isPreflopOpen ? 'Defender' : 'Villain';
  const villainBadgeLabel = isPreflopOpen ? 'Likely Defender' : 'Villain';
  const postflopFamily = state.node.postflopFamilyId ? postflopFamilyById(state.node.postflopFamilyId) : null;
  const weakPostflopFamilyId = Object.keys(postflopFamilyWeakness)
    .filter(k => (postflopFamilyWeakness[k]?.total ?? 0) >= 4)
    .sort((a, b) => {
      const A = postflopFamilyWeakness[a], B = postflopFamilyWeakness[b];
      const eA = 1 - (A.correct / Math.max(A.total, 1));
      const eB = 1 - (B.correct / Math.max(B.total, 1));
      return eB - eA;
    })[0] ?? null;
  const weakPostflopFamily = weakPostflopFamilyId ? postflopFamilyById(weakPostflopFamilyId) : null;
  const weakPostflopFamilyAcc = weakPostflopFamilyId
    ? Math.round((postflopFamilyWeakness[weakPostflopFamilyId]?.correct ?? 0) / Math.max(postflopFamilyWeakness[weakPostflopFamilyId]?.total ?? 1, 1) * 100)
    : null;
  const playerText = isPreflopOpen
    ? (activeGhostCount > 0
      ? `Unopened pot baseline is heads-up. Ghost pressure models ${effectivePlayers}-way dynamics (+${activeGhostCount}).`
      : 'Unopened pot (blinds only). Players behind can still act.')
    : (effectivePlayers === 2 ? 'Heads-up pot' : `${effectivePlayers}-way dynamics — tighten up here`);
  const openPositionMap = (e) => {
    if(e){
      e.preventDefault();
      e.stopPropagation();
    }
    setPositionMapOpen(true);
  };
  const situationText = allSkillsBuildSituationText(state.node, state.meta, heroSeat, villainSeat, villainName);

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:10,flexWrap:'wrap'}}>
        <div style={{fontSize:11,color:'#5d7f58',fontFamily:'sans-serif'}}>Mode: <strong style={{color:'#9bc892'}}>{examMode ? 'Exam (deferred feedback)' : 'Immediate feedback'}</strong></div>
        <div style={{display:'flex',gap:8,marginLeft:'auto'}}>
          <button
            onClick={()=>setShowMathHint(v=>!v)}
            disabled={examMode}
            style={{padding:'7px 10px',borderRadius:8,border:'1px solid rgba(140,170,140,0.32)',background:examMode?'rgba(0,0,0,0.14)':showMathHint?'rgba(90,150,80,0.14)':'rgba(0,0,0,0.2)',color:examMode?'#587254':showMathHint?'#9bc892':'#8ab880',cursor:examMode?'not-allowed':'pointer',fontSize:11,fontFamily:'sans-serif'}}
          >
            {examMode ? 'Math Hint Locked' : `Math Hint ${showMathHint ? 'ON' : 'OFF'}`}
          </button>
          <button onClick={()=>setExamMode(v=>!v)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid rgba(140,170,140,0.32)',background:'rgba(0,0,0,0.2)',color:'#8ab880',cursor:'pointer',fontSize:11,fontFamily:'sans-serif'}}>Toggle Exam</button>
        </div>
      </div>

      {weakPostflopFamily && weakPostflopFamilyAcc !== null && weakPostflopFamilyAcc < 85 && (
        <div style={{marginBottom:12,background:'rgba(180,100,30,0.12)',border:'1px solid rgba(180,120,40,0.3)',borderRadius:10,padding:'8px 14px',display:'flex',alignItems:'center',gap:8,fontFamily:'sans-serif'}}>
          <span style={{fontSize:14}}>🎯</span>
          <div>
            <span style={{fontSize:11,color:'#c89040',letterSpacing:1}}>Cross-tab family leak: </span>
            <span style={{fontSize:11,color:'#e0b060',fontWeight:700}}>{weakPostflopFamily.label}</span>
            <span style={{fontSize:11,color:'#8a6030'}}> ({weakPostflopFamilyAcc}% accuracy)</span>
          </div>
        </div>
      )}

      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease'}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14,alignItems:'stretch'}}>
          <div
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-expanded={positionMapOpen}
            onClick={openPositionMap}
            onKeyDown={(e) => {
              if(e.key === 'Enter' || e.key === ' ') openPositionMap(e);
            }}
            style={{flex:'0 0 146px',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,padding:'8px 8px 6px',cursor:'pointer'}}
          >
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:4,textAlign:'center'}}>Position Map</div>
            <div style={{display:'block',width:'100%',background:'rgba(0,0,0,0.12)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'5px 4px'}}>
              <div style={{display:'flex',justifyContent:'center'}}>
                <MiniTable heroPos={heroSeat} villainPos={villainSeat} compact={true}/>
              </div>
              <div style={{fontSize:9,color:'#7fa37a',fontFamily:'sans-serif',marginTop:4,letterSpacing:1,textTransform:'uppercase'}}>Tap to expand</div>
            </div>
            <div style={{fontSize:10,color:'#84aa80',fontFamily:'sans-serif',marginTop:4,lineHeight:1.35,textAlign:'center'}}>
              You: <span style={{color:heroSeatInfo?.color ?? '#9bc892',fontWeight:700}}>{heroSeatInfo?.short ?? heroSeat.toUpperCase()}</span> ({heroPosLabel}) · {villainRoleLabel}: <span style={{color:'#d0a070',fontWeight:700}}>{villainSeatInfo?.short ?? villainSeat.toUpperCase()}</span>
            </div>
          </div>

          <div style={{flex:'1 1 220px',display:'flex',gap:7,flexWrap:'wrap',alignContent:'flex-start'}}>
            <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>Pot {state.node.potBb}bb</span>
            <span style={{background:'rgba(70,120,120,0.15)',border:'1px solid rgba(70,120,120,0.32)',color:'#78a8a8',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{state.meta.stackLeftBb}bb stack</span>
            <span style={{background:'rgba(170,120,70,0.15)',border:'1px solid rgba(170,120,70,0.32)',color:'#d0a070',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{villainBadgeLabel}: {state.meta.villainModel.name}</span>
            {effectivePlayers > 2 && <span style={{background:'rgba(100,100,150,0.18)',border:'1px solid rgba(120,120,190,0.34)',color:'#aab0dd',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>👥 {effectivePlayers}-way{activeGhostCount > 0 ? ` (+${activeGhostCount} ghost)` : ''}</span>}
            {postflopFamily && state.node.street !== 'preflop' && <span style={{background:'rgba(170,120,70,0.15)',border:'1px solid rgba(170,120,70,0.32)',color:'#d0a070',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{postflopFamily.label}</span>}
            {state.node.street !== 'preflop' && state.node.postflopFamilyMatched === false && <span style={{background:'rgba(140,110,50,0.15)',border:'1px solid rgba(180,140,70,0.3)',color:'#c8a868',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>Family fallback</span>}
            <div style={{width:'100%',fontSize:11,color:'#8fb486',fontFamily:'sans-serif',lineHeight:1.45}}>Profile read: {villainHint}</div>
          </div>
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:16,borderLeft:'3px solid #507848'}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:7}}>Situation</div>
          <div style={{fontSize:13,color:'#c8e8b0',fontFamily:'sans-serif',lineHeight:1.6}}>{situationText}</div>
          <div style={{fontSize:11,color:'#7fa37a',marginTop:8,fontFamily:'sans-serif'}}>{playerText}</div>
          {showFacingBetMath && (
            <div style={{fontSize:11,color:'#86a882',marginTop:6,fontFamily:'sans-serif'}}>
              Pot odds: {state.node.potOdds}% · Discounted equity: {state.node.effectiveEquity}% · Field: {effectivePlayers}-way
            </div>
          )}
          {showFacingBetMath && state.node.postflopEval?.drawOuts > 0 && (
            <div style={{fontSize:11,color:'#7fa37a',marginTop:4,fontFamily:'sans-serif'}}>
              Draw profile: {state.node.postflopEval.drawLabel} ({state.node.postflopEval.drawOuts} outs)
            </div>
          )}
          {showExamMathLockedNote && (
            <div style={{fontSize:11,color:'#6f8a6d',marginTop:6,fontFamily:'sans-serif'}}>
              Math hidden in Exam mode. Lock your action to reveal pot odds and discounted equity.
            </div>
          )}
        </div>

        <div style={{display:'flex',justifyContent:'center',gap:16,marginBottom:18,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8,textAlign:'center'}}>Hero</div>
            <div style={{display:'flex',gap:6}}>{state.meta.heroCards.map((c,i)=><PlayingCard key={`${state.meta.id}-h-${i}`} r={c.r} s={c.s} hero={true}/>)}</div>
          </div>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8,textAlign:'center'}}>Board</div>
            <div style={{display:'flex',gap:6}}>
              {boardNow.length > 0
                ? boardNow.map((c,i)=><PlayingCard key={`${state.meta.id}-b-${i}`} r={c.r} s={c.s} hero={false}/>)
                : <div style={{fontSize:12,color:'#507848',fontFamily:'sans-serif',paddingTop:30}}>No board cards yet</div>}
            </div>
          </div>
        </div>

        {!state.result ? (
          <>
            <div style={{textAlign:'center',fontSize:12,color:'#507848',marginBottom:11,fontFamily:'sans-serif'}}>Choose your action</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {state.node.options.map(opt => (
                <button key={opt} onClick={()=>act(opt)} style={{padding:'12px 10px',borderRadius:10,border:'1px solid rgba(90,150,90,0.2)',cursor:'pointer',background:'rgba(0,0,0,0.2)',color:'#8ab880',fontFamily:'sans-serif',textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700}}>{allSkillsActionLabel(opt)}</div>
                  <div style={{fontSize:10,color:'#507848'}}>{allSkillsSizeBucket(opt) ?? 'standard'}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{textAlign:'center',padding:'14px',borderRadius:12,marginBottom:14,background:showImmediate ? (state.result.fatal ? 'rgba(180,120,30,0.17)' : state.result.isCorrect?'rgba(50,130,50,0.15)':'rgba(160,45,45,0.15)') : 'rgba(70,90,120,0.16)',border:`1px solid ${showImmediate ? (state.result.fatal ? 'rgba(200,150,40,0.34)' : state.result.isCorrect?'rgba(50,200,50,0.28)':'rgba(200,50,50,0.28)') : 'rgba(120,150,200,0.28)'}`}}>
              <div style={{fontSize:24,marginBottom:2}}>{showImmediate ? (state.result.fatal ? '⚠' : state.result.isCorrect ? '✓' : '✗') : '…'}</div>
              <div style={{fontSize:15,fontWeight:700,color:showImmediate ? (state.result.fatal ? '#d9a24a' : state.result.isCorrect?'#68cc68':'#cc6868') : '#80a0c8',fontFamily:'sans-serif'}}>
                {showImmediate
                  ? (state.result.fatal
                    ? 'Fatal error — hand score will be capped'
                    : state.result.isCorrect
                      ? 'Correct'
                      : `Incorrect — best: ${allSkillsActionLabel(state.result.bestAction)}`)
                  : 'Decision recorded (exam mode)'}
              </div>
            </div>

            {showImmediate && (
              <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:12}}>
                <div style={{fontSize:9,color:'#3a6038',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8}}>Feedback</div>
                <div style={{fontSize:13,color:'#a0c890',fontFamily:'sans-serif',lineHeight:1.6,marginBottom:8}}>{state.result.reason}</div>
                <div style={{fontSize:10,color:'#70946b',fontFamily:'sans-serif'}}>Skill tag: {state.result.skillTag}</div>
                <div style={{fontSize:10,color:'#88aa84',fontFamily:'sans-serif',marginTop:4}}>Focus area: {allSkillsSkillTagFocus(state.result.skillTag)}</div>
              </div>
            )}

            <div style={{fontSize:12,color:'#6f926b',marginBottom:12,fontFamily:'sans-serif',textAlign:'center'}}>{state.result.handText}</div>
            <button onClick={next} style={{width:'100%',padding:'13px',borderRadius:10,cursor:'pointer',background:'rgba(90,150,80,0.08)',border:'1px solid rgba(90,150,80,0.28)',color:'#78b060',fontSize:14,fontWeight:600,letterSpacing:1,fontFamily:'sans-serif'}}>{state.result.ended ? 'Next Hand →' : 'Continue →'}</button>
          </>
        )}
      </div>

      {summary && (
        <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
          <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:8}}>Hand Summary</div>
          <div style={{fontSize:13,color:'#9bc892',marginBottom:8}}>Overall score: <strong style={{color:'#ede0c0'}}>{summary.points.toFixed(1)}</strong> / {summary.maxPoints.toFixed(1)}</div>
          {summary.fatal && <div style={{fontSize:11,color:'#d8a454',marginBottom:8}}>Fatal cap applied: max {summary.fatalCapPoints.toFixed(1)} points this hand.</div>}

          <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:11,color:'#8aaa84',marginBottom:10,flexWrap:'wrap'}}>
            {[['Preflop', summary.streetMarks.preflop], ['Flop', summary.streetMarks.flop], ['Turn', summary.streetMarks.turn], ['River', summary.streetMarks.river]].map(([name, mark]) => (
              <div key={name} style={{display:'flex',alignItems:'center',gap:4}}>
                <span>{name}</span>
                <span style={{color:'#ede0c0',fontWeight:700}}>{mark}</span>
              </div>
            ))}
          </div>

          <div style={{fontSize:11,color:'#7fa37a',marginBottom:6}}>Biggest leak this hand: <span style={{color:'#b0d2a6'}}>{summary.biggestLeak}</span></div>
          <div style={{fontSize:11,color:'#7fa37a'}}>Targeted cue: <span style={{color:'#b0d2a6'}}>{summary.improvementCue}</span></div>
        </div>
      )}

      <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:8}}>Coach Tip</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:12,lineHeight:1.55}}>
          <div style={{color:'#7fa37a'}}>Focus: <span style={{color:'#b0d2a6'}}>{coachTip.focus}</span></div>
          <div style={{color:'#7fa37a'}}>Why: <span style={{color:'#b0d2a6'}}>{coachTip.why}</span></div>
          <div style={{color:'#7fa37a'}}>Next hand: <span style={{color:'#b0d2a6'}}>{coachTip.next}</span></div>
        </div>
      </div>

      <PositionMapOverlay
        open={positionMapOpen}
        onClose={() => setPositionMapOpen(false)}
        heroSeat={heroSeat}
        villainSeat={villainSeat}
        heroPos={state.meta.heroPos}
        preflopOpen={isPreflopOpen}
      />
    </div>
  );
}

const TABS = [
  {id: 'allskills', label: 'All Skills'},
  {id: 'potodds', label: 'Pot Odds'},
  {id: 'preflop', label: 'Preflop'},
  {id: 'postflop', label: 'Postflop'},
  {id: 'sizing',  label: 'Bet Sizing'},
  {id: 'positions', label: 'Table Positions'},
];

export const __testables = {
  genPotOddsScenario,
  genPreflopScenario,
  createAllSkillsHandMeta,
  allSkillsBuildNode,
  allSkillsGhostCount,
  allSkillsEffectivePlayers,
  allSkillsMatchTierFromCards,
  allSkillsPreflopDecisionTier,
  allSkillsBaselineDecision,
  allSkillsApplyGhostPressure,
  allSkillsExploitDecision,
  allSkillsContextCue,
  allSkillsBuildSituationText,
  postflopFamilyWeight,
  postflopFamilyRotation,
  postflopClassifyFamily,
  postflopCreateState,
  allSkillsBestFive,
  allSkillsEvaluatePostflopCards,
  allSkillsEstimateEquity,
  allSkillsDetectFatal,
  allSkillsActionCommit,
  allSkillsNextPot,
  allSkillsActiveOpponents,
  allSkillsApplyOpponentAttrition,
  allSkillsResolve,
};

function PositionsTab(){
  const [btnSeat,setBtnSeat]=useState(0);
  const [selSeat,setSelSeat]=useState(0);
  const seatRoles=Array.from({length:NUM_SEATS},(_,i)=>ROLE_OFFSETS[(i-btnSeat+NUM_SEATS)%NUM_SEATS]);
  const selRole=seatRoles[selSeat];
  const sel=ROLE_INFO[selRole];

  return(
    <div>
      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'16px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',marginBottom:14}}>
        <svg viewBox="0 0 320 216" style={{width:'100%',overflow:'visible'}}>
          <ellipse cx={160} cy={108} rx={105} ry={72} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={8}/>
          <ellipse cx={160} cy={108} rx={105} ry={72} fill="#1a5c30" stroke="#2a7a40" strokeWidth={1.5}/>
          <ellipse cx={160} cy={108} rx={105} ry={72} fill="none" stroke="#4a3010" strokeWidth={7} strokeOpacity={0.7}/>
          <ellipse cx={160} cy={108} rx={90}  ry={60} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1}/>
          <text x={160} y={102} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.12)" fontFamily="Georgia,serif" letterSpacing={2} style={{userSelect:'none'}}>TEXAS</text>
          <text x={160} y={114} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.12)" fontFamily="Georgia,serif" letterSpacing={2} style={{userSelect:'none'}}>HOLD'EM</text>
          {seatRoles.map((role,i)=>{
            // Seat points are derived from the table SVG center and seat ellipse radii.
            const rad = ((SEAT_ANGLES[i] - 90) * Math.PI) / 180;
            const x = TABLE_CENTER_X + TABLE_SEAT_RADIUS_X * Math.cos(rad);
            const y = TABLE_CENTER_Y + TABLE_SEAT_RADIUS_Y * Math.sin(rad);
            const info=ROLE_INFO[role];
            const isBtn=btnSeat===i;
            const isSel=selSeat===i;
            const btnRad=((SEAT_ANGLES[i]-90)*Math.PI/180);
            const chipX=x+22*Math.cos(btnRad+0.6),chipY=y+22*Math.sin(btnRad+0.6);
            return(
              <g key={i} onClick={()=>setSelSeat(i)} style={{cursor:'pointer'}}>
                {isSel&&<circle cx={x} cy={y} r={21} fill="none" stroke={info.color} strokeWidth={2} opacity={0.45}/>}
                <circle cx={x} cy={y} r={15} fill={isSel?info.color:'#1a3828'} stroke={info.color} strokeWidth={isSel?0:1.5} opacity={isSel?1:0.75}/>
                <text x={x} y={y+0.5} textAnchor="middle" dominantBaseline="middle" fontSize={isSel?6.5:6} fontWeight="700" fill={isSel?'#fff':info.color} fontFamily="Georgia,serif" style={{userSelect:'none'}}>{info.short}</text>
                {isBtn&&<>
                  <circle cx={chipX} cy={chipY} r={8} fill="#d4af37" stroke="#a07820" strokeWidth={1}/>
                  <text x={chipX} y={chipY} textAnchor="middle" dominantBaseline="middle" fontSize={6} fontWeight="900" fill="#5a3a00" fontFamily="Georgia,serif" style={{userSelect:'none'}}>D</text>
                </>}
              </g>
            );
          })}
        </svg>
        <div style={{textAlign:'center',marginTop:4}}>
          <button onClick={()=>setBtnSeat(s=>(s+1)%NUM_SEATS)} style={{background:'rgba(212,175,55,0.12)',border:'1px solid rgba(212,175,55,0.35)',borderRadius:20,padding:'5px 16px',color:'#d4af37',fontSize:11,letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',cursor:'pointer'}}>⟳ Rotate Dealer Button</button>
        </div>
      </div>

      {sel&&(
        <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:`2px solid ${sel.color}33`,borderLeft:`4px solid ${sel.color}`,borderRadius:16,padding:'18px 20px',boxShadow:'0 12px 40px rgba(0,0,0,0.5)',marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span style={{fontSize:22}}>{sel.emoji}</span>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:sel.color}}>{sel.name}</div>
              <div style={{fontSize:11,color:'#3d6040',fontFamily:'sans-serif',letterSpacing:1}}>{sel.subtitle}</div>
            </div>
          </div>
          <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'8px 12px',marginBottom:12,fontFamily:'sans-serif',fontSize:11}}>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',marginBottom:5}}>Preflop action order</div>
            <div>{PREFLOP_ORDER.map((role,i)=>(
              <span key={role} style={{color:role===selRole?sel.color:'#3d5038',fontWeight:role===selRole?700:400}}>
                {ROLE_INFO[role].short}{i<PREFLOP_ORDER.length-1?' → ':''}
              </span>
            ))}</div>
          </div>
          <div style={{fontSize:13,color:'#8ab880',lineHeight:1.6,marginBottom:14,fontFamily:'sans-serif'}}>{sel.strategy}</div>
          <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:6}}>Playable hands from here</div>
            <div style={{fontSize:12,color:sel.color,fontFamily:'sans-serif',lineHeight:1.6}}>{sel.range}</div>
          </div>
        </div>
      )}

      <div style={{background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:10}}>Position Strength</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[['UTG/UTG+1','#cc5050','Worst'],['HJ','#c0a030','Early'],['CO','#70a840','Good'],['BTN','#4090c8','Best'],['SB/BB','#7060c0','Blinds']].map(([label,color,tier])=>(
            <div key={label} style={{display:'flex',alignItems:'center',gap:5,background:'rgba(0,0,0,0.2)',borderRadius:6,padding:'4px 8px'}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:color,flexShrink:0}}/>
              <span style={{fontSize:10,color:'#4a6a48'}}><span style={{color}}>{label}</span> — {tier}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════


export default function PokerTrainer(){
  const [tab, setTab] = useLocalStorageState('poker_active_tab', 'allskills');
  const titles = {allskills: 'All Skills Trainer', potodds: 'Pot Odds Trainer', preflop: 'Preflop Trainer', postflop: 'Postflop v2 Trainer', sizing: 'Bet Sizing', positions: 'Table Positions'};

  return (
    <div style={{minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -5%, #1d4d30 0%, #0e2a1a 42%, #06100b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 14px 48px', fontFamily: 'Georgia,serif'}}>
      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{fontSize:10,letterSpacing:6,color:'#507848',textTransform:'uppercase',marginBottom:2,fontFamily:'sans-serif'}}>♠ Poker Training ♠</div>
        <h1 style={{margin:0,fontSize:23,fontWeight:700,color:'#ede0c0',letterSpacing:1}}>{titles[tab]}</h1>
      </div>

      <div style={{display:'flex',gap:4,marginBottom:20,background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:4,maxWidth:600,width:'100%',overflowX:'auto',whiteSpace:'nowrap'}}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{flex:1,padding:'8px 12px',borderRadius:9,border:'none',cursor:'pointer',background:tab===t.id?'linear-gradient(135deg,#2a6a38,#1e5030)':'transparent',color:tab===t.id?'#a8dea0':'#3d6040',fontSize:12,fontWeight:tab===t.id?700:400,letterSpacing:1,fontFamily:'sans-serif',transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{maxWidth:460,width:'100%'}}>
        {tab === 'allskills' && <AllSkillsTab/>}
        {tab === 'potodds'   && <PotOddsTab/>}
        {tab === 'preflop'   && <PreflopTab/>}
        {tab === 'postflop'  && <PostflopTab/>}
        {tab === 'sizing'    && <BetSizingTab/>}
        {tab === 'positions' && <PositionsTab/>}
      </div>
    </div>
  );
}
