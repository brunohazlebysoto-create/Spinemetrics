import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  deleteAllSelfMeasurementCases,
  deleteAllStudies,
  deleteStudy,
  listSelfMeasurementCases,
  listStudies,
  listStudiesForPatient,
  loadStudy,
  saveSelfMeasurementCase,
  saveStudy,
  type SelfMeasurementCase,
  type StoredStudy,
} from './db';
import type { MeasurementSet } from '../core/models/types';

function makeStoredStudy(overrides: Partial<StoredStudy> = {}): StoredStudy {
  return {
    localId: 'local-1',
    patientRef: 'SM-abc123',
    date: '2026-01-15',
    ageYears: 14,
    radiographs: [],
    measurementSets: [],
    ...overrides,
  };
}

function makeMeasurementSet(cobbDeg: number): MeasurementSet {
  return {
    source: 'manual',
    measurements: { cobb: { value: cobbDeg, unit: 'deg', status: 'ok', trace: [] } },
    classifications: {},
    qc: { checks: [] },
    createdAt: '2026-01-15T00:00:00.000Z',
  };
}

function makeSelfMeasurementCase(overrides: Partial<SelfMeasurementCase> = {}): SelfMeasurementCase {
  return {
    localId: 'case-1',
    date: '2026-01-15',
    own: makeMeasurementSet(30),
    automatic: makeMeasurementSet(28),
    unblinded: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.studies.clear();
  await db.selfMeasurementCases.clear();
});

describe('storage/db — SPEC.md §3 (IndexedDB vía Dexie)', () => {
  it('guarda y recupera un estudio por su localId', async () => {
    const study = makeStoredStudy();
    await saveStudy(study);
    const loaded = await loadStudy('local-1');
    expect(loaded).toEqual(study);
  });

  it('devuelve undefined para un localId inexistente', async () => {
    expect(await loadStudy('no-existe')).toBeUndefined();
  });

  it('lista todos los estudios guardados', async () => {
    await saveStudy(makeStoredStudy({ localId: 'a' }));
    await saveStudy(makeStoredStudy({ localId: 'b' }));
    const all = await listStudies();
    expect(all.map((s) => s.localId).sort()).toEqual(['a', 'b']);
  });

  it('listStudiesForPatient filtra por seudónimo y ordena por fecha descendente', async () => {
    await saveStudy(makeStoredStudy({ localId: 'a', patientRef: 'SM-x', date: '2025-01-01' }));
    await saveStudy(makeStoredStudy({ localId: 'b', patientRef: 'SM-x', date: '2026-01-01' }));
    await saveStudy(makeStoredStudy({ localId: 'c', patientRef: 'SM-y', date: '2026-06-01' }));

    const forX = await listStudiesForPatient('SM-x');
    expect(forX.map((s) => s.localId)).toEqual(['b', 'a']); // más reciente primero
  });

  it('elimina un estudio concreto', async () => {
    await saveStudy(makeStoredStudy({ localId: 'a' }));
    await deleteStudy('a');
    expect(await loadStudy('a')).toBeUndefined();
  });

  it('deleteAllStudies borra todo (SPEC.md §11, "opción de borrado completo")', async () => {
    await saveStudy(makeStoredStudy({ localId: 'a' }));
    await saveStudy(makeStoredStudy({ localId: 'b' }));
    await deleteAllStudies();
    expect(await listStudies()).toHaveLength(0);
  });

  it('put sobre el mismo localId actualiza en vez de duplicar', async () => {
    await saveStudy(makeStoredStudy({ localId: 'a', ageYears: 14 }));
    await saveStudy(makeStoredStudy({ localId: 'a', ageYears: 15 }));
    const all = await listStudies();
    expect(all).toHaveLength(1);
    expect(all[0]!.ageYears).toBe(15);
  });
});

describe('storage/db — casos de "Medir yo también" (SPEC.md §10.5)', () => {
  it('guarda y lista los casos de autocomparación', async () => {
    await saveSelfMeasurementCase(makeSelfMeasurementCase({ localId: 'a' }));
    await saveSelfMeasurementCase(makeSelfMeasurementCase({ localId: 'b' }));
    const all = await listSelfMeasurementCases();
    expect(all.map((c) => c.localId).sort()).toEqual(['a', 'b']);
  });

  it('guarda el MeasurementSet propio y automático completos, no sólo un número reducido', async () => {
    const stored = makeSelfMeasurementCase();
    await saveSelfMeasurementCase(stored);
    const [loaded] = await listSelfMeasurementCases();
    expect(loaded!.own.measurements.cobb!.value).toBe(30);
    expect(loaded!.automatic.measurements.cobb!.value).toBe(28);
  });

  it('deleteAllSelfMeasurementCases borra todo (SPEC.md §11, "opción de borrado completo")', async () => {
    await saveSelfMeasurementCase(makeSelfMeasurementCase({ localId: 'a' }));
    await saveSelfMeasurementCase(makeSelfMeasurementCase({ localId: 'b' }));
    await deleteAllSelfMeasurementCases();
    expect(await listSelfMeasurementCases()).toHaveLength(0);
  });
});
