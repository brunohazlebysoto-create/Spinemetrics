import { describe, expect, it } from 'vitest';
import { classifySrsSchwab, type SrsSchwabClassificationInput } from './srsSchwab';

function baseInput(overrides: Partial<SrsSchwabClassificationInput> = {}): SrsSchwabClassificationInput {
  return {
    curves: [],
    piLlMismatchDeg: 5,
    svaMm: 20,
    ptDeg: 10,
    ...overrides,
  };
}

describe('classifySrsSchwab — descriptor coronal (SPEC.md §9.4)', () => {
  it('N cuando ninguna curva alcanza 30°', () => {
    const result = classifySrsSchwab(baseInput({ curves: [{ apexLevel: 'T7', cobbDeg: 25 }] }));
    expect(result.coronalDescriptor).toBe('N');
  });

  it('T cuando sólo la curva torácica (ápex T9 o más craneal) alcanza 30°', () => {
    const result = classifySrsSchwab(baseInput({ curves: [{ apexLevel: 'T7', cobbDeg: 35 }] }));
    expect(result.coronalDescriptor).toBe('T');
  });

  it('L cuando sólo la curva lumbar (ápex T10 o más caudal) alcanza 30°', () => {
    const result = classifySrsSchwab(baseInput({ curves: [{ apexLevel: 'L2', cobbDeg: 35 }] }));
    expect(result.coronalDescriptor).toBe('L');
  });

  it('D cuando ambas alcanzan 30°', () => {
    const result = classifySrsSchwab(
      baseInput({ curves: [{ apexLevel: 'T7', cobbDeg: 35 }, { apexLevel: 'L2', cobbDeg: 32 }] }),
    );
    expect(result.coronalDescriptor).toBe('D');
  });

  it('T9 exacto se clasifica como torácica; T10 exacto como lumbar', () => {
    const t9 = classifySrsSchwab(baseInput({ curves: [{ apexLevel: 'T9', cobbDeg: 35 }] }));
    expect(t9.coronalDescriptor).toBe('T');
    const t10 = classifySrsSchwab(baseInput({ curves: [{ apexLevel: 'T10', cobbDeg: 35 }] }));
    expect(t10.coronalDescriptor).toBe('L');
  });

  it('exactamente 30.0° cuenta como alcanzando el umbral (no N)', () => {
    const result = classifySrsSchwab(baseInput({ curves: [{ apexLevel: 'T7', cobbDeg: 30.0 }] }));
    expect(result.coronalDescriptor).toBe('T');
  });
});

describe('classifySrsSchwab — modificador PI-LL, bordes exactos (docs/OPEN_QUESTIONS.md #20)', () => {
  it('<10° → 0', () => {
    expect(classifySrsSchwab(baseInput({ piLlMismatchDeg: 9.9 })).piLlGrade).toBe('0');
  });
  it('exactamente 10° → +', () => {
    expect(classifySrsSchwab(baseInput({ piLlMismatchDeg: 10 })).piLlGrade).toBe('+');
  });
  it('exactamente 20° → +', () => {
    expect(classifySrsSchwab(baseInput({ piLlMismatchDeg: 20 })).piLlGrade).toBe('+');
  });
  it('>20° → ++', () => {
    expect(classifySrsSchwab(baseInput({ piLlMismatchDeg: 20.1 })).piLlGrade).toBe('++');
  });
});

describe('classifySrsSchwab — modificador SVA, bordes exactos (docs/OPEN_QUESTIONS.md #20)', () => {
  it('<4 cm → 0', () => {
    expect(classifySrsSchwab(baseInput({ svaMm: 39 })).svaGrade).toBe('0');
  });
  it('exactamente 4 cm → +', () => {
    expect(classifySrsSchwab(baseInput({ svaMm: 40 })).svaGrade).toBe('+');
  });
  it('exactamente 9.5 cm → +', () => {
    expect(classifySrsSchwab(baseInput({ svaMm: 95 })).svaGrade).toBe('+');
  });
  it('>9.5 cm → ++', () => {
    expect(classifySrsSchwab(baseInput({ svaMm: 96 })).svaGrade).toBe('++');
  });
});

describe('classifySrsSchwab — modificador PT, bordes exactos (docs/OPEN_QUESTIONS.md #20)', () => {
  it('<20° → 0', () => {
    expect(classifySrsSchwab(baseInput({ ptDeg: 19.9 })).ptGrade).toBe('0');
  });
  it('exactamente 20° → +', () => {
    expect(classifySrsSchwab(baseInput({ ptDeg: 20 })).ptGrade).toBe('+');
  });
  it('exactamente 30° → +', () => {
    expect(classifySrsSchwab(baseInput({ ptDeg: 30 })).ptGrade).toBe('+');
  });
  it('>30° → ++', () => {
    expect(classifySrsSchwab(baseInput({ ptDeg: 30.1 })).ptGrade).toBe('++');
  });
});

describe('classifySrsSchwab — datos faltantes', () => {
  it('modificadores null cuando faltan, con unmetInputs, sin bloquear el resto', () => {
    const result = classifySrsSchwab(baseInput({ piLlMismatchDeg: null, svaMm: null, ptDeg: null, curves: [{ apexLevel: 'T7', cobbDeg: 35 }] }));
    expect(result.piLlGrade).toBeNull();
    expect(result.svaGrade).toBeNull();
    expect(result.ptGrade).toBeNull();
    expect(result.coronalDescriptor).toBe('T');
    expect(result.unmetInputs).toEqual(expect.arrayContaining(['PI-LL', 'SVA', 'PT']));
  });
});
