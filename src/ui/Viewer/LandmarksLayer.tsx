/**
 * Landmarks arrastrables. SPEC.md §10.2: "Cualquier landmark es arrastrable
 * directamente. Al moverlo se recalculan líneas, ángulos, balances y
 * clasificación en tiempo real."
 *
 * Los puntos viven en coordenadas de imagen (px originales); el `Stage`
 * padre aplica zoom/pan como transformación propia (`scaleX/scaleY/x/y`),
 * así que las coordenadas de arrastre de Konva ya están en el espacio de
 * imagen sin conversión manual.
 */
import { Circle } from 'react-konva';
import type Konva from 'konva';
import { useAppStore } from '../store';
import { landmarkRefKey, listLandmarkPoints, sameLandmarkRef, type LandmarkGroup } from './landmarkPoints';
import type { LandmarkRef } from '../landmarkRef';

const GROUP_COLOR: Record<LandmarkGroup, string> = {
  vertebra: '#4fd1ff',
  pelvis: '#ffb454',
  rib: '#ff6ec7',
};

const BASE_RADIUS_PX = 5;
const SELECTED_RADIUS_PX = 7;

interface LandmarksLayerProps {
  zoom: number;
}

export function LandmarksLayer({ zoom }: LandmarksLayerProps): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const selectedLandmark = useAppStore((s) => s.selectedLandmark);
  const layerVisible = useAppStore((s) => s.layerVisibility.landmarks);
  const overlaysVisible = useAppStore((s) => s.overlaysVisible);
  const beginLandmarkDrag = useAppStore((s) => s.beginLandmarkDrag);
  const updateLandmarkLive = useAppStore((s) => s.updateLandmarkLive);
  const setIsDraggingLandmark = useAppStore((s) => s.setIsDraggingLandmark);
  const selectLandmark = useAppStore((s) => s.selectLandmark);

  if (!radiograph || !layerVisible || !overlaysVisible) return null;

  const points = listLandmarkPoints(radiograph);
  const radius = BASE_RADIUS_PX / zoom;
  const selectedRadius = SELECTED_RADIUS_PX / zoom;
  const strokeWidth = 1.5 / zoom;

  const handleDragStart = (ref: LandmarkRef) => () => {
    selectLandmark(ref);
    beginLandmarkDrag();
    setIsDraggingLandmark(true);
  };

  const handleDragMove = (ref: LandmarkRef) => (e: Konva.KonvaEventObject<DragEvent>) => {
    updateLandmarkLive(ref, { x: e.target.x(), y: e.target.y() });
  };

  const handleDragEnd = (): void => setIsDraggingLandmark(false);

  return (
    <>
      {points.map(({ ref, point, group }) => {
        const isSelected = sameLandmarkRef(ref, selectedLandmark);
        return (
          <Circle
            key={landmarkRefKey(ref)}
            x={point.x}
            y={point.y}
            radius={isSelected ? selectedRadius : radius}
            fill={GROUP_COLOR[group]}
            {...(isSelected ? { stroke: '#ffffff', strokeWidth } : {})}
            draggable
            onDragStart={handleDragStart(ref)}
            onDragMove={handleDragMove(ref)}
            onDragEnd={handleDragEnd}
            onClick={() => selectLandmark(ref)}
            onTap={() => selectLandmark(ref)}
          />
        );
      })}
    </>
  );
}
