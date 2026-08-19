import { describe, expect, it } from 'vitest';
import { assessCurveStructurality, measureFBCI, measureFlexibilityIndex, pairFlexibilityFilms } from './flexibility';
import { DEFAULT_CONVENTIONS } from '../config/conventions';
import type { Radiograph } from '../models/types';

describe('assessCurveStructurality — docs/OPEN_QUESTIONS.md #6 (borde inclusivo)', () => {
  it('exactamente 25.0° es estructural (borde inclusivo)', () => {
    expect(assessCurveStructurality(25.0).structural).toBe(true);
  });

  it('24.9° no es estructural', () => {
    expect(assessCurveStructurality(24.9).structural).toBe(false);
  });

  it('30° es estructural', () => {
    expect(assessCurveStructurality(30).structural).toBe(true);
  });

  it('con borde exclusivo configurado, exactamente 25.0° no es estructural', () => {
    const conventions = { ...DEFAULT_CONVENTIONS, lenke: { ...DEFAULT_CONVENTIONS.lenke, structuralThresholdsInclusive: false } };
    expect(assessCurveStructurality(25.0, conventions).structural).toBe(false);
  });
});

describe('measureFlexibilityIndex', () => {
  it('calcula el porcentaje de corrección', () => {
    const result = measureFlexibilityIndex(50, 20);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo(60, 6); // (50-20)/50*100
  });

  it('unavailable con Cobb de pie = 0°', () => {
    const result = measureFlexibilityIndex(0, 0);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });
});

describe('measureFBCI', () => {
  it('calcula el FBCI', () => {
    const result = measureFBCI(80, 40);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo(200, 6); // (80/40)*100
  });

  it('unavailable con flexibilidad en fulcrum = 0%', () => {
    const result = measureFBCI(80, 0);
    expect(result.status).toBe('unavailable');
  });
});

describe('pairFlexibilityFilms', () => {
  function makeRadiograph(view: Radiograph['view'], id: string): Radiograph {
    return { id, view, annotations: { vertebrae: [] } };
  }

  it('empareja cada proyección por su view dentro del mismo estudio', () => {
    const radiographs: Radiograph[] = [
      makeRadiograph('PA_standing', 'a'),
      makeRadiograph('BEND_left', 'b'),
      makeRadiograph('BEND_right', 'c'),
      makeRadiograph('LAT_standing', 'd'),
    ];
    const paired = pairFlexibilityFilms(radiographs);
    expect(paired.standing?.id).toBe('a');
    expect(paired.bendLeft?.id).toBe('b');
    expect(paired.bendRight?.id).toBe('c');
    expect(paired.fulcrum).toBeNull();
    expect(paired.traction).toBeNull();
  });

  it('devuelve null para las proyecciones ausentes', () => {
    const paired = pairFlexibilityFilms([]);
    expect(paired.standing).toBeNull();
    expect(paired.bendLeft).toBeNull();
    expect(paired.bendRight).toBeNull();
    expect(paired.fulcrum).toBeNull();
    expect(paired.traction).toBeNull();
  });
});
