import { describe, expect, it } from 'vitest';
import { classifyKingMoe, type KingMoeInput } from './kingMoe';

function baseInput(overrides: Partial<KingMoeInput> = {}): KingMoeInput {
  return {
    view: 'PA_standing',
    thoracicCobbDeg: 40,
    lumbarCobbDeg: 30,
    doubleThoracic: false,
    thoracicMoreRigidManual: null,
    longThoracicCurveManual: false,
    ...overrides,
  };
}

describe('classifyKingMoe', () => {
  it('bloquea si la proyección no es de pie', () => {
    const result = classifyKingMoe(baseInput({ view: 'BEND_left' }));
    expect(result.type).toBeNull();
    expect(result.unmetInputs).toContain('view');
  });

  it('unavailable sin curva torácica', () => {
    const result = classifyKingMoe(baseInput({ thoracicCobbDeg: null }));
    expect(result.type).toBeNull();
    expect(result.unmetInputs).toContain('thoracicCobb');
  });

  it('tipo V: doble torácica tiene prioridad sobre todo lo demás', () => {
    const result = classifyKingMoe(baseInput({ doubleThoracic: true, lumbarCobbDeg: null }));
    expect(result.type).toBe('V');
  });

  it('tipo IV: torácica larga (criterio manual de L4)', () => {
    const result = classifyKingMoe(baseInput({ longThoracicCurveManual: true }));
    expect(result.type).toBe('IV');
  });

  it('tipo III: sin curva lumbar (no hay curva en S)', () => {
    const result = classifyKingMoe(baseInput({ lumbarCobbDeg: null }));
    expect(result.type).toBe('III');
  });

  it('tipo II: torácica mayor que lumbar por magnitud', () => {
    const result = classifyKingMoe(baseInput({ thoracicCobbDeg: 45, lumbarCobbDeg: 30 }));
    expect(result.type).toBe('II');
  });

  it('tipo I: lumbar mayor que torácica', () => {
    const result = classifyKingMoe(baseInput({ thoracicCobbDeg: 30, lumbarCobbDeg: 45 }));
    expect(result.type).toBe('I');
  });

  it('docs/OPEN_QUESTIONS.md #25: lumbar mayor pero torácica marcada manualmente como más rígida → tipo II', () => {
    const result = classifyKingMoe(baseInput({ thoracicCobbDeg: 30, lumbarCobbDeg: 35, thoracicMoreRigidManual: true }));
    expect(result.type).toBe('II');
  });

  it('empate exacto sin indicación manual de rigidez: no fabrica I ni II', () => {
    const result = classifyKingMoe(baseInput({ thoracicCobbDeg: 35, lumbarCobbDeg: 35, thoracicMoreRigidManual: null }));
    expect(result.type).toBeNull();
    expect(result.unmetInputs).toContain('thoracicMoreRigidManual');
  });

  it('siempre incluye la nota histórica en la traza', () => {
    const result = classifyKingMoe(baseInput());
    expect(result.trace.some((t) => t.step === 'nota histórica')).toBe(true);
  });
});
