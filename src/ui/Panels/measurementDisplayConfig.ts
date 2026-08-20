/**
 * Qué claves de `MeasurementSet.measurements` mostrar, en qué grupo y con
 * qué etiqueta. SPEC.md §10.1: "panel de mediciones agrupado (Coronal /
 * Sagital / Pélvico / Rotación / Crecimiento)". Rotación no tiene todavía
 * una herramienta de anotación en el visor de la Fase 2 (Perdriolle exige
 * bordes del cuerpo apical + pedículo convexo) — se omite en vez de
 * mostrar una sección vacía o engañosa. Crecimiento sólo cubre T1–T12 y
 * T1–S1 (derivables de landmarks ya existentes); SAL queda fuera —
 * requiere un tipo de anotación nuevo, ver `core/measurements/thoracicGrowth.ts`.
 */

export type MeasurementGroup = 'Coronal' | 'Sagital' | 'Pélvico' | 'Crecimiento';

export interface MeasurementDisplayConfig {
  key: string;
  label: string;
  group: MeasurementGroup;
}

export const MEASUREMENT_DISPLAY_CONFIG: MeasurementDisplayConfig[] = [
  { key: 'cobb', label: 'Ángulo de Cobb', group: 'Coronal' },
  { key: 'coronalBalance', label: 'Balance coronal', group: 'Coronal' },
  { key: 'apicalTranslation', label: 'Translación apical', group: 'Coronal' },
  { key: 'thoracicKyphosis', label: 'Cifosis torácica (T5–T12)', group: 'Sagital' },
  { key: 'lumbarLordosis', label: 'Lordosis lumbar', group: 'Sagital' },
  { key: 'sva', label: 'SVA', group: 'Sagital' },
  { key: 't1Slope', label: 'Pendiente de T1', group: 'Sagital' },
  { key: 'tpa', label: 'TPA', group: 'Sagital' },
  { key: 'sacralSlope', label: 'Pendiente sacra (SS)', group: 'Pélvico' },
  { key: 'pelvicTilt', label: 'Versión pélvica (PT)', group: 'Pélvico' },
  { key: 'pelvicIncidence', label: 'Incidencia pélvica (PI)', group: 'Pélvico' },
  { key: 'piLlMismatch', label: 'PI-LL mismatch', group: 'Pélvico' },
  { key: 'pelvicObliquity', label: 'Oblicuidad pélvica (Osebold)', group: 'Pélvico' },
  { key: 't1t12Height', label: 'Altura T1–T12', group: 'Crecimiento' },
  { key: 't1s1Height', label: 'Altura T1–S1', group: 'Crecimiento' },
];

export const MEASUREMENT_GROUPS: MeasurementGroup[] = ['Coronal', 'Sagital', 'Pélvico', 'Crecimiento'];
