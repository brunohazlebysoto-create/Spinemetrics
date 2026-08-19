/**
 * Persistencia local. SPEC.md §3 ("Persistencia local: IndexedDB
 * (Dexie.js)"), §11 ("Procesamiento exclusivamente local [...] opción de
 * borrado completo").
 */
import Dexie, { type Table } from 'dexie';
import type { Study } from '../core/models/types';

/** `Study` con una clave primaria local. `localId` es puramente interno de
 * IndexedDB — nunca se deriva de ningún identificador clínico ni se
 * exporta como tal (el seudónimo ya vive en `patientRef`, ver
 * `src/imaging/anonymize.ts`). */
export interface StoredStudy extends Study {
  localId: string;
}

class SpineMetricsDatabase extends Dexie {
  studies!: Table<StoredStudy, string>;

  constructor() {
    super('spinemetrics');
    this.version(1).stores({
      // Índices secundarios sobre patientRef/date para listar estudios de
      // un mismo seudónimo (seguimiento seriado, SPEC.md §10.4) sin tener
      // que leer toda la tabla.
      studies: 'localId, patientRef, date',
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
