import { describe, expect, it } from 'vitest';
import { classifyRoussouly, type RoussoulyClassificationInput } from './roussouly';

function baseInput(overrides: Partial<RoussoulyClassificationInput> = {}): RoussoulyClassificationInput {
  return {
    sacralSlopeDeg: 40,
    pelvicIncidenceDeg: 50,
    hyperlordotic: null,
    anteverted: false,
    ...overrides,
  };
}

describe('classifyRoussouly', () => {
  it('siempre marca el resultado como orientativo', () => {
    const result = classifyRoussouly(baseInput());
    expect(result.trace.some((t) => t.detail.includes('orientativo'))).toBe(true);
  });

  it('unavailable sin SS', () => {
    const result = classifyRoussouly(baseInput({ sacralSlopeDeg: null }));
    expect(result.type).toBeNull();
    expect(result.unmetInputs).toContain('sacralSlope');
  });

  it('tipo 1: SS <35° e hiperlordótico', () => {
    const result = classifyRoussouly(baseInput({ sacralSlopeDeg: 30, hyperlordotic: true }));
    expect(result.type).toBe(1);
  });

  it('tipo 2: SS <35° y espalda plana', () => {
    const result = classifyRoussouly(baseInput({ sacralSlopeDeg: 30, hyperlordotic: false }));
    expect(result.type).toBe(2);
  });

  it('SS <35° sin distinguir hiperlordosis/espalda plana: no fabrica el tipo', () => {
    const result = classifyRoussouly(baseInput({ sacralSlopeDeg: 30, hyperlordotic: null }));
    expect(result.type).toBeNull();
    expect(result.unmetInputs).toContain('hyperlordotic');
  });

  it('tipo 3: SS 35–45°', () => {
    expect(classifyRoussouly(baseInput({ sacralSlopeDeg: 35 })).type).toBe(3);
    expect(classifyRoussouly(baseInput({ sacralSlopeDeg: 45 })).type).toBe(3);
  });

  it('tipo 4: SS >45°', () => {
    expect(classifyRoussouly(baseInput({ sacralSlopeDeg: 45.1 })).type).toBe(4);
  });

  it('3-AP tiene prioridad cuando se marca pelvis antevertida, sin importar SS', () => {
    const result = classifyRoussouly(baseInput({ sacralSlopeDeg: 40, anteverted: true }));
    expect(result.type).toBe('3-AP');
  });
});
