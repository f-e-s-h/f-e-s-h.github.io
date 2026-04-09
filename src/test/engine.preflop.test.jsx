import { describe, expect, it } from 'vitest';
import { __testables } from '../App.jsx';

const {
  allSkillsMatchTierFromCards,
  allSkillsPreflopDecisionTier,
  allSkillsBaselineDecision,
  allSkillsContextCue,
  allSkillsBuildSituationText,
} = __testables;

function card(r, s){
  return {r, s};
}

describe('preflop consistency and wording', () => {
  it('classifies KJs suited as medium from raw cards', () => {
    const tier = allSkillsMatchTierFromCards([card(13, 'h'), card(11, 'h')]);
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
    expect(cue).toContain('4-max table with 3 behind');
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
});
