import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, deleteAllStudies, deleteStudy, listStudies, listStudiesForPatient, loadStudy, saveStudy, type StoredStudy } from './db';

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

beforeEach(async () => {
  await db.studies.clear();
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
