import { afterEach, describe, expect, it, vi } from 'vitest';
import { __testables } from '../App.jsx';

const {
  allSkillsActionCommit,
  allSkillsNextPot,
  allSkillsActiveOpponents,
  allSkillsApplyOpponentAttrition,
  allSkillsResolve,
} = __testables;

function withRandomSequence(values, fallback = 0.99){
  const seq = [...values];
  return vi.spyOn(Math, 'random').mockImplementation(() => (seq.length > 0 ? seq.shift() : fallback));
}

function buildMeta(overrides = {}){
  return {
    id: 'test-hand',
    history: [],
    activeOpponents: 2,
    numPlayers: 3,
    villainModel: {foldToAggro: 0.35},
    stackLeftBb: 80,
    currentPotBb: 12,
    streetIndex: 1,
    targetStreet: 3,
    ended: false,
    ...overrides,
  };
}

function buildNode(overrides = {}){
  return {
    street: 'flop',
    spotType: 'checked_to_hero',
    skillBucket: 'value',
    numPlayers: 3,
    postflopFamilyId: 'flop_value_build',
    potBb: 12,
    betBb: null,
    stackLeftBb: 80,
    options: ['check', 'bet-small', 'bet-medium', 'bet-large'],
    ...overrides,
  };
}

function buildScored(action, overrides = {}){
  return {
    action,
    isCorrect: true,
    score: 1,
    reason: 'test decision',
    bestAction: action,
    baselineAction: action,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('engine resolver invariants', () => {
  it('computes commits and pot transitions consistently', () => {
    const preflopNode = {street: 'preflop', spotType: 'preflop_open', numPlayers: 4, potBb: 1.5, betBb: null};
    expect(allSkillsActionCommit(preflopNode, 'raise-medium')).toBeCloseTo(3.7, 8);

    const limpedPot = allSkillsNextPot({potBb: 1.5, numPlayers: 4, betBb: null}, 'limp', 1);
    expect(limpedPot).toBeCloseTo(4.5, 8);

    const calledPot = allSkillsNextPot({potBb: 10, numPlayers: 2, betBb: 4}, 'call', 4);
    expect(calledPot).toBeCloseTo(18, 8);

    const aggroPot = allSkillsNextPot({potBb: 10, numPlayers: 2, betBb: 4}, 'bet-medium', 6);
    expect(aggroPot).toBeCloseTo(22, 8);

    const unknownCommit = allSkillsActionCommit({street: 'flop', potBb: 10, betBb: null, numPlayers: 2}, 'mystery-token');
    expect(unknownCommit).toBe(0);
  });

  it('normalizes active opponents and attrition bounds', () => {
    expect(allSkillsActiveOpponents({activeOpponents: 2.6})).toBe(3);
    expect(allSkillsActiveOpponents({numPlayers: 5})).toBe(4);
    expect(allSkillsActiveOpponents({})).toBe(1);

    const spy = withRandomSequence([0.1, 0.1, 0.1], 0.1);
    const remaining = allSkillsApplyOpponentAttrition(3, 1, 1);
    spy.mockRestore();
    expect(remaining).toBe(1);
  });

  it('terminates immediately on fatal decision', () => {
    const meta = buildMeta();
    const node = buildNode();
    const scored = buildScored('check');
    const fatalInfo = {isFatal: true, code: 'limp_trash', message: 'fatal test'};

    const result = allSkillsResolve(meta, node, scored, fatalInfo);

    expect(result.ended).toBe(true);
    expect(result.fatal).toBe(true);
    expect(result.meta.ended).toBe(true);
    expect(result.meta.history).toHaveLength(1);
    expect(result.meta.history[0].fatal).toBe(true);
  });

  it('ends hand on explicit fold action', () => {
    const meta = buildMeta();
    const node = buildNode({spotType: 'facing_bet', options: ['fold', 'call', 'raise-large'], betBb: 4});
    const scored = buildScored('fold');
    const fatalInfo = {isFatal: false, code: null, message: ''};

    const result = allSkillsResolve(meta, node, scored, fatalInfo);

    expect(result.ended).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.meta.ended).toBe(true);
    expect(result.text).toMatch(/Hand ends immediately/i);
  });

  it('progresses street with conserved invariants on passive action', () => {
    const spy = withRandomSequence([0.99, 0.99], 0.99);
    const meta = buildMeta();
    const node = buildNode();
    const scored = buildScored('check');
    const fatalInfo = {isFatal: false, code: null, message: ''};

    const result = allSkillsResolve(meta, node, scored, fatalInfo);
    spy.mockRestore();

    expect(result.ended).toBe(false);
    expect(result.meta.history).toHaveLength(1);
    expect(result.meta.streetIndex).toBe(meta.streetIndex + 1);
    expect(result.meta.currentPotBb).toBeCloseTo(meta.currentPotBb, 8);
    expect(result.meta.stackLeftBb).toBeCloseTo(meta.stackLeftBb, 8);
    expect(result.meta.activeOpponents).toBeGreaterThanOrEqual(1);
    expect(result.meta.numPlayers).toBe(result.meta.activeOpponents + 1);
  });

  it('marks all-in transitions as terminal showdown', () => {
    const meta = buildMeta({stackLeftBb: 5, currentPotBb: 20});
    const node = buildNode({spotType: 'facing_bet', potBb: 20, betBb: 6, options: ['fold', 'call', 'raise-large']});
    const scored = buildScored('call');
    const fatalInfo = {isFatal: false, code: null, message: ''};

    const result = allSkillsResolve(meta, node, scored, fatalInfo);

    expect(result.ended).toBe(true);
    expect(result.meta.ended).toBe(true);
    expect(result.meta.stackLeftBb).toBe(0);
    expect(result.text).toMatch(/Stacks are in/i);
  });

  it('ends heads-up hands when pressure forces a fold', () => {
    const spy = withRandomSequence([0.5, 0.01], 0.99);
    const meta = buildMeta({activeOpponents: 1, numPlayers: 2, villainModel: {foldToAggro: 0.8}});
    const node = buildNode({numPlayers: 2, options: ['check', 'bet-small', 'bet-medium', 'bet-large']});
    const scored = buildScored('bet-large');
    const fatalInfo = {isFatal: false, code: null, message: ''};

    const result = allSkillsResolve(meta, node, scored, fatalInfo);
    spy.mockRestore();

    expect(result.ended).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.meta.activeOpponents).toBe(0);
    expect(result.meta.numPlayers).toBe(1);
    expect(result.text).toMatch(/Villain folds to pressure/i);
  });

  it('reduces field size but continues when multiway pressure gets partial folds', () => {
    const spy = withRandomSequence([0.5, 0.01, 0.2, 0.9, 0.9, 0.9, 0.9], 0.99);
    const meta = buildMeta({activeOpponents: 3, numPlayers: 4, villainModel: {foldToAggro: 0.8}});
    const node = buildNode({numPlayers: 4});
    const scored = buildScored('bet-medium');
    const fatalInfo = {isFatal: false, code: null, message: ''};

    const result = allSkillsResolve(meta, node, scored, fatalInfo);
    spy.mockRestore();

    expect(result.ended).toBe(false);
    expect(result.meta.activeOpponents).toBeGreaterThanOrEqual(1);
    expect(result.meta.activeOpponents).toBeLessThan(meta.activeOpponents);
    expect(result.meta.numPlayers).toBe(result.meta.activeOpponents + 1);
    expect(result.text).toMatch(/Field now 3-way/i);
  });
});
