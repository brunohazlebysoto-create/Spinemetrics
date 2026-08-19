/**
 * Modelo de datos de dominio. SPEC.md §5.
 *
 * `core/models` no depende de `core/geometry` más que del tipo `Pt`, y no
 * depende de `ui/`, `imaging/` ni `pipeline/` (regla de arquitectura no
 * negociable de SPEC.md §4).
 */
import type { Pt } from '../geometry/types';

export type { Pt } from '../geometry/types';

export type ThoracicLevel =
  | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11' | 'T12';
export type LumbarLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** Nivel vertebral. SPEC.md §5. */
export type SpinalLevel = 'C7' | ThoracicLevel | LumbarLevel | 'S1';

export interface VertebraAnnotation {
  level: SpinalLevel;
  /** Izquierda del paciente, derecha del paciente. */
  superiorEndplate: [Pt, Pt];
  inferiorEndplate: [Pt, Pt];
  /** Necesario para el modificador lumbar de Lenke (fase 4). */
  lateralBorders?: [Pt, Pt];
  pedicles?: { left: Pt; right: Pt };
  centroid?: Pt;
  /** Requerido en S1 para el SVA. */
  posteriorSuperiorCorner?: Pt;
  /** 0–1. Sólo presente en landmarks automáticos. */
  confidence?: number;
  /** true si el usuario lo corrigió (bucle de mejora del modelo, §12). */
  edited?: boolean;
}

export interface PelvicAnnotation {
  femoralHeads: { left: { center: Pt; radius: number }; right: { center: Pt; radius: number } };
  s1Endplate: [Pt, Pt];
  iliacCrests?: { left: Pt; right: Pt };
}

/** RVAD de Mehta. SPEC.md §5, §7.9. */
export interface RibAnnotation {
  /** Vértebra apical. */
  level: SpinalLevel;
  concave: { headMid: Pt; neckMid: Pt };
  convex: { headMid: Pt; neckMid: Pt };
}

export type RadiographView =
  | 'PA_standing'
  | 'LAT_standing'
  | 'PA_supine'
  | 'BEND_left'
  | 'BEND_right'
  | 'FULCRUM'
  | 'TRACTION'
  | 'HAND'
  | 'PELVIS';

export type CalibrationMethod = 'dicom' | 'ruler' | 'sphere';

export interface Radiograph {
  id: string;
  view: RadiographView;
  pixelSpacing?: [number, number];
  calibration?: { pxPerMm: number; method: CalibrationMethod; magnification?: number };
  annotations: { vertebrae: VertebraAnnotation[]; pelvis?: PelvicAnnotation; ribs?: RibAnnotation[] };
}

/** Unidad de una medición. SPEC.md §5. */
export type MeasurementUnit = 'deg' | 'mm' | 'ratio' | 'ordinal';

/** Semáforo por parámetro. SPEC.md §8.1: verde = 'ok', ámbar = 'warning',
 * gris = 'unavailable' (no calculable, con el motivo en `reason`). Prohibido
 * rellenar un hueco con un valor estimado: `status === 'unavailable'` implica
 * siempre `value === null`. */
export type MeasurementStatus = 'ok' | 'warning' | 'unavailable';

/** Paso de la traza de decisión de una medición o clasificación. Se muestra
 * plegado por defecto en la interfaz (SPEC.md §10.3). */
export interface TraceStep {
  step: string;
  detail: string;
  value?: number;
}

export interface MeasurementResult {
  value: number | null;
  unit: MeasurementUnit;
  /** ± propagado desde la confianza de los landmarks. */
  uncertainty?: number;
  status: MeasurementStatus;
  /** Motivo legible si status ≠ 'ok'. */
  reason?: string;
  trace: TraceStep[];
  /** Advertencias que no impiden el cálculo pero degradan la confianza
   * (semáforo ámbar). Vacío cuando status es 'ok' con confianza plena. */
  warnings?: string[];
}

/** Resultado de un control de calidad individual. SPEC.md §8.1. */
export interface QualityControlCheck {
  name: string;
  status: MeasurementStatus;
  detail?: string;
}

export interface QualityControlReport {
  checks: QualityControlCheck[];
}

export interface ClassificationResult {
  result: string;
  confidence?: number;
  trace: TraceStep[];
  /** Datos que faltan para completar la clasificación; si no está vacío, el
   * resultado se muestra igualmente con una nota discreta (SPEC.md §9). */
  unmetInputs?: string[];
}

export type MeasurementSource = 'auto' | 'manual' | 'auto-edited';

export interface MeasurementSet {
  source: MeasurementSource;
  /** Trazabilidad del modelo usado, sólo para `source === 'auto' | 'auto-edited'`. */
  modelVersion?: string;
  measurements: Record<string, MeasurementResult>;
  classifications: Record<string, ClassificationResult>;
  qc: QualityControlReport;
  createdAt: string;
}

export type RisserSystem = 'US' | 'FR';

export interface SkeletalMaturity {
  risser?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Obligatorio si `risser` está presente — ver `docs/OPEN_QUESTIONS.md` #32. */
  risserSystem?: RisserSystem;
  sanders?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  triradiateOpen?: boolean;
  boneAgeYears?: number;
}

export type ScoliosisEtiology = 'idiopathic' | 'congenital' | 'neuromuscular' | 'syndromic';

export interface ClinicalContext {
  etiology?: ScoliosisEtiology;
  gmfcs?: 1 | 2 | 3 | 4 | 5;
  scoliometerATR?: number;
  instrumented?: boolean;
}

export interface Study {
  /** Seudónimo local, nunca un identificador real (SPEC.md §11). */
  patientRef: string;
  date: string;
  ageYears: number;
  radiographs: Radiograph[];
  measurementSets: MeasurementSet[];
  /** Estudio índice para el seguimiento — sus vértebras terminales del Cobb
   * se reutilizan automáticamente (`docs/OPEN_QUESTIONS.md` #2). */
  indexStudyId?: string;
  maturity?: SkeletalMaturity;
  clinical?: ClinicalContext;
}
