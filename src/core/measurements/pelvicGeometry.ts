/**
 * Puntos pélvicos compartidos entre `sagittal.ts` (TPA) y `pelvic.ts`
 * (SS, PT, PI) — SPEC.md §7.5, §7.6.
 */
import { midpoint } from '../geometry/primitives';
import type { Pt } from '../geometry/types';
import type { PelvicAnnotation } from '../models/types';

/** `F` de SPEC.md §7.6: punto medio entre los centros de las cabezas
 * femorales (`docs/OPEN_QUESTIONS.md` #16). */
export function femoralAxisMidpoint(pelvis: PelvicAnnotation): Pt {
  return midpoint(pelvis.femoralHeads.left.center, pelvis.femoralHeads.right.center);
}

/** `M` de SPEC.md §7.6: punto medio del platillo superior de S1. */
export function s1EndplateMidpoint(pelvis: PelvicAnnotation): Pt {
  return midpoint(pelvis.s1Endplate[0], pelvis.s1Endplate[1]);
}
