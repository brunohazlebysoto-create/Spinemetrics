# SpineMetrics

Aplicación local de análisis morfométrico de radiografías de columna en escoliosis pediátrica, del adolescente y del adulto. Ver `SPEC.md` para la especificación completa y `docs/OPEN_QUESTIONS.md` para las decisiones de ambigüedad de definición y umbral.

**Estatus:** herramienta de apoyo a la medición para uso propio y de investigación. No es un dispositivo médico certificado.

## Estado de desarrollo

- [x] **Fase 1 — Motor de geometría y mediciones.** `src/core/geometry` y `src/core/measurements`, sin interfaz.
- [ ] Fase 2 — Visor, anotación y recálculo en vivo.
- [ ] Fase 3 — Pipeline automático, vista PA de pie.
- [ ] Fase 4 — Clasificadores.
- [ ] Fase 5 — Vista lateral y parámetros pélvicos automáticos.
- [ ] Fase 6 — Informes, seguimiento seriado y panel opcional de comparación.

## Estructura

```
src/
  core/
    geometry/        # primitivas puras: Point, Line, angleBetween, signedDistance
    measurements/     # cobb.ts, sagittal.ts, pelvic.ts, balance.ts, rotation.ts, mehta.ts, flexibility.ts
    classification/   # (fase 4)
    models/           # tipos de dominio
    calibration/       # px→mm, magnificación
    config/
      conventions.ts  # decisiones de docs/OPEN_QUESTIONS.md, configurables
  pipeline/           # detección automática (fase 3)
  imaging/            # carga DICOM (fase 2)
  ui/                 # visor y paneles (fase 2)
  storage/            # persistencia local (fase 2)
training/             # entrenamiento de modelos, fuera del bundle
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
```
