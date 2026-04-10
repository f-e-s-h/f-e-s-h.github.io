import { afterEach, describe, expect, it, vi } from 'vitest';
import { __testables } from '../App.jsx';

const {
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
} = __testables;

function card(r, s){
  return {r, s};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('preflop consistency and wording', () => {
  it('classifies KJs suited as medium from raw cards', () => {
    const tier = allSkillsMatchTierFromCards([card(13, 'h'), card(11, 'h')]);
    expect(tier).toBe('medium');
  });

  it('classifies KTs suited as medium from raw cards', () => {
    const tier = allSkillsMatchTierFromCards([card(13, 'd'), card(10, 'd')]);
    expect(tier).toBe('medium');
  });

  it('uses softer tightening for first-in preflop spots', () => {
    const openTier = allSkillsPreflopDecisionTier({
      street: 'preflop',
      spotType: 'preflop_open',
      handClass: 'medium',
      numPlayers: 4,
    });

    const defenseTier = allSkillsPreflopDecisionTier({
      street: 'preflop',
      spotType: 'preflop_facing_open',
      handClass: 'medium',
      numPlayers: 4,
    });

    expect(openTier).toBe('speculative');
    expect(defenseTier).toBe('weak');
  });

  it('avoids weak-hand wording drift for medium first-in spots', () => {
    const baseline = allSkillsBaselineDecision({
      street: 'preflop',
      spotType: 'preflop_open',
      handClass: 'medium',
      numPlayers: 4,
      preflopPos: 'utg',
      preflopSituation: 'unopened',
      raiseOpenBb: 3.2,
      heroPos: 'oop',
    });

    expect(baseline.action).toBe('fold');
    expect(baseline.decisionTier).toBe('speculative');
    expect(baseline.reason).toContain('Speculative hand early');
    expect(baseline.reason).toContain('players behind');
  });

  it('keeps context cue consistent with first-in preflop pressure model', () => {
    const cue = allSkillsContextCue({
      street: 'preflop',
      spotType: 'preflop_open',
      handClass: 'medium',
      numPlayers: 4,
      preflopPos: 'utg',
      heroSeat: 'utg',
    });

    expect(cue).toContain('first-in preflop');
    expect(cue).toContain('a speculative hand');
    expect(cue).toContain('in preflop dynamics');
    expect(cue).toContain('4-max dynamics with 3 behind');
    expect(cue).not.toContain('4-way pot');
  });

  it('uses first-to-act wording for preflop open situation text', () => {
    const text = allSkillsBuildSituationText(
      { street: 'preflop', spotType: 'preflop_open' },
      { heroPos: 'oop' },
      'utg',
      'utg1',
      'Loose-Aggressive'
    );

    expect(text).toContain('first to act preflop');
    expect(text).toContain('likely defender');
    expect(text).not.toMatch(/Action folds to you preflop/i);
  });

  it('uses first-to-act wording in legacy preflop generator unopened spots', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scenario = genPreflopScenario({}, {});

    expect(scenario.situation).toBe('unopened');
    expect(scenario.situationDesc).toContain('first to act preflop');
    expect(scenario.situationDesc).not.toContain('Action folds to you');
  });

  it('keeps all-skills generated hands in heads-up mode', () => {
    for(let i = 0; i < 12; i++){
      const meta = createAllSkillsHandMeta({});
      expect(meta.numPlayers).toBe(2);
    }
  });

  it('treats active ghost count as extra players beyond hero and villain', () => {
    const meta = createAllSkillsHandMeta({});

    expect(meta.numPlayers).toBe(2);
    expect(meta.activeGhostCount).toBeGreaterThanOrEqual(0);
    expect(meta.activeGhostCount).toBeLessThanOrEqual(3);
    expect(meta.effectivePlayers).toBe(2 + meta.activeGhostCount);
    expect(allSkillsGhostCount(meta)).toBe(meta.activeGhostCount);
    expect(allSkillsEffectivePlayers(meta)).toBe(meta.effectivePlayers);
  });

  it('keeps unopened first-in text baseline-first and appends ghost context', () => {
    const text = allSkillsBuildSituationText(
      {
        street: 'preflop',
        spotType: 'preflop_open',
        numPlayers: 2,
        activeGhostCount: 2,
        effectivePlayers: 4,
      },
      {heroPos: 'oop'},
      'utg',
      'bb',
      'Maniac'
    );

    expect(text).toMatch(/^You are first to act preflop/i);
    expect(text).toContain('Ghost pressure');
    expect(text).toContain('4-way dynamics');
  });

  it('applies ghost pressure to tighten preflop facing-open defense', () => {
    const node = {
      street: 'preflop',
      spotType: 'preflop_facing_open',
      handClass: 'medium',
      preflopPos: 'btn',
      preflopSituation: 'raise',
      raiseOpenBb: 3.3,
      sizeBucket: 'medium',
      options: ['fold', 'call', 'raise-large'],
      heroPos: 'ip',
      villainType: 'maniac',
      villainLabel: 'Maniac',
      numPlayers: 2,
      activeGhostCount: 2,
      effectivePlayers: 4,
    };

    const baseline = allSkillsBaselineDecision({...node, activeGhostCount: 0, effectivePlayers: 2});
    const ghostAdjusted = allSkillsApplyGhostPressure(node, baseline);

    expect(baseline.action).toBe('call');
    expect(ghostAdjusted.action).toBe('fold');
    expect(ghostAdjusted.ghostApplied).toBe(true);
    expect(ghostAdjusted.reason).toContain('Ghost adjustment');
  });

  it('prevents impossible raise-caller preflop states', () => {
    const node = allSkillsBuildNode({
      streetIndex: 0,
      focus: {street: 'preflop', spotType: 'preflop_facing_open'},
      heroCards: [card(11, 'd'), card(9, 'd')],
      boardCards: [card(14, 's'), card(7, 'c'), card(3, 'h'), card(6, 's'), card(2, 'd')],
      villainType: 'lag',
      villainModel: {label: 'LAG', aggression: 0.75, looseness: 0.7, foldToAggro: 0.31, small: 0.22, medium: 0.45, large: 0.33},
      numPlayers: 4,
      activeOpponents: 3,
      heroPos: 'ip',
      heroSeat: 'co',
      villainSeat: 'hj',
      stackLeftBb: 100,
      currentPotBb: 8,
      history: [],
      ended: false,
    });

    expect(node.numPlayers).toBe(2);
    expect(node.preflopSituation).toBe('raise');
    expect(node.preflopSituation).not.toBe('raise_caller');
  });

  it('flags maniac preflop exploit trigger instead of neutral fallback wording', () => {
    const node = {
      street: 'preflop',
      spotType: 'preflop_facing_open',
      handClass: 'medium',
      preflopPos: 'btn',
      preflopSituation: 'raise',
      raiseOpenBb: 3.3,
      sizeBucket: 'medium',
      options: ['fold', 'call', 'raise-large'],
      heroPos: 'ip',
      villainType: 'maniac',
      villainLabel: 'Maniac',
      numPlayers: 2,
    };

    const baseline = allSkillsBaselineDecision(node);
    const exploit = allSkillsExploitDecision(node, baseline);

    expect(baseline.action).toBe('call');
    expect(exploit.action).toBe('call');
    expect(exploit.reason).toMatch(/Exploit trigger active|Maniac/);
    expect(exploit.reason).not.toContain('No exploit adjustment is selected');
  });

  it('keeps exploit ordering explicit after ghost-adjusted baseline', () => {
    const node = {
      street: 'flop',
      spotType: 'facing_bet',
      handClass: 'strong',
      sizeBucket: 'medium',
      options: ['fold', 'call', 'raise-small', 'raise-large'],
      heroPos: 'ip',
      villainType: 'maniac',
      villainLabel: 'Maniac',
      numPlayers: 2,
      activeGhostCount: 2,
      effectivePlayers: 4,
      potBb: 18,
      betBb: 8,
      effectiveEquity: 58,
      potOdds: 31,
    };

    const baseline = allSkillsBaselineDecision({...node, activeGhostCount: 0, effectivePlayers: 2});
    const ghostAdjusted = allSkillsApplyGhostPressure(node, baseline);
    const exploit = allSkillsExploitDecision(node, ghostAdjusted);

    expect(baseline.action).toBe('call');
    expect(ghostAdjusted.action).toBe('call');
    expect(exploit.action).toBe('raise-small');
    expect(exploit.reason).toContain('Ghost-aware baseline considered');
  });
});
