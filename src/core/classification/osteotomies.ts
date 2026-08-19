/**
 * Osteotomías (Schwab-Lenke). SPEC.md §9.10 — "referencia de consulta".
 * No es un clasificador: no recibe mediciones del paciente ni deriva nada.
 * Es una tabla estática que la UI puede mostrar como consulta rápida.
 */
export type OsteotomyGrade = 1 | 2 | 3 | 4 | 5 | 6;
export type OsteotomyApproachModifier = 'P' | 'A/P';

export interface OsteotomyReferenceEntry {
  grade: OsteotomyGrade;
  name: string;
}

/** SPEC.md §9.10: "Grados 1–6: 1 resección facetaria parcial
 * (Smith-Petersen) → 2 Ponte → 3 PSO → 4 PSO extendida → 5 VCR de un nivel
 * → 6 resección multinivel." */
export const OSTEOTOMY_REFERENCE_TABLE: readonly OsteotomyReferenceEntry[] = [
  { grade: 1, name: 'Resección facetaria parcial (Smith-Petersen)' },
  { grade: 2, name: 'Ponte' },
  { grade: 3, name: 'PSO (osteotomía de sustracción pedicular)' },
  { grade: 4, name: 'PSO extendida' },
  { grade: 5, name: 'VCR de un nivel (resección vertebral en columna)' },
  { grade: 6, name: 'Resección multinivel' },
];

export const APPROACH_MODIFIER_NAMES: Record<OsteotomyApproachModifier, string> = {
  P: 'Posterior',
  'A/P': 'Anterior/posterior',
};

/** SPEC.md §9.10: "Aviso en código y UI: este modificador es de abordaje;
 * no confundirlo con los modificadores de la clasificación SRS-Schwab del
 * adulto (§9.4)." La UI debe mostrar este texto junto al modificador de
 * abordaje siempre que se presente esta tabla. */
export const APPROACH_MODIFIER_DISAMBIGUATION_NOTE =
  'Este modificador (P / A-P) describe el ABORDAJE quirúrgico de la osteotomía. No es un modificador de la ' +
  'clasificación SRS-Schwab del adulto (SPEC.md §9.4) — son sistemas distintos, no confundir.';

export function lookupOsteotomy(grade: OsteotomyGrade): OsteotomyReferenceEntry {
  // OSTEOTOMY_REFERENCE_TABLE está ordenada e indexada 1..6 por diseño: el
  // índice `grade - 1` siempre existe para un `OsteotomyGrade` válido.
  return OSTEOTOMY_REFERENCE_TABLE[grade - 1]!;
}
