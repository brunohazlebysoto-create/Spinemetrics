/**
 * Etapa 5 — Landmarks pélvicos. SPEC.md §8: "Cabezas femorales por Hough
 * circular con refinamiento por ajuste de círculo... Platillo y ángulo
 * posterosuperior de S1 desde la segmentación sacra."
 *
 * Las cabezas femorales sí se detectan con un método real (Hough circular,
 * §8 lo nombra explícitamente como técnica válida, no como sustituto de un
 * modelo). El platillo de S1 exige "segmentación sacra" — eso sí necesita
 * un modelo entrenado que no existe (ver `training/README.md`) — así que
 * **no se fabrica**: queda `null` con el motivo, igual que cualquier otro
 * dato insuficiente (SPEC.md §8.1, "prohibido rellenar un hueco con un
 * valor estimado").
 */
import type { PelvicAnnotation } from '../core/models/types';
import { detectCircles, type DetectedCircle } from './houghCircle';
import type { DetectionConfidence, GrayscaleImage } from './types';

export interface FemoralHeadDetectionOptions {
  minRadius: number;
  maxRadius: number;
  radiusStep?: number;
}

export interface FemoralHeadDetectionResult {
  femoralHeads: PelvicAnnotation['femoralHeads'] | null;
  confidence: DetectionConfidence;
}

/**
 * Los votos de un pico del acumulador se concentran en un único píxel
 * entero, así que el redondeo dispersa el voto de cada píxel de borde entre
 * varios píxeles vecinos del acumulador en vez de sumarlos todos en uno
 * solo. `ROUNDING_SPREAD_FACTOR` es la dispersión media observada
 * empíricamente sobre círculos sintéticos limpios (ver
 * `pelvicDetector.test.ts`): un círculo bien formado de radio `r` obtiene
 * ~`2π·r / 8` votos en su pico, no `2π·r`.
 */
const ROUNDING_SPREAD_FACTOR = 8;

function expectedVotesForCleanCircle(radius: number): number {
  return (2 * Math.PI * radius) / ROUNDING_SPREAD_FACTOR;
}

/**
 * Confianza real derivada de los votos del acumulador de Hough, no una
 * constante: cuanto más se acerque `votes` a lo que produciría un borde de
 * círculo limpio de ese radio, más alta. Se limita a 0.9 — un ajuste de
 * círculo, por bueno que sea, no sustituye la verificación clínica.
 */
function circleConfidence(circle: DetectedCircle): DetectionConfidence {
  const expectedMaxVotes = expectedVotesForCleanCircle(circle.radius);
  const ratio = expectedMaxVotes > 0 ? circle.votes / expectedMaxVotes : 0;
  const value = Math.min(0.9, ratio);
  return {
    value,
    reason: `${circle.votes.toFixed(0)} votos / ${expectedMaxVotes.toFixed(0)} esperados para radio ${circle.radius}px (ratio ${ratio.toFixed(2)}).`,
  };
}

/**
 * Detecta las dos cabezas femorales por Hough circular. Devuelve `null` si
 * no se encuentran dos círculos separables — nunca inventa una segunda
 * cabeza a partir de una sola detección.
 */
const MIN_QUALITY_RATIO = 0.3;

export function detectFemoralHeads(image: GrayscaleImage, options: FemoralHeadDetectionOptions): FemoralHeadDetectionResult {
  const rawCircles = detectCircles(image, {
    minRadius: options.minRadius,
    maxRadius: options.maxRadius,
    ...(options.radiusStep !== undefined ? { radiusStep: options.radiusStep } : {}),
    maxCircles: 4, // se piden de más para poder filtrar picos espurios de baja calidad antes de emparejar.
    minCenterSeparation: options.minRadius * 2,
  });

  // Descarta picos del acumulador que no se acercan a lo que produciría un
  // círculo real de ese radio (evita "detectar" una segunda cabeza femoral
  // fantasma a partir del ruido del propio borde de la primera).
  const circles = rawCircles.filter((c) => c.votes / expectedVotesForCleanCircle(c.radius) >= MIN_QUALITY_RATIO).slice(0, 2);

  if (circles.length < 2) {
    return {
      femoralHeads: null,
      confidence: {
        value: 0,
        reason: `Sólo se detectaron ${circles.length} círculo(s) candidato(s) a cabeza femoral (se necesitan 2).`,
      },
    };
  }

  const [a, b] = circles as [DetectedCircle, DetectedCircle];
  const [left, right] = a.center.x <= b.center.x ? [a, b] : [b, a];

  const confidenceLeft = circleConfidence(left);
  const confidenceRight = circleConfidence(right);
  const combined: DetectionConfidence = {
    value: Math.min(confidenceLeft.value, confidenceRight.value),
    reason: `Izquierda: ${confidenceLeft.reason} · Derecha: ${confidenceRight.reason}`,
  };

  return {
    femoralHeads: {
      left: { center: left.center, radius: left.radius },
      right: { center: right.center, radius: right.radius },
    },
    confidence: combined,
  };
}
