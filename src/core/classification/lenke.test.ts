import { describe, expect, it } from 'vitest';
import { classifyLenke, type LenkeClassificationInput, type LenkeRegionInput } from './lenke';
import { DEFAULT_CONVENTIONS } from '../config/conventions';
import type { LumbarModifierResult } from './lumbarModifier';

const noCurve: LenkeRegionInput = { standingCobbDeg: null, bendingCobbDeg: null, sagittalKyphosisDeg: null };

function region(standingCobbDeg: number, bendingCobbDeg: number | null = null, sagittalKyphosisDeg: number | null = null): LenkeRegionInput {
  return { standingCobbDeg, bendingCobbDeg, sagittalKyphosisDeg };
}

function lumbar(modifier: 'A' | 'B' | 'C', borderlineBC = false): LumbarModifierResult {
  return { modifier, borderlineBC, status: 'ok', trace: [] };
}

function baseInput(overrides: Partial<LenkeClassificationInput> = {}): LenkeClassificationInput {
  return {
    view: 'PA_standing',
    regions: { PT: noCurve, MT: noCurve, TL_L: noCurve },
    nonStandardFlexibilityFilm: false,
    sagittalT5T12Deg: 25,
    lumbarModifier: lumbar('A'),
    ...overrides,
  };
}

describe('classifyLenke — bloqueo por proyección (docs/OPEN_QUESTIONS.md #5)', () => {
  it('no clasifica si la proyección no es PA_standing', () => {
    const result = classifyLenke(baseInput({ view: 'BEND_left' }));
    expect(result.curveType).toBeNull();
    expect(result.unmetInputs).toContain('view');
  });
});

describe('classifyLenke — los 6 tipos de curva (SPEC.md §9.1 Paso 4)', () => {
  it('tipo 1: torácica principal (MT mayor, PT y TL_L no estructurales)', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20), // bending 20 < 25 → no estructural
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(1);
    expect(result.majorRegion).toBe('MT');
  });

  it('tipo 2: doble torácica (PT estructural, MT mayor, TL_L no estructural)', () => {
    const input = baseInput({
      regions: {
        PT: region(30, 28), // bending 28 ≥ 25 → estructural
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(2);
  });

  it('tipo 3: doble mayor (PT no estructural, MT mayor, TL_L estructural)', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20),
        MT: region(50, 10),
        TL_L: region(35, 27), // bending 27 ≥ 25 → estructural
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(3);
  });

  it('tipo 4: triple mayor (PT y TL_L estructurales, MT mayor)', () => {
    const input = baseInput({
      regions: {
        PT: region(30, 28),
        MT: region(50, 10),
        TL_L: region(35, 27),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(4);
  });

  it('tipo 4: triple mayor con TL_L como mayor (SPEC.md §9.1 nota #11)', () => {
    const input = baseInput({
      regions: {
        PT: region(30, 28),
        MT: region(40, 27), // estructural, no mayor
        TL_L: region(50, 10), // mayor, TL_L−MT = 10° ≥ 5°: sin borderline
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(4);
    expect(result.majorRegion).toBe('TL_L');
  });

  it('tipo 5: toracolumbar/lumbar (TL_L mayor, PT y MT no estructurales)', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20),
        MT: region(20, 20),
        TL_L: region(50, 10),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(5);
    // Tipos 5 y 6 son por definición C, aunque la geometría diga otra cosa.
    expect(result.lumbarModifier).toBe('C');
  });

  it('tipo 6: TL/L – torácica principal (TL_L mayor ≥ MT+5°, MT estructural)', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20),
        MT: region(30, 27), // estructural
        TL_L: region(40, 10), // TL_L − MT = 10° ≥ 5°
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(6);
    expect(result.type3vs6Borderline).toBe(false);
    expect(result.lumbarModifier).toBe('C');
  });
});

describe('classifyLenke — tipo 3 vs 6, borde exacto de docs/OPEN_QUESTIONS.md #10 (±5°)', () => {
  it('TL_L mayor que MT por exactamente 5° → tipo 6, no borderline', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20),
        MT: region(30, 27),
        TL_L: region(35, 10), // 35 − 30 = 5.0°
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(6);
    expect(result.type3vs6Borderline).toBe(false);
  });

  it('TL_L mayor que MT por menos de 5° (4.9°) → tipo 3, marcado borderline', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20),
        MT: region(30, 10), // MT no estructural por bending, pero...
        TL_L: region(34.9, 27), // TL_L estructural, 34.9 − 30 = 4.9° < 5°
      },
    });
    const result = classifyLenke(input);
    expect(result.majorRegion).toBe('MT');
    expect(result.type3vs6Borderline).toBe(true);
    expect(result.curveType).toBe(3);
  });
});

describe('classifyLenke — borde exacto de estructuralidad por bending, 25.0° (docs/OPEN_QUESTIONS.md #6)', () => {
  it('bending exactamente 25.0° → estructural (inclusivo)', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 25.0),
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    // PT estructural con bending=25.0 exacto → tipo 2, no tipo 1.
    expect(result.curveType).toBe(2);
  });

  it('bending 24.9° → no estructural', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 24.9),
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(1);
  });
});

describe('classifyLenke — borde exacto de estructuralidad sagital, 20.0° (docs/OPEN_QUESTIONS.md #6, #13)', () => {
  it('cifosis del segmento exactamente 20.0° → estructural', () => {
    const input = baseInput({
      regions: {
        PT: region(15, null, 20.0),
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(2);
  });

  it('cifosis 19.9° → no estructural', () => {
    const input = baseInput({
      regions: {
        PT: region(15, null, 19.9),
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(1);
  });
});

describe('classifyLenke — modificador sagital T5–T12, bordes exactos (docs/OPEN_QUESTIONS.md #12)', () => {
  const regions = { PT: noCurve, MT: region(50, 10), TL_L: region(20, 20) };

  it('exactamente 10.0° → N', () => {
    const result = classifyLenke(baseInput({ regions, sagittalT5T12Deg: 10.0 }));
    expect(result.sagittalModifier).toBe('N');
  });

  it('9.9° → −', () => {
    const result = classifyLenke(baseInput({ regions, sagittalT5T12Deg: 9.9 }));
    expect(result.sagittalModifier).toBe('-');
  });

  it('exactamente 40.0° → N', () => {
    const result = classifyLenke(baseInput({ regions, sagittalT5T12Deg: 40.0 }));
    expect(result.sagittalModifier).toBe('N');
  });

  it('40.1° → +', () => {
    const result = classifyLenke(baseInput({ regions, sagittalT5T12Deg: 40.1 }));
    expect(result.sagittalModifier).toBe('+');
  });

  it('sin dato → null y unmetInputs', () => {
    const result = classifyLenke(baseInput({ regions, sagittalT5T12Deg: null }));
    expect(result.sagittalModifier).toBeNull();
    expect(result.unmetInputs).toContain('sagittalT5T12');
  });
});

describe('classifyLenke — modificador lumbar (los tres, A/B/C)', () => {
  const regions = { PT: noCurve, MT: region(50, 10), TL_L: region(20, 20) }; // tipo 1

  it('A se conserva sin cambios (no es tipo 5/6)', () => {
    const result = classifyLenke(baseInput({ regions, lumbarModifier: lumbar('A') }));
    expect(result.curveType).toBe(1);
    expect(result.lumbarModifier).toBe('A');
  });

  it('B se conserva, incluida la marca borderlineBC', () => {
    const result = classifyLenke(baseInput({ regions, lumbarModifier: lumbar('B', true) }));
    expect(result.lumbarModifier).toBe('B');
    expect(result.borderlineBC).toBe(true);
  });

  it('C se conserva sin cambios', () => {
    const result = classifyLenke(baseInput({ regions, lumbarModifier: lumbar('C') }));
    expect(result.lumbarModifier).toBe('C');
  });

  it('se fuerza a C en tipo 5 aunque la geometría dijera A, y borderlineBC se limpia', () => {
    const type5Regions = { PT: noCurve, MT: noCurve, TL_L: region(50, 10) };
    const result = classifyLenke(baseInput({ regions: type5Regions, lumbarModifier: lumbar('A', true) }));
    expect(result.curveType).toBe(5);
    expect(result.lumbarModifier).toBe('C');
    expect(result.borderlineBC).toBe(false);
  });
});

describe('classifyLenke — datos insuficientes: nunca fabrica un tipo (SPEC.md §9)', () => {
  it('curveType null si falta estructuralidad de una región (sin bending ni cifosis)', () => {
    const input = baseInput({
      regions: {
        PT: { standingCobbDeg: 15, bendingCobbDeg: null, sagittalKyphosisDeg: null },
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBeNull();
    expect(result.unmetInputs).toContain('bendingCobb:PT');
    expect(result.unmetInputs).toContain('sagittalKyphosis:PT');
  });

  it('curveType null si no hay ninguna curva detectada', () => {
    const result = classifyLenke(baseInput());
    expect(result.curveType).toBeNull();
    expect(result.unmetInputs).toContain('standingCobb');
  });

  it('sigue reportando lo que sí se sabe (curvas, sagital) aunque el tipo sea indeterminable', () => {
    const input = baseInput({
      regions: {
        PT: { standingCobbDeg: 15, bendingCobbDeg: null, sagittalKyphosisDeg: null },
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input);
    expect(result.curves.find((c) => c.region === 'MT')!.standingCobbDeg).toBe(50);
    expect(result.sagittalModifier).toBe('N');
  });
});

describe('classifyLenke — radiografía de flexibilidad no estándar (docs/OPEN_QUESTIONS.md #7 ★★)', () => {
  it('sigue calculando pero marca nonStandardFlexibilityFilm', () => {
    const input = baseInput({
      regions: {
        PT: region(15, 20),
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
      nonStandardFlexibilityFilm: true,
    });
    const result = classifyLenke(input);
    expect(result.curveType).toBe(1);
    expect(result.nonStandardFlexibilityFilm).toBe(true);
  });
});

describe('classifyLenke — result string', () => {
  it('compone "Lenke <tipo><lumbar> <sagital>"', () => {
    const input = baseInput({
      regions: { PT: noCurve, MT: region(50, 10), TL_L: region(20, 20) },
      lumbarModifier: lumbar('B'),
      sagittalT5T12Deg: 25,
    });
    const result = classifyLenke(input);
    expect(result.result).toBe('Lenke 1B N');
  });
});

describe('classifyLenke — respeta convenciones configuradas explícitamente', () => {
  it('umbral de estructuralidad exclusivo cambia el resultado en el borde', () => {
    const conventions = {
      ...DEFAULT_CONVENTIONS,
      lenke: { ...DEFAULT_CONVENTIONS.lenke, structuralThresholdsInclusive: false },
    };
    const input = baseInput({
      regions: {
        PT: region(15, 25.0), // exactamente 25° ahora NO es estructural
        MT: region(50, 10),
        TL_L: region(20, 20),
      },
    });
    const result = classifyLenke(input, conventions);
    expect(result.curveType).toBe(1);
  });
});
