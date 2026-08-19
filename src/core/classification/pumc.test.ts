import { describe, expect, it } from 'vitest';
import { classifyPUMC, type PumcClassificationInput } from './pumc';

function input(curves: PumcClassificationInput['curves'], view: PumcClassificationInput['view'] = 'PA_standing'): PumcClassificationInput {
  return { view, curves };
}

describe('classifyPUMC — tipo I (única)', () => {
  it('Ia: ápex torácico', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 30 }]));
    expect(result.mainType).toBe('I');
    expect(result.subtype).toBe('Ia');
  });

  it('Ib: ápex toracolumbar (T12–L1)', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T12', cobbDeg: 30 }]));
    expect(result.subtype).toBe('Ib');
    const result2 = classifyPUMC(input([{ apexLevel: 'L1', cobbDeg: 30 }]));
    expect(result2.subtype).toBe('Ib');
  });

  it('Ic: ápex lumbar (L2–L4)', () => {
    const result = classifyPUMC(input([{ apexLevel: 'L3', cobbDeg: 30 }]));
    expect(result.subtype).toBe('Ic');
  });
});

describe('classifyPUMC — tipo II (doble), bordes de docs/OPEN_QUESTIONS.md #26', () => {
  it('IIa: dos ápices torácicos', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T4', cobbDeg: 25 }, { apexLevel: 'T8', cobbDeg: 40 }]));
    expect(result.subtype).toBe('IIa');
  });

  it('IIb: torácica − TL/L exactamente 10° (borde inclusivo)', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 40 }, { apexLevel: 'L2', cobbDeg: 30 }]));
    expect(result.subtype).toBe('IIb');
  });

  it('IId: TL/L − torácica exactamente 10°', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 25 }, { apexLevel: 'L2', cobbDeg: 35 }]));
    expect(result.subtype).toBe('IId');
  });

  it('IIc: diferencia menor a 10° en cualquier sentido', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 35 }, { apexLevel: 'L2', cobbDeg: 30 }]));
    expect(result.subtype).toBe('IIc');
  });

  it('pumcBorderline true cuando la diferencia está entre 8° y 12° (ambos bordes inclusivos)', () => {
    const at8 = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 38 }, { apexLevel: 'L2', cobbDeg: 30 }]));
    expect(at8.pumcBorderline).toBe(true);
    const at12 = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 42 }, { apexLevel: 'L2', cobbDeg: 30 }]));
    expect(at12.pumcBorderline).toBe(true);
    const at7 = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 37 }, { apexLevel: 'L2', cobbDeg: 30 }]));
    expect(at7.pumcBorderline).toBe(false);
  });
});

describe('classifyPUMC — tipo III (triple), subtipo no publicado', () => {
  it('mainType III sin subtipo, con unmetInputs explicando el motivo', () => {
    const result = classifyPUMC(
      input([
        { apexLevel: 'T4', cobbDeg: 20 },
        { apexLevel: 'T8', cobbDeg: 40 },
        { apexLevel: 'L2', cobbDeg: 25 },
      ]),
    );
    expect(result.mainType).toBe('III');
    expect(result.subtype).toBeNull();
    expect(result.unmetInputs).toContain('pumcSubtypeIIIaVsIIIb');
  });
});

describe('classifyPUMC — casos límite', () => {
  it('unavailable sin curvas', () => {
    const result = classifyPUMC(input([]));
    expect(result.mainType).toBeNull();
    expect(result.unmetInputs).toContain('curves');
  });

  it('bloquea si la proyección no es de pie', () => {
    const result = classifyPUMC(input([{ apexLevel: 'T8', cobbDeg: 30 }], 'BEND_left'));
    expect(result.mainType).toBeNull();
    expect(result.unmetInputs).toContain('view');
  });
});
