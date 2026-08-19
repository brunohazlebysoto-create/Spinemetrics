# `src/pipeline/` — Pipeline automático (Fase 3)

Implementa SPEC.md §8 sobre imágenes reales, sin esperar a que exista un
modelo entrenado (`training/` sólo tiene el andamiaje de entrenamiento, ver
`training/README.md` — no hay ningún checkpoint). Por decisión explícita del
usuario, las etapas que SPEC.md exige resolver con un modelo (Etapa 3,
segmentación vertebral) se implementan aquí con heurísticos clásicos reales
en vez de quedar sin construir.

## Qué es real y qué es un heurístico honesto

| Etapa | Estado | Método |
|---|---|---|
| 0 — Ingesta/anonimización | Real | `imaging/loadDicom.ts`, `imaging/anonymize.ts` (Fase 2) |
| 1 — Clasificación de proyección | Real, con límite honesto | `viewClassification.ts`: metadatos DICOM si existen; sin ellos, confianza 0 y exige confirmación — SPEC.md pide un "clasificador de imagen ligero" que necesitaría datos de entrenamiento inexistentes |
| 2 — Preprocesado | Real | `preprocess.ts`: normalización por percentiles, CLAHE, detección de ROI, remuestreo con transformación afín invertible — espejo en TS de `training/preprocess.py` |
| 3 — Segmentación vertebral | Heurístico, confianza acotada a 0.5 | `vertebraDetector.ts`: picos del perfil de intensidad por fila. SPEC.md exige aquí un modelo entrenado (U-Net/Mask R-CNN); sin él, este heurístico intenta algo real en vez de nada, pero nunca se presenta como equivalente |
| 4 — Etiquetado de niveles | Nunca fabricado | `levelLabeling.ts`: exige un ancla explícita (qué banda es qué nivel). Sin segmentación sacra real no hay forma de anclar automáticamente — SPEC.md prohíbe adivinar el recuento |
| 5 — Landmarks pélvicos | Real (cabezas femorales) | `pelvicDetector.ts` + `houghCircle.ts`: Hough circular por gradiente — el método que SPEC.md nombra explícitamente como válido, no un sustituto. El platillo de S1 (que sí exige segmentación sacra) nunca se fabrica |
| 6 — Vista lateral | No implementado | Fuera de alcance de esta iteración |
| 7 — Cálculo y clasificación | Real | `runPipeline.ts` reutiliza `ui/measurementEngine.ts::recomputeMeasurementSet` — la MISMA función que la anotación manual, sin ruta alternativa |
| 8 — Control de calidad | Real | `qualityControl.ts`, tabla de SPEC.md §8.1 |

## La consecuencia honesta de no tener un modelo entrenado

La Etapa 3 nunca supera 0.5 de confianza (techo deliberado); la Etapa 4
siempre exige una confirmación humana (una banda → un nivel). Como
`core/measurements/cobb.ts` excluye vértebras con confianza <0.7 de la
selección de terminales, **el ángulo de Cobb automático normalmente sale en
gris** hasta que exista un modelo real — eso es correcto, no un error: es
la aplicación de la regla de SPEC.md §8.1, "prohibido rellenar un hueco con
un valor estimado". Otras mediciones que no dependen de la confianza de
segmentación (p. ej. cifosis torácica, si los niveles están confirmados) sí
se calculan.

## Flujo actual en la app

1. Al importar una imagen (`ui/store.ts::loadImage`), se dispara
   `runAutoDetection()` sin ancla — detecta bandas candidatas, cabezas
   femorales y corre el control de calidad. Ningún clic del usuario.
2. El panel "Detección automática" (`ui/Panels/AutoDetectionPanel.tsx`)
   muestra el resultado y pide **una única confirmación**: qué banda es
   qué nivel (Etapa 4). Es el único punto donde este pipeline heurístico,
   sin modelo entrenado, no puede evitar pedir un dato al usuario sin
   fabricarlo.
3. Al confirmar, `applyAutoDetectionAnchor` vuelve a correr el pipeline con
   el ancla, carga las vértebras detectadas (con su `confidence`) como
   anotación del `Radiograph` activo y calcula el `MeasurementSet`
   (`source: 'auto'`, `modelVersion: 'heuristic-bands-v1'`) con el mismo
   motor que la anotación manual.
4. Cualquier corrección manual posterior sobre esas vértebras usa el flujo
   ya existente de la Fase 2 (arrastrar landmarks) y alimenta el "bucle de
   mejora" de SPEC.md §12 igual que si hubieran sido manuales desde el
   principio.

## Pendiente explícito (no ocultado)

- **No corre en un Web Worker todavía** (SPEC.md §8: "corre en un Web
  Worker"). El heurístico actual es mucho más barato que la inferencia de
  un modelo ONNX real, así que no bloquea la UI de forma perceptible en las
  pruebas hechas; moverlo a un worker es trabajo de "pulido" pendiente, no
  una limitación de corrección.
- **Vista lateral (Etapa 6)** no implementada.
- **Reemplazo por un modelo real**: en cuanto exista un checkpoint
  entrenado (`training/`) y su exportación a ONNX, la Etapa 3 debería
  sustituirse por inferencia real detrás de la misma interfaz de
  `vertebraDetector.ts` — el resto del pipeline (preprocesado, QC, motor de
  cálculo) no necesitaría cambios.
