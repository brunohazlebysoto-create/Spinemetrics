/**
 * Constantes clínicas centralizadas. SPEC.md §15.
 *
 * Cada constante lleva su fuente bibliográfica (número de `docs/REFERENCES.md`,
 * idéntica numeración a SPEC.md §16). Ninguna función de `core/measurements`
 * ni `core/classification` debe repetir estos valores como literal: siempre
 * se importan desde aquí.
 */

export const CLINICAL = {
  /** Escoliosis = Cobb ≥10°. Ref. 1 (Cobb 1948), 11 (Lenke 2001). */
  SCOLIOSIS_THRESHOLD_DEG: 10,

  /** Error de medición del Cobb clínicamente aceptado; progresión = cambio
   * estrictamente >5° (`docs/OPEN_QUESTIONS.md` #4). Ref. 14 (Gstoettner 2007). */
  COBB_MEASUREMENT_ERROR_DEG: 5,

  /** Curva menor estructural si el bending no corrige por debajo de este
   * umbral (inclusivo, `docs/OPEN_QUESTIONS.md` #6). Ref. 11 (Lenke 2001). */
  STRUCTURAL_BENDING_DEG: 25,

  /** Cifosis T2–T5 ≥ este umbral → PT estructural (inclusivo, #6). Ref. 11. */
  STRUCTURAL_KYPHOSIS_PT_DEG: 20,

  /** Cifosis T10–L2 ≥ este umbral → MT o TL/L estructural (inclusivo, #6). Ref. 11. */
  STRUCTURAL_KYPHOSIS_MT_TL_DEG: 20,

  /** Modificador sagital T5–T12 de Lenke: `-` <10°, `N` [10,40], `+` >40°
   * (`docs/OPEN_QUESTIONS.md` #12). Ref. 11. */
  LENKE_SAGITTAL: { hypo: 10, hyper: 40 },

  /** Cifosis torácica normal T5–T12. Ref. 25 (SRS Radiographic Measurement Manual). */
  NORMAL_THORACIC_KYPHOSIS: [10, 40] as [number, number],

  /** SVA normal, mm. Ref. 18 (Schwab 2012). */
  NORMAL_SVA_MM: 40,

  /** Incidencia pélvica en el adulto: media, desviación estándar y rango.
   * Ref. 10 (Legaye 1998). No aplicable <18 años (`docs/OPEN_QUESTIONS.md` #17). */
  PI_MEAN_ADULT: 53,
  PI_SD_ADULT: 10,
  PI_RANGE_ADULT: [33, 85] as [number, number],

  /** Objetivo terapéutico de PI-LL mismatch. Ref. 10, 18. */
  PI_LL_TARGET_DEG: 10,

  /** Bordes de los modificadores SRS-Schwab; el borde inferior pertenece a
   * la categoría superior (`docs/OPEN_QUESTIONS.md` #20). Ref. 18. */
  SCHWAB: {
    piLl: [10, 20] as [number, number],
    svaCm: [4, 9.5] as [number, number],
    ptDeg: [20, 30] as [number, number],
  },

  /** C-EOS: cortes de curva mayor (°) y de cifosis máxima (°). El hueco
   * publicado entre 50° y 51° se elimina con corte único en 50°
   * (`docs/OPEN_QUESTIONS.md` #22). Ref. 20 (Williams 2014). */
  CEOS: { curve: [20, 50, 90] as [number, number, number], kyphosis: [20, 50] as [number, number], progression: [10, 20] as [number, number] },

  /** RVAD de Mehta: umbral que predice progresión en escoliosis de inicio
   * precoz. Ref. 3 (Mehta 1972). */
  MEHTA_RVAD_PROGRESSIVE_DEG: 20,

  /** Umbral de derivación con escoliómetro: 7° = criterio original, menos
   * falsos positivos; 5° = mayor sensibilidad (`docs/OPEN_QUESTIONS.md` #34).
   * Ref. 8 (Bunnell 1984). */
  SCOLIOMETER_REFERRAL_ATR_DEG: 7,
} as const;
