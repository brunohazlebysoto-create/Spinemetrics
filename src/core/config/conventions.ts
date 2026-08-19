/**
 * Convenciones configurables. Codifica TODAS las decisiones de
 * `docs/OPEN_QUESTIONS.md` (§#1–#40) como un único objeto de configuración.
 *
 * SPEC.md §17.4: "No resuelvas por tu cuenta ninguna ambigüedad marcada
 * allí." Cada campo de `DEFAULT_CONVENTIONS` implementa el valor **por
 * defecto** documentado en `docs/OPEN_QUESTIONS.md`; las alternativas
 * razonables quedan anotadas en el tipo y en el comentario, nunca
 * implementadas en su lugar de forma silenciosa. Las funciones de
 * `core/measurements` y `core/classification` reciben `conventions` como
 * parámetro opcional (por defecto `DEFAULT_CONVENTIONS`) en vez de asumir
 * los valores como literales.
 *
 * Regla de trazabilidad (`docs/OPEN_QUESTIONS.md`, cabecera): los puntos
 * marcados con ★ deben imprimirse en el apéndice del informe exportado
 * (fase 6). `starredKeys` enumera esos campos para que el generador de
 * informes no tenga que releer el markdown.
 */

// ---------------------------------------------------------------------------
// A. Medición del ángulo de Cobb
// ---------------------------------------------------------------------------

/** #1 ★ Borde del platillo usado para trazar la línea de Cobb. */
export type CobbEndplateEdge = 'corticalInnerSurface' | 'corticalMidline';

/** #2 ★ Desempate cuando dos candidatas a vértebra terminal están a <2° de
 * inclinación. */
export type TerminalVertebraTieBreak = 'mostIncludingCurve' | 'maximizeCobb';

// ---------------------------------------------------------------------------
// B. Clasificación de Lenke (fase 4; ya expuesto aquí porque `core/config`
// es el único lugar donde vive esta configuración).
// ---------------------------------------------------------------------------

/** #7 ★★ Radiografía de flexibilidad exigida por el criterio de
 * estructuralidad de Lenke. */
export type FlexibilityFilmPolicy = 'supineBendOnly' | 'acceptFulcrumOrTraction';

/** #9 Referencia geométrica cuando el ápex lumbar cae en un disco. */
export type ApexAtDiscPolicy = 'useCaudalVertebra' | 'averageAdjacent';

// ---------------------------------------------------------------------------
// G. Calibración y geometría de imagen
// ---------------------------------------------------------------------------

/** #18 ★ Método de oblicuidad pélvica. */
export type PelvicObliquityMethod = 'osebold' | 'maloney' | 'allenFerguson' | 'obrien';

export interface Conventions {
  cobb: {
    /** #1 ★ */
    endplateEdge: CobbEndplateEdge;
    /** #2 ★ */
    terminalVertebraTieBreak: TerminalVertebraTieBreak;
    /** #2: diferencia de inclinación por debajo de la cual dos candidatas se
     * consideran empatadas y se aplica `terminalVertebraTieBreak`. */
    tieBreakThresholdDeg: number;
    /** #4: progresión = cambio estrictamente mayor que este umbral (°). */
    progressionThresholdDeg: number;
    /** #5: si es true, la clasificación se bloquea cuando la proyección no
     * es `PA_standing`. */
    requireStandingForClassification: boolean;
  };
  lenke: {
    /** #6 ★: umbrales de estructuralidad inclusivos (`>=`) si es true. */
    structuralThresholdsInclusive: boolean;
    /** #7 ★★ */
    flexibilityFilmPolicy: FlexibilityFilmPolicy;
    /** #8 ★: tolerancia calibrada (mm) para el modificador lumbar B vs C. */
    lumbarModifierToleranceMm: number;
    /** #9 */
    apexAtDiscPolicy: ApexAtDiscPolicy;
    /** #10: margen (°) exigido para TL/L > MT en el tipo 6 frente al tipo 3. */
    type6MinDifferenceDeg: number;
    /** #12 ★: N cubre [10,40] cerrado si es true. */
    sagittalModifierNInclusiveBounds: boolean;
  };
  sagittal: {
    /** #14 ★: referencia distal del SVA. */
    svaReference: 'posteriorSuperiorS1Corner' | 'midpointS1SuperiorEndplate';
    /** #15: niveles de la lordosis lumbar. */
    lordosisLevels: 'L1-S1' | 'L1-L5';
  };
  pelvic: {
    /** #17: si es true, no se muestra banda de normalidad de PI en <18 años. */
    noPediatricPiNormalBand: boolean;
    /** #18 ★ */
    obliquityMethod: PelvicObliquityMethod;
    /** #16: distancia (mm) entre centros femorales que degrada la confianza
     * sagital y advierte de rotación del paciente. */
    femoralHeadSeparationWarningMm: number;
    /** #35 ★: si falta DistanceSourceToDetector/DistanceSourceToPatient, no
     * corregir la magnificación (nunca asumir un factor fijo). */
    magnificationRequiresDicomGeometry: boolean;
  };
  rotation: {
    /** #29: redondeo del resultado de Perdriolle/Raimondi. */
    perdriolleRoundingDeg: number;
    /** #30: decisión firme, no debe cambiarse — se conserva aquí sólo para
     * que quede explícita y auditable, no porque sea configurable en la UI. */
    nashMoeConvertsToNumeric: false;
    /** #31: zoom mínimo exigido para colocar los puntos del RVAD de Mehta. */
    mehtaMinZoomPercent: number;
  };
  reference: {
    /** #27: desempate de la vértebra estable. */
    stableVertebraTieBreak: 'mostCaudal';
    /** #28: umbral de asimetría pedicular relativa para la vértebra neutra
     * (convención propia de la aplicación, no estándar publicado). */
    neutralVertebraPedicleAsymmetryThreshold: number;
  };
  maturity: {
    /** #32: decisión firme — el campo Risser no puede guardarse sin sistema. */
    risserSystemRequired: true;
    /** #33: escala de Sanders implementada. */
    sandersScale: 'original8Stage';
    /** #34: par de umbrales del escoliómetro a mostrar simultáneamente. */
    scoliometerReferralThresholdsDeg: [number, number];
  };
  concordance: {
    /** #38 ★★: mínimo de vértebras identificables para que el caso sea
     * válido en el estudio de concordancia (fase 6). */
    minIdentifiableVertebrae: number;
    /** #39 ★★: decisión firme — el cegamiento roto es irreversible. */
    unblindedIsIrreversible: true;
    tolerances: {
      /** #40: ángulos vertebrales y pélvicos (°). */
      anglesDeg: number;
      /** #40: SVA, balance coronal, translación apical (mm). */
      distancesMm: number;
    };
  };
}

export const DEFAULT_CONVENTIONS: Conventions = {
  cobb: {
    endplateEdge: 'corticalInnerSurface',
    terminalVertebraTieBreak: 'mostIncludingCurve',
    tieBreakThresholdDeg: 2,
    progressionThresholdDeg: 5,
    requireStandingForClassification: true,
  },
  lenke: {
    structuralThresholdsInclusive: true,
    flexibilityFilmPolicy: 'supineBendOnly',
    lumbarModifierToleranceMm: 1,
    apexAtDiscPolicy: 'useCaudalVertebra',
    type6MinDifferenceDeg: 5,
    sagittalModifierNInclusiveBounds: true,
  },
  sagittal: {
    svaReference: 'posteriorSuperiorS1Corner',
    lordosisLevels: 'L1-S1',
  },
  pelvic: {
    noPediatricPiNormalBand: true,
    obliquityMethod: 'osebold',
    femoralHeadSeparationWarningMm: 15,
    magnificationRequiresDicomGeometry: true,
  },
  rotation: {
    perdriolleRoundingDeg: 5,
    nashMoeConvertsToNumeric: false,
    mehtaMinZoomPercent: 400,
  },
  reference: {
    stableVertebraTieBreak: 'mostCaudal',
    neutralVertebraPedicleAsymmetryThreshold: 0.1,
  },
  maturity: {
    risserSystemRequired: true,
    sandersScale: 'original8Stage',
    scoliometerReferralThresholdsDeg: [5, 7],
  },
  concordance: {
    minIdentifiableVertebrae: 12,
    unblindedIsIrreversible: true,
    tolerances: {
      anglesDeg: 5,
      distancesMm: 10,
    },
  },
};

/**
 * Claves ★ / ★★ de `docs/OPEN_QUESTIONS.md` que deben imprimirse en el
 * apéndice de convenciones del informe exportado (SPEC.md §12, regla de
 * trazabilidad de `docs/OPEN_QUESTIONS.md`).
 */
export const STARRED_CONVENTIONS = [
  { path: 'cobb.endplateEdge', question: 1 },
  { path: 'cobb.terminalVertebraTieBreak', question: 2 },
  { path: 'lenke.structuralThresholdsInclusive', question: 6 },
  { path: 'lenke.flexibilityFilmPolicy', question: 7 },
  { path: 'lenke.lumbarModifierToleranceMm', question: 8 },
  { path: 'lenke.sagittalModifierNInclusiveBounds', question: 12 },
  { path: 'sagittal.svaReference', question: 14 },
  { path: 'pelvic.obliquityMethod', question: 18 },
  { path: 'pelvic.magnificationRequiresDicomGeometry', question: 35 },
  { path: 'concordance.minIdentifiableVertebrae', question: 38 },
  { path: 'concordance.unblindedIsIrreversible', question: 39 },
] as const;
