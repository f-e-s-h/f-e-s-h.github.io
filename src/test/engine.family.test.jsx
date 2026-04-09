import { describe, expect, it } from 'vitest';
import { __testables } from '../App.jsx';

const {
  postflopFamilyWeight,
  postflopFamilyRotation,
  postflopClassifyFamily,
  postflopCreateState,
} = __testables;

describe('postflop family engine', () => {
  it('weights unseen families as boosted and scales misses for sampled families', () => {
    expect(postflopFamilyWeight('flop_value_build', {})).toBeCloseTo(1.3, 8);

    const weighted = postflopFamilyWeight('river_bluffcatch', {
      river_bluffcatch: {correct: 4, total: 10, misses: 3},
    });
    expect(weighted).toBeCloseTo(3.16, 8);
  });

  it('builds a unique rotation and honors an explicit lead family', () => {
    const rotation = postflopFamilyRotation({
      river_bluffcatch: {correct: 2, total: 8, misses: 5},
      flop_draw_defense: {correct: 6, total: 12, misses: 1},
    }, 'turn_pressure');

    const ids = rotation.map(f => f.id);
    expect(ids[0]).toBe('turn_pressure');
    expect(ids).toContain('river_bluffcatch');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns null family info for preflop nodes', () => {
    const classified = postflopClassifyFamily({street: 'preflop'});

    expect(classified.family).toBeNull();
    expect(classified.familyId).toBeNull();
    expect(classified.matched).toBe(false);
  });

  it('selects highest-priority family unless a preferred matched family is provided', () => {
    const node = {
      street: 'flop',
      spotType: 'facing_bet',
      numPlayers: 3,
      handClass: 'draw',
    };

    const defaultPick = postflopClassifyFamily(node);
    expect(defaultPick.matched).toBe(true);
    expect(defaultPick.familyId).toBe('multiway_branch');

    const preferredPick = postflopClassifyFamily(node, 'flop_draw_defense');
    expect(preferredPick.matched).toBe(true);
    expect(preferredPick.familyId).toBe('flop_draw_defense');
    expect(preferredPick.matchedIds).toContain('multiway_branch');
    expect(preferredPick.matchCount).toBeGreaterThan(1);
  });

  it('falls back to preferred family when no matches exist', () => {
    const node = {
      street: 'river',
      spotType: 'checked_to_hero',
      numPlayers: 5,
      handClass: 'air',
    };

    const classified = postflopClassifyFamily(node, 'river_bluffcatch');
    expect(classified.matched).toBe(false);
    expect(classified.familyId).toBe('river_bluffcatch');
    expect(classified.matchCount).toBe(0);
  });

  it('creates postflop state with generation telemetry invariants', () => {
    for(let i = 0; i < 5; i++){
      const state = postflopCreateState({});

      expect(state.result).toBeNull();
      expect(state.meta).toBeTruthy();
      expect(state.node).toBeTruthy();
      expect(['flop', 'turn', 'river']).toContain(state.node.street);
      expect(typeof state.meta.familyId).toBe('string');
      expect(typeof state.meta.familyLabel).toBe('string');
      expect(state.meta.generation.attempts).toBeGreaterThan(0);
      expect(typeof state.meta.generation.resolvedFamilyId).toBe('string');
      expect(state.meta.activeOpponents).toBeGreaterThanOrEqual(1);
      expect(state.meta.numPlayers).toBe(state.meta.activeOpponents + 1);
    }
  });
});
