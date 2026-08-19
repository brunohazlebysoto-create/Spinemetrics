# SpineMetrics

Aplicación local de análisis morfométrico de radiografías de columna en escoliosis pediátrica, del adolescente y del adulto. Ver `SPEC.md` para la especificación completa y `docs/OPEN_QUESTIONS.md` para las decisiones de ambigüedad de definición y umbral.

**Estatus:** herramienta de apoyo a la medición para uso propio y de investigación. No es un dispositivo médico certificado.

## Estado de desarrollo

- [x] **Fase 1 — Motor de geometría y mediciones.** `src/core/geometry` y `src/core/measurements`, sin interfaz.
- [x] **Fase 2 — Visor, anotación y recálculo en vivo.** Carga DICOM/PNG/JPEG/TIFF, anonimización, calibración (DICOM y regla manual), anotación manual de vértebras/pelvis/costillas con recálculo en vivo, panel de mediciones, atajos de teclado, persistencia local (IndexedDB) e import/export JSON.
- [x] **Fase 3 — Pipeline automático, vista PA de pie (con heurísticos, sin modelo entrenado).** `src/pipeline/`: se dispara solo al importar (Etapas 0–2, preprocesado real con transformación afín); Etapa 3 (segmentación vertebral) usa un heurístico de picos de intensidad porque no existe un modelo entrenado (`training/` sólo tiene el andamiaje — ver `training/README.md`), con confianza acotada a 0.5 y nunca presentado como equivalente a una segmentación real; Etapa 5 (cabezas femorales) usa Hough circular, el método clásico que SPEC.md nombra explícitamente. Etapa 4 (a qué nivel corresponde cada vértebra) exige una única confirmación del usuario — sin segmentación sacra real no hay forma de anclar el recuento sin adivinar. Confirmado el ancla, el cálculo pasa por el mismo motor que la anotación manual (`ui/measurementEngine.ts`). Detalles y limitaciones explícitas en `src/pipeline/README.md`. Sin Web Worker todavía (pendiente de pulido) ni vista lateral (Etapa 6).
- [x] **Fase 4 — Clasificadores.** `src/core/classification/`: los 10 clasificadores de SPEC.md §9 — Lenke (AIS, principal), King-Moe, PUMC, SRS-Schwab (adulto), C-EOS (inicio precoz), Winter/McMaster (congénita), Lonstein-Akbarnia+GMFCS (neuromuscular), Roussouly, y las dos estructuras de referencia explícitamente no automáticas (Lenke-Silva: árbol guiado por casillas; osteotomías Schwab-Lenke: tabla de consulta). 143 tests, incluidos los valores límite exactos de SPEC.md §13.3. Wiring en la UI (panel de clasificación a nivel de `Study`, combinando varias radiografías) queda pendiente de pulido — los clasificadores en sí están completos y probados.
- [ ] Fase 5 — Parámetros pélvicos automáticos avanzados y vista lateral.
- [ ] Fase 6 — Informes, seguimiento seriado y panel opcional de comparación.

**Entrenamiento del modelo real:** el andamiaje completo (`training/`: carga de datos, preprocesado, arquitectura U-Net, bucle de entrenamiento, exportación a ONNX) está listo — ver `training/README.md` — pero no hay ningún checkpoint entrenado porque no existe un dataset real etiquetado. En cuanto exista, la Etapa 3 del pipeline puede sustituir el heurístico actual por inferencia ONNX real detrás de la misma interfaz, sin tocar el resto del pipeline.

## Estructura

```
src/
  core/
    geometry/        # primitivas puras: Point, Line, angleBetween, signedDistance
    measurements/     # cobb.ts, sagittal.ts, pelvic.ts, balance.ts, rotation.ts, mehta.ts, flexibility.ts
    classification/   # Lenke, King-Moe, PUMC, SRS-Schwab, C-EOS, congénita, neuromuscular, Roussouly... (fase 4)
    models/           # tipos de dominio
    calibration/       # px→mm, magnificación
    config/
      conventions.ts  # decisiones de docs/OPEN_QUESTIONS.md, configurables
  pipeline/           # detección automática (fase 3, heurísticos sin modelo entrenado — ver pipeline/README.md)
  imaging/            # carga DICOM/PNG/JPEG/TIFF, anonimización, window/level
  ui/                 # visor (Konva), paneles, store (Zustand)
  storage/            # persistencia local (Dexie/IndexedDB), import/export JSON
training/             # entrenamiento de modelos, fuera del bundle (ver training/README.md)
docs/
  OPEN_QUESTIONS.md
  REFERENCES.md
```

**Reglas de arquitectura no negociables:**
- `core/` no importa nada de `ui/`, `imaging/` ni `pipeline/`. Toda función de `core/measurements` y `core/classification` es pura: recibe entrada, devuelve `{ value, unit, trace, warnings }`.
- Los landmarks automáticos y los manuales atraviesan exactamente el mismo motor de cálculo y clasificación.

## Desarrollo

```bash
npm install
npm run typecheck
npm test
npm run dev      # servidor de desarrollo
npm run build    # build de producción
```
