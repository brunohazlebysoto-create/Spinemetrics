/**
 * Modificador lumbar de Lenke. SPEC.md §9.1 Paso 5. `docs/OPEN_QUESTIONS.md`
 * #8 ★ (tolerancia B/C) y #9 (ápex en un disco).
 *
 * // AMBIGUO: ver `docs/OPEN_QUESTIONS.md` #43. La redacción de SPEC.md
 * §9.1 ("C completamente medial al margen lateral") es geométricamente
 * inconsistente con la definición clínica estándar de Lenke (C = la CSVL
 * cae completamente LATERAL al cuerpo vertebral apical, sin contacto — no
 * medial). Se implementa aquí la definición clínica estándar (A entre
 * pedículos; B toca el cuerpo entre el borde medial del pedículo y el
 * margen lateral; C completamente fuera del cuerpo, sin contacto),
 * documentado como discrepancia de redacción, no resuelto en silencio.
 */
import { csvlX } from '../measurements/balance';
import type { Calibration } from '../calibration/calibration';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { PelvicAnnotation, TraceStep, VertebraAnnotation } from '../models/types';

export type LumbarModifier = 'A' | 'B' | 'C';

export interface LumbarModifierResult {
  modifier: LumbarModifier | null;
  /** `docs/OPEN_QUESTIONS.md` #8: true cuando la tolerancia de ±1 mm fue lo
   * que decidió B en vez de C (la CSVL cae justo en el borde). */
  borderlineBC: boolean;
  status: 'ok' | 'unavailable';
  reason?: string;
  trace: TraceStep[];
}

/** 0 si `x` está dentro de `[lo, hi]`; en otro caso, distancia positiva al
 * borde más cercano de la banda. */
function distanceOutsideBand(x: number, lo: number, hi: number): number {
  if (x < lo) return lo - x;
  if (x > hi) return x - hi;
  return 0;
}

/**
 * SPEC.md §9.1 Paso 5: posición de la CSVL respecto a la vértebra apical de
 * la curva lumbar/TL-L. `apex` debe ser la vértebra apical de esa curva —
 * ver `docs/OPEN_QUESTIONS.md` #9: nuestro modelo de datos sólo anota
 * vértebras (nunca discos intervertebrales), así que la política "usar la
 * vértebra caudal al disco apical" de #9 es un no-op estructural aquí: el
 * ápex que produce `determineApexVertebra` siempre es ya una vértebra
 * concreta, nunca un disco.
 *
 * No decide el override "tipos 5 y 6 son por definición C" — eso depende
 * del tipo de curva de Lenke, que se resuelve en `lenke.ts`, no aquí: esta
 * función es puramente geométrica.
 */
export function determineLumbarModifier(
  apex: VertebraAnnotation | null,
  pelvis: PelvicAnnotation | undefined,
  calibration: Calibration | undefined,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): LumbarModifierResult {
  const trace: TraceStep[] = [];

  if (!apex) {
    return {
      modifier: null,
      borderlineBC: false,
      status: 'unavailable',
      reason: 'Sin vértebra apical de la curva lumbar/TL-L: no se puede determinar el modificador lumbar.',
      trace,
    };
  }
  if (!pelvis) {
    return {
      modifier: null,
      borderlineBC: false,
      status: 'unavailable',
      reason: 'Sin anotación pélvica: no se puede trazar la CSVL.',
      trace,
    };
  }
  if (!apex.pedicles || !apex.lateralBorders) {
    return {
      modifier: null,
      borderlineBC: false,
      status: 'unavailable',
      reason: `Faltan pedículos o bordes laterales anotados en la vértebra apical (${apex.level}).`,
      trace,
    };
  }

  const csvl = csvlX(pelvis);
  const pedicleMinX = Math.min(apex.pedicles.left.x, apex.pedicles.right.x);
  const pedicleMaxX = Math.max(apex.pedicles.left.x, apex.pedicles.right.x);
  const borderMinX = Math.min(apex.lateralBorders[0].x, apex.lateralBorders[1].x);
  const borderMaxX = Math.max(apex.lateralBorders[0].x, apex.lateralBorders[1].x);

  trace.push({ step: 'CSVL', detail: 'Punto medio del platillo superior de S1.', value: csvl });
  trace.push({
    step: `pedículos de ${apex.level}`,
    detail: `x en [${pedicleMinX.toFixed(1)}, ${pedicleMaxX.toFixed(1)}] px.`,
  });
  trace.push({
    step: `bordes laterales de ${apex.level}`,
    detail: `x en [${borderMinX.toFixed(1)}, ${borderMaxX.toFixed(1)}] px.`,
  });

  const pedicleDist = distanceOutsideBand(csvl, pedicleMinX, pedicleMaxX);
  if (pedicleDist === 0) {
    trace.push({ step: 'modificador lumbar', detail: `CSVL (${csvl.toFixed(1)}) entre los pedículos → A.` });
    return { modifier: 'A', borderlineBC: false, status: 'ok', trace };
  }

  let toleranceGuidancePx = 0;
  if (calibration) {
    toleranceGuidancePx = conventions.lenke.lumbarModifierToleranceMm * calibration.pxPerMm;
    trace.push({
      step: 'tolerancia B/C',
      detail:
        `±${conventions.lenke.lumbarModifierToleranceMm} mm calibrado = ±${toleranceGuidancePx.toFixed(1)} px ` +
        '(docs/OPEN_QUESTIONS.md #8).',
    });
  } else {
    trace.push({
      step: 'tolerancia B/C',
      detail: 'Sin calibración: la tolerancia de ±1 mm no se puede expresar en píxeles; se usa frontera estricta.',
    });
  }

  const bodyDist = distanceOutsideBand(csvl, borderMinX, borderMaxX);
  if (bodyDist <= toleranceGuidancePx) {
    const borderlineBC = bodyDist > 0;
    trace.push({
      step: 'modificador lumbar',
      detail: borderlineBC
        ? `CSVL fuera del margen lateral estricto pero dentro de la tolerancia de ±1 mm → B (docs/OPEN_QUESTIONS.md #8), borderlineBC.`
        : `CSVL toca el cuerpo apical entre el pedículo y el margen lateral → B.`,
    });
    return { modifier: 'B', borderlineBC, status: 'ok', trace };
  }

  trace.push({
    step: 'modificador lumbar',
    detail: `CSVL completamente fuera del cuerpo apical (sin contacto, ni con tolerancia) → C.`,
  });
  return { modifier: 'C', borderlineBC: false, status: 'ok', trace };
}
