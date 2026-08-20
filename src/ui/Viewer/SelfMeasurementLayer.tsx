/**
 * Trazado propio de "Medir yo también" (SPEC.md §10.5): landmarks y líneas
 * derivadas de `store.ts::selfMeasurement`, en un color distinto del
 * automático para no confundirlos. Sólo lectura — nunca arrastrable, a
 * diferencia de `LandmarksLayer` — el clínico corrige un punto mal puesto
 * quitando y volviendo a añadir esa vértebra (`removeVertebra` +
 * `placeVertebraCorner`, misma herramienta que el trazado automático).
 * Se muestra mientras exista un trazado propio, esté o no activo el modo,
 * para poder revisarlo junto a la tabla de comparación después de
 * terminar.
 */
import { Circle, Line, Text } from 'react-konva';
import { useAppStore } from '../store';
import { computeDerivedLines } from './derivedLines';
import { listLandmarkPoints } from './landmarkPoints';

interface SelfMeasurementLayerProps {
  imageWidth: number;
  imageHeight: number;
  zoom: number;
}

const OWN_COLOR = '#a78bfa';

export function SelfMeasurementLayer({ imageWidth, imageHeight, zoom }: SelfMeasurementLayerProps): JSX.Element | null {
  const selfMeasurement = useAppStore((s) => s.selfMeasurement);
  if (!selfMeasurement) return null;

  const { radiograph, measurementSet } = selfMeasurement;
  const points = listLandmarkPoints(radiograph);
  const { lines, cobbLabel } = computeDerivedLines(radiograph, measurementSet, imageWidth, imageHeight);
  const radius = 5 / zoom;
  const strokeWidth = 2 / zoom;

  return (
    <>
      {lines.map((line) => (
        <Line key={line.key} points={line.points} stroke={OWN_COLOR} strokeWidth={strokeWidth} dash={[4 / zoom, 4 / zoom]} listening={false} />
      ))}
      {points.map(({ ref, point }, i) => (
        <Circle key={`${ref.kind}-${i}`} x={point.x} y={point.y} radius={radius} fill={OWN_COLOR} opacity={0.85} listening={false} />
      ))}
      {radiograph.annotations.vertebrae.map((v) => (
        <Text
          key={v.level}
          x={v.superiorEndplate[0].x - 8 / zoom - (14 / zoom) * 2}
          y={v.superiorEndplate[0].y - 8 / zoom}
          text={v.level}
          fontSize={14 / zoom}
          fill={OWN_COLOR}
          listening={false}
        />
      ))}
      {cobbLabel && (
        <Text
          x={cobbLabel.point.x + 8 / zoom}
          y={cobbLabel.point.y + 8 / zoom}
          text={`propio: ${cobbLabel.text}`}
          fontSize={14 / zoom}
          fontStyle="bold"
          fill={OWN_COLOR}
          listening={false}
        />
      )}
    </>
  );
}
