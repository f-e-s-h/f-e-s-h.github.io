import { beforeEach, describe, expect, it } from 'vitest';

import { buildCanonicalSpotKey } from '../solvers/contract.js';
import {
  lookupSolverDecisionBySpotKey,
  lookupSolverDecisionForNode,
  resetSolverLoaderCaches,
} from '../solvers/loader.js';

function createFetchMock(payloadByUrl){
  const calls = [];

  const fetchMock = async (url) => {
    calls.push(url);

    if(Object.prototype.hasOwnProperty.call(payloadByUrl, url)){
      return {
        ok: true,
        status: 200,
        json: async () => payloadByUrl[url],
      };
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    };
  };

  fetchMock.calls = calls;
  return fetchMock;
}

describe('solver loader', () => {
  beforeEach(() => {
    resetSolverLoaderCaches();
  });

  it('loads and caches solver decisions from manifest and index', async () => {
    const spotKey = 'pos_ip__stack_80bb__texture_dry__node_flop_checked_to_hero__hist_start';
    const basePath = '/solver-fixture';

    const fetchMock = createFetchMock({
      '/solver-fixture/manifest.json': {
        schemaVersion: '1.0.0',
        solverVersion: 'fixture',
        generatedAt: '2026-04-10T00:00:00Z',
        indexFile: 'index.json',
      },
      '/solver-fixture/index.json': {
        entries: {
          [spotKey]: { file: 'flop.json', spotType: 'checked_to_hero' },
        },
      },
      '/solver-fixture/flop.json': {
        entries: {
          [spotKey]: {
            actions: [
              { action: 'check', frequency: 0.4 },
              { action: 'bet 33%', frequency: 0.2, amountPot: 0.33 },
              { action: 'bet 58%', frequency: 0.3, amountPot: 0.58 },
              { action: 'bet 86%', frequency: 0.1, amountPot: 0.86 },
            ],
          },
        },
      },
    });

    const first = await lookupSolverDecisionBySpotKey(spotKey, fetchMock, basePath);
    const second = await lookupSolverDecisionBySpotKey(spotKey, fetchMock, basePath);

    expect(first).toBeTruthy();
    expect(first.spotType).toBe('checked_to_hero');
    expect(first.frequencies.check).toBeCloseTo(0.4, 8);
    expect(first.frequencies['bet-medium']).toBeCloseTo(0.3, 8);
    expect(second).toEqual(first);
    expect(fetchMock.calls).toHaveLength(3);
  });

  it('returns null for unknown spot key', async () => {
    const fetchMock = createFetchMock({
      '/solver-fixture/manifest.json': {
        schemaVersion: '1.0.0',
        solverVersion: 'fixture',
        generatedAt: '2026-04-10T00:00:00Z',
        indexFile: 'index.json',
      },
      '/solver-fixture/index.json': {
        entries: {},
      },
    });

    const decision = await lookupSolverDecisionBySpotKey('missing_spot', fetchMock, '/solver-fixture');
    expect(decision).toBeNull();
  });

  it('builds canonical key lookup for a node and returns matched decision', async () => {
    const node = {
      street: 'flop',
      spotType: 'checked_to_hero',
      heroPos: 'ip',
      stackLeftBb: 80,
      boardTexture: 'dry',
    };
    const meta = { history: [] };

    const spotKey = buildCanonicalSpotKey(node, meta);
    const fetchMock = createFetchMock({
      '/solver-fixture/manifest.json': {
        schemaVersion: '1.0.0',
        solverVersion: 'fixture',
        generatedAt: '2026-04-10T00:00:00Z',
        indexFile: 'index.json',
      },
      '/solver-fixture/index.json': {
        entries: {
          [spotKey]: { file: 'flop.json', spotType: 'checked_to_hero' },
        },
      },
      '/solver-fixture/flop.json': {
        entries: {
          [spotKey]: {
            frequencies: {
              check: 0.5,
              'bet-small': 0.2,
              'bet-medium': 0.2,
              'bet-large': 0.1,
            },
          },
        },
      },
    });

    const result = await lookupSolverDecisionForNode(node, meta, fetchMock, '/solver-fixture');

    expect(result.spotKey).toBe(spotKey);
    expect(result.solverDecision).toBeTruthy();
    expect(result.solverDecision.frequencies.check).toBeCloseTo(0.5, 8);
  });
});
