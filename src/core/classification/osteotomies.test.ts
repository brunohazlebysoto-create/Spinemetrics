import { describe, expect, it } from 'vitest';
import { APPROACH_MODIFIER_DISAMBIGUATION_NOTE, lookupOsteotomy, OSTEOTOMY_REFERENCE_TABLE } from './osteotomies';

describe('OSTEOTOMY_REFERENCE_TABLE', () => {
  it('tiene exactamente los 6 grados de SPEC.md §9.10 en orden', () => {
    expect(OSTEOTOMY_REFERENCE_TABLE.map((e) => e.grade)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('los nombres coinciden con SPEC.md §9.10', () => {
    expect(OSTEOTOMY_REFERENCE_TABLE[0]!.name).toContain('Smith-Petersen');
    expect(OSTEOTOMY_REFERENCE_TABLE[1]!.name).toBe('Ponte');
    expect(OSTEOTOMY_REFERENCE_TABLE[2]!.name).toContain('PSO');
    expect(OSTEOTOMY_REFERENCE_TABLE[5]!.name).toContain('multinivel');
  });
});

describe('lookupOsteotomy', () => {
  it('devuelve la entrada correcta por grado', () => {
    expect(lookupOsteotomy(3).name).toContain('PSO');
    expect(lookupOsteotomy(6).name).toContain('multinivel');
  });
});

describe('APPROACH_MODIFIER_DISAMBIGUATION_NOTE', () => {
  it('menciona explícitamente que no debe confundirse con SRS-Schwab', () => {
    expect(APPROACH_MODIFIER_DISAMBIGUATION_NOTE).toMatch(/SRS-Schwab/);
  });
});
