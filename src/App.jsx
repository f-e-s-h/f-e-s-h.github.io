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
      return {action: 'call', why: 'Strong hand — call with two players. A 3-bet bloats the pot unnecessarily.'};
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
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
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
            const{x,y}=tableSeatXY(i);
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
  const [tab, setTab] = useState('potodds');
  const titles = {potodds: 'Pot Odds Trainer', preflop: 'Preflop Trainer', postflop: 'Postflop (C-Bet) Trainer', sizing: 'Bet Sizing', positions: 'Table Positions'};

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
        {tab === 'potodds'   && <PotOddsTab/>}
        {tab === 'preflop'   && <PreflopTab/>}
        {tab === 'postflop'  && <PostflopTab/>}
        {tab === 'sizing'    && <BetSizingTab/>}
        {tab === 'positions' && <PositionsTab/>}
      </div>
    </div>
  );
}
