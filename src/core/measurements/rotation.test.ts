import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERDRIOLLE_TABLE,
  importSterEosRotation,
  measurePerdriolleRotation,
  recordNashMoeGrade,
} from './rotation';
import { DEFAULT_CONVENTIONS } from '../config/conventions';

describe('measurePerdriolleRotation — docs/OPEN_QUESTIONS.md #29/#41', () => {
  it('pedículo centrado (sin desplazamiento) da 0°', () => {
    const result = measurePerdriolleRotation({ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 150, y: 0 });
    expect(result.value).toBe(0);
    expect(result.status).toBe('warning');
    expect(result.warnings).toContain('perdriolleTableUnverified');
  });

  it('interpola linealmente entre los puntos tabulados', () => {
    // width=100, pedículo desplazado 12.5 px → ratio 0.125, entre 0.10→10°
    // y 0.15→15°: interpolado 12.5°, redondeado a 5° → 15°.
    const result = measurePerdriolleRotation({ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 162.5, y: 0 });
    expect(result.value).toBe(15);
  });

  it('recorta al extremo de la tabla en vez de extrapolar más allá de ratio 0.5', () => {
    const result = measurePerdriolleRotation({ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 });
    expect(result.value).toBe(60);
  });

  it('usa la proyección sobre el eje transverso, no la distancia euclídea directa', () => {
    // Cuerpo apical inclinado 45°; el pedículo se desplaza exactamente en la
    // dirección perpendicular al eje (100,100) → (-1,1), por lo que su
    // proyección sobre el eje transverso es 0 aunque la distancia euclídea
    // al centro del cuerpo no lo sea.
    const left = { x: 0, y: 0 };
    const right = { x: 100, y: 100 }; // eje a 45°, anchura = 100*sqrt(2)
    const perpendicularOffset = { x: -7.0710678, y: 7.0710678 };
    const pedicleOffAxis = { x: 50 + perpendicularOffset.x, y: 50 + perpendicularOffset.y };
    const result = measurePerdriolleRotation(left, right, pedicleOffAxis);
    expect(result.value).toBe(0);
  });

  it('respeta un redondeo configurado explícitamente', () => {
    const conventions = { ...DEFAULT_CONVENTIONS, rotation: { ...DEFAULT_CONVENTIONS.rotation, perdriolleRoundingDeg: 1 } };
    const result = measurePerdriolleRotation({ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 162.5, y: 0 }, conventions);
    // Sin redondeo a 5° (step=1), 12.5 se redondea a 13 (Math.round hacia arriba en .5).
    expect(result.value).toBeCloseTo(13, 6);
  });

  it('unavailable si los bordes del cuerpo coinciden', () => {
    const result = measurePerdriolleRotation({ x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 });
    expect(result.status).toBe('unavailable');
  });

  it('acepta una tabla personalizada (torsiómetro físico del centro)', () => {
    const customTable = [
      { ratio: 0, degrees: 0 },
      { ratio: 1, degrees: 90 },
    ];
    const result = measurePerdriolleRotation(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 }, // centro del cuerpo en x=50, ancho=100 → desplazamiento 50 → ratio 0.5
      DEFAULT_CONVENTIONS,
      customTable,
    );
    expect(result.value).toBe(45);
    expect(customTable).not.toEqual(DEFAULT_PERDRIOLLE_TABLE);
  });
});

describe('recordNashMoeGrade — docs/OPEN_QUESTIONS.md #30 (decisión firme)', () => {
  it('registra el grado ordinal sin convertirlo a grados', () => {
    const result = recordNashMoeGrade(3);
    expect(result.value).toBe(3);
    expect(result.unit).toBe('ordinal');
    expect(result.status).toBe('ok');
  });

  it('no existe ninguna función que convierta Nash-Moe a grados en este módulo', async () => {
    const moduleExports = await import('./rotation');
    expect(Object.keys(moduleExports)).not.toContain('nashMoeToDegrees');
  });
});

describe('importSterEosRotation', () => {
  it('etiqueta el valor como fuente externa', () => {
    const result = importSterEosRotation('T8', 18);
    expect(result.value).toBe(18);
    expect(result.status).toBe('ok');
    expect(result.trace[0]!.detail).toMatch(/sterEOS/);
  });
});
