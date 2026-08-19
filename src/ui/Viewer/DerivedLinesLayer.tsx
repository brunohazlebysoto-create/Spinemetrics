/**
 * Dibuja las líneas derivadas (`computeDerivedLines`) sobre el visor.
 * SPEC.md §3, capa "líneas derivadas".
 */
import { Circle, Line, Text } from 'react-konva';
import { useAppStore } from '../store';
import { computeDerivedLines } from './derivedLines';

interface DerivedLinesLayerProps {
  imageWidth: number;
  imageHeight: number;
  zoom: number;
}

const COBB_LABEL_COLOR = '#ffe066';

export function DerivedLinesLayer({ imageWidth, imageHeight, zoom }: DerivedLinesLayerProps): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const measurementSet = useAppStore((s) => s.measurementSet);
  const layerVisible = useAppStore((s) => s.layerVisibility.derivedLines);
  const overlaysVisible = useAppStore((s) => s.overlaysVisible);

  if (!radiograph || !layerVisible || !overlaysVisible) return null;

  const { lines, cobbLabel } = computeDerivedLines(radiograph, measurementSet, imageWidth, imageHeight);
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
      {cobbLabel && (
        <>
          {/* Vértice de las dos líneas del Cobb extendidas, con el ángulo
              impreso al lado — mismo estilo visual que las herramientas de
              medición de referencia: confirmar el número justo donde se
              está midiendo, no sólo en el panel lateral. */}
          <Circle x={cobbLabel.point.x} y={cobbLabel.point.y} radius={3 / zoom} fill={COBB_LABEL_COLOR} listening={false} />
          <Text
            x={cobbLabel.point.x + 8 / zoom}
            y={cobbLabel.point.y - 8 / zoom}
            text={cobbLabel.text}
            fontSize={16 / zoom}
            fontStyle="bold"
            fill={COBB_LABEL_COLOR}
            listening={false}
          />
        </>
      )}
    </>
  );
}
