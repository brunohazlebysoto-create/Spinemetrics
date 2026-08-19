import { describe, expect, it } from 'vitest';
import { anonymizeDicomDataset, type DicomDatasetReader } from './anonymize';

function makeDataSet(tags: Record<string, string>): DicomDatasetReader {
  const elements: Record<string, { tag: string }> = {};
  for (const tag of Object.keys(tags)) elements[tag] = { tag };
  return {
    elements,
    string: (tag: string) => tags[tag],
  };
}

describe('anonymizeDicomDataset — SPEC.md §11', () => {
  it('elimina por defecto los tags identificables de la lista', async () => {
    const dataSet = makeDataSet({
      x00100010: 'DOE^JANE',
      x00100020: 'MRN12345',
      x00100030: '19800101',
      x00080050: 'ACC001',
      x00080080: 'Hospital Central',
      x00080090: 'DR SMITH',
      x00200010: 'STUDY01',
    });

    const result = await anonymizeDicomDataset(dataSet);

    expect(result.preservedIdentifiers).toBe(false);
    const names = result.removedTags.map((t) => t.name).sort();
    expect(names).toEqual(
      ['AccessionNumber', 'InstitutionName', 'PatientBirthDate', 'PatientID', 'PatientName', 'ReferringPhysicianName', 'StudyID'].sort(),
    );
  });

  it('no incluye en removedTags los tags que no estaban presentes', async () => {
    const dataSet = makeDataSet({ x00100010: 'DOE^JANE' });
    const result = await anonymizeDicomDataset(dataSet);
    expect(result.removedTags).toHaveLength(1);
    expect(result.removedTags[0]!.name).toBe('PatientName');
  });

  it('cuenta los tags privados (grupo impar) por separado', async () => {
    const dataSet = makeDataSet({
      x00100010: 'DOE^JANE',
      x00090010: 'valor privado 1', // grupo 0009 (impar)
      x00151001: 'valor privado 2', // grupo 0015 (impar)
      x00280010: '512', // grupo 0028 (par) — no es privado
    });
    const result = await anonymizeDicomDataset(dataSet);
    expect(result.privateTagCount).toBe(2);
  });

  it('modo "conservar identificadores": no elimina nada y lo marca explícitamente', async () => {
    const dataSet = makeDataSet({ x00100010: 'DOE^JANE', x00100020: 'MRN12345' });
    const result = await anonymizeDicomDataset(dataSet, { preserveIdentifiers: true });
    expect(result.preservedIdentifiers).toBe(true);
    expect(result.removedTags).toHaveLength(0);
  });

  it('detecta BurnedInAnnotation = YES', async () => {
    const withBurnedIn = makeDataSet({ x00280301: 'YES' });
    expect((await anonymizeDicomDataset(withBurnedIn)).burnedInAnnotation).toBe(true);

    const without = makeDataSet({ x00280301: 'NO' });
    expect((await anonymizeDicomDataset(without)).burnedInAnnotation).toBe(false);

    const absent = makeDataSet({});
    expect((await anonymizeDicomDataset(absent)).burnedInAnnotation).toBe(false);
  });

  it('el mismo PatientID (+ fecha de nacimiento) siempre deriva el mismo seudónimo', async () => {
    const a = makeDataSet({ x00100020: 'MRN12345', x00100030: '19800101' });
    const b = makeDataSet({ x00100020: 'MRN12345', x00100030: '19800101', x00100010: 'NOMBRE DISTINTO EN ESTA IMPORTACIÓN' });
    const resultA = await anonymizeDicomDataset(a);
    const resultB = await anonymizeDicomDataset(b);
    expect(resultA.pseudonym).toBe(resultB.pseudonym);
  });

  it('PatientID distinto deriva seudónimos distintos', async () => {
    const a = makeDataSet({ x00100020: 'MRN12345', x00100030: '19800101' });
    const b = makeDataSet({ x00100020: 'MRN99999', x00100030: '19800101' });
    const resultA = await anonymizeDicomDataset(a);
    const resultB = await anonymizeDicomDataset(b);
    expect(resultA.pseudonym).not.toBe(resultB.pseudonym);
  });

  it('sin PatientID, genera un seudónimo aleatorio (no correlacionable) cada vez', async () => {
    const empty = makeDataSet({});
    const resultA = await anonymizeDicomDataset(empty);
    const resultB = await anonymizeDicomDataset(empty);
    expect(resultA.pseudonym).not.toBe(resultB.pseudonym);
  });

  it('el seudónimo nunca contiene el PatientID original en texto plano', async () => {
    const dataSet = makeDataSet({ x00100020: 'MUY-IDENTIFICABLE-12345' });
    const result = await anonymizeDicomDataset(dataSet);
    expect(result.pseudonym).not.toContain('MUY-IDENTIFICABLE-12345');
  });
});
