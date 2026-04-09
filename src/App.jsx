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
  medium: {label: 'Medium', color: '#c0a030', hands: [{r1: 9, r2: 9, suited: false, label: '99'}, {r1: 8, r2: 8, suited: false, label: '88'}, {r1: 7, r2: 7, suited: false, label: '77'}, {r1: 14, r2: 10, suited: false, label: 'ATo'}, {r1: 14, r2: 10, suited: true, label: 'ATs'}, {r1: 13, r2: 11, suited: false, label: 'KJo'}, {r1: 13, r2: 11, suited: true, label: 'KJs'}, {r1: 12, r2: 11, suited: true, label: 'QJs'}, {r1: 11, r2: 10, suited: true, label: 'JTs'}]},
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
      if(pos === 'btn') return {action: 'call', why: `Medium hand on the button — call the ${r}. You'll have position all hand.`};
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
  if(situation === 'unopened') situationDesc = `Action folds to you.`;
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
function MiniTable({heroPos}){
  const heroPosIdx = POSITIONS.indexOf(heroPos);
  return (
    <svg viewBox="0 0 180 116" style={{width: '100%', maxWidth: 220}}>
      <ellipse cx={MCX} cy={MCY} rx={58} ry={38} fill="#1a5c30" stroke="#2a7a40" strokeWidth={1}/>
      <ellipse cx={MCX} cy={MCY} rx={58} ry={38} fill="none" stroke="#4a3010" strokeWidth={4} strokeOpacity={0.6}/>
      {POSITIONS.map((pos, i) => {
        const displayIdx = (i - heroPosIdx + 2 + NUM_SEATS) % NUM_SEATS;
        const {x, y} = miniSeatXY(displayIdx);
        const info = POS_INFO[pos];
        const isHero = pos === heroPos;
        return (
          <g key={pos}>
            <circle cx={x} cy={y} r={isHero ? 9 : 7} fill={isHero ? info.color : '#1a3828'} stroke={info.color} strokeWidth={isHero ? 0 : 1} opacity={isHero ? 1 : 0.6}/>
            <text x={x} y={y+0.5} textAnchor="middle" dominantBaseline="middle" fontSize={isHero ? 5 : 4} fontWeight="700" fill={isHero ? '#fff' : info.color} fontFamily="Georgia,serif" style={{userSelect: 'none'}}>{info.short}</text>
          </g>
        );
      })}
    </svg>
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
const PF_SITUATIONS = [
  {
    id: 'ip_air_dry', label: 'Air on a Dry Board', texture: 'Dry',
    action: 'raise', pos: 'btn', vpos: 'bb', num: 2, 
    holeP: [14, 11], boardP: [13, 7, 2], suitP: [[0,1], [0,2,3]], // AJ on K72r
    correct: 'bet',
    why: "Range Advantage: A dry board heavily favors the preflop raiser's range. A small continuation bet here (bluff) takes down the pot often, as the villain usually misses this flop."
  },
  {
    id: 'oop_air_wet', label: 'Air on a Wet Board', texture: 'Wet/Dynamic',
    action: 'raise', pos: 'utg', vpos: 'btn', num: 2,
    holeP: [14, 13], boardP: [11, 10, 8], suitP: [[0,1], [0,0,2]], // AK on JT8ss
    correct: 'check/fold',
    why: "Disadvantage: You missed completely on a highly coordinated board that hits the preflop caller's range perfectly. C-Betting here burns chips. Give up."
  },
  {
    id: 'oop_draw_wet', label: 'Strong Draw on Wet Board', texture: 'Wet',
    action: 'raise', pos: 'hj', vpos: 'btn', num: 2,
    holeP: [12, 11], boardP: [10, 9, 2], suitP: [[0,0], [0,1,2]], // QJss on T92ss (OESD + FD)
    correct: 'bet',
    why: "Semi-Bluff / Pot Building: You have massive equity with a combo draw. Betting builds the pot for when you hit, and gives you a second way to win immediately via fold equity."
  },
  {
    id: 'oop_tptk_wet', label: 'Top Pair Top Kicker (Wet)', texture: 'Wet',
    action: 'raise', pos: 'hj', vpos: 'bb', num: 2,
    holeP: [14, 13], boardP: [13, 10, 8], suitP: [[0,1], [2,3,0]], // AK on KT8ss
    correct: 'bet',
    why: "Value & Protection: You have a very strong hand on a draw-heavy board. Bet for value and to charge opponents who are chasing flush and straight draws."
  },
  {
    id: 'ip_marg_dry', label: 'Marginal Made Hand (Dry)', texture: 'Dry',
    action: 'raise', pos: 'btn', vpos: 'bb', num: 2,
    holeP: [9, 8], boardP: [14, 8, 3], suitP: [[0,1], [2,3,0]], // 98 on K83r
    correct: 'check',
    why: "Pot Control: You have a middle pair. Betting usually folds out worse hands and gets called by better ones. Checking behind controls the pot size and realizes your equity."
  },
  {
    id: 'oop_monster_dry', label: 'Monster Hand (Dry)', texture: 'Dry',
    action: 'raise', pos: 'utg', vpos: 'hj', num: 2,
    holeP: [10, 10], boardP: [10, 6, 2], suitP: [[0,1], [0,2,3]], // TT on T62r
    correct: 'bet',
    why: "Value Extraction: You flopped top set. While slowplaying is tempting, betting builds a pot early. You want to start extracting value from all their underpairs and floats immediately."
  },
  {
    id: 'ip_tp_dry', label: 'Top Pair (Dry)', texture: 'Dry',
    action: 'raise', pos: 'co', vpos: 'bb', num: 2,
    holeP: [12, 11], boardP: [12, 5, 2], suitP: [[0,1], [2,3,0]], // QJ on Q52r
    correct: 'bet',
    why: "Pure Value: Top pair good kicker is easily strong enough to bet for value on a dry board against a wide big blind calling range."
  }
];

function genPostflopScenario(){
  const base = PF_SITUATIONS[~~(Math.random() * PF_SITUATIONS.length)];
  const suits = shuffle(['s','h','d','c']);
  return {
    ...base,
    hand: base.holeP.map((r, i) => ({r, s: suits[base.suitP[0][i]]})),
    flop: base.boardP.map((r, i) => ({r, s: suits[base.suitP[1][i]]})),
  };
}

function PostflopTab(){
  const [sc, setSc] = useState(() => genPostflopScenario());
  const [result, setResult] = useState(null);
  const [stats, setStats] = useLocalStorageState('poker_stats_2', {correct: 0, total: 0});
  const [streak, setStreak] = useLocalStorageState('poker_streak_2', 0);
  const [best, setBest] = useLocalStorageState('poker_best_2', 0);
  const [fade, setFade] = useState(true);

  const act = (action) => {
    if(result) return;
    const ok = action === sc.correct;
    setResult({action, ok});
    setStats(s => ({...s, correct: s.correct + (ok ? 1 : 0), total: s.total + 1}));
    if(ok){
      const ns = streak + 1;
      setStreak(ns);
      if(ns > best) setBest(ns);
    }else setStreak(0);
  };

  const next = () => {
    setFade(false);
    setTimeout(() => {
      setSc(genPostflopScenario());
      setResult(null);
      setFade(true);
    }, 150);
  };

  const pp = POS_INFO[sc.pos];
  const vp = POS_INFO[sc.vpos];
  const options = sc.pos === 'btn' || sc.pos === 'co' 
    ? [['bet', 'C-BET (ATTACK)', '#a8dea0', 'linear-gradient(135deg,#2a6a38,#1a5228)'], ['check', 'CHECK (POT CONTROL)', '#e8a0a0', 'linear-gradient(135deg,#6a2828,#521818)']]
    : [['bet', 'C-BET / LEAD', '#a8dea0', 'linear-gradient(135deg,#2a6a38,#1a5228)'], ['check/call', 'CHECK / CALL', '#a0c8e8', 'linear-gradient(135deg,#2a5a6a,#1a4858)'], ['check/fold', 'CHECK / FOLD', '#e8a0a0', 'linear-gradient(135deg,#6a2828,#521818)']];

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>
      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:2}}>Your Pos</div>
            <div style={{fontSize:16,fontWeight:700,color:pp.color,fontFamily:'Georgia,serif'}}>{pp.name}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:2}}>Villain Pos</div>
            <div style={{fontSize:16,fontWeight:700,color:vp.color,fontFamily:'Georgia,serif'}}>{vp.name}</div>
          </div>
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:18,borderLeft:'3px solid #507848'}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8}}>Situation</div>
          <div style={{fontSize:14,color:'#c8e8b0',fontFamily:'sans-serif',marginBottom:8}}>
            You raised preflop. <strong>{vp.name}</strong> called. The pot is heads-up.
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <span style={{background:'rgba(90,155,70,0.14)',border:'1px solid rgba(90,155,70,0.38)',color:'#78b060',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{sc.action === 'raise' ? 'You have initiative' : 'PFC'}</span>
            <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{sc.texture} Board</span>
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'center',gap:16,marginBottom:18}}>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8,textAlign:'center'}}>Your Hand</div>
            <div style={{display:'flex',gap:6}}>{sc.hand.map((c,i)=><PlayingCard key={i} r={c.r} s={c.s} hero={true}/>)}</div>
          </div>
          <div>
            <div style={{fontSize:9,color:'#3d6040',letterSpacing:2,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8,textAlign:'center'}}>The Flop</div>
            <div style={{display:'flex',gap:6}}>{sc.flop.map((c,i)=><PlayingCard key={i} r={c.r} s={c.s} hero={true}/>)}</div>
          </div>
        </div>

        {!result ? (
          <>
            <div style={{textAlign:'center',fontSize:12,color:'#507848',marginBottom:12,fontFamily:'sans-serif'}}>What do you do?</div>
            <div style={{display:'flex',gap:8}}>
              {options.map(([val, label, color, bg]) => (
                <button key={val} onClick={()=>act(val)} style={{flex:1,padding:'13px 0',borderRadius:10,border:'none',cursor:'pointer',background:bg,color,fontSize:13,fontWeight:700,letterSpacing:1,fontFamily:'sans-serif',boxShadow:'0 4px 14px rgba(0,0,0,0.35)'}}
                  onMouseDown={e=>e.currentTarget.style.transform='scale(0.96)'}
                  onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
                >{label}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{textAlign:'center',padding:'14px',borderRadius:12,marginBottom:14,background:result.ok?'rgba(50,130,50,0.15)':'rgba(160,45,45,0.15)',border:`1px solid ${result.ok?'rgba(50,200,50,0.28)':'rgba(200,50,50,0.28)'}`}}>
              <div style={{fontSize:26,marginBottom:2}}>{result.ok ? '✓' : '✗'}</div>
              <div style={{fontSize:16,fontWeight:700,color:result.ok?'#68cc68':'#cc6868',fontFamily:'sans-serif'}}>{result.ok ? 'Correct!' : `Wrong — correct play was ${sc.correct.toUpperCase()}`}</div>
            </div>
            <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:9,color:'#3a6038',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:8}}>Why</div>
              <div style={{fontSize:13,color:'#a0c890',fontFamily:'sans-serif',lineHeight:1.6}}>{sc.why}</div>
            </div>
            <button onClick={next} style={{width:'100%',padding:'13px',borderRadius:10,cursor:'pointer',background:'rgba(90,150,80,0.08)',border:'1px solid rgba(90,150,80,0.28)',color:'#78b060',fontSize:14,fontWeight:600,letterSpacing:1,fontFamily:'sans-serif'}}>Next Scenario →</button>
          </>
        )}
      </div>

      <div style={{marginTop:16,background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:12,padding:'12px 16px',fontFamily:'sans-serif'}}>
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:9}}>Postflop Heuristics</div>
        {[['Range Advantage','Bet mostly IP on dry broadway boards.'],['Nut Advantage','Bet big when you hit big on draw-heavy boards.'],['Equity Realization','Check back marginal hands IP to see free cards.'],['Surrendering','Check/Fold air OOP on disconnected/wet boards.']].map(([rule,desc])=>(
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
const AS_MULTIWAY_DISTRIBUTION = [2, 2, 2, 2, 2, 2, 3, 4];
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

const AS_VILLAIN_PROFILES = {
  tag: {label: 'TAG', name: 'Tight-Aggressive', baseWeight: 1.15, aggression: 0.58, looseness: 0.35, foldToAggro: 0.46, small: 0.25, medium: 0.5, large: 0.25},
  lag: {label: 'LAG', name: 'Loose-Aggressive', baseWeight: 1.05, aggression: 0.75, looseness: 0.7, foldToAggro: 0.31, small: 0.22, medium: 0.45, large: 0.33},
  lp: {label: 'LP', name: 'Loose-Passive', baseWeight: 1.0, aggression: 0.35, looseness: 0.72, foldToAggro: 0.38, small: 0.45, medium: 0.42, large: 0.13},
  maniac: {label: 'Maniac', name: 'Maniac', baseWeight: 0.8, aggression: 0.9, looseness: 0.86, foldToAggro: 0.24, small: 0.2, medium: 0.4, large: 0.4},
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

function allSkillsActionLabel(action){ return AS_ACTION_LABELS[action] ?? action; }
function allSkillsStreetTitle(street){ return street === 'preflop' ? 'Preflop' : street[0].toUpperCase() + street.slice(1); }
function allSkillsIsAggro(action){ return action.startsWith('bet') || action.startsWith('raise'); }
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
  const numPlayers = randItem(AS_MULTIWAY_DISTRIBUTION);
  const stackBb = randItem(AS_STACKS);
  const startPotBb = asRound(AS_MIN_START_POT_BB + Math.random() * AS_START_POT_RANGE_BB, 10);
  const stageMult = startStreetIndex === 0 ? 1 : startStreetIndex === 1 ? (1.8 + Math.random() * 0.4) : (2.5 + Math.random() * 0.6);
  const currentPotBb = asRound(startPotBb * stageMult * (1 + Math.max(numPlayers - 2, 0) * 0.12), 10);
  const stackLeftBb = asRound(Math.max(stackBb - currentPotBb * 0.28, 12), 10);
  return {
    id: allSkillsNextHandId(),
    villainType,
    villainModel: allSkillsCreateVillainModel(villainType, numPlayers),
    numPlayers,
    heroPos: Math.random() > AS_IP_BIAS_THRESHOLD ? 'ip' : 'oop',
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

function allSkillsPickPreflopClass(meta){
  const inLate = meta.heroPos === 'ip';
  const extra = Math.max(meta.numPlayers - 2, 0);
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

function allSkillsEstimateEquity(node){
  let equity = 0;
  if(node.handClass === 'monster') equity = 84;
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

function allSkillsBuildNode(meta){
  const street = AS_STREETS[meta.streetIndex];
  const focusMatch = !!meta.focus && meta.focus.street === street;
  const boardCount = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  const boardNow = meta.boardCards.slice(0, boardCount);
  const boardTexture = street === 'preflop' ? 'n/a' : allSkillsBoardTexture(boardNow);
  const potBb = asRound(meta.currentPotBb, 10);
  const stackLeftBb = asRound(meta.stackLeftBb, 10);

  let spotType = 'checked_to_hero';
  let handClass = 'marginal';
  let sizeBucket = null;
  let betBb = null;
  let raiseOpenBb = null;
  let preflopPos = null;
  let preflopSituation = null;
  let options = ['check', 'bet-small', 'bet-medium'];

  if(street === 'preflop'){
    handClass = allSkillsPickPreflopClass(meta);
    preflopPos = allSkillsResolvePosition(meta.heroPos);
    const facingOpenChance = clamp(meta.villainModel.looseness * 0.62 + meta.villainModel.aggression * 0.24 + (meta.heroPos === 'oop' ? 0.1 : 0) + Math.max(meta.numPlayers - 2, 0) * 0.06, 0.15, 0.9);
    spotType = (focusMatch && meta.focus.spotType?.startsWith('preflop')) ? meta.focus.spotType : (Math.random() < facingOpenChance ? 'preflop_facing_open' : 'preflop_open');
    if(spotType === 'preflop_open'){
      preflopSituation = 'unopened';
      raiseOpenBb = asRound(2.3 + Math.max(meta.numPlayers - 2, 0) * 0.25, 10);
      options = ['fold', 'limp', 'raise-small', 'raise-medium'];
    } else {
      sizeBucket = allSkillsPickSizing(meta.villainModel);
      raiseOpenBb = asRound(2.4 + (sizeBucket === 'small' ? 0.2 : sizeBucket === 'medium' ? 0.9 : 1.6) + Math.max(meta.numPlayers - 2, 0) * 0.35, 10);
      betBb = raiseOpenBb;
      preflopSituation = meta.numPlayers > 2 ? 'raise_caller' : 'raise';
      options = ['fold', 'call', 'raise-large'];
    }
  } else {
    handClass = allSkillsPickPostflopClass(street, meta.focus, meta.numPlayers);
    const betFreq = clamp(meta.villainModel.aggression * 0.63 + (meta.heroPos === 'oop' ? 0.09 : 0) + Math.max(meta.numPlayers - 2, 0) * 0.04, 0.18, 0.9);
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
      const pressure = 1 + Math.max(meta.numPlayers - 2, 0) * 0.06;
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
    heroPos: meta.heroPos,
    villainType: meta.villainType,
    villainLabel: meta.villainModel.label,
    villainModel: meta.villainModel,
    numPlayers: meta.numPlayers,
  };

  if(spotType === 'facing_bet'){
    const math = allSkillsEstimateEquity(node);
    node = {...node, ...math};
  }

  const baseline = allSkillsBaselineDecision(node);
  const exploit = allSkillsExploitDecision(node, baseline);
  const skillBucket = allSkillsSkillBucket(node);
  return {...node, baseline, exploit, skillBucket, focusKey: `${street}|${spotType}|${skillBucket}`};
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
    const tightTier = allSkillsTightenTier(node.handClass, node.numPlayers);
    const raiseAmt = Math.max(2, Math.round(node.raiseOpenBb ?? 3));
    const decision = getDecision(tightTier, node.preflopPos, node.preflopSituation, raiseAmt);
    const mapped = allSkillsMapPreflopDecision(node, decision);
    const reason = node.numPlayers > 2 ? `${mapped.reason} ${node.numPlayers}-way pot — tighten up here.` : mapped.reason;
    return {action: mapped.action, reason};
  }

  if(node.spotType === 'checked_to_hero'){
    if(node.handClass === 'monster') return {action: node.boardTexture === 'wet' ? 'bet-large' : allSkillsPreferredBetAction(node), reason: 'Nutted hands push value and deny free equity.'};
    if(node.handClass === 'strong') return {action: allSkillsPreferredBetAction(node), reason: 'Strong made hands value-bet while protecting against runouts.'};
    if(node.handClass === 'draw'){
      if(node.numPlayers > 2) return {action: 'check', reason: 'Multiway pressure discounts draw equity; avoid over-bluffing.'};
      return {action: allSkillsPreferredBetAction(node), reason: 'Semi-bluffing draws combines fold equity with draw equity.'};
    }
    if(node.handClass === 'marginal') return {action: 'check', reason: 'Marginal showdown value prefers pot control.'};
    return {action: ip && node.boardTexture === 'dry' ? 'bet-small' : 'check', reason: 'Air can stab dry boards in position but should check more often elsewhere.'};
  }

  const hasPrice = (node.effectiveEquity ?? 0) >= (node.potOdds ?? 100);
  if(node.handClass === 'monster') return {action: 'raise-large', reason: 'Monsters versus a bet should build the pot quickly.'};
  if(node.handClass === 'strong'){
    if(node.sizeBucket === 'small' && node.options.includes('raise-small')) return {action: 'raise-small', reason: 'Strong hand versus small sizing can extract value with a raise.'};
    return {action: 'call', reason: 'Strong hand can continue comfortably versus this sizing.'};
  }
  if(node.handClass === 'draw'){
    if(hasPrice) return {action: 'call', reason: `Pot odds require ${node.potOdds}% and your discounted draw equity is ~${node.effectiveEquity}%.`};
    return {action: 'fold', reason: `You need ${node.potOdds}% but discounted draw equity is only ~${node.effectiveEquity}%.`};
  }
  if(node.handClass === 'marginal'){
    if(node.sizeBucket === 'small' && hasPrice) return {action: 'call', reason: `Small sizing gives enough price (${node.potOdds}%) to defend this bluff-catcher.`};
    return {action: 'fold', reason: 'Marginal hands should fold to pressure unless price is clearly favorable.'};
  }
  return {action: 'fold', reason: 'Air should fold against aggression.'};
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

function allSkillsExploitDecision(node, baseline){
  const v = node.villainType;
  let action = baseline.action;
  let reason = 'Baseline line remains best versus this archetype.';

  if(v === 'lp'){
    if(node.spotType === 'checked_to_hero' && (node.handClass === 'strong' || node.handClass === 'monster') && allSkillsIsAggro(action)){
      action = allSkillsStepAction(node, action, 1);
      reason = 'Loose-passive players call too wide, so value can size up one step.';
    }
    if(node.spotType === 'checked_to_hero' && node.handClass === 'air' && allSkillsIsAggro(action)){
      action = 'check';
      reason = 'Loose-passive players under-fold, so cut low-equity bluffs.';
    }
  }

  if(v === 'tag'){
    if(node.spotType === 'checked_to_hero' && node.handClass === 'air' && allSkillsIsAggro(action)){
      action = allSkillsStepAction(node, action, -1);
      reason = 'TAG ranges defend correctly, so trim speculative stabs.';
    }
    if(node.spotType === 'facing_bet' && node.handClass === 'marginal' && action === 'call'){
      action = 'fold';
      reason = 'Tight aggression narrows value-heavy ranges; fold more bluff-catchers.';
    }
  }

  if(v === 'lag'){
    if(node.spotType === 'facing_bet' && node.handClass === 'strong' && action === 'call' && node.options.includes('raise-small')){
      action = 'raise-small';
      reason = 'LAGs over-barrel, so punish with extra thin value raises.';
    }
    if(node.spotType === 'facing_bet' && node.handClass === 'draw' && action === 'fold' && node.sizeBucket !== 'large'){
      action = 'call';
      reason = 'Wide aggression gives better realization for draw continues.';
    }
  }

  if(v === 'maniac'){
    if(node.spotType === 'facing_bet' && node.handClass === 'strong'){
      action = node.sizeBucket === 'large' ? 'call' : 'raise-small';
      reason = 'Maniacs over-bluff, so defend more and punish smaller sizings.';
    }
    if(node.spotType === 'checked_to_hero' && node.handClass === 'monster' && node.options.includes('bet-large')){
      action = 'bet-large';
      reason = 'Versus mania, maximize value with larger bets.';
    }
  }

  if(node.numPlayers > 2){
    if(node.spotType === 'facing_bet' && (node.handClass === 'draw' || node.handClass === 'marginal') && action === 'call' && node.sizeBucket !== 'small'){
      action = 'fold';
      reason = `${node.numPlayers}-way pressure tightens postflop defense thresholds.`;
    }
    if(node.handClass === 'air' && allSkillsIsAggro(action)){
      action = allSkillsStepAction(node, action, -1);
      reason = `${node.numPlayers}-way pots reduce bluff success, so scale aggression down one step.`;
    }
    if(node.handClass === 'draw' && action.startsWith('raise')){
      action = 'call';
      reason = `${node.numPlayers}-way pots discount draw equity; prefer lower-variance continues.`;
    }
  }

  if(!node.options.includes(action)) return {action: baseline.action, reason: baseline.reason};
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

  if(isBest) reason = `Best play: ${allSkillsActionLabel(exploit)}. ${node.exploit.reason}`;
  else if(isBaseline) reason = `Baseline-correct: ${node.baseline.reason} Exploit against ${node.villainLabel} prefers ${allSkillsActionLabel(exploit)}.`;
  else reason = `Best line is ${allSkillsActionLabel(exploit)}. Baseline anchor is ${allSkillsActionLabel(baseline)}.`;

  return {action, isCorrect, score, reason, bestAction: exploit, baselineAction: baseline, skillTag: `${node.street}|${node.spotType}|${node.skillBucket}`};
}

function allSkillsActionCommit(node, action){
  if(action === 'fold' || action === 'check') return 0;
  if(action === 'limp') return 1;

  if(node.street === 'preflop'){
    if(node.spotType === 'preflop_open'){
      if(action === 'raise-small') return asRound(2.4 + Math.max(node.numPlayers - 2, 0) * 0.2, 10);
      if(action === 'raise-medium') return asRound(3.1 + Math.max(node.numPlayers - 2, 0) * 0.3, 10);
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

function allSkillsResolve(meta, node, scored, fatalInfo){
  const entry = {
    street: node.street,
    spotType: node.spotType,
    skillBucket: node.skillBucket,
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
    nextMeta = {...nextMeta, ended: true};
    return {meta: nextMeta, ended: true, fatal: true, text: 'Fatal error detected. Hand terminated and score capped.'};
  }

  if(scored.action === 'fold'){
    nextMeta = {...nextMeta, ended: true};
    return {meta: nextMeta, ended: true, fatal: false, text: 'You folded. Hand ends immediately.'};
  }

  const heroCommitRaw = allSkillsActionCommit(node, scored.action);
  const heroCommit = asRound(Math.min(heroCommitRaw, meta.stackLeftBb), 10);
  const nextPot = allSkillsNextPot(node, scored.action, heroCommit);
  const nextStack = asRound(Math.max(meta.stackLeftBb - heroCommit, 2), 10);

  if(allSkillsIsAggro(scored.action)){
    const size = allSkillsSizeBucket(scored.action);
    const sizeAdj = size === 'large' ? 0.14 : size === 'small' ? -0.06 : 0;
    let foldChance = clamp(meta.villainModel.foldToAggro + sizeAdj + (Math.random() - 0.5) * 0.08, 0.08, 0.85);
    if(meta.numPlayers > 2) foldChance *= clamp(1 - (meta.numPlayers - 2) * 0.09, 0.65, 1);
    if(meta.streetIndex <= meta.targetStreet) foldChance *= AS_DEEP_STREET_FOLD_MULT;
    if(Math.random() < foldChance){
      nextMeta = {...nextMeta, ended: true};
      return {meta: nextMeta, ended: true, fatal: false, text: 'Villain folds to pressure. Hand ends.'};
    }
  }

  if(meta.streetIndex >= 3){
    nextMeta = {...nextMeta, ended: true};
    return {meta: nextMeta, ended: true, fatal: false, text: 'River complete. Hand goes to showdown.'};
  }

  nextMeta = {...nextMeta, streetIndex: meta.streetIndex + 1, currentPotBb: nextPot, stackLeftBb: nextStack};
  return {meta: nextMeta, ended: false, fatal: false, text: `Villain continues. Proceed to ${allSkillsStreetTitle(AS_STREETS[nextMeta.streetIndex])}.`};
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

function allSkillsNextFocus(weakness = {}){
  const keys = Object.keys(weakness).filter(k => (weakness[k]?.total ?? 0) >= AS_MIN_SAMPLES_FOR_FOCUS_CUE);
  if(keys.length === 0) return 'Keep volume high. Weak spots will surface after more reps.';
  keys.sort((a, b) => {
    const A = weakness[a], B = weakness[b];
    const eA = 1 - (A.correct / Math.max(A.total, 1));
    const eB = 1 - (B.correct / Math.max(B.total, 1));
    return eB - eA;
  });
  const [street, , skillBucket] = keys[0].split('|');
  const pretty = {
    preflop_open: 'preflop opening discipline',
    preflop_defense: 'preflop defense spots',
    value: 'postflop thin/thick value sizing',
    bluffing: 'bluff frequency control',
    draw_defense: 'draw continues vs pressure',
    postflop_defense: 'postflop bluff-catch decisions',
  };
  return `Next focus: ${allSkillsStreetTitle(street)} ${pretty[skillBucket] ?? skillBucket}.`;
}

function AllSkillsTab(){
  const [weakness, setWeakness] = useLocalStorageState('poker_allskills_weakness', {});
  const [stats, setStats] = useLocalStorageState('poker_allskills_stats', {correct: 0, total: 0, points: 0, hands: 0});
  const [streak, setStreak] = useLocalStorageState('poker_allskills_streak', 0);
  const [best, setBest] = useLocalStorageState('poker_allskills_best', 0);
  const [examMode, setExamMode] = useLocalStorageState('poker_allskills_exam', false);
  const [fade, setFade] = useState(true);

  const init = () => {
    const m = createAllSkillsHandMeta(weakness);
    return {meta: m, node: allSkillsBuildNode(m), result: null};
  };
  const [state, setState] = useState(() => init());

  const revealBoardCount = state.node.street === 'preflop' ? 0 : state.node.street === 'flop' ? 3 : state.node.street === 'turn' ? 4 : 5;
  const boardNow = state.meta.boardCards.slice(0, revealBoardCount);
  const summary = state.meta.ended ? allSkillsSummarize(state.meta) : null;

  const act = (action) => {
    if(state.result) return;

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
  const focusCue = allSkillsNextFocus(weakness);
  const villainName = state.meta.villainModel.name;
  const playerText = state.meta.numPlayers === 2 ? 'Heads-up pot' : `${state.meta.numPlayers}-way pot — tighten up here`;

  let situationText = '';
  if(state.node.street === 'preflop'){
    if(state.node.spotType === 'preflop_open'){
      situationText = `Action folds to you preflop. Villain profile behind: ${villainName}.`;
    } else {
      situationText = `${villainName} opens ${state.node.sizeBucket} to ${state.node.betBb}bb. You are ${state.meta.heroPos === 'ip' ? 'in position' : 'out of position'}.`;
    }
  } else if(state.node.spotType === 'checked_to_hero'){
    situationText = `${villainName} checks on a ${state.node.boardTexture} board. Pick your continuation action.`;
  } else {
    situationText = `${villainName} bets ${state.node.sizeBucket} (${state.node.betBb}bb) into ${state.node.potBb}bb on a ${state.node.boardTexture} board.`;
  }

  return (
    <div>
      <StatsBar stats={stats} streak={streak} best={best}/>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:10}}>
        <div style={{fontSize:11,color:'#5d7f58',fontFamily:'sans-serif'}}>Mode: <strong style={{color:'#9bc892'}}>{examMode ? 'Exam (deferred feedback)' : 'Immediate feedback'}</strong></div>
        <button onClick={()=>setExamMode(v=>!v)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid rgba(140,170,140,0.32)',background:'rgba(0,0,0,0.2)',color:'#8ab880',cursor:'pointer',fontSize:11,fontFamily:'sans-serif'}}>Toggle Exam</button>
      </div>

      <div style={{background:'linear-gradient(155deg,#1e4a2e,#143822)',border:'2px solid rgba(90,150,90,0.18)',borderRadius:20,padding:'22px 18px',boxShadow:'0 24px 64px rgba(0,0,0,0.75)',opacity:fade?1:0,transform:fade?'translateY(0)':'translateY(8px)',transition:'opacity 0.18s ease,transform 0.18s ease'}}>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14}}>
          <span style={{background:'rgba(90,155,70,0.14)',border:'1px solid rgba(90,155,70,0.38)',color:'#78b060',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{allSkillsStreetTitle(state.node.street)}</span>
          <span style={{background:'rgba(100,100,150,0.15)',border:'1px solid rgba(100,100,180,0.3)',color:'#9090c0',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>Pot {state.node.potBb}bb</span>
          <span style={{background:'rgba(70,120,120,0.15)',border:'1px solid rgba(70,120,120,0.32)',color:'#78a8a8',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{state.meta.stackLeftBb}bb stack</span>
          <span style={{background:'rgba(120,100,170,0.15)',border:'1px solid rgba(120,100,170,0.32)',color:'#b0a0d0',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>{state.meta.heroPos === 'ip' ? 'In Position' : 'Out of Position'}</span>
          <span style={{background:'rgba(170,120,70,0.15)',border:'1px solid rgba(170,120,70,0.32)',color:'#d0a070',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>Villain: {state.meta.villainModel.label}</span>
          {state.meta.numPlayers > 2 && <span style={{background:'rgba(100,100,150,0.18)',border:'1px solid rgba(120,120,190,0.34)',color:'#aab0dd',padding:'3px 10px',borderRadius:20,fontSize:10,letterSpacing:1,textTransform:'uppercase',fontFamily:'sans-serif'}}>👥 {state.meta.numPlayers}-way</span>}
        </div>

        <div style={{background:'rgba(0,0,0,0.22)',borderRadius:10,padding:'14px 16px',marginBottom:16,borderLeft:'3px solid #507848'}}>
          <div style={{fontSize:9,color:'#3d6040',letterSpacing:3,textTransform:'uppercase',fontFamily:'sans-serif',marginBottom:7}}>Situation</div>
          <div style={{fontSize:13,color:'#c8e8b0',fontFamily:'sans-serif',lineHeight:1.6}}>{situationText}</div>
          <div style={{fontSize:11,color:'#7fa37a',marginTop:8,fontFamily:'sans-serif'}}>{playerText}</div>
          {state.node.spotType === 'facing_bet' && (
            <div style={{fontSize:11,color:'#86a882',marginTop:6,fontFamily:'sans-serif'}}>
              Pot odds: {state.node.potOdds}% · Discounted equity: {state.node.effectiveEquity}%
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
        <div style={{fontSize:9,color:'#2e4a2c',letterSpacing:3,textTransform:'uppercase',marginBottom:8}}>Adaptive Cue</div>
        <div style={{fontSize:12,color:'#7fa37a'}}>{focusCue}</div>
      </div>
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
  const titles = {allskills: 'All Skills Trainer', potodds: 'Pot Odds Trainer', preflop: 'Preflop Trainer', postflop: 'Postflop (C-Bet) Trainer', sizing: 'Bet Sizing', positions: 'Table Positions'};

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
