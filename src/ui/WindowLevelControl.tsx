/**
 * Window/level e inversión de escala de grises. SPEC.md §10.2: "window/
 * level, inversión de escala de grises." Sólo aplica a imágenes DICOM (los
 * formatos ráster ya vienen renderizados).
 */
import { useAppStore } from './store';

export function WindowLevelControl(): JSX.Element | null {
  const image = useAppStore((s) => s.image);
  const windowCenter = useAppStore((s) => s.windowCenter);
  const windowWidth = useAppStore((s) => s.windowWidth);
  const invertGrayscale = useAppStore((s) => s.invertGrayscale);
  const setWindowLevel = useAppStore((s) => s.setWindowLevel);
  const toggleInvertGrayscale = useAppStore((s) => s.toggleInvertGrayscale);

  if (!image || image.kind !== 'dicom') return null;

  const center = windowCenter ?? image.defaultWindowCenter;
  const width = windowWidth ?? image.defaultWindowWidth;
  const range = Math.max(1, image.defaultWindowWidth * 3);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#c7cad1' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Nivel
        <input
          type="range"
          min={center - range}
          max={center + range}
          value={center}
          onChange={(e) => setWindowLevel(Number(e.target.value), width)}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Ventana
        <input type="range" min={1} max={range * 2} value={width} onChange={(e) => setWindowLevel(center, Number(e.target.value))} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={invertGrayscale} onChange={toggleInvertGrayscale} />
        Invertir
      </label>
    </div>
  );
}
