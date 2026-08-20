/**
 * Agregador puro de datos para el informe exportado. SPEC.md §12:
 * "1. Identificación seudonimizada, edad, fecha, proyecciones analizadas.
 * 2. Mediciones en tabla: parámetro/valor/referencia normal/observación.
 * 3. Clasificaciones con nomenclatura completa y traza resumida.
 * 4. Imagen anotada. 5. Comparación seriada si existe estudio previo, con
 * la banda de ±5°. 6. Madurez esquelética [...]. 7. Apéndice de
 * convenciones usadas [...]. 8. Descargo de responsabilidad y marca de
 * tiempo." La imagen anotada (punto 4) NO se genera aquí — es una captura
 * del `Stage` de Konva que sólo existe en el DOM, ver
 * `ui/Panels/ReportPanel.tsx` — este módulo produce todo lo demás, puro y
 * sin DOM, para poder probarse igual que `followUp.ts`.
 *
 * "Referencia normal" sólo se rellena cuando hay una constante clínica
 * citada en `core/constants.ts` (SPEC.md §15) que la respalde — nunca un
 * rango inventado para las mediciones que no tienen una referencia
 * publicada ya vetted en el código (SPEC.md §8.1, "nunca fabricar").
 */
import { CLINICAL } from '../core/constants';
import type { MeasurementSet, MeasurementStatus, Radiograph, SkeletalMaturity } from '../core/models/types';
import { formatMeasurementValue } from './Panels/formatMeasurement';
import { MEASUREMENT_DISPLAY_CONFIG } from './Panels/measurementDisplayConfig';
import { CLASSIFICATION_LABELS, CLASSIFICATION_ORDER } from './Panels/classificationDisplayConfig';
import { RADIOGRAPH_VIEW_LABELS } from './radiographViewLabels';
import { REPORT_CONVENTIONS_APPENDIX, type AppendixEntry } from './reportAppendix';
import type { FollowUpDeltaRow } from './followUp';

export interface ReportMeasurementRow {
  key: string;
  label: string;
  value: string;
  status: MeasurementStatus;
  /** `null` cuando no hay una referencia normal vetted para esta medición
   * (no cuando falta calcularla — eso es `value: '—'`). */
  reference: string | null;
  observation: string | null;
}

export interface ReportClassificationRow {
  key: string;
  label: string;
  result: string;
  traceSummary: string;
  unmetInputs: string[];
}

export interface ReportFollowUpRow {
  key: string;
  label: string;
  previous: string;
  current: string;
  delta: string;
  isProgression: boolean | null;
}

export interface ReportMaturity {
  risser: string | null;
  sanders: string | null;
  triradiateOpen: string | null;
}

export interface ReportData {
  patientRef: string;
  ageYears: number;
  date: string;
  views: string[];
  measurements: ReportMeasurementRow[];
  classifications: ReportClassificationRow[];
  followUp: { indexDate: string; rows: ReportFollowUpRow[] } | null;
  maturity: ReportMaturity;
  appendix: AppendixEntry[];
  generatedAt: string;
  disclaimer: string;
}

/** Sólo las claves con una constante clínica vetted en `core/constants.ts`
 * (SPEC.md §15) — el resto de `MEASUREMENT_DISPLAY_CONFIG` queda sin
 * referencia impresa en vez de inventarla. */
const MEASUREMENT_REFERENCE: Partial<Record<string, string>> = {
  cobb: `≥${CLINICAL.SCOLIOSIS_THRESHOLD_DEG}° define escoliosis`,
  thoracicKyphosis: `${CLINICAL.NORMAL_THORACIC_KYPHOSIS[0]}–${CLINICAL.NORMAL_THORACIC_KYPHOSIS[1]}° (normal)`,
  sva: `<${CLINICAL.NORMAL_SVA_MM} mm (normal)`,
  piLlMismatch: `<${CLINICAL.PI_LL_TARGET_DEG}° (objetivo terapéutico)`,
  pelvicIncidence: `${CLINICAL.PI_MEAN_ADULT}±${CLINICAL.PI_SD_ADULT}° (adulto; no aplicable <18 años, docs/OPEN_QUESTIONS.md #17)`,
};

const DISCLAIMER =
  'Herramienta de apoyo a la medición y clasificación, no un diagnóstico. Todo resultado en gris (no calculable) o ámbar ' +
  '(con advertencia) requiere revisión manual antes de cualquier uso clínico. Generado localmente: SPEC.md §11, sin envío ' +
  'de datos a servidores externos.';

function buildMeasurementRows(measurementSet: MeasurementSet): ReportMeasurementRow[] {
  const rows: ReportMeasurementRow[] = [];
  for (const config of MEASUREMENT_DISPLAY_CONFIG) {
    const result = measurementSet.measurements[config.key];
    if (!result) continue;
    rows.push({
      key: config.key,
      label: config.label,
      value: formatMeasurementValue(result),
      status: result.status,
      reference: MEASUREMENT_REFERENCE[config.key] ?? null,
      observation: result.reason ?? (result.warnings && result.warnings.length > 0 ? result.warnings.join(' ') : null),
    });
  }
  return rows;
}

function buildClassificationRows(measurementSet: MeasurementSet): ReportClassificationRow[] {
  const rows: ReportClassificationRow[] = [];
  for (const key of CLASSIFICATION_ORDER) {
    const classification = measurementSet.classifications[key];
    if (!classification) continue;
    rows.push({
      key,
      label: CLASSIFICATION_LABELS[key] ?? key,
      result: classification.result,
      traceSummary: classification.trace.map((step) => `${step.step}: ${step.detail}`).join(' · '),
      unmetInputs: classification.unmetInputs ?? [],
    });
  }
  return rows;
}

function buildFollowUpRows(rows: FollowUpDeltaRow[]): ReportFollowUpRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    previous: `${Math.round(row.previousValue * 10) / 10}`,
    current: `${Math.round(row.currentValue * 10) / 10}`,
    delta: `${row.deltaValue > 0 ? '+' : ''}${Math.round(row.deltaValue * 10) / 10}`,
    isProgression: row.isProgression,
  }));
}

function formatMaturity(maturity: SkeletalMaturity): ReportMaturity {
  const risserSystemLabel = maturity.risserSystem === 'US' ? 'americano' : maturity.risserSystem === 'FR' ? 'francés' : null;
  return {
    risser: maturity.risser !== undefined && risserSystemLabel ? `${maturity.risser} (sistema ${risserSystemLabel})` : null,
    sanders: maturity.sanders !== undefined ? `Estadio ${maturity.sanders} (SSMS)` : null,
    triradiateOpen: maturity.triradiateOpen === undefined ? null : maturity.triradiateOpen ? 'Abierto' : 'Cerrado',
  };
}

export interface BuildReportDataInput {
  patientRef: string;
  ageYears: number;
  date: string;
  radiographs: Radiograph[];
  measurementSet: MeasurementSet;
  maturity: SkeletalMaturity;
  followUp?: { indexDate: string; rows: FollowUpDeltaRow[] } | null;
  /** Inyectable para pruebas deterministas; por defecto la hora real. */
  now?: () => Date;
}

export function buildReportData(input: BuildReportDataInput): ReportData {
  const now = input.now ?? (() => new Date());
  return {
    patientRef: input.patientRef,
    ageYears: input.ageYears,
    date: input.date,
    views: input.radiographs.map((r) => RADIOGRAPH_VIEW_LABELS[r.view]),
    measurements: buildMeasurementRows(input.measurementSet),
    classifications: buildClassificationRows(input.measurementSet),
    followUp: input.followUp ? { indexDate: input.followUp.indexDate, rows: buildFollowUpRows(input.followUp.rows) } : null,
    maturity: formatMaturity(input.maturity),
    appendix: REPORT_CONVENTIONS_APPENDIX,
    generatedAt: now().toISOString(),
    disclaimer: DISCLAIMER,
  };
}
