/**
 * Persistencia local. SPEC.md §3 ("Persistencia local: IndexedDB
 * (Dexie.js)"), §11 ("Procesamiento exclusivamente local [...] opción de
 * borrado completo").
 */
import Dexie, { type Table } from 'dexie';
import type { MeasurementSet, Study } from '../core/models/types';

/** `Study` con una clave primaria local. `localId` es puramente interno de
 * IndexedDB — nunca se deriva de ningún identificador clínico ni se
 * exporta como tal (el seudónimo ya vive en `patientRef`, ver
 * `src/imaging/anonymize.ts`). */
export interface StoredStudy extends Study {
  localId: string;
}

/**
 * Un caso de "Medir yo también" (SPEC.md §10.5) ya terminado: los dos
 * `MeasurementSet` completos (propio y automático) sobre las MISMAS
 * anotaciones que el usuario acaba de trazar — nunca sólo un par de
 * números ya reducidos, para no fijar de antemano qué mediciones o
 * clasificaciones podrá analizar `ui/researchStats.ts` más adelante. Sólo
 * existe una entrada por caso donde el clínico haya usado esta función
 * ("si nunca se usa, la aplicación funciona igual").
 */
export interface SelfMeasurementCase {
  localId: string;
  date: string;
  own: MeasurementSet;
  automatic: MeasurementSet;
  /** `docs/OPEN_QUESTIONS.md` #39, "decisión firme": true si el automático
   * se consultó antes de terminar la medición propia — rompe la
   * independencia de la comparación. `ui/researchStats.ts`/`ResearchPanel`
   * excluyen por defecto estos casos de la estadística agregada. */
  unblinded: boolean;
  /** `docs/OPEN_QUESTIONS.md` #38: columna previamente instrumentada, copiado
   * de `Study.clinical.instrumented` en el momento de terminar la medición
   * propia — otro criterio de exclusión de "caso válido" para la
   * estadística de concordancia. */
  instrumented: boolean;
  /** `docs/OPEN_QUESTIONS.md` #38: número de vértebras anotadas en el
   * trazado propio (`selfMeasurement.radiograph.annotations.vertebrae.length`)
   * — el mínimo de `DEFAULT_CONVENTIONS.concordance.minIdentifiableVertebrae`
   * (12) es el tercer criterio de exclusión. */
  identifiableVertebraeCount: number;
}

class SpineMetricsDatabase extends Dexie {
  studies!: Table<StoredStudy, string>;
  selfMeasurementCases!: Table<SelfMeasurementCase, string>;

  constructor() {
    super('spinemetrics');
    this.version(1).stores({
      // Índices secundarios sobre patientRef/date para listar estudios de
      // un mismo seudónimo (seguimiento seriado, SPEC.md §10.4) sin tener
      // que leer toda la tabla.
      studies: 'localId, patientRef, date',
    });
    this.version(2).stores({
      studies: 'localId, patientRef, date',
      // SPEC.md §10.5: casos acumulados para el panel de "Investigación".
      selfMeasurementCases: 'localId, date',
    });
  }
}

export const db = new SpineMetricsDatabase();

export async function saveStudy(study: StoredStudy): Promise<void> {
  await db.studies.put(study);
}

export async function loadStudy(localId: string): Promise<StoredStudy | undefined> {
  return db.studies.get(localId);
}

export async function listStudies(): Promise<StoredStudy[]> {
  return db.studies.toArray();
}

/** Estudios previos del mismo seudónimo, más recientes primero — para
 * elegir el estudio índice del seguimiento seriado (SPEC.md §7.2, §10.4). */
export async function listStudiesForPatient(patientRef: string): Promise<StoredStudy[]> {
  const studies = await db.studies.where('patientRef').equals(patientRef).toArray();
  return studies.sort((a, b) => b.date.localeCompare(a.date));
}

export async function deleteStudy(localId: string): Promise<void> {
  await db.studies.delete(localId);
}

/** SPEC.md §11: "opción de borrado completo." */
export async function deleteAllStudies(): Promise<void> {
  await db.studies.clear();
}

export async function saveSelfMeasurementCase(selfMeasurementCase: SelfMeasurementCase): Promise<void> {
  await db.selfMeasurementCases.put(selfMeasurementCase);
}

/** Todos los casos acumulados, para el panel de "Investigación" (SPEC.md
 * §10.5) — sin filtrar, ya que el panel decide qué agregar. */
export async function listSelfMeasurementCases(): Promise<SelfMeasurementCase[]> {
  return db.selfMeasurementCases.toArray();
}

/** SPEC.md §11: "opción de borrado completo" — cualquier futuro control de
 * borrado total debe llamar también a esto, no sólo a `deleteAllStudies`. */
export async function deleteAllSelfMeasurementCases(): Promise<void> {
  await db.selfMeasurementCases.clear();
}
