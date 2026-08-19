import { describe, expect, it } from 'vitest';
import { classifyNeuromuscular, type NeuromuscularClassificationInput } from './neuromuscular';

function baseInput(overrides: Partial<NeuromuscularClassificationInput> = {}): NeuromuscularClassificationInput {
  return {
    etiologyClass: 'myopathic',
    trunkBalanced: true,
    pelvicObliquitySignificant: false,
    doubleBalancedCurve: true,
    gmfcs: 2,
    ...overrides,
  };
}

describe('classifyNeuromuscular — grupo Lonstein-Akbarnia', () => {
  it('IA: tronco compensado, doble curva balanceada', () => {
    const result = classifyNeuromuscular(baseInput({ doubleBalancedCurve: true }));
    expect(result.lonsteinAkbarniaGroup).toBe('IA');
  });

  it('IB: tronco compensado, sin doble curva balanceada', () => {
    const result = classifyNeuromuscular(baseInput({ doubleBalancedCurve: false }));
    expect(result.lonsteinAkbarniaGroup).toBe('IB');
  });

  it('II: tronco descompensado con oblicuidad pélvica significativa', () => {
    const result = classifyNeuromuscular(baseInput({ trunkBalanced: false, pelvicObliquitySignificant: true }));
    expect(result.lonsteinAkbarniaGroup).toBe('II');
    expect(result.pelvicFusionIndicated).toBe(true);
  });

  it('docs/OPEN_QUESTIONS.md #45: tronco descompensado sin dato de oblicuidad no fabrica el grupo II', () => {
    const result = classifyNeuromuscular(baseInput({ trunkBalanced: false, pelvicObliquitySignificant: null }));
    expect(result.lonsteinAkbarniaGroup).toBeNull();
    expect(result.unmetInputs).toContain('pelvicObliquitySignificant');
  });

  it('sin trunkBalanced, no fabrica ningún grupo', () => {
    const result = classifyNeuromuscular(baseInput({ trunkBalanced: null }));
    expect(result.lonsteinAkbarniaGroup).toBeNull();
    expect(result.unmetInputs).toContain('trunkBalanced');
  });
});

describe('classifyNeuromuscular — GMFCS', () => {
  it('niveles IV y V marcan highSeverityGmfcs', () => {
    expect(classifyNeuromuscular(baseInput({ gmfcs: 4 })).highSeverityGmfcs).toBe(true);
    expect(classifyNeuromuscular(baseInput({ gmfcs: 5 })).highSeverityGmfcs).toBe(true);
  });

  it('niveles I-III no marcan highSeverityGmfcs', () => {
    expect(classifyNeuromuscular(baseInput({ gmfcs: 3 })).highSeverityGmfcs).toBe(false);
  });
});

describe('classifyNeuromuscular — etiología SRS', () => {
  it('devuelve la etiqueta completa para cada clase', () => {
    expect(classifyNeuromuscular(baseInput({ etiologyClass: 'neuropathicUpperMotorNeuron' })).etiologyLabel).toMatch(/neurona motora superior/);
    expect(classifyNeuromuscular(baseInput({ etiologyClass: 'neuropathicLowerMotorNeuron' })).etiologyLabel).toMatch(/neurona motora inferior/);
    expect(classifyNeuromuscular(baseInput({ etiologyClass: 'myopathic' })).etiologyLabel).toMatch(/Miopática/);
  });
});
