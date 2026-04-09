import { describe, expect, it } from 'vitest';
import { __testables } from '../App.jsx';

const {
  allSkillsBestFive,
  allSkillsEvaluatePostflopCards,
  allSkillsEstimateEquity,
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
});
