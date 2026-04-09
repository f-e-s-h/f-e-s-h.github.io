import { describe, expect, it } from 'vitest';
import { __testables } from '../App.jsx';

const { genPotOddsScenario } = __testables;

function cardKey(card){
  return `${card.r}${card.s}`;
}

describe('scenario generator robustness', () => {
  it('builds valid pot-odds scenarios over repeated runs', () => {
    const runs = 60;

    for(let i = 0; i < runs; i++){
      const sc = genPotOddsScenario({});
      const cards = [...sc.holeCards, ...sc.communityCards];
      const uniqueCards = new Set(cards.map(cardKey));

      expect(sc).toBeTruthy();
      expect(['flop', 'turn']).toContain(sc.street);
      expect(sc.holeCards).toHaveLength(2);
      expect(sc.communityCards.length === 3 || sc.communityCards.length === 4).toBe(true);
      expect(sc.numPlayers).toBeGreaterThanOrEqual(2);
      expect(sc.numPlayers).toBeLessThanOrEqual(4);
      expect(sc.pot).toBeGreaterThanOrEqual(10);
      expect(sc.bet).toBeGreaterThanOrEqual(5);
      expect(sc.equity).toBeGreaterThanOrEqual(0);
      expect(sc.effectiveEquity).toBeLessThanOrEqual(sc.equity);
      expect(sc.potOdds).toBeGreaterThanOrEqual(1);
      expect(sc.potOdds).toBeLessThanOrEqual(100);
      expect(uniqueCards.size).toBe(cards.length);
      expect(['call', 'fold']).toContain(sc.correct);
    }
  });

  it('still returns valid scenarios with skewed weakness tracker input', () => {
    const tracker = {
      'Flush Draw': {correct: 0, total: 20},
      'One Overcard': {correct: 1, total: 18},
      'Gutshot Straight Draw': {correct: 2, total: 22},
    };

    for(let i = 0; i < 20; i++){
      const sc = genPotOddsScenario(tracker);
      expect(sc.drawName).toBeTruthy();
      expect(sc.outs).toBeGreaterThanOrEqual(2);
      expect(sc.communityCards.length).toBeGreaterThanOrEqual(3);
      expect(sc.communityCards.length).toBeLessThanOrEqual(4);
    }
  });
});
