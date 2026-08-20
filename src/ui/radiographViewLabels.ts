/**
 * Nombres legibles de `RadiographView` (SPEC.md §5). Compartido entre
 * `RadiographSwitcher.tsx` y `ui/report.ts` (SPEC.md §12, "proyecciones
 * analizadas") para no duplicar la lista.
 */
import type { RadiographView } from '../core/models/types';

export const RADIOGRAPH_VIEW_LABELS: Record<RadiographView, string> = {
  PA_standing: 'PA de pie',
  LAT_standing: 'Lateral de pie',
  PA_supine: 'PA en decúbito',
  BEND_left: 'Bending izquierdo',
  BEND_right: 'Bending derecho',
  FULCRUM: 'Fulcrum',
  TRACTION: 'Tracción',
  HAND: 'Mano (madurez)',
  PELVIS: 'Pelvis',
};
