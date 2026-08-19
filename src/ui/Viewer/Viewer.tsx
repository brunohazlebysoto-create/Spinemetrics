/**
 * Visor principal. SPEC.md §3 (capas imagen/landmarks/líneas derivadas/
 * etiquetas), §10.2 (zoom hasta 800%, pan, lupa, atajos).
 */
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Circle, Line } from 'react-konva';
import type Konva from 'konva';
import { useAppStore } from '../store';
import { distance } from '../../core/geometry/primitives';
import type { Pt } from '../../core/geometry/types';
import { ImageLayer } from './ImageLayer';
import { LandmarksLayer } from './LandmarksLayer';
import { DerivedLinesLayer } from './DerivedLinesLayer';
import { LabelsLayer } from './LabelsLayer';
import { Magnifier } from './Magnifier';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { HelpPanel } from './HelpPanel';
import { useContainerSize } from './useContainerSize';

const RULER_POINT_COLOR = '#ffe066';

const ZOOM_STEP = 1.1;

export function Viewer(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const size = useContainerSize(containerRef);

  const image = useAppStore((s) => s.image);
  const radiograph = useAppStore((s) => s.radiograph);
  const zoom = useAppStore((s) => s.zoom);
  const pan = useAppStore((s) => s.pan);
  const windowCenter = useAppStore((s) => s.windowCenter);
  const windowWidth = useAppStore((s) => s.windowWidth);
  const invertGrayscale = useAppStore((s) => s.invertGrayscale);
  const activeTool = useAppStore((s) => s.activeTool);
  const isDraggingLandmark = useAppStore((s) => s.isDraggingLandmark);
  const helpVisible = useAppStore((s) => s.helpVisible);

  const setZoom = useAppStore((s) => s.setZoom);
  const setPan = useAppStore((s) => s.setPan);
  const placeVertebraCorner = useAppStore((s) => s.placeVertebraCorner);
  const selectLandmark = useAppStore((s) => s.selectLandmark);
  const setCalibrationFromRuler = useAppStore((s) => s.setCalibrationFromRuler);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  const [pointerImagePos, setPointerImagePos] = useState<{ x: number; y: number } | null>(null);
  const [rulerPoints, setRulerPoints] = useState<Pt[]>([]);

  useEffect(() => {
    if (activeTool !== 'ruler') setRulerPoints([]);
  }, [activeTool]);

  useKeyboardShortcuts();

  const fittedImageRef = useRef<typeof image>(null);
  useEffect(() => {
    if (!image) {
      fittedImageRef.current = null;
      return;
    }
    // Al cargar una imagen nueva, encájala en el contenedor si es más
    // grande que el visor (mejor primera impresión que aparecer al 100%
    // recortada). El tamaño del contenedor puede tardar en llegar (el
    // `ResizeObserver` es asíncrono) o cambiar poco después si la toolbar
    // reparte sus controles en más o menos líneas — por eso este efecto
    // depende también de `size` y reintenta hasta conseguir una medida
    // válida, pero sólo encaja **una vez por imagen** (con la bandera de
    // `fittedImageRef`): si encajara de nuevo cada vez que cambia `size`,
    // pisaría el zoom/pan que el usuario ya haya ajustado a mano.
    if (fittedImageRef.current === image) return;
    if (size.width === 0 || size.height === 0) return;

    const fitZoom = Math.min(size.width / image.width, size.height / image.height, 1);
    setZoom(fitZoom > 0 ? fitZoom : 1);
    setPan({ x: (size.width - image.width * fitZoom) / 2, y: (size.height - image.height * fitZoom) / 2 });
    fittedImageRef.current = image;
  }, [image, size, setZoom, setPan]);

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldZoom = zoom;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = direction > 0 ? oldZoom * ZOOM_STEP : oldZoom / ZOOM_STEP;

    const mousePointTo = { x: (pointer.x - pan.x) / oldZoom, y: (pointer.y - pan.y) / oldZoom };
    setZoom(newZoom);
    const clamped = useAppStore.getState().zoom;
    setPan({ x: pointer.x - mousePointTo.x * clamped, y: pointer.y - mousePointTo.y * clamped });
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.target !== e.target.getStage() && activeTool === 'select') return; // clic sobre un landmark: lo gestiona el propio nodo
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    if (activeTool === 'addVertebra') {
      placeVertebraCorner(pos);
    } else if (activeTool === 'ruler') {
      handleRulerClick(pos);
    } else if (activeTool === 'select' && e.target === e.target.getStage()) {
      selectLandmark(null);
    }
  }

  function handleRulerClick(pos: Pt): void {
    if (rulerPoints.length === 0) {
      setRulerPoints([pos]);
      return;
    }
    const first = rulerPoints[0]!;
    const pxLength = distance(first, pos);
    setRulerPoints([]);
    const knownLengthMm = window.prompt('Longitud real del segmento trazado, en milímetros:', '');
    const parsed = knownLengthMm ? parseFloat(knownLengthMm.replace(',', '.')) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setCalibrationFromRuler(pxLength, parsed);
    }
    setActiveTool('select');
  }

  function handleMouseMove(): void {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    setPointerImagePos(pos);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0b0d' }}>
      {image && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          draggable={activeTool === 'select'}
          onDragEnd={(e) => setPan({ x: e.target.x(), y: e.target.y() })}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setPointerImagePos(null)}
        >
          <Layer>
            <ImageLayer image={image} windowCenter={windowCenter} windowWidth={windowWidth} invertGrayscale={invertGrayscale} />
          </Layer>
          <Layer>
            <DerivedLinesLayer imageWidth={image.width} imageHeight={image.height} zoom={zoom} />
          </Layer>
          <Layer>
            <LandmarksLayer zoom={zoom} />
          </Layer>
          <Layer>
            <LabelsLayer zoom={zoom} />
          </Layer>
          {activeTool === 'ruler' && rulerPoints.length > 0 && (
            <Layer listening={false}>
              <Circle x={rulerPoints[0]!.x} y={rulerPoints[0]!.y} radius={4 / zoom} fill={RULER_POINT_COLOR} />
              {pointerImagePos && (
                <Line
                  points={[rulerPoints[0]!.x, rulerPoints[0]!.y, pointerImagePos.x, pointerImagePos.y]}
                  stroke={RULER_POINT_COLOR}
                  strokeWidth={2 / zoom}
                  dash={[6 / zoom, 4 / zoom]}
                />
              )}
            </Layer>
          )}
        </Stage>
      )}

      {!image && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8a8f98' }}>
          Importa una radiografía para empezar.
        </div>
      )}

      {image && radiograph && pointerImagePos && (isDraggingLandmark || activeTool === 'addVertebra' || activeTool === 'ruler') && (
        <Magnifier image={image} pointerImagePos={pointerImagePos} windowCenter={windowCenter} windowWidth={windowWidth} invertGrayscale={invertGrayscale} />
      )}

      {helpVisible && <HelpPanel />}
    </div>
  );
}
