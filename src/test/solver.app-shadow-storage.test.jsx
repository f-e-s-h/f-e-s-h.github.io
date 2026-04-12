import { beforeEach, describe, expect, it } from 'vitest';

import { __testables } from '../App.jsx';

const {
  allSkillsClearSolverShadowData,
  allSkillsReadSolverShadowLog,
  allSkillsReadSolverShadowReport,
} = __testables;

describe('solver shadow storage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns safe defaults when no shadow data exists', () => {
    expect(allSkillsReadSolverShadowLog()).toEqual([]);
    expect(allSkillsReadSolverShadowReport()).toBeNull();
  });

  it('reads stored shadow log and report payloads', () => {
    const sampleLog = [
      { status: 'agreement', covered: true },
      { status: 'hard_mismatch', covered: true },
    ];

    const sampleReport = {
      summary: { total: 2, hard_mismatch: 1 },
      topClusters: [{ key: 'flop|checked_to_hero|flop_cbet_bluff|hard_mismatch', count: 1 }],
    };

    window.localStorage.setItem('poker_allskills_solver_shadow_v1', JSON.stringify(sampleLog));
    window.localStorage.setItem('poker_allskills_solver_shadow_report_v1', JSON.stringify(sampleReport));

    expect(allSkillsReadSolverShadowLog()).toEqual(sampleLog);
    expect(allSkillsReadSolverShadowReport()).toEqual(sampleReport);
  });

  it('clears stored shadow log and report payloads', () => {
    window.localStorage.setItem('poker_allskills_solver_shadow_v1', JSON.stringify([{ status: 'agreement' }]));
    window.localStorage.setItem('poker_allskills_solver_shadow_report_v1', JSON.stringify({ summary: { total: 1 } }));

    allSkillsClearSolverShadowData();

    expect(allSkillsReadSolverShadowLog()).toEqual([]);
    expect(allSkillsReadSolverShadowReport()).toBeNull();
  });
});
