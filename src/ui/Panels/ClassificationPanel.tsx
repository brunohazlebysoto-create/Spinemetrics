/**
 * Panel de clasificación. SPEC.md §9. Se calcula sobre la MISMA radiografía
 * activa que el panel de mediciones (`ui/classificationEngine.ts`), nunca
 * por una ruta distinta. Sólo muestra las claves presentes en
 * `MeasurementSet.classifications` — si no hay ninguna curva coronal
 * detectada, el panel entero se omite en vez de mostrar entradas vacías.
 */
import { useAppStore } from '../store';
import { ClassificationRow } from './ClassificationRow';

const LABELS: Record<string, string> = {
  lenke: 'Lenke (AIS)',
  kingMoe: 'King-Moe',
  pumc: 'PUMC',
  srsSchwab: 'SRS-Schwab (adulto)',
  roussouly: 'Roussouly',
  ceos: 'C-EOS (inicio precoz)',
  congenital: 'Congénita (Winter/McMaster)',
  neuromuscular: 'Neuromuscular (Lonstein-Akbarnia)',
  lenkeSilva: 'Lenke-Silva (degenerativa del adulto)',
};

const ORDER = ['lenke', 'kingMoe', 'pumc', 'srsSchwab', 'roussouly', 'ceos', 'congenital', 'neuromuscular', 'lenkeSilva'];

export function ClassificationPanel(): JSX.Element | null {
  const measurementSet = useAppStore((s) => s.measurementSet);
  if (!measurementSet) return null;

  const keys = ORDER.filter((key) => measurementSet.classifications[key]);
  if (keys.length === 0) return null;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Clasificación
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a8f98' }}>
        Calculada sobre todas las radiografías del estudio en curso (bending, PA+lateral incluidos cuando existen, no
        sólo la que esté activa en el visor) más las entradas manuales de abajo — lo que falta se indica, nunca se
        inventa.
      </p>
      {keys.map((key) => (
        <ClassificationRow key={key} label={LABELS[key]!} classification={measurementSet.classifications[key]!} />
      ))}
    </div>
  );
}
