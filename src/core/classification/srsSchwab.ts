/**
 * SRS-Schwab (adulto). SPEC.md §9.4. `docs/OPEN_QUESTIONS.md` #20 ★ (bordes
 * de los modificadores) y #21 (ápex en disco T9-T10).
 */
import { CLINICAL } from '../constants';
import type { ClassificationResult, SpinalLevel, TraceStep } from '../models/types';
import { compareSpinalLevels } from '../models/spinalLevelOrder';

export type SrsSchwabCoronalDescriptor = 'T' | 'L' | 'D' | 'N';
export type SrsSchwabGrade = '0' | '+' | '++';

const CORONAL_CURVE_THRESHOLD_DEG = 30;

export interface SrsSchwabCoronalCurve {
  apexLevel: SpinalLevel;
  cobbDeg: number;
}

/**
 * A diferencia de Lenke/King-Moe/PUMC (una sola radiografía PA de pie),
 * SRS-Schwab combina el descriptor coronal (de la PA de pie) con PI-LL,
 * SVA y PT (de la lateral de pie) — no tiene "una" proyección única que
 * bloquear con `docs/OPEN_QUESTIONS.md` #5. Es responsabilidad de quien
 * ensambla este input garantizar que ambos valores procedan de radiografías
 * en bipedestación, no de esta función.
 */
export interface SrsSchwabClassificationInput {
  /** Curvas coronales mayores detectadas en la PA de pie (normalmente 1–2:
   * una torácica y/o una toracolumbar/lumbar). */
  curves: SrsSchwabCoronalCurve[];
  piLlMismatchDeg: number | null;
  svaMm: number | null;
  ptDeg: number | null;
}

export interface SrsSchwabClassificationResult extends ClassificationResult {
  coronalDescriptor: SrsSchwabCoronalDescriptor | null;
  piLlGrade: SrsSchwabGrade | null;
  svaGrade: SrsSchwabGrade | null;
  ptGrade: SrsSchwabGrade | null;
}

/**
 * `docs/OPEN_QUESTIONS.md` #20 ★: "el borde inferior pertenece a la
 * categoría superior". `bounds = [lo, hi]`: `value < lo` → '0'; `lo <=
 * value <= hi` → '+'; `value > hi` → '++'.
 */
function gradeByBounds(value: number, bounds: [number, number]): SrsSchwabGrade {
  const [lo, hi] = bounds;
  if (value < lo) return '0';
  if (value <= hi) return '+';
  return '++';
}

function gradeModifier(
  name: string,
  value: number | null,
  bounds: [number, number],
  unit: string,
  trace: TraceStep[],
  unmetInputs: string[],
): SrsSchwabGrade | null {
  if (value === null) {
    unmetInputs.push(name);
    return null;
  }
  const grade = gradeByBounds(value, bounds);
  trace.push({
    step: `modificador ${name}`,
    detail: `${value.toFixed(1)}${unit} → '${grade}' (docs/OPEN_QUESTIONS.md #20, bordes [${bounds[0]}, ${bounds[1]}]).`,
    value,
  });
  return grade;
}

/**
 * SPEC.md §9.4: "T (ápex T9 o superior), L (ápex T10 o inferior), D (doble,
 * ambas ≥30°), N (ninguna >30°)." `docs/OPEN_QUESTIONS.md` #21 (ápex en el
 * disco T9-T10 → L) es, igual que #44, un no-op estructural aquí: el modelo
 * de datos nunca produce un ápex en un disco, sólo vértebras concretas.
 *
 * // AMBIGUO: la propia redacción es internamente inconsistente en el borde
 * de 30° exacto — T/L/D exigen "≥30°" pero N dice "ninguna >30°", que
 * dejaría 30.0° exacto sin categoría. Se aplica aquí el mismo principio de
 * borde de `docs/OPEN_QUESTIONS.md` #20 ("el borde inferior pertenece a la
 * categoría superior"): exactamente 30.0° cuenta como alcanzando el umbral
 * (T/L/D), no como N.
 */
function classifyCoronalDescriptor(
  curves: SrsSchwabCoronalCurve[],
  trace: TraceStep[],
): SrsSchwabCoronalDescriptor {
  let maxThoracic: number | null = null;
  let maxLumbar: number | null = null;
  for (const curve of curves) {
    const isThoracic = compareSpinalLevels(curve.apexLevel, 'T9') <= 0;
    trace.push({
      step: 'descriptor coronal, curva',
      detail: `Ápex ${curve.apexLevel} (${isThoracic ? 'T9 o superior → torácica' : 'T10 o inferior → lumbar'}), Cobb ${curve.cobbDeg.toFixed(1)}°.`,
    });
    if (isThoracic) maxThoracic = maxThoracic === null ? curve.cobbDeg : Math.max(maxThoracic, curve.cobbDeg);
    else maxLumbar = maxLumbar === null ? curve.cobbDeg : Math.max(maxLumbar, curve.cobbDeg);
  }

  const thoracicMajor = maxThoracic !== null && maxThoracic >= CORONAL_CURVE_THRESHOLD_DEG;
  const lumbarMajor = maxLumbar !== null && maxLumbar >= CORONAL_CURVE_THRESHOLD_DEG;

  let descriptor: SrsSchwabCoronalDescriptor;
  if (thoracicMajor && lumbarMajor) descriptor = 'D';
  else if (thoracicMajor) descriptor = 'T';
  else if (lumbarMajor) descriptor = 'L';
  else descriptor = 'N';

  trace.push({ step: 'descriptor coronal', detail: `'${descriptor}' (SPEC.md §9.4).` });
  return descriptor;
}

export function classifySrsSchwab(input: SrsSchwabClassificationInput): SrsSchwabClassificationResult {
  const trace: TraceStep[] = [];
  const unmetInputs: string[] = [];

  const coronalDescriptor = classifyCoronalDescriptor(input.curves, trace);
  const piLlGrade = gradeModifier('PI-LL', input.piLlMismatchDeg, CLINICAL.SCHWAB.piLl, '°', trace, unmetInputs);
  const svaGrade = gradeModifier(
    'SVA',
    input.svaMm !== null ? input.svaMm / 10 : null,
    CLINICAL.SCHWAB.svaCm,
    ' cm',
    trace,
    unmetInputs,
  );
  const ptGrade = gradeModifier('PT', input.ptDeg, CLINICAL.SCHWAB.ptDeg, '°', trace, unmetInputs);

  const result = `SRS-Schwab ${coronalDescriptor}, PI-LL ${piLlGrade ?? '?'}, SVA ${svaGrade ?? '?'}, PT ${ptGrade ?? '?'}`;

  return {
    result,
    trace,
    ...(unmetInputs.length > 0 ? { unmetInputs } : {}),
    coronalDescriptor,
    piLlGrade,
    svaGrade,
    ptGrade,
  };
}
