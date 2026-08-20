import { describe, expect, it } from 'vitest';
import { computeBlandAltman, computeCohenKappa, computeIcc } from './researchStats';

describe('computeBlandAltman', () => {
  it('calcula el sesgo medio y los límites de concordancia al 95%', () => {
    // Diferencias (propia - automática): 2, 4, 6, 8 -> media 5, sd muestral ≈ 2.582.
    const pairs = [
      { own: 32, automatic: 30 },
      { own: 34, automatic: 30 },
      { own: 36, automatic: 30 },
      { own: 38, automatic: 30 },
    ];
    const result = computeBlandAltman(pairs)!;
    expect(result.n).toBe(4);
    expect(result.meanDifference).toBeCloseTo(5, 6);
    expect(result.sdDifference).toBeCloseTo(2.5819889, 5);
    expect(result.upperLimitOfAgreement).toBeCloseTo(5 + 1.96 * 2.5819889, 5);
    expect(result.lowerLimitOfAgreement).toBeCloseTo(5 - 1.96 * 2.5819889, 5);
  });

  it('sin sesgo, la media de diferencias es 0', () => {
    const pairs = [
      { own: 30, automatic: 32 },
      { own: 32, automatic: 30 },
    ];
    const result = computeBlandAltman(pairs)!;
    expect(result.meanDifference).toBeCloseTo(0, 6);
  });

  it('devuelve null con menos de dos pares (nunca fabrica una desviación estándar sin varianza que estimar)', () => {
    expect(computeBlandAltman([])).toBeNull();
    expect(computeBlandAltman([{ own: 30, automatic: 30 }])).toBeNull();
  });
});

describe('computeIcc', () => {
  it('con acuerdo perfecto entre propia y automática, ICC = 1', () => {
    const pairs = [
      { own: 20, automatic: 20 },
      { own: 30, automatic: 30 },
      { own: 45, automatic: 45 },
      { own: 15, automatic: 15 },
    ];
    const result = computeIcc(pairs)!;
    expect(result.n).toBe(4);
    expect(result.icc).toBeCloseTo(1, 6);
  });

  it('un sesgo sistemático entre propia y automática reduce el ICC (concordancia absoluta, no sólo correlación)', () => {
    const withoutBias = [
      { own: 20, automatic: 20 },
      { own: 30, automatic: 30 },
      { own: 45, automatic: 45 },
      { own: 60, automatic: 60 },
    ];
    const withBias = withoutBias.map((p) => ({ own: p.own + 10, automatic: p.automatic }));

    const iccWithoutBias = computeIcc(withoutBias)!.icc;
    const iccWithBias = computeIcc(withBias)!.icc;
    expect(iccWithBias).toBeLessThan(iccWithoutBias);
  });

  it('devuelve null con menos de dos pares', () => {
    expect(computeIcc([])).toBeNull();
    expect(computeIcc([{ own: 30, automatic: 30 }])).toBeNull();
  });

  it('devuelve null cuando todos los valores son idénticos (sin varianza entre casos)', () => {
    const pairs = [
      { own: 30, automatic: 30 },
      { own: 30, automatic: 30 },
      { own: 30, automatic: 30 },
    ];
    expect(computeIcc(pairs)).toBeNull();
  });
});

describe('computeCohenKappa', () => {
  it('reproduce el ejemplo de referencia: 50 casos, kappa = 0.4', () => {
    const pairs: { own: 'Yes' | 'No'; automatic: 'Yes' | 'No' }[] = [
      ...Array(20).fill({ own: 'Yes', automatic: 'Yes' }),
      ...Array(5).fill({ own: 'Yes', automatic: 'No' }),
      ...Array(10).fill({ own: 'No', automatic: 'Yes' }),
      ...Array(15).fill({ own: 'No', automatic: 'No' }),
    ];
    const result = computeCohenKappa(pairs)!;
    expect(result.n).toBe(50);
    expect(result.observedAgreement).toBeCloseTo(0.7, 6);
    expect(result.expectedAgreement).toBeCloseTo(0.5, 6);
    expect(result.kappa).toBeCloseTo(0.4, 6);
  });

  it('acuerdo perfecto da kappa = 1', () => {
    const pairs = [
      { own: 1, automatic: 1 },
      { own: 2, automatic: 2 },
      { own: 1, automatic: 1 },
      { own: 3, automatic: 3 },
    ];
    expect(computeCohenKappa(pairs)!.kappa).toBeCloseTo(1, 6);
  });

  it('devuelve null con menos de dos pares', () => {
    expect(computeCohenKappa([])).toBeNull();
    expect(computeCohenKappa([{ own: 1, automatic: 1 }])).toBeNull();
  });

  it('devuelve null cuando todo el mundo cae en la misma categoría en ambos lados (kappa indefinido, 0/0)', () => {
    const pairs = [
      { own: 'A', automatic: 'A' },
      { own: 'A', automatic: 'A' },
      { own: 'A', automatic: 'A' },
    ];
    expect(computeCohenKappa(pairs)).toBeNull();
  });
});
