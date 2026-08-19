import { describe, expect, it } from 'vitest';
import { compareSpinalLevels, isSpinalLevelBetween, spinalLevelRank } from './spinalLevelOrder';

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
