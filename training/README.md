# SpineMetrics — entrenamiento del modelo

Andamiaje Python para entrenar el modelo de segmentación vertebral de la
Etapa 3 del pipeline automático (SPEC.md §8, §12). **Vive fuera del bundle
de la aplicación** — `src/pipeline/` no importa nada de aquí; la única
frontera entre ambos es el archivo `.onnx` exportado y su
`modelVersion`.

**Estado actual: sólo andamiaje.** No incluye un modelo entrenado ni
integra detección automática en la app (`src/pipeline/`). Sirve para que,
cuando exista un dataset real etiquetado, el entrenamiento se pueda
ejecutar sin construir nada más. Ver `docs/OPEN_QUESTIONS.md` y el estado
de fases en el `README.md` raíz.

## Por qué existe

SPEC.md §8 exige, para la Etapa 3 (segmentación vertebral automática), un
modelo entrenado (U-Net/nnU-Net o Mask R-CNN) exportado a ONNX. Ese modelo
no se puede producir sin datos reales de radiografías etiquetadas, que no
existen en este repositorio. En vez de fabricar o estimar resultados de
detección automática (violaría la regla de SPEC.md de no inventar valores
cuando faltan datos), este directorio prepara todo lo que sí se puede
construir sin el dataset: carga de datos, preprocesado, arquitectura del
modelo, bucle de entrenamiento y exportación a ONNX — todo probado con
datos sintéticos.

## Instalación

Requiere Python 3.11+ y [`uv`](https://docs.astral.sh/uv/).

```bash
cd training
uv venv
uv pip install -e ".[dev]"
```

## Ejecutar las pruebas

```bash
.venv/bin/python -m pytest -q
```

## El bucle de mejora (SPEC.md §1, §12)

Cada corrección manual de un landmark en la aplicación marca ese landmark
`edited: true`. El botón "Exportar JSON" de la app (`src/storage/jsonExport.ts`)
serializa el estudio completo — imagen ya anonimizada según §11, landmarks,
mediciones — en un único archivo `.json`. Ese export es la unidad de dato
de entrenamiento: `schema.trustworthy_vertebrae()` sólo conserva vértebras
de mediciones `manual` o de mediciones `auto-edited` cuyo landmark fue
corregido a mano — nunca vértebras puramente automáticas sin revisar, para
no retroalimentar el modelo con sus propios errores no corregidos.

## Construir un dataset

Un directorio de dataset es una carpeta plana de pares `<nombre>.json` +
`<nombre>.<ext>` (`.dcm`, `.png`, `.jpg`, `.jpeg`, `.tif`, `.tiff`), donde
el `.json` es un export de la aplicación y la imagen es el archivo
original que se cargó para ese estudio:

```
dataset/
  paciente_001.json
  paciente_001.dcm
  paciente_002.json
  paciente_002.png
  ...
```

`schema.discover_dataset(directory)` empareja por nombre de archivo (sin
extensión) y lanza `FileNotFoundError` si un `.json` no tiene imagen
correspondiente. Cada estudio exportado debe tener exactamente una
radiografía activa (limitación actual de `dataset.VertebraSegmentationDataset`,
que reflejará el export de la app mientras la Fase 3 no soporte múltiples
radiografías por estudio en un mismo archivo).

## Entrenar

```bash
.venv/bin/python -m spinemetrics_training.train \
    --data-dir ./dataset --output-dir ./runs/exp1 --epochs 50
```

Produce en `--output-dir`:
- `config.json` — hiperparámetros usados.
- `best.pt` — checkpoint del mejor epoch (por `val_loss`, o `train_loss`
  si el dataset es demasiado pequeño para separar validación).
- `history.json` — pérdida de entrenamiento/validación por epoch.

Pérdida: entropía cruzada binaria + Dice suave por canal
(`train.combined_loss`), apropiada para el fuerte desequilibrio de clases
de una máscara de segmentación (la mayoría de píxeles son fondo).

## Exportar a ONNX

```bash
.venv/bin/python -m spinemetrics_training.export_onnx \
    --checkpoint ./runs/exp1/best.pt --output ./runs/exp1/model.onnx
```

Genera `model.onnx` (ejes de lote/alto/ancho dinámicos, para aceptar
cualquier tamaño de imagen tras el preprocesado de Etapa 2) y un sidecar
`model.onnx.metadata.json` con `modelVersion` (hash SHA-256 del checkpoint,
truncado a 12 caracteres), fecha de exportación, niveles espinales
soportados y tamaño de entrada usado para trazar el grafo. Ese
`modelVersion` es el valor que la futura integración en `src/pipeline/`
debería copiar a `MeasurementSet.modelVersion` (`src/core/models/types.ts`)
en cada medición automática, para que el rendimiento del modelo sea
siempre atribuible a una versión concreta (SPEC.md §12).

## Módulos

| Módulo | Responsabilidad |
| --- | --- |
| `schema.py` | Parsear el export JSON de la app; filtrar vértebras de confianza (`trustworthy_vertebrae`); emparejar json+imagen (`discover_dataset`). |
| `masks.py` | Rasterizar polígonos de vértebra a máscaras binarias, un canal por nivel espinal (evita segmentación de instancias post-hoc). |
| `preprocess.py` | Normalización de intensidad, CLAHE, detección heurística de ROI, recorte+remuestreo con `AffineTransform` que se puede invertir para volver al espacio original. |
| `corners.py` | De una máscara de vértebra a sus 4 esquinas (rect de área mínima + refinamiento por gradiente) — Etapa 3 del pipeline. |
| `model.py` | `VertebraSegmentationUNet`: U-Net (Ronneberger et al. 2015) con un canal de salida por nivel espinal. |
| `dataset.py` | `torch.utils.data.Dataset` que junta todo lo anterior en pares (imagen, máscara) listos para entrenar. |
| `train.py` | Bucle de entrenamiento, checkpointing, CLI. |
| `export_onnx.py` | Exportación a ONNX + sidecar de metadatos, CLI. |

## Limitaciones conocidas (documentadas, no resueltas)

- `preprocess.detect_spine_roi` es un heurístico de referencia (varianza de
  columna), no el detector de ROI final — ese exigiría su propio modelo
  entrenado. Está aquí para poder ejercitar y probar de extremo a extremo
  el recorte+remuestreo con transformación afín.
- `VertebraSegmentationDataset` exige exactamente 1 radiografía por
  estudio exportado.
- No hay augmentation de datos (flips, rotaciones leves, ruido) — cuando
  exista un dataset real, probablemente haga falta antes de un
  entrenamiento serio.
- No hay aún ningún checkpoint entrenado sobre datos reales, ni
  integración de inferencia en `src/pipeline/`. Ese es el siguiente paso
  una vez exista un dataset etiquetado suficiente.
