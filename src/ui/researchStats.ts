/**
 * Estadística agregada del panel de "Investigación" (SPEC.md §10.5):
 * "Bland-Altman, ICC, kappa por clasificación [...] sólo de los casos
 * donde se haya usado esta función." Puro — sin DOM/Zustand — se calcula
 * sobre los pares (propio, automático) que `store.ts` recopila de
 * `storage/db.ts::listSelfMeasurementCases`.
 *
 * Ninguna de estas tres funciones fabrica un resultado con menos de dos
 * pares: con `n < 2` no hay varianza que estimar, así que devuelven `null`
 * en vez de un número sin sentido estadístico (mismo principio de
 * "nunca fabricar" que el resto de la aplicación).
 */
export interface NumericPair {
  own: number;
  automatic: number;
}

export interface BlandAltmanResult {
  n: number;
  meanDifference: number;
  sdDifference: number;
  /** Límites de concordancia (`meanDifference ± 1.96·sdDifference`). */
  upperLimitOfAgreement: number;
  lowerLimitOfAgreement: number;
}

/** Bland-Altman clásico: sesgo medio propia−automática y límites de
 * concordancia al 95% (desviación estándar muestral, denominador `n-1`). */
export function computeBlandAltman(pairs: NumericPair[]): BlandAltmanResult | null {
  const n = pairs.length;
  if (n < 2) return null;

  const differences = pairs.map((p) => p.own - p.automatic);
  const meanDifference = differences.reduce((sum, d) => sum + d, 0) / n;
  const variance = differences.reduce((sum, d) => sum + (d - meanDifference) ** 2, 0) / (n - 1);
  const sdDifference = Math.sqrt(variance);

  return {
    n,
    meanDifference,
    sdDifference,
    upperLimitOfAgreement: meanDifference + 1.96 * sdDifference,
    lowerLimitOfAgreement: meanDifference - 1.96 * sdDifference,
  };
}

export interface IccResult {
  n: number;
  /** ICC(2,1): dos vías, efectos aleatorios, medida única, concordancia
   * absoluta (Shrout & Fleiss 1979 / McGraw & Wong 1996) — el que
   * corresponde a comparar "propia" vs. "automática" como si fueran dos
   * evaluadores intercambiables sobre el mismo caso. A diferencia de
   * ICC(3,1), SÍ penaliza un sesgo sistemático entre ambas. */
  icc: number;
}

/**
 * ICC(2,1) para exactamente dos "evaluadores" (propio, automático) sobre
 * `n` casos, vía ANOVA de dos vías sin repetición.
 */
export function computeIcc(pairs: NumericPair[]): IccResult | null {
  const n = pairs.length;
  if (n < 2) return null;
  const k = 2;

  const rowMeans = pairs.map((p) => (p.own + p.automatic) / 2);
  const ownColMean = pairs.reduce((sum, p) => sum + p.own, 0) / n;
  const automaticColMean = pairs.reduce((sum, p) => sum + p.automatic, 0) / n;
  const grandMean = (ownColMean + automaticColMean) / 2;

  const ssRows = k * rowMeans.reduce((sum, r) => sum + (r - grandMean) ** 2, 0);
  const ssCols = n * ((ownColMean - grandMean) ** 2 + (automaticColMean - grandMean) ** 2);
  const ssTotal = pairs.reduce((sum, p) => sum + (p.own - grandMean) ** 2 + (p.automatic - grandMean) ** 2, 0);
  const ssError = ssTotal - ssRows - ssCols;

  const msRows = ssRows / (n - 1);
  const msCols = ssCols / (k - 1);
  const msError = ssError / ((n - 1) * (k - 1));

  const denominator = msRows + (k - 1) * msError + (k / n) * (msCols - msError);
  // Denominador cero sólo cuando todos los valores son idénticos (ninguna
  // varianza entre casos que atribuir a nada) — no hay ICC que estimar.
  if (denominator === 0) return null;

  const icc = (msRows - msError) / denominator;
  return { n, icc };
}

export interface KappaResult {
  n: number;
  kappa: number;
  observedAgreement: number;
  expectedAgreement: number;
}

/** Kappa de Cohen genérico, para cualquier resultado categórico (p. ej.
 * `curveType` de Lenke) donde ambos lados están presentes. */
export function computeCohenKappa<T extends string | number>(pairs: { own: T; automatic: T }[]): KappaResult | null {
  const n = pairs.length;
  if (n < 2) return null;

  let agreements = 0;
  const ownCounts = new Map<T, number>();
  const automaticCounts = new Map<T, number>();
  for (const { own, automatic } of pairs) {
    if (own === automatic) agreements++;
    ownCounts.set(own, (ownCounts.get(own) ?? 0) + 1);
    automaticCounts.set(automatic, (automaticCounts.get(automatic) ?? 0) + 1);
  }

  const observedAgreement = agreements / n;
  let expectedAgreement = 0;
  for (const [category, ownCount] of ownCounts) {
    const automaticCount = automaticCounts.get(category) ?? 0;
    expectedAgreement += (ownCount / n) * (automaticCount / n);
  }

  // Sin desacuerdo posible en ningún lado (todo el mundo cae en la misma
  // categoría): kappa no está definido (0/0), no se fabrica un valor.
  if (expectedAgreement === 1) return null;

  const kappa = (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
  return { n, kappa, observedAgreement, expectedAgreement };
}
