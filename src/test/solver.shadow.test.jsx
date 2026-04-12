import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHADOW_PROMOTION_GATES,
  buildShadowDiagnosticReport,
  clusterShadowRecords,
  createShadowComparison,
  evaluateShadowPromotionReadiness,
  summarizeShadowRecords,
} from '../solvers/shadow.js';

describe('solver shadow comparator', () => {
  it('marks missing solver coverage as uncovered', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_a',
      node: { street: 'flop', spotType: 'checked_to_hero' },
      scored: { action: 'check', bestAction: 'check' },
      solverDecision: null,
    });

    expect(comparison.covered).toBe(false);
    expect(comparison.status).toBe('uncovered');
    expect(comparison.solverBest).toBeNull();
  });

  it('marks agreement when heuristic best matches solver best', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_b',
      node: { street: 'turn', spotType: 'facing_bet' },
      scored: { action: 'call', bestAction: 'call' },
      solverDecision: {
        frequencies: {
          fold: 0.1,
          call: 0.55,
          'raise-small': 0.2,
          'raise-large': 0.15,
        },
      },
    });

    expect(comparison.covered).toBe(true);
    expect(comparison.status).toBe('agreement');
    expect(comparison.solverBest).toBe('call');
  });

  it('marks soft mismatch when heuristic choice is still acceptable', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_c',
      node: { street: 'flop', spotType: 'checked_to_hero' },
      scored: { action: 'bet-small', bestAction: 'bet-small' },
      solverDecision: {
        frequencies: {
          check: 0.56,
          'bet-small': 0.28,
          'bet-medium': 0.1,
          'bet-large': 0.06,
        },
      },
    });

    expect(comparison.status).toBe('soft_mismatch');
    expect(comparison.heuristicCategory).toBe('acceptable');
  });

  it('marks hard mismatch when heuristic choice is below acceptable threshold', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_d',
      node: { street: 'river', spotType: 'facing_bet' },
      scored: { action: 'raise-large', bestAction: 'raise-large' },
      solverDecision: {
        frequencies: {
          fold: 0.12,
          call: 0.68,
          'raise-small': 0.16,
          'raise-large': 0.04,
        },
      },
    });

    expect(comparison.status).toBe('hard_mismatch');
    expect(comparison.heuristicCategory).toBe('incorrect');
  });

  it('downgrades adjacent sizing mismatch to soft even when heuristic bucket is below acceptable threshold', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_d_adjacent',
      node: { street: 'turn', spotType: 'checked_to_hero' },
      scored: { action: 'bet-small', bestAction: 'bet-small' },
      solverDecision: {
        frequencies: {
          check: 0.08,
          'bet-small': 0.09,
          'bet-medium': 0.58,
          'bet-large': 0.25,
        },
      },
    });

    expect(comparison.solverBest).toBe('bet-medium');
    expect(comparison.heuristicCategory).toBe('incorrect');
    expect(comparison.status).toBe('soft_mismatch');
  });

  it('keeps check-versus-bet conflicts as hard mismatches in mixed families', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_strict_conflict',
      node: { street: 'turn', spotType: 'checked_to_hero', postflopFamilyId: 'turn_pressure' },
      scored: { action: 'check', bestAction: 'check' },
      solverDecision: {
        frequencies: {
          check: 0.11,
          'bet-small': 0.2,
          'bet-medium': 0.47,
          'bet-large': 0.22,
        },
      },
    });

    expect(comparison.solverBest).toBe('bet-medium');
    expect(comparison.heuristicCategory).toBe('incorrect');
    expect(comparison.status).toBe('hard_mismatch');
  });

  it('downgrades near-gap family mixing mismatches from hard to soft', () => {
    const comparison = createShadowComparison({
      spotKey: 'spot_family_mix',
      node: { street: 'turn', spotType: 'facing_bet', postflopFamilyId: 'flop_cbet_bluff' },
      scored: { action: 'call', bestAction: 'call' },
      solverDecision: {
        frequencies: {
          fold: 0.17,
          call: 0.12,
          'raise-small': 0.33,
          'raise-large': 0.38,
        },
      },
    });

    expect(comparison.heuristicCategory).toBe('incorrect');
    expect(comparison.status).toBe('soft_mismatch');
  });

  it('summarizes shadow records by status', () => {
    const summary = summarizeShadowRecords([
      { covered: true, status: 'agreement' },
      { covered: true, status: 'soft_mismatch' },
      { covered: true, status: 'hard_mismatch' },
      { covered: false, status: 'uncovered' },
    ]);

    expect(summary.total).toBe(4);
    expect(summary.covered).toBe(3);
    expect(summary.uncovered).toBe(1);
    expect(summary.agreement).toBe(1);
    expect(summary.soft_mismatch).toBe(1);
    expect(summary.hard_mismatch).toBe(1);
  });

  it('clusters records by street/spot/family/status with descending counts', () => {
    const clusters = clusterShadowRecords([
      { street: 'flop', spotType: 'checked_to_hero', familyId: 'flop_cbet_bluff', status: 'hard_mismatch' },
      { street: 'flop', spotType: 'checked_to_hero', familyId: 'flop_cbet_bluff', status: 'hard_mismatch' },
      { street: 'turn', spotType: 'facing_bet', familyId: 'turn_pressure', status: 'soft_mismatch' },
    ], 3);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].status).toBe('hard_mismatch');
    expect(clusters[0].count).toBe(2);
    expect(clusters[1].status).toBe('soft_mismatch');
  });

  it('builds diagnostic report with focused mismatch cluster slices', () => {
    const report = buildShadowDiagnosticReport([
      { covered: true, status: 'hard_mismatch', street: 'flop', spotType: 'checked_to_hero', familyId: 'flop_cbet_bluff' },
      { covered: true, status: 'hard_mismatch', street: 'flop', spotType: 'checked_to_hero', familyId: 'flop_cbet_bluff' },
      { covered: true, status: 'soft_mismatch', street: 'turn', spotType: 'facing_bet', familyId: 'turn_pressure' },
      { covered: false, status: 'uncovered', street: 'river', spotType: 'facing_bet', familyId: 'river_bluffcatch' },
    ], {maxClusters: 5});

    expect(report.summary.total).toBe(4);
    expect(report.summary.hard_mismatch).toBe(2);
    expect(report.hardMismatchClusters.length).toBeGreaterThanOrEqual(1);
    expect(report.softMismatchClusters.length).toBeGreaterThanOrEqual(1);
    expect(report.uncoveredClusters.length).toBeGreaterThanOrEqual(1);
    expect(report.readiness).toBeTruthy();
    expect(typeof report.readiness.ready).toBe('boolean');
  });

  it('marks promotion readiness as blocked when sample and mismatch gates fail', () => {
    const readiness = evaluateShadowPromotionReadiness({
      total: 30,
      covered: 18,
      uncovered: 12,
      agreement: 7,
      soft_mismatch: 4,
      hard_mismatch: 7,
    }, {
      ...DEFAULT_SHADOW_PROMOTION_GATES,
      minSamples: 60,
      maxUncoveredRate: 0.2,
      maxHardMismatchRate: 0.2,
      maxSoftMismatchRate: 0.35,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.length).toBeGreaterThan(0);
    expect(readiness.metrics.uncoveredRate).toBeGreaterThan(0.2);
    expect(readiness.metrics.hardMismatchRate).toBeGreaterThan(0.2);
  });

  it('marks promotion readiness as ready when all gates pass', () => {
    const readiness = evaluateShadowPromotionReadiness({
      total: 240,
      covered: 220,
      uncovered: 20,
      agreement: 170,
      soft_mismatch: 28,
      hard_mismatch: 22,
    }, {
      ...DEFAULT_SHADOW_PROMOTION_GATES,
      minSamples: 120,
      maxUncoveredRate: 0.2,
      maxHardMismatchRate: 0.18,
      maxSoftMismatchRate: 0.35,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });
});
