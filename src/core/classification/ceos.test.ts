import { describe, expect, it } from 'vitest';
import { classifyCEOS, type CeosClassificationInput } from './ceos';

function baseInput(overrides: Partial<CeosClassificationInput> = {}): CeosClassificationInput {
  return {
    ageYears: 5,
    etiology: 'idiopathic',
    majorCobbDeg: 30,
    maxKyphosisDeg: 30,
    progression: null,
    ...overrides,
  };
}

describe('classifyCEOS — etiología', () => {
  it.each([
    ['congenital', 'C'],
    ['neuromuscular', 'M'],
    ['syndromic', 'S'],
    ['idiopathic', 'I'],
  ] as const)('%s → %s', (etiology, code) => {
    const result = classifyCEOS(baseInput({ etiology }));
    expect(result.etiologyCode).toBe(code);
  });

  it('null cuando falta la etiología, con unmetInputs', () => {
    const result = classifyCEOS(baseInput({ etiology: null }));
    expect(result.etiologyCode).toBeNull();
    expect(result.unmetInputs).toContain('etiology');
  });
});

describe('classifyCEOS — categoría de curva, bordes exactos (docs/OPEN_QUESTIONS.md #22)', () => {
  it('19.9° → 1', () => {
    expect(classifyCEOS(baseInput({ majorCobbDeg: 19.9 })).curveCategory).toBe(1);
  });
  it('exactamente 20° → 2', () => {
    expect(classifyCEOS(baseInput({ majorCobbDeg: 20 })).curveCategory).toBe(2);
  });
  it('exactamente 50° → 2 (no hay hueco)', () => {
    expect(classifyCEOS(baseInput({ majorCobbDeg: 50 })).curveCategory).toBe(2);
  });
  it('50.4° (dentro del hueco publicado 50–51) → 3', () => {
    expect(classifyCEOS(baseInput({ majorCobbDeg: 50.4 })).curveCategory).toBe(3);
  });
  it('exactamente 90° → 3', () => {
    expect(classifyCEOS(baseInput({ majorCobbDeg: 90 })).curveCategory).toBe(3);
  });
  it('90.1° → 4', () => {
    expect(classifyCEOS(baseInput({ majorCobbDeg: 90.1 })).curveCategory).toBe(4);
  });

  it('null cuando falta el Cobb mayor', () => {
    const result = classifyCEOS(baseInput({ majorCobbDeg: null }));
    expect(result.curveCategory).toBeNull();
    expect(result.unmetInputs).toContain('majorCobb');
  });
});

describe('classifyCEOS — categoría de cifosis, bordes exactos', () => {
  it('19.9° → −', () => {
    expect(classifyCEOS(baseInput({ maxKyphosisDeg: 19.9 })).kyphosisCategory).toBe('-');
  });
  it('exactamente 20° → N', () => {
    expect(classifyCEOS(baseInput({ maxKyphosisDeg: 20 })).kyphosisCategory).toBe('N');
  });
  it('exactamente 50° → N', () => {
    expect(classifyCEOS(baseInput({ maxKyphosisDeg: 50 })).kyphosisCategory).toBe('N');
  });
  it('50.1° → +', () => {
    expect(classifyCEOS(baseInput({ maxKyphosisDeg: 50.1 })).kyphosisCategory).toBe('+');
  });
});

describe('classifyCEOS — modificador de progresión (docs/OPEN_QUESTIONS.md #24)', () => {
  it('null sin datos de progresión', () => {
    expect(classifyCEOS(baseInput({ progression: null })).progressionModifier).toBeNull();
  });

  it('null si el intervalo entre estudios es menor a 6 meses', () => {
    const result = classifyCEOS(
      baseInput({
        progression: { priorCobbDeg: 20, priorDate: '2025-01-01', currentCobbDeg: 30, currentDate: '2025-03-01' },
      }),
    );
    expect(result.progressionModifier).toBeNull();
    expect(result.unmetInputs).toContain('progressionInterval');
  });

  it('P0: <10°/año', () => {
    const result = classifyCEOS(
      baseInput({
        progression: { priorCobbDeg: 20, priorDate: '2024-01-01', currentCobbDeg: 25, currentDate: '2025-01-01' },
      }),
    );
    expect(result.progressionModifier).toBe('P0');
  });

  it('P1: entre 10 y 19.9°/año', () => {
    const result = classifyCEOS(
      baseInput({
        progression: { priorCobbDeg: 20, priorDate: '2024-01-01', currentCobbDeg: 35, currentDate: '2025-01-01' },
      }),
    );
    expect(result.progressionModifier).toBe('P1');
  });

  it('P2: ≥20°/año', () => {
    const result = classifyCEOS(
      baseInput({
        progression: { priorCobbDeg: 20, priorDate: '2024-01-01', currentCobbDeg: 45, currentDate: '2025-01-01' },
      }),
    );
    expect(result.progressionModifier).toBe('P2');
  });
});

describe('classifyCEOS — result string', () => {
  it('compone "<edad> <etiología><curva><cifosis> <progresión>"', () => {
    const result = classifyCEOS(
      baseInput({
        ageYears: 5,
        etiology: 'neuromuscular',
        majorCobbDeg: 55,
        maxKyphosisDeg: 30,
        progression: { priorCobbDeg: 20, priorDate: '2024-01-01', currentCobbDeg: 35, currentDate: '2025-01-01' },
      }),
    );
    expect(result.result).toBe('5 M3N P1');
  });

  it('sin progresión, omite el modificador de la cadena', () => {
    const result = classifyCEOS(baseInput());
    expect(result.result).not.toMatch(/P\d/);
  });
});
