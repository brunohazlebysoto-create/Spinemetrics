/**
 * Zoom/pan que encaja una imagen completa dentro de un contenedor, sin
 * recortarla ni ampliarla por encima del 100% (SPEC.md §10.2). Extraído de
 * `Viewer.tsx` (que lo usa al cargar una imagen nueva) para que
 * `ui/Panels/ReportPanel.tsx` pueda reproducir exactamente el mismo encaje
 * al capturar la imagen anotada del informe (SPEC.md §12, punto 4) — deben
 * ser el mismo cálculo, no una aproximación aparte.
 */
import type { Pt } from '../../core/geometry/types';

export function computeFitZoomPan(imageWidth: number, imageHeight: number, containerWidth: number, containerHeight: number): { zoom: number; pan: Pt } {
  const fitZoom = Math.min(containerWidth / imageWidth, containerHeight / imageHeight, 1);
  const zoom = fitZoom > 0 ? fitZoom : 1;
  return { zoom, pan: { x: (containerWidth - imageWidth * zoom) / 2, y: (containerHeight - imageHeight * zoom) / 2 } };
}
