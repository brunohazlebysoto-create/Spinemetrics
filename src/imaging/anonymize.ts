/**
 * Anonimización DICOM en la importación. SPEC.md §11, §8 Etapa 0: "La
 * anonimización ocurre antes de cualquier procesamiento."
 *
 * Opera sobre un `DataSet` ya parseado por `dicom-parser` (no en los bytes
 * crudos): sólo depende de la interfaz mínima `DicomDatasetReader`, así que
 * se puede probar con un `DataSet` sintético sin construir un archivo DICOM
 * real byte a byte.
 */

export interface DicomDatasetReader {
  elements: Record<string, { tag: string }>;
  string: (tag: string) => string | undefined;
}

interface IdentifyingTagSpec {
  tag: string;
  name: string;
}

/** SPEC.md §11: tags eliminados por defecto. */
const IDENTIFYING_TAGS: IdentifyingTagSpec[] = [
  { tag: 'x00100010', name: 'PatientName' },
  { tag: 'x00100020', name: 'PatientID' },
  { tag: 'x00100030', name: 'PatientBirthDate' },
  { tag: 'x00080050', name: 'AccessionNumber' },
  { tag: 'x00080080', name: 'InstitutionName' },
  { tag: 'x00080090', name: 'ReferringPhysicianName' },
  { tag: 'x00200010', name: 'StudyID' },
];

const BURNED_IN_ANNOTATION_TAG = 'x00280301';

export interface IdentifyingTagFound {
  tag: string;
  name: string;
  value: string;
}

export interface AnonymizationOptions {
  /** SPEC.md §11: "Modo 'conservar identificadores' desactivado por
   * defecto y con aviso explícito." */
  preserveIdentifiers?: boolean;
}

export interface AnonymizationResult {
  /** Seudónimo local. Estable entre importaciones del mismo paciente
   * cuando `PatientID` está presente (hash unidireccional, nunca se guarda
   * el identificador original); aleatorio si no hay `PatientID`. */
  pseudonym: string;
  /** Tags identificables encontrados. Vacío si no había ninguno o si
   * `preserveIdentifiers` estaba activo. */
  removedTags: IdentifyingTagFound[];
  /** Cuántos tags privados (grupo impar) se detectaron y, si
   * `preserveIdentifiers` es false, se consideran eliminados. */
  privateTagCount: number;
  preservedIdentifiers: boolean;
  /** SPEC.md §11: "si BurnedInAnnotation = YES, advertir de que puede
   * haber datos identificables quemados en el píxel." Sólo se lee aquí;
   * la advertencia se muestra en el flujo de exportación (fase 6). */
  burnedInAnnotation: boolean;
}

function isPrivateTag(tag: string): boolean {
  // Formato dicom-parser: 'xGGGGEEEE'. Grupo impar = tag privado (DICOM PS3.5).
  const group = parseInt(tag.slice(1, 5), 16);
  return !Number.isNaN(group) && group % 2 === 1;
}

function countPrivateTags(dataSet: DicomDatasetReader): number {
  return Object.keys(dataSet.elements).filter(isPrivateTag).length;
}

function findIdentifyingTags(dataSet: DicomDatasetReader): IdentifyingTagFound[] {
  const found: IdentifyingTagFound[] = [];
  for (const spec of IDENTIFYING_TAGS) {
    const value = dataSet.string(spec.tag);
    if (value !== undefined && value !== '') {
      found.push({ tag: spec.tag, name: spec.name, value });
    }
  }
  return found;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomLocalId(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Deriva un seudónimo local. Si hay `PatientID`, usa un hash SHA-256
 * (nunca reversible) de `PatientID` + `PatientBirthDate` para que el mismo
 * paciente real obtenga siempre el mismo seudónimo en importaciones
 * sucesivas (necesario para el seguimiento seriado, SPEC.md §10.4) sin
 * conservar el identificador original en ningún momento. Sin `PatientID`,
 * genera un seudónimo aleatorio (no correlacionable entre estudios).
 */
async function derivePseudonym(dataSet: DicomDatasetReader): Promise<string> {
  const patientId = dataSet.string('x00100020');
  const birthDate = dataSet.string('x00100030');
  const seed = [patientId, birthDate].filter((v) => v !== undefined && v !== '').join('|');
  if (!seed) return `SM-${randomLocalId()}`;
  const hash = await sha256Hex(seed);
  return `SM-${hash.slice(0, 12)}`;
}

/**
 * SPEC.md §11. Por defecto (`preserveIdentifiers: false` o ausente),
 * `removedTags` lista lo encontrado (para trazabilidad interna del
 * proceso; el dato en sí NUNCA se guarda en el `Study` — ver
 * `src/imaging/loadDicom.ts`) y los tags privados se cuentan como
 * eliminados. Con `preserveIdentifiers: true`, no se elimina nada y se
 * marca `preservedIdentifiers: true` para que la interfaz (fase 2+)
 * muestre el aviso explícito exigido por la spec.
 */
export async function anonymizeDicomDataset(
  dataSet: DicomDatasetReader,
  options: AnonymizationOptions = {},
): Promise<AnonymizationResult> {
  const preserveIdentifiers = options.preserveIdentifiers ?? false;
  const pseudonym = await derivePseudonym(dataSet);
  const burnedInAnnotation = dataSet.string(BURNED_IN_ANNOTATION_TAG) === 'YES';
  const privateTagCount = countPrivateTags(dataSet);

  if (preserveIdentifiers) {
    return { pseudonym, removedTags: [], privateTagCount, preservedIdentifiers: true, burnedInAnnotation };
  }

  return {
    pseudonym,
    removedTags: findIdentifyingTags(dataSet),
    privateTagCount,
    preservedIdentifiers: false,
    burnedInAnnotation,
  };
}
