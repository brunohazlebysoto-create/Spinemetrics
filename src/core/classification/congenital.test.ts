import { describe, expect, it } from 'vitest';
import { classifyCongenital, type CongenitalClassificationInput } from './congenital';

describe('classifyCongenital', () => {
  it('sin hallazgos: no clasificable', () => {
    const result = classifyCongenital({ formationFailure: null, segmentationFailure: null });
    expect(result.mainType).toBeNull();
    expect(result.unmetInputs).toEqual(['formationFailure', 'segmentationFailure']);
  });

  it('tipo I, parcial (vértebra en cuña)', () => {
    const result = classifyCongenital({ formationFailure: { kind: 'partialWedge' }, segmentationFailure: null });
    expect(result.mainType).toBe('I');
  });

  it('tipo I, completo (hemivértebra)', () => {
    const result = classifyCongenital({
      formationFailure: { kind: 'completeHemivertebra', subtype: 'fullySegmented', side: 'left' },
      segmentationFailure: null,
    });
    expect(result.mainType).toBe('I');
  });

  it('tipo II, unilateral (barra no segmentada)', () => {
    const result = classifyCongenital({ formationFailure: null, segmentationFailure: { kind: 'unilateralBar', side: 'right' } });
    expect(result.mainType).toBe('II');
  });

  it('tipo II, bilateral (vértebra en bloque)', () => {
    const result = classifyCongenital({ formationFailure: null, segmentationFailure: { kind: 'bilateralBlockVertebra' } });
    expect(result.mainType).toBe('II');
  });

  it('tipo III (mixto): ambos fallos presentes', () => {
    const input: CongenitalClassificationInput = {
      formationFailure: { kind: 'partialWedge' },
      segmentationFailure: { kind: 'bilateralBlockVertebra' },
    };
    expect(classifyCongenital(input).mainType).toBe('III');
  });

  describe('alerta obligatoria: barra unilateral + hemivértebra contralateral', () => {
    it('se dispara cuando los lados son opuestos', () => {
      const result = classifyCongenital({
        formationFailure: { kind: 'completeHemivertebra', subtype: 'nonsegmentedOrIncarcerated', side: 'left' },
        segmentationFailure: { kind: 'unilateralBar', side: 'right' },
      });
      expect(result.rapidProgressionAlert).toBe(true);
      expect(result.result).toContain('artrodesis profiláctica precoz');
    });

    it('no se dispara cuando los lados coinciden (ipsilateral)', () => {
      const result = classifyCongenital({
        formationFailure: { kind: 'completeHemivertebra', subtype: 'semisegmented', side: 'left' },
        segmentationFailure: { kind: 'unilateralBar', side: 'left' },
      });
      expect(result.rapidProgressionAlert).toBe(false);
    });

    it('no se dispara para vértebra en cuña (no es hemivértebra completa)', () => {
      const result = classifyCongenital({
        formationFailure: { kind: 'partialWedge' },
        segmentationFailure: { kind: 'unilateralBar', side: 'right' },
      });
      expect(result.rapidProgressionAlert).toBe(false);
    });
  });
});
