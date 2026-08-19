"""Entrenamiento del modelo de segmentación vertebral de SpineMetrics.

Vive fuera del bundle de la aplicación (SPEC.md §3: "Entrenamiento del
modelo (fuera de la app): Python, PyTorch, pydicom, numpy, opencv-python,
exportando a ONNX. Vive en `training/`, no en el bundle de la aplicación.").

Ver `training/README.md` para el flujo completo: exportación de estudios
desde la app (`src/storage/jsonExport.ts`) → dataset de entrenamiento →
modelo entrenado → exportación a ONNX → (fase 3, pendiente) inferencia en
`src/pipeline/` vía ONNX Runtime Web.
"""
