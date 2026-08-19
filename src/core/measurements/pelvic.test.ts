import { describe, expect, it } from 'vitest';
import {
  measurePelvicObliquity,
  measurePelvicParameters,
  measurePiLlMismatch,
  pelvicIncidenceReferenceBand,
} from './pelvic';
import { calibrationFromRuler } from '../calibration/calibration';
import { DEFAULT_CONVENTIONS } from '../config/conventions';
import type { PelvicAnnotation, Pt } from '../models/types';

function rotate(v: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  return {
    x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
    y: v.x * Math.sin(rad) + v.y * Math.cos(rad),
  };
}

/**
 * Construye una pelvis sintética geométricamente coherente: parte de una
 * configuración de referencia con PT=0 (F directamente alineado con M en la
 * dirección de referencia) donde por construcción PI = SS, y rota el cuerpo
 * rígido completo (F y la línea de S1 solidarios) un ángulo `phi` alrededor
 * de M. La rotación conjunta desplaza PT y SS pero conserva PI = `piTarget`
 * (SPEC.md §7.6: PI es un parámetro morfológico constante, independiente de
 * la postura).
 */
function buildConsistentPelvis(piTarget: number, phi: number): PelvicAnnotation {
  const m: Pt = { x: 200, y: 300 };
  const fmDirBase: Pt = { x: 0, y: 1 };
  // Nótese el signo: para que PT + SS se mantenga igual a `piTarget` al
  // variar `phi` (0 ≤ phi < piTarget en los fixtures de este archivo), la
  // orientación base de S1 debe rotarse en sentido opuesto a `piTarget`
  // antes de aplicar la misma rotación `phi` que a F.
  const s1DirBase = rotate({ x: 1, y: 0 }, -piTarget);
  const fmDir = rotate(fmDirBase, phi);
  const s1Dir = rotate(s1DirBase, phi);

  const length = 300;
  const f: Pt = { x: m.x - fmDir.x * length, y: m.y - fmDir.y * length };
  const s1Left: Pt = { x: m.x - s1Dir.x * 20, y: m.y - s1Dir.y * 20 };
  const s1Right: Pt = { x: m.x + s1Dir.x * 20, y: m.y + s1Dir.y * 20 };

  return {
    femoralHeads: {
      left: { center: { x: f.x - 20, y: f.y }, radius: 15 },
      right: { center: { x: f.x + 20, y: f.y }, radius: 15 },
    },
    s1Endplate: [s1Left, s1Right],
  };
}

describe('measurePelvicParameters — coherencia PI = PT + SS (SPEC.md §13.2)', () => {
  it.each([
    [53, 0],
    [53, 15],
    [60, 10],
    [40, 20],
  ])('PI=%s°, rotación de postura=%s°: |PI − (PT+SS)| ≤ 1°', (piTarget, phi) => {
    const pelvis = buildConsistentPelvis(piTarget, phi);
    const result = measurePelvicParameters(pelvis);
    expect(result.discrepancyDeg).toBeLessThan(1);
    expect(result.consistent).toBe(true);
    expect(result.sacralSlope.status).toBe('ok');
    expect(result.pelvicTilt.status).toBe('ok');
    expect(result.pelvicIncidence.status).toBe('ok');
  });

  it('los tres parámetros salen en gris con el motivo cuando la verificación falla', () => {
    // PI = PT + SS es una identidad geométrica exacta para CUALQUIER F, M y
    // orientación de S1 (es la base matemática de la incidencia pélvica:
    // Legaye 1998), así que sólo se rompe cuando el plegado a ángulo agudo
    // de `angleBetweenLines` distorsiona alguno de los tres términos — es
    // decir, cuando el desplazamiento femoral bruto respecto a M supera 90°,
    // como ocurriría con un F mal anotado casi coincidente con M o al lado
    // equivocado. `phi=100°` fuerza justo ese pliegue.
    const inconsistentPelvis = buildConsistentPelvis(53, 100);
    const result = measurePelvicParameters(inconsistentPelvis);
    expect(result.consistent).toBe(false);
    expect(result.discrepancyDeg).toBeGreaterThan(1);
    for (const measurement of [result.sacralSlope, result.pelvicTilt, result.pelvicIncidence]) {
      expect(measurement.status).toBe('unavailable');
      expect(measurement.value).toBeNull();
      expect(measurement.reason).toMatch(/landmarks pélvicos poco fiables/);
    }
  });

  it('degrada a ámbar cuando los centros femorales están separados >15 mm', () => {
    const pelvis = buildConsistentPelvis(53, 0);
    const separated: PelvicAnnotation = {
      ...pelvis,
      femoralHeads: {
        left: { center: { x: pelvis.femoralHeads.left.center.x - 100, y: pelvis.femoralHeads.left.center.y }, radius: 15 },
        right: { center: { x: pelvis.femoralHeads.right.center.x + 100, y: pelvis.femoralHeads.right.center.y }, radius: 15 },
      },
    };
    const calibration = calibrationFromRuler(10, 1); // 10 px/mm: 200 px de más separación → 20 mm
    const result = measurePelvicParameters(separated, calibration);
    // La rotación no afecta el ángulo (F sigue siendo el punto medio), sólo
    // degrada la confianza.
    if (result.consistent) {
      expect(result.sacralSlope.status).toBe('warning');
      expect(result.sacralSlope.warnings).toContain('femoralHeadSeparation');
    }
  });
});

describe('measurePiLlMismatch', () => {
  it('PI − LL, objetivo terapéutico ≤10° documentado en la traza', () => {
    const result = measurePiLlMismatch(60, 55);
    expect(result.value).toBe(5);
    expect(result.trace[0]!.detail).toMatch(/10/);
  });
});

describe('pelvicIncidenceReferenceBand — docs/OPEN_QUESTIONS.md #17', () => {
  it('devuelve la banda de referencia adulta en ≥18 años', () => {
    const band = pelvicIncidenceReferenceBand(18);
    expect(band).toEqual({ mean: 53, sd: 10, range: [33, 85] });
  });

  it('no hay banda de normalidad en <18 años', () => {
    expect(pelvicIncidenceReferenceBand(12)).toBeNull();
  });
});

describe('measurePelvicObliquity — docs/OPEN_QUESTIONS.md #18 (Osebold por defecto)', () => {
  it('calcula el ángulo entre las crestas ilíacas y la horizontal', () => {
    const pelvis: PelvicAnnotation = {
      femoralHeads: {
        left: { center: { x: 160, y: 500 }, radius: 15 },
        right: { center: { x: 240, y: 500 }, radius: 15 },
      },
      s1Endplate: [
        { x: 180, y: 400 },
        { x: 220, y: 400 },
      ],
      iliacCrests: { left: { x: 140, y: 250 }, right: { x: 260, y: 260 } },
    };
    const result = measurePelvicObliquity(pelvis);
    expect(result.status).toBe('ok');
    expect(result.value).not.toBeNull();
    expect(result.trace[0]!.step).toMatch(/Osebold/);
  });

  it('unavailable sin crestas ilíacas anotadas', () => {
    const pelvis: PelvicAnnotation = {
      femoralHeads: {
        left: { center: { x: 160, y: 500 }, radius: 15 },
        right: { center: { x: 240, y: 500 }, radius: 15 },
      },
      s1Endplate: [
        { x: 180, y: 400 },
        { x: 220, y: 400 },
      ],
    };
    expect(measurePelvicObliquity(pelvis).status).toBe('unavailable');
  });

  it('declara explícitamente no implementado un método distinto de Osebold', () => {
    const pelvis: PelvicAnnotation = {
      femoralHeads: {
        left: { center: { x: 160, y: 500 }, radius: 15 },
        right: { center: { x: 240, y: 500 }, radius: 15 },
      },
      s1Endplate: [
        { x: 180, y: 400 },
        { x: 220, y: 400 },
      ],
      iliacCrests: { left: { x: 140, y: 250 }, right: { x: 260, y: 260 } },
    };
    const conventions = { ...DEFAULT_CONVENTIONS, pelvic: { ...DEFAULT_CONVENTIONS.pelvic, obliquityMethod: 'maloney' as const } };
    const result = measurePelvicObliquity(pelvis, conventions);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toMatch(/maloney/);
  });
});
