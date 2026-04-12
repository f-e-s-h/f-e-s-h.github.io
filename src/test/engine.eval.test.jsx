import { describe, expect, it } from 'vitest';
import { __testables } from '../App.jsx';

const {
  allSkillsBestFive,
  allSkillsEvaluatePostflopCards,
  allSkillsEstimateEquity,
  allSkillsBaselineDecision,
  allSkillsApplyGhostPressure,
  allSkillsExploitDecision,
  allSkillsScoreAction,
} = __testables;

function card(r, s){
  return {r, s};
}

describe('hand evaluation and equity', () => {
  it('returns null for best-five requests with too few cards', () => {
    expect(allSkillsBestFive([card(14, 's'), card(13, 's'), card(12, 's'), card(11, 's')])).toBeNull();
  });

  it('finds straight flush as the best five-card hand', () => {
    const cards = [
      card(14, 'h'),
      card(13, 'h'),
      card(12, 'h'),
      card(11, 'h'),
      card(10, 'h'),
      card(2, 'c'),
      card(3, 'd'),
    ];

    const best = allSkillsBestFive(cards);

    expect(best).toBeTruthy();
    expect(best.rank.category).toBe(8);
    expect(best.rank.tiebreak[0]).toBe(14);
    expect(best.indices).toHaveLength(5);
  });

  it('returns safe air fallback when card input is invalid', () => {
    const evalResult = allSkillsEvaluatePostflopCards([], [], 'flop');

    expect(evalResult.handClass).toBe('air');
    expect(evalResult.madeHand).toBe('high-card');
    expect(evalResult.drawOuts).toBe(0);
    expect(evalResult.equity).toBe(14);
  });

  it('labels combo draws on flop as draw class with meaningful equity', () => {
    const hero = [card(14, 's'), card(13, 's')];
    const board = [card(12, 's'), card(11, 's'), card(2, 'd')];

    const evalResult = allSkillsEvaluatePostflopCards(hero, board, 'flop');

    expect(evalResult.handClass).toBe('draw');
    expect(evalResult.drawType).toContain('combo_flush');
    expect(evalResult.drawOuts).toBeGreaterThanOrEqual(12);
    expect(evalResult.equity).toBeGreaterThanOrEqual(45);
  });

  it('classifies river full house as monster strength', () => {
    const hero = [card(14, 'h'), card(14, 'd')];
    const board = [card(14, 's'), card(13, 'c'), card(13, 'd'), card(2, 'h'), card(3, 's')];

    const evalResult = allSkillsEvaluatePostflopCards(hero, board, 'river');

    expect(evalResult.handClass).toBe('monster');
    expect(evalResult.madeHand).toBe('full-house');
    expect(evalResult.drawOuts).toBe(0);
    expect(evalResult.equity).toBeGreaterThanOrEqual(80);
  });

  it('clears draw metadata on river even when turn-style draws exist in card shape', () => {
    const hero = [card(14, 's'), card(13, 's')];
    const board = [card(12, 's'), card(11, 'h'), card(2, 'd'), card(9, 'c'), card(3, 'h')];

    const evalResult = allSkillsEvaluatePostflopCards(hero, board, 'river');

    expect(evalResult.drawType).toBe('none');
    expect(evalResult.drawOuts).toBe(0);
    expect(evalResult.drawLabel).toBe('No draw');
  });

  it('classifies top pair with strong kicker as strong', () => {
    const hero = [card(14, 'h'), card(12, 'd')];
    const board = [card(14, 'c'), card(7, 's'), card(2, 'h')];

    const evalResult = allSkillsEvaluatePostflopCards(hero, board, 'flop');

    expect(evalResult.handClass).toBe('strong');
    expect(evalResult.madeHand).toBe('top-pair');
    expect(evalResult.heroCardsUsed).toBeGreaterThanOrEqual(1);
  });

  it('applies multiway draw discount in effective equity while preserving pot odds', () => {
    const equity = allSkillsEstimateEquity({
      street: 'flop',
      handClass: 'draw',
      postflopEval: {equity: 52},
      numPlayers: 4,
      betBb: 6,
      potBb: 18,
    });

    expect(equity.equity).toBe(52);
    expect(equity.effectiveEquity).toBeLessThanOrEqual(52);
    expect(equity.potOdds).toBe(25);
  });

  it('falls back to river air baseline without postflop evaluation', () => {
    const equity = allSkillsEstimateEquity({
      street: 'river',
      handClass: 'air',
      numPlayers: 2,
      betBb: 0,
      potBb: 20,
    });

    expect(equity.equity).toBe(10);
    expect(equity.effectiveEquity).toBe(10);
    expect(equity.potOdds).toBe(0);
  });

  it('decreases draw effective equity monotonically as player count increases', () => {
    const baseline = {
      street: 'flop',
      handClass: 'draw',
      postflopEval: {equity: 52},
      betBb: 6,
      potBb: 18,
    };

    const hu = allSkillsEstimateEquity({...baseline, numPlayers: 2});
    const threeWay = allSkillsEstimateEquity({...baseline, numPlayers: 3});
    const fourWay = allSkillsEstimateEquity({...baseline, numPlayers: 4});

    expect(hu.effectiveEquity).toBe(52);
    expect(threeWay.effectiveEquity).toBe(44);
    expect(fourWay.effectiveEquity).toBe(36);
    expect(hu.potOdds).toBe(25);
    expect(threeWay.potOdds).toBe(25);
    expect(fourWay.potOdds).toBe(25);
    expect(hu.effectiveEquity).toBeGreaterThan(threeWay.effectiveEquity);
    expect(threeWay.effectiveEquity).toBeGreaterThan(fourWay.effectiveEquity);
  });

  it('calls marginal hands facing medium bets when discounted equity clears price', () => {
    const decision = allSkillsBaselineDecision({
      street: 'flop',
      spotType: 'facing_bet',
      handClass: 'marginal',
      sizeBucket: 'medium',
      effectiveEquity: 36,
      potOdds: 37,
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
    });

    expect(decision.action).toBe('fold');

    const pricedDecision = allSkillsBaselineDecision({
      street: 'flop',
      spotType: 'facing_bet',
      handClass: 'marginal',
      sizeBucket: 'medium',
      effectiveEquity: 38,
      potOdds: 37,
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
    });

    expect(pricedDecision.action).toBe('call');
  });

  it('tightens postflop marginal defense under ghost pressure', () => {
    const headsUpNode = {
      street: 'flop',
      spotType: 'facing_bet',
      handClass: 'marginal',
      sizeBucket: 'medium',
      effectiveEquity: 39,
      potOdds: 37,
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
      numPlayers: 2,
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const ghostNode = {...headsUpNode, activeGhostCount: 2, effectivePlayers: 4, effectiveEquity: 32};
    const baseline = allSkillsBaselineDecision(headsUpNode);
    const ghostAdjusted = allSkillsApplyGhostPressure(ghostNode, baseline);

    expect(baseline.action).toBe('call');
    expect(ghostAdjusted.action).toBe('fold');
    expect(ghostAdjusted.ghostApplied).toBe(true);
  });

  it('tightens postflop draw continues under ghost pressure', () => {
    const headsUpNode = {
      street: 'turn',
      spotType: 'facing_bet',
      handClass: 'draw',
      sizeBucket: 'medium',
      effectiveEquity: 30,
      potOdds: 28,
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
      numPlayers: 2,
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const ghostNode = {...headsUpNode, activeGhostCount: 1, effectivePlayers: 3, effectiveEquity: 24};
    const baseline = allSkillsBaselineDecision(headsUpNode);
    const ghostAdjusted = allSkillsApplyGhostPressure(ghostNode, baseline);

    expect(baseline.action).toBe('call');
    expect(ghostAdjusted.action).toBe('fold');
    expect(ghostAdjusted.reason).toContain('Ghost adjustment');
  });

  it('uses medium sizing for strong semiwet checked-to-hero spots instead of auto-large', () => {
    const decision = allSkillsBaselineDecision({
      street: 'turn',
      spotType: 'checked_to_hero',
      handClass: 'strong',
      boardTexture: 'semi-wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      postflopEval: {madeHand: 'overpair', heroCardsUsed: 2},
      numPlayers: 2,
      heroPos: 'ip',
    });

    expect(decision.action).toBe('bet-medium');
  });

  it('allows pot control for thin strong hands on paired checked-to-hero boards', () => {
    const decision = allSkillsBaselineDecision({
      street: 'flop',
      spotType: 'checked_to_hero',
      handClass: 'strong',
      boardTexture: 'paired',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      postflopEval: {madeHand: 'two-pair', heroCardsUsed: 1},
      numPlayers: 2,
      heroPos: 'ip',
    });

    expect(decision.action).toBe('check');
  });

  it('prefers medium draw semibluffs in heads-up semiwet checked-to-hero spots', () => {
    const decision = allSkillsBaselineDecision({
      street: 'flop',
      spotType: 'checked_to_hero',
      handClass: 'draw',
      boardTexture: 'semi-wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      numPlayers: 2,
      heroPos: 'ip',
    });

    expect(decision.action).toBe('bet-medium');
  });

  it('still allows large draw pressure on wet checked-to-hero boards', () => {
    const decision = allSkillsBaselineDecision({
      street: 'flop',
      spotType: 'checked_to_hero',
      handClass: 'draw',
      boardTexture: 'wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      numPlayers: 2,
      heroPos: 'ip',
    });

    expect(decision.action).toBe('bet-large');
  });

  it('marks secondary allowed strong sizing as acceptable instead of incorrect', () => {
    const scored = allSkillsScoreAction({
      street: 'turn',
      spotType: 'checked_to_hero',
      handClass: 'strong',
      boardTexture: 'semi-wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      numPlayers: 2,
      villainLabel: 'TAG',
      skillBucket: 'value',
      baseline: {action: 'bet-medium', reason: 'Solid value sizing line.'},
      exploit: {action: 'bet-medium', reason: 'No exploit offset needed.'},
    }, 'bet-large');

    expect(scored.isCorrect).toBe(true);
    expect(scored.score).toBe(0.65);
    expect(scored.bestAction).toBe('bet-medium');
    expect(scored.acceptableActions).toContain('bet-large');
    expect(scored.reason).toContain('acceptable alternative');
  });

  it('does not grant aggressive alternatives when baseline and exploit both anchor to check', () => {
    const scored = allSkillsScoreAction({
      street: 'flop',
      spotType: 'checked_to_hero',
      handClass: 'draw',
      boardTexture: 'wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      numPlayers: 4,
      villainLabel: 'LAG',
      skillBucket: 'bluffing',
      baseline: {action: 'check', reason: 'Multiway realization prefers check.'},
      exploit: {action: 'check', reason: 'No exploit offset needed.'},
    }, 'bet-large');

    expect(scored.isCorrect).toBe(false);
    expect(scored.score).toBe(0);
    expect(scored.acceptableActions).toEqual([]);
  });

  it('keeps turn_pressure value sizing centered at medium on non-wet turns', () => {
    const node = {
      street: 'turn',
      spotType: 'checked_to_hero',
      handClass: 'strong',
      boardTexture: 'semi-wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      numPlayers: 2,
      heroPos: 'ip',
      villainType: 'lp',
      villainLabel: 'LP',
      postflopFamilyId: 'turn_pressure',
      postflopEval: {madeHand: 'top-pair', heroCardsUsed: 2},
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('bet-medium');
    expect(exploit.action).toBe('bet-medium');
    expect(exploit.reason).toMatch(/Turn-pressure calibration/i);
  });

  it('prefers near-price draw calls in flop_cbet_bluff facing-bet branches', () => {
    const node = {
      street: 'turn',
      spotType: 'facing_bet',
      handClass: 'draw',
      sizeBucket: 'medium',
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
      villainType: 'tag',
      villainLabel: 'TAG',
      numPlayers: 2,
      potBb: 18,
      betBb: 8,
      effectiveEquity: 33,
      potOdds: 37,
      postflopFamilyId: 'flop_cbet_bluff',
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('fold');
    expect(exploit.action).toBe('call');
    expect(exploit.reason).toMatch(/Flop c-bet bluff calibration/i);
  });

  it('keeps far-from-price draw folds in flop_cbet_bluff facing-bet branches', () => {
    const node = {
      street: 'turn',
      spotType: 'facing_bet',
      handClass: 'draw',
      sizeBucket: 'medium',
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
      villainType: 'tag',
      villainLabel: 'TAG',
      numPlayers: 2,
      potBb: 18,
      betBb: 10,
      effectiveEquity: 19,
      potOdds: 40,
      postflopFamilyId: 'flop_cbet_bluff',
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('fold');
    expect(exploit.action).toBe('fold');
  });

  it('adds medium marginal pressure on OOP turn_pressure textures instead of pure checks', () => {
    const node = {
      street: 'turn',
      spotType: 'checked_to_hero',
      handClass: 'marginal',
      boardTexture: 'semi-wet',
      options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
      heroPos: 'oop',
      villainType: 'tag',
      villainLabel: 'TAG',
      numPlayers: 2,
      postflopFamilyId: 'turn_pressure',
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('check');
    expect(exploit.action).toBe('bet-medium');
    expect(exploit.reason).toMatch(/Turn-pressure calibration/i);
  });

  it('adds OOP medium air probes in flop_cbet_bluff checked-to-hero pressure textures', () => {
    const node = {
      street: 'flop',
      spotType: 'checked_to_hero',
      handClass: 'air',
      boardTexture: 'semi-wet',
      options: ['check', 'bet-small', 'bet-medium'],
      heroPos: 'oop',
      villainType: 'tag',
      villainLabel: 'TAG',
      numPlayers: 2,
      postflopFamilyId: 'flop_cbet_bluff',
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('check');
    expect(exploit.action).toBe('bet-medium');
    expect(exploit.reason).toMatch(/Flop c-bet bluff calibration/i);
  });

  it('uses OOP raise-large semibluff for near-price draws in flop_cbet_bluff facing-bet pressure spots', () => {
    const node = {
      street: 'turn',
      spotType: 'facing_bet',
      handClass: 'draw',
      boardTexture: 'semi-wet',
      sizeBucket: 'medium',
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'oop',
      villainType: 'tag',
      villainLabel: 'TAG',
      numPlayers: 2,
      potBb: 18,
      betBb: 8,
      effectiveEquity: 28,
      potOdds: 37,
      postflopFamilyId: 'flop_cbet_bluff',
      activeGhostCount: 0,
      effectivePlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('fold');
    expect(exploit.action).toBe('raise-large');
    expect(exploit.reason).toMatch(/Flop c-bet bluff calibration/i);
  });
});
