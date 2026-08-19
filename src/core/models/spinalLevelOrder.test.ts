import { describe, expect, it } from 'vitest';
import { compareSpinalLevels, isSpinalLevelBetween, spinalLevelAtRank, spinalLevelRank } from './spinalLevelOrder';

describe('spinalLevelRank', () => {
  it('orders C7 before all thoracic levels', () => {
    expect(spinalLevelRank('C7')).toBeLessThan(spinalLevelRank('T1'));
  });

  it('orders thoracic levels craneal to caudal', () => {
    expect(spinalLevelRank('T1')).toBeLessThan(spinalLevelRank('T12'));
    expect(spinalLevelRank('T5')).toBeLessThan(spinalLevelRank('T6'));
  });

  it('orders lumbar levels after thoracic and before S1', () => {
    expect(spinalLevelRank('T12')).toBeLessThan(spinalLevelRank('L1'));
    expect(spinalLevelRank('L5')).toBeLessThan(spinalLevelRank('S1'));
  });
});

describe('compareSpinalLevels', () => {
  it('is negative when a is more cranial than b', () => {
    expect(compareSpinalLevels('T3', 'T5')).toBeLessThan(0);
  });

  it('is zero for the same level', () => {
    expect(compareSpinalLevels('T6', 'T6')).toBe(0);
  });

  it('is positive when a is more caudal than b', () => {
    expect(compareSpinalLevels('L2', 'T10')).toBeGreaterThan(0);
  });
});

describe('spinalLevelAtRank', () => {
  it('es la inversa de spinalLevelRank para cualquier nivel', () => {
    for (const level of ['C7', 'T1', 'T7', 'T12', 'L1', 'L5', 'S1'] as const) {
      expect(spinalLevelAtRank(spinalLevelRank(level))).toBe(level);
    }
  });

  it('devuelve null fuera de rango, sin redondear al extremo más cercano', () => {
    expect(spinalLevelAtRank(-1)).toBeNull();
    expect(spinalLevelAtRank(spinalLevelRank('S1') + 1)).toBeNull();
  });
});

describe('isSpinalLevelBetween', () => {
  it('is true for a level inside the range, regardless of argument order', () => {
    expect(isSpinalLevelBetween('T4', 'T3', 'T5')).toBe(true);
    expect(isSpinalLevelBetween('T4', 'T5', 'T3')).toBe(true);
  });

  it('is inclusive of both endpoints', () => {
    expect(isSpinalLevelBetween('T3', 'T3', 'T5')).toBe(true);
    expect(isSpinalLevelBetween('T5', 'T3', 'T5')).toBe(true);
  });

  it('is false outside the range', () => {
    expect(isSpinalLevelBetween('T6', 'T3', 'T5')).toBe(false);
    expect(isSpinalLevelBetween('T2', 'T3', 'T5')).toBe(false);
  });
});
