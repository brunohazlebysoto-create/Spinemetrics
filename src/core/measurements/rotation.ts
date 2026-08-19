/**
 * Rotación vertebral. SPEC.md §7.8. Ref. 2 (Nash-Moe 1969), 15 (Lam 2008 —
 * revisión de métodos), 21 (Boyer 2018 — Nash-Moe debe evitarse, error
 * interobservador >9°).
 */
import { distance, midpoint, subtract } from '../geometry/primitives';
import type { Pt } from '../geometry/types';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { MeasurementResult, SpinalLevel, TraceStep } from '../models/types';

export interface PerdriolleTablePoint {
  /** Desplazamiento relativo `d/w`, 0–1. */
  ratio: number;
  degrees: number;
}

/**
 * AMBIGUO: ver `docs/OPEN_QUESTIONS.md` #41. SPEC.md §7.8 exige mapear
 * `d/w` a grados "por la tabla de Perdriolle", pero ni SPEC.md ni
 * `docs/REFERENCES.md` reproducen los valores numéricos exactos del
 * torsiómetro original (Perdriolle & Vidal, 1985) — es una plantilla
 * física, no una tabla publicada en el artículo. Esta es una tabla de
 * anclaje aproximada y **no verificada**; todo resultado que la use lleva
 * la advertencia `perdriolleTableUnverified`. Configurable: cualquier
 * centro puede sustituirla por la tabla impresa en su propio torsiómetro.
 */
export const DEFAULT_PERDRIOLLE_TABLE: PerdriolleTablePoint[] = [
  { ratio: 0.0, degrees: 0 },
  { ratio: 0.05, degrees: 5 },
  { ratio: 0.1, degrees: 10 },
  { ratio: 0.15, degrees: 15 },
  { ratio: 0.2, degrees: 20 },
  { ratio: 0.25, degrees: 25 },
  { ratio: 0.3, degrees: 30 },
  { ratio: 0.35, degrees: 35 },
  { ratio: 0.4, degrees: 40 },
  { ratio: 0.45, degrees: 50 },
  { ratio: 0.5, degrees: 60 },
];

/** Interpolación lineal entre los puntos tabulados (`docs/OPEN_QUESTIONS.md`
 * #29). Ratios por debajo del mínimo o por encima del máximo tabulado se
 * recortan al extremo más cercano en vez de extrapolar. */
function interpolateTable(ratio: number, table: PerdriolleTablePoint[]): number {
  const sorted = [...table].sort((a, b) => a.ratio - b.ratio);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (ratio <= first.ratio) return first.degrees;
  if (ratio >= last.ratio) return last.degrees;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (ratio >= a.ratio && ratio <= b.ratio) {
      const t = (ratio - a.ratio) / (b.ratio - a.ratio);
      return a.degrees + t * (b.degrees - a.degrees);
    }
  }
  return last.degrees;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * SPEC.md §7.8: "Perdriolle/Raimondi: herramienta digital — bordes
 * laterales del cuerpo apical y centro del pedículo convexo; se calcula el
 * desplazamiento relativo `d/w` y se mapea a grados por la tabla de
 * Perdriolle, redondeando a 5°."
 *
 * `d` se mide como la proyección con signo del pedículo convexo sobre el
 * eje transverso del cuerpo vertebral (la línea que une los bordes
 * laterales), no como distancia euclídea directa: así el resultado es
 * estable aunque la vértebra esté inclinada en la imagen.
 */
export function measurePerdriolleRotation(
  apicalBodyLeftEdge: Pt,
  apicalBodyRightEdge: Pt,
  convexPedicleCenter: Pt,
  conventions: Conventions = DEFAULT_CONVENTIONS,
  table: PerdriolleTablePoint[] = DEFAULT_PERDRIOLLE_TABLE,
): MeasurementResult {
  const width = distance(apicalBodyLeftEdge, apicalBodyRightEdge);
  if (width === 0) {
    return {
      value: null,
      unit: 'deg',
      status: 'unavailable',
      reason: 'Los bordes laterales del cuerpo apical coinciden: no se puede calcular la anchura.',
      trace: [],
    };
  }

  const bodyCenter = midpoint(apicalBodyLeftEdge, apicalBodyRightEdge);
  const axis = subtract(apicalBodyRightEdge, apicalBodyLeftEdge);
  const unitAxis: Pt = { x: axis.x / width, y: axis.y / width };
  const toPedicle = subtract(convexPedicleCenter, bodyCenter);
  const d = toPedicle.x * unitAxis.x + toPedicle.y * unitAxis.y;
  const ratio = Math.abs(d) / width;

  const rawDegrees = interpolateTable(ratio, table);
  const rounded = roundTo(rawDegrees, conventions.rotation.perdriolleRoundingDeg);

  const trace: TraceStep[] = [
    { step: 'desplazamiento relativo d/w', detail: 'Proyección del pedículo convexo sobre el eje transverso del cuerpo apical.', value: ratio },
    {
      step: 'tabla de Perdriolle',
      detail:
        'Interpolación lineal, redondeada a ' +
        `${conventions.rotation.perdriolleRoundingDeg}° (docs/OPEN_QUESTIONS.md #29; tabla no verificada, #41).`,
      value: rawDegrees,
    },
  ];

  return {
    value: rounded,
    unit: 'deg',
    status: 'warning',
    warnings: ['perdriolleTableUnverified'],
    trace,
  };
}

/** Grado ordinal de Nash-Moe (0–IV). SPEC.md §7.8. */
export type NashMoeGrade = 0 | 1 | 2 | 3 | 4;

/**
 * SPEC.md §7.8 / `docs/OPEN_QUESTIONS.md` #30, decisión firme, no
 * configurable: Nash-Moe se registra como grado ordinal y **nunca se
 * convierte a grados ni entra en ningún cálculo**. No existe — deliberada-
 * mente — ninguna función `nashMoeToDegrees` en este módulo.
 */
export function recordNashMoeGrade(grade: NashMoeGrade): MeasurementResult {
  const trace: TraceStep[] = [
    {
      step: 'Nash-Moe',
      detail:
        `Grado ordinal ${grade} (0–IV). Nunca se convierte a grados ni entra en ningún cálculo ` +
        '(docs/OPEN_QUESTIONS.md #30, decisión firme).',
    },
  ];
  return { value: grade, unit: 'ordinal', status: 'ok', trace };
}

/**
 * SPEC.md §7.8: "sterEOS: permitir importar el valor si el centro dispone
 * de EOS, etiquetado como fuente externa (precisión ~1–2°)."
 */
export function importSterEosRotation(level: SpinalLevel, rotationDeg: number): MeasurementResult {
  const trace: TraceStep[] = [
    {
      step: 'sterEOS',
      detail: `Rotación de ${level} importada de sterEOS (fuente externa, precisión ~1–2°, SPEC.md §7.8).`,
      value: rotationDeg,
    },
  ];
  return { value: rotationDeg, unit: 'deg', status: 'ok', trace };
}
