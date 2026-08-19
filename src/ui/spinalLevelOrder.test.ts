import { describe, expect, it } from 'vitest';
import { compareSpinalLevels } from './spinalLevelOrder';

describe('compareSpinalLevels', () => {
  it('ordena craneal → caudal, C7 antes que T1 antes que L1 antes que S1', () => {
    const levels: Array<Parameters<typeof compareSpinalLevels>[0]> = ['S1', 'T12', 'C7', 'L1', 'T1'];
    expect([...levels].sort(compareSpinalLevels)).toEqual(['C7', 'T1', 'T12', 'L1', 'S1']);
  });
});
