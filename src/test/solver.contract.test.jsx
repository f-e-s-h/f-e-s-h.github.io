import { describe, expect, it } from 'vitest';

import {
  buildCanonicalSpotKey,
  bucketizeSolverFrequencies,
  gradeActionByFrequency,
  isSolverEligibleNode,
  mapSolverAmountToAction,
} from '../solvers/contract.js';

describe('solver contract utilities', () => {
  it('builds canonical spot key from node and meta fields', () => {
    const key = buildCanonicalSpotKey({
      street: 'flop',
      spotType: 'checked_to_hero',
      heroPos: 'ip',
      stackLeftBb: 78,
      boardTexture: 'semi-wet',
    }, {
      history: [],
    });

    expect(key).toBe('pos_ip__stack_80bb__texture_semi_wet__node_flop_checked_to_hero__hist_start');
  });

  it('includes sanitized action history in canonical key', () => {
    const key = buildCanonicalSpotKey({
      street: 'turn',
      spotType: 'facing_bet',
      heroPos: 'oop',
      stackLeftBb: 102,
      boardTexture: 'wet',
    }, {
      history: [
        { street: 'flop', action: 'bet-small' },
        { street: 'flop', action: 'call' },
      ],
    });

    expect(key).toContain('hist_flop_bet_small__flop_call');
  });

  it('pins flop canonical history to start regardless of prior hand records', () => {
    const key = buildCanonicalSpotKey({
      street: 'flop',
      spotType: 'checked_to_hero',
      heroPos: 'ip',
      stackLeftBb: 100,
      boardTexture: 'dry',
    }, {
      history: [
        { street: 'preflop', action: 'raise-small' },
        { street: 'preflop', action: 'call' },
      ],
    });

    expect(key).toContain('hist_start');
  });

  it('maps equal-distance checked-to-hero sizing tie to the larger bucket', () => {
    const mapped = mapSolverAmountToAction('checked_to_hero', 0.455);
    expect(mapped).toBe('bet-medium');
  });

  it('bucketizes solver actions and normalizes frequencies', () => {
    const frequencies = bucketizeSolverFrequencies([
      { action: 'check', frequency: 0.2 },
      { action: 'bet 33%', frequency: 0.3, amountPot: 0.33 },
      { action: 'bet 58%', frequency: 0.35, amountPot: 0.58 },
      { action: 'bet 86%', frequency: 0.15, amountPot: 0.86 },
    ], 'checked_to_hero');

    const sum = Object.values(frequencies).reduce((acc, value) => acc + value, 0);

    expect(Object.keys(frequencies).sort()).toEqual(['bet-large', 'bet-medium', 'bet-small', 'check']);
    expect(sum).toBeCloseTo(1, 8);
    expect(frequencies['bet-medium']).toBeGreaterThan(frequencies['bet-large']);
  });

  it('grades actions from frequency thresholds', () => {
    const frequencies = {
      check: 0.58,
      'bet-small': 0.22,
      'bet-medium': 0.14,
      'bet-large': 0.06,
    };

    expect(gradeActionByFrequency('check', frequencies).category).toBe('best');
    expect(gradeActionByFrequency('bet-small', frequencies).category).toBe('acceptable');
    expect(gradeActionByFrequency('bet-large', frequencies).category).toBe('incorrect');
  });

  it('enforces heads-up postflop eligibility for solver coverage', () => {
    expect(isSolverEligibleNode({
      street: 'flop',
      spotType: 'checked_to_hero',
      numPlayers: 2,
      effectivePlayers: 2,
      activeGhostCount: 0,
    })).toBe(true);

    expect(isSolverEligibleNode({
      street: 'preflop',
      spotType: 'preflop_open',
      numPlayers: 2,
      effectivePlayers: 2,
      activeGhostCount: 0,
    })).toBe(false);

    expect(isSolverEligibleNode({
      street: 'turn',
      spotType: 'facing_bet',
      numPlayers: 2,
      effectivePlayers: 3,
      activeGhostCount: 1,
    })).toBe(false);

    expect(isSolverEligibleNode({
      street: 'river',
      spotType: 'facing_bet',
      numPlayers: 2,
      effectivePlayers: 2,
      activeGhostCount: 0,
    })).toBe(false);
  });
});
