import { describe, expect, it } from 'vitest';
import { labelVertebraLevels } from './levelLabeling';
import type { VertebraBandCandidate } from './vertebraDetector';

function makeBand(rowCenter: number): VertebraBandCandidate {
  return { rowCenter, rowTop: rowCenter - 10, rowBottom: rowCenter + 10, colLeft: 0, colRight: 50, confidence: { value: 0.4, reason: '' } };
}

describe('labelVertebraLevels', () => {
  it('sin ancla, nunca etiqueta y marca uncertain (nunca adivina)', () => {
    const bands = [makeBand(0), makeBand(30), makeBand(60)];
    const result = labelVertebraLevels(bands, null);
    expect(result.uncertain).toBe(true);
    expect(result.labeled.every((l) => l.level === null)).toBe(true);
  });

  it('sin bandas, uncertain', () => {
    const result = labelVertebraLevels([], null);
    expect(result.uncertain).toBe(true);
    expect(result.labeled).toEqual([]);
  });

  it('con ancla, cuenta craneal→caudal correctamente', () => {
    const bands = [makeBand(0), makeBand(30), makeBand(60), makeBand(90), makeBand(120)];
    // Banda 2 (índice 2) es T8.
    const result = labelVertebraLevels(bands, { bandIndex: 2, level: 'T8' });
    expect(result.uncertain).toBe(false);
    expect(result.labeled.map((l) => l.level)).toEqual(['T6', 'T7', 'T8', 'T9', 'T10']);
  });

  it('ancla en el primer o último índice también funciona', () => {
    const bands = [makeBand(0), makeBand(30), makeBand(60)];
    const result = labelVertebraLevels(bands, { bandIndex: 0, level: 'L3' });
    expect(result.labeled.map((l) => l.level)).toEqual(['L3', 'L4', 'L5']);
  });

  it('marca uncertain si el recuento se sale del dominio C7–S1', () => {
    const bands = Array.from({ length: 5 }, (_, i) => makeBand(i * 30));
    // Ancla en T1 (índice 2): índice 0 requeriría un nivel más craneal que C7.
    const result = labelVertebraLevels(bands, { bandIndex: 2, level: 'T1' });
    expect(result.uncertain).toBe(true);
    expect(result.reason).toMatch(/fuera del dominio/);
  });

  it('índice de ancla fuera de rango produce uncertain sin lanzar', () => {
    const bands = [makeBand(0), makeBand(30)];
    const result = labelVertebraLevels(bands, { bandIndex: 5, level: 'T5' });
    expect(result.uncertain).toBe(true);
    expect(result.labeled.every((l) => l.level === null)).toBe(true);
  });
});
