/**
 * Dibuja las líneas derivadas (`computeDerivedLines`) sobre el visor.
 * SPEC.md §3, capa "líneas derivadas".
 */
import { Line } from 'react-konva';
import { useAppStore } from '../store';
import { computeDerivedLines } from './derivedLines';

interface DerivedLinesLayerProps {
  imageHeight: number;
  zoom: number;
}

export function DerivedLinesLayer({ imageHeight, zoom }: DerivedLinesLayerProps): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const measurementSet = useAppStore((s) => s.measurementSet);
  const layerVisible = useAppStore((s) => s.layerVisibility.derivedLines);
  const overlaysVisible = useAppStore((s) => s.overlaysVisible);

  if (!radiograph || !layerVisible || !overlaysVisible) return null;

  const lines = computeDerivedLines(radiograph, measurementSet, imageHeight);
  const strokeWidth = 2 / zoom;

  return (
    <>
      {lines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke={line.color}
          strokeWidth={strokeWidth}
          {...(line.dash ? { dash: line.dash.map((d) => d / zoom) } : {})}
          listening={false}
        />
      ))}
    </>
  );
}
