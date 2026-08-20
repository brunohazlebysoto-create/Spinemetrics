/**
 * Panel de "Investigación" (SPEC.md §10.5): "estadística agregada
 * (Bland-Altman, ICC, kappa por clasificación) sólo de los casos donde se
 * haya usado [Medir yo también]. Si nunca se usa, la aplicación funciona
 * igual." Por eso este panel no carga nada automáticamente — es
 * independiente del estudio activo, y sólo tiene sentido consultarlo una
 * vez que existan casos acumulados.
 */
import { useState } from 'react';
import { listSelfMeasurementCases, type SelfMeasurementCase } from '../../storage/db';
import { computeBlandAltman, computeCohenKappa, computeIcc, type NumericPair } from '../researchStats';
import { MEASUREMENT_DISPLAY_CONFIG } from './measurementDisplayConfig';
import { UNIT_SUFFIX } from './formatMeasurement';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function extractPairs(cases: SelfMeasurementCase[], key: string): NumericPair[] {
  const pairs: NumericPair[] = [];
  for (const c of cases) {
    const own = c.own.measurements[key]?.value;
    const automatic = c.automatic.measurements[key]?.value;
    if (own !== null && own !== undefined && automatic !== null && automatic !== undefined) {
      pairs.push({ own, automatic });
    }
  }
  return pairs;
}

/** Sólo `curveType` de Lenke por ahora — es el descriptor categórico más
 * central del motor de clasificación; extenderlo a otros clasificadores es
 * un paso aparte, no una fabricación de este panel. */
function extractLenkeCurveTypePairs(cases: SelfMeasurementCase[]): { own: number; automatic: number }[] {
  const pairs: { own: number; automatic: number }[] = [];
  for (const c of cases) {
    const own = c.own.classifications.lenke as unknown as { curveType: number | null } | undefined;
    const automatic = c.automatic.classifications.lenke as unknown as { curveType: number | null } | undefined;
    if (own?.curveType != null && automatic?.curveType != null) {
      pairs.push({ own: own.curveType, automatic: automatic.curveType });
    }
  }
  return pairs;
}

export function ResearchPanel(): JSX.Element {
  const [cases, setCases] = useState<SelfMeasurementCase[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLoad(): Promise<void> {
    setLoading(true);
    setCases(await listSelfMeasurementCases());
    setLoading(false);
  }

  return (
    <div style={{ padding: 16, borderTop: '1px solid #26282e' }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Investigación (SPEC.md §10.5)
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a8f98' }}>
        Estadística agregada sólo de los casos donde se usó "Medir yo también". Si nunca se usa, no cambia nada más
        en la aplicación.
      </p>
      <button type="button" onClick={() => void handleLoad()} disabled={loading}>
        {loading ? 'Cargando…' : 'Cargar estadística acumulada'}
      </button>

      {cases !== null && cases.length === 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>Todavía no hay ningún caso guardado con esta función.</p>
      )}

      {cases !== null && cases.length > 0 && (() => {
        // `docs/OPEN_QUESTIONS.md` #38–#39: los casos donde se consultó el
        // automático antes de terminar (`unblinded`) no son independientes
        // — se excluyen de la estadística "publicable" por defecto, sin
        // dejar de contarlos (nunca se ocultan en silencio).
        const blindedCases = cases.filter((c) => !c.unblinded);
        const unblindedCount = cases.length - blindedCases.length;

        const rows = MEASUREMENT_DISPLAY_CONFIG.map((config) => {
          const pairs = extractPairs(blindedCases, config.key);
          const ba = computeBlandAltman(pairs);
          if (!ba) return null;
          const icc = computeIcc(pairs);
          const suffix = UNIT_SUFFIX[cases[0]!.automatic.measurements[config.key]?.unit ?? 'deg'];
          return { key: config.key, label: config.label, ba, icc, suffix };
        }).filter((r): r is NonNullable<typeof r> => r !== null);

        const kappa = computeCohenKappa(extractLenkeCurveTypePairs(blindedCases));

        const unblindedNote = unblindedCount > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#fbbf24' }}>
            {unblindedCount} caso{unblindedCount === 1 ? '' : 's'} excluido{unblindedCount === 1 ? '' : 's'} de esta estadística: se
            consultó el automático antes de terminar la medición propia (docs/OPEN_QUESTIONS.md #39).
          </p>
        );

        if (rows.length === 0) {
          return (
            <>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>
                {blindedCases.length} caso{blindedCases.length === 1 ? '' : 's'} cegado{blindedCases.length === 1 ? '' : 's'} guardado
                {blindedCases.length === 1 ? '' : 's'} — hacen falta al menos 2 con la misma medición calculable en ambos lados para
                estimar Bland-Altman/ICC.
              </p>
              {unblindedNote}
            </>
          );
        }

        return (
          <>
            <table style={{ width: '100%', marginTop: 8, fontSize: 12, color: '#c7cad1', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#8a8f98', textAlign: 'left' }}>
                  <th style={{ fontWeight: 'normal', padding: '2px 4px 2px 0' }}>Parámetro</th>
                  <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>n</th>
                  <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>Sesgo (Bland-Altman)</th>
                  <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>Límites 95%</th>
                  <th style={{ fontWeight: 'normal', padding: '2px 0 2px 4px', textAlign: 'right' }}>ICC(2,1)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, label, ba, icc, suffix }) => (
                  <tr key={key} style={{ borderTop: '1px solid #26282e' }}>
                    <td style={{ padding: '3px 4px 3px 0' }}>{label}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right' }}>{ba.n}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                      {round1(ba.meanDifference)}
                      {suffix}
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                      [{round1(ba.lowerLimitOfAgreement)}, {round1(ba.upperLimitOfAgreement)}]{suffix}
                    </td>
                    <td style={{ padding: '3px 0 3px 4px', textAlign: 'right' }}>{icc ? icc.icc.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>
              Kappa (tipo de curva de Lenke): {kappa ? `${kappa.kappa.toFixed(2)} (n=${kappa.n})` : 'sin suficientes casos comparables'}.
            </p>
            {unblindedNote}
          </>
        );
      })()}
    </div>
  );
}
