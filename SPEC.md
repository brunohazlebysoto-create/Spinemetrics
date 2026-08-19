# SPEC.md — SpineMetrics
## Aplicación de análisis automático y clasificación de radiografías de columna con escoliosis

> **Cómo usar este archivo.** Guárdalo en la raíz del repositorio junto con `docs/OPEN_QUESTIONS.md`. En Claude Code:
> `Lee SPEC.md completo y docs/OPEN_QUESTIONS.md. Ejecuta la Fase 1. No avances a la Fase 2 hasta que los tests de la Fase 1 estén en verde.`
>
> Este documento es la única fuente de verdad del proyecto. Sustituye a cualquier versión previa.

---

## 0. CONTEXTO Y PRINCIPIO DE DISEÑO

Actúa como ingeniero de software senior especializado en imagen médica. Vas a construir **SpineMetrics**, una aplicación local de análisis morfométrico de radiografías de columna en escoliosis pediátrica, del adolescente y del adulto.

**Usuario:** cirujano/residente de ortopedia y traumatología infantil.

**Principio de diseño rector — es una ayuda, no un examen.**
El usuario carga una radiografía y la aplicación hace **todo el trabajo**: detecta las vértebras, traza las líneas, calcula los ángulos y balances, y clasifica. El resultado se muestra de inmediato, completo y sin pedir nada a cambio. Si algo salió torcido, el usuario arrastra un punto y todo se recalcula en vivo.

**Criterio de interfaz que arbitra cualquier duda de diseño:** *el camino entre cargar una radiografía y ver el Cobb clasificado debe ser de cero clics.* Cualquier confirmación, advertencia o bloqueo que se interponga en ese camino tiene que justificarse por sí mismo; si su única función es procedimental, va fuera.

**Lo único que la aplicación no debe hacer nunca:** entregar un número seguro de sí mismo cuando no lo está. Un parámetro en ámbar que hace mirar la imagen dos segundos es mejor que uno en verde que está mal, y un hueco explicado es mejor que un valor inventado.

**Estatus:** herramienta de apoyo a la medición para uso propio y de investigación. No es un dispositivo médico certificado. Este descargo aparece en los informes exportados, no como banner permanente en pantalla.

---

## 1. ADVERTENCIA DE INGENIERÍA — LEER ANTES DE ESCRIBIR CÓDIGO

La detección automática de landmarks vertebrales en radiografía es la parte más difícil y de mayor riesgo del proyecto. Conviene saberlo desde el día uno:

- **El motor de geometría y clasificación es determinista y se puede dejar prácticamente perfecto.** El punto débil no son las matemáticas, son los puntos de entrada.
- **Un modelo entrenado con datos públicos rendirá peor en radiografías reales de un servicio concreto** que en su conjunto de test. La literatura reporta un error absoluto medio en el Cobb de ~3° (mejor con enfoques de segmentación, ~2.4°, que con regresión directa de landmarks, ~3.3°), pero eso es dentro del mismo dominio de imagen.
- **Casos que romperán el automático:** instrumentación previa, corsé puesto, obesidad, curvas >90°, escoliosis congénita con hemivértebras (falla la numeración de niveles), placas recortadas sin S1 o sin cabezas femorales, y laterales con hombros superpuestos sobre la columna torácica alta.
- **Por eso el orden de construcción invierte la intuición:** primero el motor de geometría y la anotación manual (que es además el mecanismo con el que se corrigen los landmarks del automático), y sólo después el modelo de detección. Sin motor verificado no hay forma de saber si el automático acierta.
- **Bucle de mejora:** cada corrección manual de un landmark genera un dato etiquetado. La aplicación debe guardarlas en formato reutilizable como dataset para afinar el modelo sobre el dominio real del usuario (ver §12).

---

## 2. REQUISITOS FUNCIONALES

1. **Cargar** DICOM (`.dcm`, incluida serie multiframe) y PNG/JPEG/TIFF.
2. **Analizar automáticamente** al importar, sin intervención.
3. **Mostrar** líneas trazadas, mediciones y clasificación de inmediato.
4. **Corregir** cualquier landmark arrastrándolo, con recálculo en vivo.
5. **Comparar** estudios seriados del mismo paciente y marcar progresión real.
6. **Exportar** informe (PDF y DOCX), imagen anotada (PNG) y datos estructurados (JSON/CSV).
7. **Funcionar 100 % en local**, sin enviar imágenes ni datos identificables a ningún servidor.

---

## 3. STACK TÉCNICO

**Frontend / aplicación:**
- React 18 + TypeScript (modo `strict`) + Vite.
- Visor DICOM: `@cornerstonejs/core` + `@cornerstonejs/dicom-image-loader` (window/level, VOI LUT, pixel spacing).
- Capa de anotación: `react-konva`, con capas separadas: imagen / landmarks / líneas derivadas / etiquetas.
- Estado: Zustand.
- Persistencia local: IndexedDB (Dexie.js); import/export vía File System Access API.
- Informes: `pdf-lib` o `jspdf` (PDF) y `docx` (Word).
- Tests: Vitest.
- Empaquetado de escritorio opcional: Tauri.

**Inferencia del modelo:** ONNX Runtime Web con WebGPU/WASM, ejecutando en un Web Worker. Mantiene la aplicación sin backend y garantiza que la imagen nunca sale del dispositivo.

**Entrenamiento del modelo (fuera de la app):** Python, PyTorch, `pydicom`, `numpy`, `opencv-python`, exportando a ONNX. Vive en `training/`, no en el bundle de la aplicación.

---

## 4. ARQUITECTURA

```
src/
  core/
    geometry/        # primitivas puras: Point, Line, angleBetween, signedDistance
    measurements/    # cobb.ts, sagittal.ts, pelvic.ts, balance.ts, rotation.ts, mehta.ts, flexibility.ts
    classification/  # lenke.ts, king.ts, pumc.ts, srsSchwab.ts, ceos.ts, congenital.ts,
                     # neuromuscular.ts, roussouly.ts, lenkeSilva.ts
    models/          # tipos de dominio
    calibration/     # px→mm, magnificación
    config/
      conventions.ts # TODAS las decisiones de OPEN_QUESTIONS.md, configurables
  pipeline/          # detección automática: preproceso, inferencia, etiquetado de niveles, QC
  imaging/           # carga DICOM, anonimización, window/level
  ui/
    Viewer/          # canvas, herramientas, atajos
    Panels/          # mediciones, clasificación, trazabilidad
    Reports/
  storage/
  tests/
training/            # scripts de entrenamiento y exportación a ONNX (fuera del bundle)
docs/
  OPEN_QUESTIONS.md
  REFERENCES.md
```

**Reglas de arquitectura no negociables:**
- `core/` no importa nada de `ui/`, `imaging/` ni `pipeline/`. Toda función de `core/measurements` y `core/classification` es **pura**: recibe entrada, devuelve `{ value, unit, trace, warnings }`.
- **Los landmarks automáticos y los manuales atraviesan exactamente el mismo motor de cálculo y clasificación.** Ninguna ruta de código alternativa. La única diferencia es el campo `source`.

---

## 5. MODELO DE DATOS

```ts
type Pt = { x: number; y: number };   // píxeles de la imagen original

interface VertebraAnnotation {
  level: SpinalLevel;                 // 'C7' | 'T1'...'T12' | 'L1'...'L5' | 'S1'
  superiorEndplate: [Pt, Pt];         // izquierda, derecha
  inferiorEndplate: [Pt, Pt];
  lateralBorders?: [Pt, Pt];          // para el modificador lumbar de Lenke
  pedicles?: { left: Pt; right: Pt };
  centroid?: Pt;
  posteriorSuperiorCorner?: Pt;       // requerido en S1 para el SVA
  confidence?: number;                // 0–1, sólo en landmarks automáticos
  edited?: boolean;                   // true si el usuario lo corrigió
}

interface PelvicAnnotation {
  femoralHeads: { left: { center: Pt; radius: number }; right: { center: Pt; radius: number } };
  s1Endplate: [Pt, Pt];
  iliacCrests?: { left: Pt; right: Pt };
}

interface RibAnnotation {             // RVAD de Mehta
  level: SpinalLevel;                 // vértebra apical
  concave: { headMid: Pt; neckMid: Pt };
  convex:  { headMid: Pt; neckMid: Pt };
}

interface Radiograph {
  id: string;
  view: 'PA_standing' | 'LAT_standing' | 'PA_supine'
      | 'BEND_left' | 'BEND_right' | 'FULCRUM' | 'TRACTION' | 'HAND' | 'PELVIS';
  pixelSpacing?: [number, number];
  calibration?: { pxPerMm: number; method: 'dicom' | 'ruler' | 'sphere'; magnification?: number };
  annotations: { vertebrae: VertebraAnnotation[]; pelvis?: PelvicAnnotation; ribs?: RibAnnotation[] };
}

interface MeasurementSet {
  source: 'auto' | 'manual' | 'auto-edited';
  modelVersion?: string;              // trazabilidad del modelo usado
  measurements: Record<string, MeasurementResult>;
  classifications: Record<string, ClassificationResult>;
  qc: QualityControlReport;
  createdAt: string;
}

interface MeasurementResult {
  value: number | null;
  unit: 'deg' | 'mm' | 'ratio' | 'ordinal';
  uncertainty?: number;               // ± propagado desde la confianza de los landmarks
  status: 'ok' | 'warning' | 'unavailable';
  reason?: string;                    // motivo legible si status ≠ ok
  trace: TraceStep[];
}

interface Study {
  patientRef: string;                 // seudónimo local
  date: string;
  ageYears: number;
  radiographs: Radiograph[];
  measurementSets: MeasurementSet[];
  indexStudyId?: string;              // estudio índice para el seguimiento
  maturity?: { risser?: 0|1|2|3|4|5; risserSystem?: 'US'|'FR'; sanders?: 1|2|3|4|5|6|7|8;
               triradiateOpen?: boolean; boneAgeYears?: number };
  clinical?: { etiology?: 'idiopathic'|'congenital'|'neuromuscular'|'syndromic';
               gmfcs?: 1|2|3|4|5; scoliometerATR?: number; instrumented?: boolean };
}
```

**Convención de signos (documentar en `core/geometry/README.md` y cubrir con tests):** coronal positivo = **derecha del paciente**; sagital positivo = **anterior**; cifosis positiva y lordosis negativa internamente, presentadas como valores absolutos en la interfaz. Si la aplicación detecta conflicto de lateralidad entre los marcadores DICOM y la orientación de la imagen, **se detiene y pregunta** en vez de asumir.

---

## 6. CALIBRACIÓN

- **DICOM:** usar `PixelSpacing`; si falta, `ImagerPixelSpacing` con corrección de magnificación mediante `DistanceSourceToDetector` y `DistanceSourceToPatient`. Si esos tags no están, **no corregir** y marcar las distancias como `uncorrectedMagnification`. Nunca asumir un factor fijo.
- **Sin metadatos:** el usuario traza una línea sobre un objeto de longitud conocida e introduce el valor en mm.
- **Los ángulos no requieren calibración; las distancias sí.** Sin calibración válida, las medidas lineales salen en gris con el motivo, y los ángulos se calculan y muestran con normalidad.

---

## 7. MOTOR DE MEDICIONES

### 7.1 Primitivas
```
angleBetweenLines(l1, l2):
  v1 = l1.p2 - l1.p1;  v2 = l2.p2 - l2.p1
  ang = |atan2(cross(v1,v2), dot(v1,v2))| en grados; devolver el agudo si > 90°
signedDistanceToVerticalLine(p, xLine) = p.x - xLine    // + = derecha del paciente
```

### 7.2 Ángulo de Cobb
- Ángulo entre la línea del platillo superior de la vértebra terminal craneal y la del platillo inferior de la vértebra terminal caudal.
- **Selección automática de vértebras terminales:** calcular la inclinación de cada platillo respecto a la horizontal y elegir las que delimitan el cambio de signo con inclinación máxima. El usuario puede cambiarlas con la tecla `E`.
- **Seguimiento:** en estudios sucesivos del mismo paciente, **reutilizar automáticamente las vértebras terminales del estudio índice**. Sin esto, buena parte de la "progresión" medida es ruido de selección. Es automático y no requiere nada del usuario.
- **Progresión:** cambio estrictamente mayor de 5°. Escoliosis = Cobb ≥10°.
- Salida: grados, vértebras terminales, vértebra apical, lado de la convexidad.

### 7.3 Regiones de curva (base de Lenke)
- **Torácica proximal (PT):** ápex entre T3 y T5.
- **Torácica principal (MT):** ápex entre T6 y el disco T11-T12.
- **Toracolumbar/lumbar (TL/L):** ápex entre T12-L1 (TL) y L1-L4 (L).
- **Curva mayor** = la de mayor Cobb, siempre estructural.

### 7.4 Líneas y balance coronal
- **CSVL:** vertical desde el punto medio del platillo superior de S1.
- **Plomada de C7 (C7PL):** vertical desde el centroide de C7.
- **Balance coronal** = distancia horizontal con signo entre C7PL y CSVL (mm).
- **Translación apical** = distancia horizontal del centroide apical a la CSVL (mm).
- **Vértebra estable** = la más bisectada por la CSVL (empate → la más caudal). **Vértebra neutra** = la de menor asimetría pedicular.

### 7.5 Parámetros sagitales
- **Cifosis torácica (TK):** T5 platillo superior → T12 platillo inferior. Normal ~10–40°.
- **Lordosis lumbar (LL):** L1 platillo superior → S1 platillo superior.
- **SVA:** distancia horizontal de la plomada de C7 al ángulo posterosuperior de S1. Normal <40–50 mm.
- **Pendiente de T1:** ángulo del platillo superior de T1 con la horizontal.
- **TPA:** ángulo entre la línea eje femoral→centroide de T1 y la línea eje femoral→punto medio del platillo de S1.

### 7.6 Parámetros pélvicos
Sea `M` = punto medio del platillo superior de S1, `F` = punto medio entre los centros de las cabezas femorales.
- **SS:** ángulo entre el platillo de S1 y la horizontal.
- **PT:** ángulo entre la línea `F→M` y la vertical.
- **PI:** ángulo entre la línea `F→M` y la perpendicular al platillo de S1 en `M`.
- **Verificación automática:** `|PI − (PT + SS)| ≤ 1°`. Si falla, los parámetros pélvicos salen en gris con el motivo (landmarks pélvicos poco fiables) en vez de mostrarse erróneos.
- **PI-LL mismatch** = PI − LL; objetivo terapéutico ≤10°.
- **Referencia:** PI media en adultos ≈53° (DE 10; rango ~33–85°). En <18 años se muestra el valor **sin banda de normalidad**, porque la PI aumenta durante el crecimiento.

### 7.7 Oblicuidad pélvica
Método de **Osebold** por defecto (línea de crestas ilíacas respecto a la horizontal). Método seleccionable e impreso en el informe: no son intercambiables.

### 7.8 Rotación vertebral
- **Perdriolle / Raimondi:** herramienta digital — bordes laterales del cuerpo apical y centro del pedículo convexo; se calcula el desplazamiento relativo `d/w` y se mapea a grados por la tabla de Perdriolle, **redondeando a 5°** (una precisión mayor sería falsa: el error individual del método alcanza ~6°).
- **Nash-Moe:** registro ordinal 0–IV, entrada manual. **Nunca se convierte a grados ni entra en ningún cálculo** — su error interobservador llega a ~9°.
- **sterEOS:** permitir importar el valor si el centro dispone de EOS, etiquetado como fuente externa (precisión ~1–2°).

### 7.9 RVAD de Mehta (inicio precoz)
- **RVA** de cada lado = ángulo entre la perpendicular al **platillo inferior** de la vértebra apical y la línea que une el punto medio de la cabeza costal con el punto medio del cuello costal.
- **RVAD** = RVA cóncavo − RVA convexo. **>20° predice progresión.**
- **Fase costal:** I = sin solapamiento de la cabeza costal sobre el cuerpo apical; II = con solapamiento (progresiva). Entrada visual del usuario.
- Alta sensibilidad a la colocación: exigir zoom ≥400 % para estos puntos.

### 7.10 Flexibilidad
- **Curva menor estructural:** no corrige por debajo de **25°** en inclinación lateral supina.
- **Índice de flexibilidad** = (Cobb de pie − Cobb en bending/fulcrum) / Cobb de pie × 100.
- **FBCI** = (tasa de corrección quirúrgica / flexibilidad en fulcrum) × 100.
- Emparejar automáticamente la placa de bipedestación con sus bendings del mismo estudio.

### 7.11 Madurez y crecimiento
- **Risser 0–5** con selector **obligatorio** del sistema (americano o francés): no son equivalentes y el campo no puede guardarse sin él.
- **Sanders (SSMS) 1–8** sobre radiografía de mano, con guía visual integrada. Prioridad visual sobre el Risser: es el que mejor correlaciona con la fase de aceleración de la curva.
- **Cartílago trirradiado** abierto/cerrado.
- **Crecimiento torácico:** altura T1–T12, T1–S1 y **SAL** (razón entre altura hemitorácica cóncava y convexa), con gráfico de evolución.

---

## 8. PIPELINE AUTOMÁTICO

Se dispara **al importar**, sin que el usuario pulse nada. Corre en un Web Worker.

**Etapa 0 — Ingesta y anonimización.** La anonimización ocurre antes de cualquier procesamiento (ver §11).

**Etapa 1 — Clasificación de la proyección.** PA de pie, lateral, bending, fulcrum, tracción, mano o pelvis. Primero por metadatos DICOM (`ViewPosition`, `SeriesDescription`); si faltan, clasificador de imagen ligero. Si la confianza es <0.9, preguntar: clasificar mal la proyección invalida todo lo posterior.

**Etapa 2 — Preprocesado.** Normalización de intensidad, CLAHE para realzar bordes corticales, detección de la ROI de la columna, remuestreo a la resolución de entrada del modelo. **Conservar la transformación afín**: todas las mediciones se calculan en el espacio de la imagen original, nunca en el remuestreado.

**Etapa 3 — Segmentación vertebral.** Usar **segmentación de instancias, no regresión directa de landmarks** (U-Net/nnU-Net o Mask R-CNN): es más robusto y rinde mejor en la literatura. De cada máscara se extraen las 4 esquinas mediante el rectángulo de área mínima, refinando cada esquina con el gradiente local. La máscara aporta además centroide y bordes laterales (necesarios para el modificador lumbar de Lenke).

**Etapa 4 — Etiquetado de niveles.** Contar desde S1 hacia craneal, anclando en el platillo sacro. Verificar con la altura vertebral esperada. Es la etapa que más falla en escoliosis congénita: si el recuento no cuadra, marcar `levelLabelingUncertain` y pedir confirmación de los niveles ancla, sin adivinar.

**Etapa 5 — Landmarks pélvicos.** Cabezas femorales por Hough circular con refinamiento por ajuste de círculo, o modelo de keypoints. Platillo y ángulo posterosuperior de S1 desde la segmentación sacra.

**Etapa 6 — Vista lateral.** Modelo separado para las esquinas en sagital. Rendimiento esperable inferior por la superposición costal y de hombros.

**Etapa 7 — Cálculo y clasificación.** Los landmarks pasan al motor de §7 y §9, sin ruta de código alternativa.

**Etapa 8 — Control de calidad.** Ver §8.1.

### 8.1 Control de calidad automático

| Comprobación | Acción |
|---|---|
| Confianza de segmentación de una vértebra <0.7 | Marcarla no fiable; excluirla de la selección de vértebras terminales |
| Vértebras no ordenadas monotónicamente | Abortar el etiquetado de niveles |
| Altura vertebral fuera de ±40 % de la mediana de sus vecinas | Marcar posible colapso o mala segmentación |
| Número de cuerpos ≠ el esperado | `levelLabelingUncertain`, pedir confirmación |
| `PI ≠ PT + SS` (>1°) | Parámetros pélvicos en gris |
| Centros femorales separados >15 mm (lateral) | Advertir de rotación del paciente; degradar confianza sagital |
| S1 o cabezas femorales fuera del campo | SVA, PI, PT, SS y TPA en gris con el motivo |
| Sin calibración | Distancias en gris; ángulos válidos |

**Semáforo por parámetro:** verde (calculado y verificado), ámbar (calculado con advertencias), gris (no calculable, con el motivo en una línea). **Prohibido rellenar un hueco con un valor estimado.**

Cada medición automática se acompaña de un **margen de incertidumbre** propagado desde la confianza de los landmarks: `Cobb T6–T11: 42° ±4°`. Un número desnudo comunica una precisión que la medición radiográfica no tiene, ni automática ni manual.

---

## 9. MOTOR DE CLASIFICACIÓN

Cada clasificador devuelve `{ result, confidence, trace[], unmetInputs[] }`. Si falta un dato, **no adivinar**: devolver `unmetInputs` y ofrecer al usuario completarlo manualmente. La clasificación se muestra igualmente cuando es calculable, con una nota discreta sobre lo que falta — **sin bloqueos ni advertencias en rojo**.

### 9.1 Lenke (AIS) — clasificador principal
**Paso 1:** medir PT, MT y TL/L en bipedestación.
**Paso 2:** curva mayor = la de mayor Cobb, siempre estructural.
**Paso 3 — estructuralidad de las curvas menores:**

| Región | Criterio coronal | Criterio sagital |
|---|---|---|
| PT | bending ≥25° | cifosis T2–T5 ≥ +20° |
| MT | bending ≥25° | cifosis T10–L2 ≥ +20° |
| TL/L | bending ≥25° | cifosis T10–L2 ≥ +20° |

**Paso 4 — tipo de curva:**

| Tipo | PT | MT | TL/L | Descripción |
|---|---|---|---|---|
| 1 | no estructural | **mayor** | no estructural | Torácica principal |
| 2 | estructural | **mayor** | no estructural | Doble torácica |
| 3 | no estructural | **mayor** | estructural | Doble mayor |
| 4 | estructural | mayor o estructural | estructural | Triple mayor |
| 5 | no estructural | no estructural | **mayor** | Toracolumbar/lumbar |
| 6 | no estructural | estructural | **mayor** (≥ MT + 5°) | TL/L – torácica principal |

**Paso 5 — modificador lumbar** (posición de la CSVL respecto al ápex lumbar): **A** entre los pedículos; **B** toca el cuerpo apical entre el borde medial del pedículo y el margen lateral; **C** completamente medial al margen lateral (sin contacto). Los tipos 5 y 6 son por definición **C**.

**Paso 6 — modificador sagital T5–T12:** `−` <10°, `N` 10–40°, `+` >40°.

Salida: p. ej. `Lenke 1B N`, con traza plegada de cada decisión. El informe debe explicitar la utilidad: se fusiona la curva mayor y todas las menores estructurales.

### 9.2 King-Moe
Tipos I–V (I: curva en S con lumbar mayor; II: curva en S con torácica mayor o más rígida; III: torácica sin lumbar estructural; IV: torácica larga; V: doble torácica). Mostrar con nota de que se incluye por valor histórico y comunicacional: sólo coronal, sólo torácicas, fiabilidad interobservador pobre-regular.

### 9.3 PUMC
Por número de ápices. **I** (única): Ia torácica, Ib toracolumbar, Ic lumbar. **II** (doble): IIa doble torácica; IIb torácica ≥10° mayor que TL/L; IIc diferencia <10°; IId TL/L ≥10° mayor que torácica. **III** (triple): IIIa, IIIb. Marcar caso limítrofe cuando la diferencia esté entre 8 y 12°: son los subtipos con peor concordancia.

### 9.4 SRS-Schwab (adulto)
**Descriptor coronal:** `T` (ápex T9 o superior), `L` (ápex T10 o inferior), `D` (doble, ambas ≥30°), `N` (ninguna >30°).

| Modificador | 0 | + | ++ |
|---|---|---|---|
| PI-LL | <10° | 10–20° | >20° |
| SVA | <4 cm | 4–9.5 cm | >9.5 cm |
| PT | <20° | 20–30° | >30° |

Salida: p. ej. `L, PI-LL +, SVA 0, PT +`.

### 9.5 C-EOS (inicio precoz, <10 años)
Prefijo de edad; etiología `C`/`M`/`S`/`I`; curva mayor `1` <20°, `2` 20–50°, `3` 51–90°, `4` >90°; cifosis máxima `−` <20°, `N` 20–50°, `+` >50°; modificador de progresión opcional `P0` <10°/año, `P1` 10–19°/año, `P2` ≥20°/año, calculado a partir de dos estudios fechados. Salida: p. ej. `5 M3+P1`. Nota: la reproducibilidad del modificador de cifosis y de progresión es inferior a la del ángulo mayor.

### 9.6 Congénita — Winter/McMaster
**I fallo de formación:** parcial (vértebra en cuña) o completo (hemivértebra: completamente segmentada / semisegmentada / no segmentada o incarcerada). **II fallo de segmentación:** unilateral (barra no segmentada) o bilateral (vértebra en bloque). **III mixto.**

**Alerta destacada obligatoria:** si se registra **barra unilateral no segmentada con hemivértebra contralateral**, avisar de que es el patrón de progresión más rápida y suele requerir artrodesis profiláctica precoz. Esta es la única alerta prominente que la aplicación debe mostrar en pantalla.

### 9.7 Neuromuscular
**Etiología SRS:** neuropática (neurona motora superior: parálisis cerebral, degeneración espinocerebelosa, siringomielia, lesión medular; neurona motora inferior: poliomielitis, atrofia muscular espinal, mielomeningocele) o miopática (artrogriposis, distrofias musculares, distrofia miotónica, hipotonía congénita).
**Lonstein-Akbarnia:** Grupo I tronco compensado (IA doble curva balanceada; IB torácica mayor con lumbar fraccional pequeña); Grupo II tronco descompensado con oblicuidad pélvica.
**GMFCS I–V** como modificador: los niveles IV–V concentran la mayor gravedad; la oblicuidad pélvica significativa es indicación clave de extender la fusión a la pelvis.

### 9.8 Roussouly
Tipo 1 y 2 con SS <35° (1 con lordosis corta e hiperlordótica y cifosis toracolumbar; 2 espalda plana); Tipo 3 con SS 35–45°; Tipo 4 con SS >45° y PI alta; Tipo 3-AP con pelvis antevertida. **Marcar siempre como orientativo:** los cortes no están fijados de forma uniforme en la literatura.

### 9.9 Lenke-Silva (degenerativa del adulto)
Seis niveles crecientes de tratamiento (I descompresión sola → VI osteotomías), según osteofitos anteriores, subluxación >2 mm, magnitud de la curva (~30°/45°), cifosis lumbar, desbalance global y corrección <30 % en bending. **Árbol de decisión guiado con casillas**, no cálculo automático.

### 9.10 Osteotomías (Schwab-Lenke) — referencia de consulta
Grados 1–6: 1 resección facetaria parcial (Smith-Petersen) → 2 Ponte → 3 PSO → 4 PSO extendida → 5 VCR de un nivel → 6 resección multinivel. **Modificador de abordaje** `P` (posterior) o `A/P`.
**Aviso en código y UI:** este modificador es de **abordaje**; no confundirlo con los modificadores de la clasificación SRS-Schwab del adulto (§9.4).

---

## 10. INTERFAZ

### 10.1 Flujo
Importar → el análisis corre solo → se muestra todo: imagen con líneas, panel de mediciones agrupado (Coronal / Sagital / Pélvico / Rotación / Crecimiento) y panel de clasificación. **Cero clics hasta el resultado.**

### 10.2 Corrección en vivo
Cualquier landmark es arrastrable directamente. Al moverlo se recalculan líneas, ángulos, balances y clasificación **en tiempo real**. Sin modo de edición que activar, sin guardar, sin confirmar. El landmark corregido se marca `edited: true` (para el bucle de mejora del §12), de forma invisible para el usuario.

Atajos: `E` ciclar vértebra terminal, `R` recalcular desde cero, `Espacio` ocultar/mostrar overlays, flechas mover 1 px, `Shift`+flechas 0.1 px, `Ctrl+Z` deshacer ilimitado, `?` panel de ayuda.

Herramientas del visor: zoom hasta 800 %, pan, **lupa al colocar puntos** (crítico para la precisión del platillo), window/level, inversión de escala de grises, capas conmutables.

### 10.3 Presentación de los resultados
- Valores con su margen (`42° ±4°`).
- Semáforo verde/ámbar/gris según §8.1, con el motivo en una línea cuando es gris.
- Indicadores de caso limítrofe (`borderlineBC`, `type3vs6Borderline`, etc.) como icono discreto desplegable, no como advertencia.
- Traza de decisión completa disponible pero **plegada** por defecto.
- Si faltan bendings: nota discreta bajo la clasificación (`sin radiografías en inclinación: estructuralidad estimada`) más un conmutador para marcar manualmente qué curvas son estructurales.

### 10.4 Seguimiento seriado
Comparación con el estudio previo del mismo paciente: tabla de deltas y gráfico de evolución del Cobb con la banda de ±5° sombreada. Vértebras terminales heredadas del estudio índice automáticamente.

### 10.5 Comparación con la medición propia (opcional)
Botón discreto **"Medir yo también"**: oculta los overlays para hacer una medición propia sobre la imagen limpia y, al terminar, muestra una tabla de tres columnas (propia / automática / diferencia).

Es una función más, no el eje de la aplicación: no excluye casos, no marca nada de forma irreversible, no impone intervalos entre mediciones y no pasa nada si se consulta el automático a mitad de camino. Un panel aparte de "Investigación" acumula estadística agregada (Bland-Altman, ICC, kappa por clasificación) sólo de los casos donde se haya usado esta función. Si nunca se usa, la aplicación funciona igual.

---

## 11. PRIVACIDAD

- **Procesamiento exclusivamente local.** Ninguna imagen ni dato de paciente sale del dispositivo. Sin telemetría. Sin llamadas de red en el camino crítico.
- **Anonimización DICOM en la importación:** eliminar por defecto `PatientName`, `PatientID`, `PatientBirthDate`, `AccessionNumber`, `InstitutionName`, `ReferringPhysicianName`, `StudyID` y todos los tags privados, sustituyendo por un seudónimo local. Modo "conservar identificadores" desactivado por defecto y con aviso explícito.
- **Exportación:** si `BurnedInAnnotation` = YES, advertir de que puede haber datos identificables quemados en el píxel.
- Almacenamiento local cifrado si el entorno lo permite; opción de borrado completo.

---

## 12. INFORMES Y DATASET

### Informe exportado (PDF / DOCX / JSON)
1. Identificación seudonimizada, edad, fecha, proyecciones analizadas.
2. Mediciones en tabla: parámetro / valor / referencia normal / observación.
3. Clasificaciones con nomenclatura completa y traza resumida.
4. Imagen anotada.
5. Comparación seriada si existe estudio previo, con la banda de ±5°.
6. Madurez esquelética (Risser **con su sistema**, Sanders, cartílago trirradiado).
7. Apéndice de convenciones usadas (los puntos marcados con ★ en `OPEN_QUESTIONS.md`).
8. Descargo de responsabilidad y marca de tiempo.

El JSON debe bastar para reconstruir todas las anotaciones.

### Dataset para afinado del modelo
Exportar los landmarks corregidos por el usuario (`edited: true`) y las mediciones manuales en formato de dataset: imagen anonimizada + coordenadas + niveles. Registrar `modelVersion` en cada `MeasurementSet` automático para que las métricas de rendimiento sean siempre atribuibles a una versión concreta.

---

## 13. TESTS

1. **Geometría con fixtures sintéticas:** vértebras virtuales con ángulos conocidos (platillos a 15° y −20° → Cobb = 35°), exactitud <0.1°. Casos límite: platillos horizontales, convexidad izquierda y derecha, ángulos >90°, imágenes espejadas.
2. **Coherencia pélvica:** pelvis sintéticas verificando `PI = PT + SS`.
3. **Clasificador de Lenke:** al menos 12 casos cubriendo los 6 tipos, los 3 modificadores lumbares y los 3 sagitales, **incluidos los valores limítrofes exactos** (bending 25.0°, cifosis 20.0°, T5-T12 = 10.0° y 40.0°).
4. **Resto de clasificadores** con casos límite en cada umbral (SRS-Schwab 10/20°, 4/9.5 cm, 20/30°; C-EOS 20/50/90° y 20/50°).
5. **Calibración:** conversión px→mm con distintos `PixelSpacing` y factores de magnificación.
6. **Anonimización:** ningún tag identificable sobrevive a la importación en modo por defecto.
7. **Transformación afín:** landmarks detectados en el espacio remuestreado y devueltos al original conservan la posición dentro de 0.5 px.
8. **Aceptación clínica:** plantilla para medir 20 radiografías reales y comparar con la medición manual en PACS. Criterio: **ICC >0.90 y diferencia media <3°**.

---

## 14. FASES DE DESARROLLO

**Fase 1 — Motor de geometría y mediciones.** Todo el §7 con sus tests. Sin interfaz. Es el activo del proyecto.

**Fase 2 — Visor, anotación y recálculo en vivo.** Carga DICOM/PNG, calibración, herramientas del §10.2. Al terminar ya hay una herramienta de medición usable.

**Fase 3 — Pipeline automático, vista PA de pie.** Etapas 1–5 y 8 del §8. Aquí la aplicación pasa a ser lo que se pidió: cargar y ver el resultado.

**Fase 4 — Clasificadores.** Lenke primero, luego el resto.

**Fase 5 — Vista lateral y parámetros pélvicos automáticos.** Más difícil por la superposición de hombros y costillas.

**Fase 6 — Informes, seguimiento seriado y panel opcional de comparación.**

Al terminar cada fase: ejecutar la suite completa de tests y detenerse a mostrar un resumen de lo implementado y lo pendiente antes de continuar.

---

## 15. CONSTANTES CLÍNICAS

Centralizar en `src/core/constants.ts`, cada una con comentario de su fuente bibliográfica.

```ts
export const CLINICAL = {
  SCOLIOSIS_THRESHOLD_DEG: 10,
  COBB_MEASUREMENT_ERROR_DEG: 5,
  STRUCTURAL_BENDING_DEG: 25,
  STRUCTURAL_KYPHOSIS_PT_DEG: 20,        // T2–T5
  STRUCTURAL_KYPHOSIS_MT_TL_DEG: 20,     // T10–L2
  LENKE_SAGITTAL: { hypo: 10, hyper: 40 },
  NORMAL_THORACIC_KYPHOSIS: [10, 40],
  NORMAL_SVA_MM: 40,
  PI_MEAN_ADULT: 53, PI_SD_ADULT: 10, PI_RANGE_ADULT: [33, 85],
  PI_LL_TARGET_DEG: 10,
  SCHWAB: { piLl: [10, 20], svaCm: [4, 9.5], ptDeg: [20, 30] },
  CEOS: { curve: [20, 50, 90], kyphosis: [20, 50], progression: [10, 20] },
  MEHTA_RVAD_PROGRESSIVE_DEG: 20,
  SCOLIOMETER_REFERRAL_ATR_DEG: 7,       // umbral original; 5° = mayor sensibilidad
};
```

---

## 16. BIBLIOGRAFÍA (copiar a `docs/REFERENCES.md`)

1. Cobb JR. Outline for the study of scoliosis. Instr Course Lect AAOS. 1948;5:261–275.
2. Nash CL Jr, Moe JH. A study of vertebral rotation. J Bone Joint Surg Am. 1969;51(2):223–229. PMID 5767314.
3. Mehta MH. The rib-vertebra angle in the early diagnosis between resolving and progressive infantile scoliosis. J Bone Joint Surg Br. 1972;54(2):230–243. PMID 5034823.
4. McMaster MJ, Ohtsuka K. The natural history of congenital scoliosis. J Bone Joint Surg Am. 1982;64(8):1128–1147. PMID 7130225.
5. McMaster MJ. Congenital scoliosis caused by a unilateral failure of vertebral segmentation with contralateral hemivertebrae. Spine. 1998;23(9):998–1005. PMID 9589537.
6. King HA, Moe JH, Bradford DS, Winter RB. The selection of fusion levels in thoracic idiopathic scoliosis. J Bone Joint Surg Am. 1983;65(9):1302–1313. PMID 6654943.
7. Lonstein JE, Akbarnia A. Operative treatment of spinal deformities in patients with cerebral palsy or mental retardation. J Bone Joint Surg Am. 1983;65(1):43–55. PMID 6822580.
8. Bunnell WP. An objective criterion for scoliosis screening. J Bone Joint Surg Am. 1984;66(9):1381–1387. PMID 6501335.
9. Cheung KMC, Luk KDK. Prediction of correction of scoliosis with use of the fulcrum bending radiograph. J Bone Joint Surg Am. 1997;79(8):1144–1150. PMID 9278073.
10. Legaye J, Duval-Beaupère G, Hecquet J, Marty C. Pelvic incidence: a fundamental pelvic parameter for three-dimensional regulation of spinal sagittal curves. Eur Spine J. 1998;7(2):99–103. PMID 9629932.
11. Lenke LG, Betz RR, Harms J, et al. Adolescent idiopathic scoliosis: a new classification to determine extent of spinal arthrodesis. J Bone Joint Surg Am. 2001;83(8):1169–1181. PMID 11507125.
12. Roussouly P, Gollogly S, Berthonnaud E, Dimnet J. Classification of the normal variation in the sagittal alignment of the human lumbar spine and pelvis in the standing position. Spine. 2005;30(3):346–353. PMID 15682018.
13. Qiu G, Zhang J, Wang Y, et al. A new operative classification of idiopathic scoliosis: a Peking Union Medical College method. Spine. 2005;30(12):1419–1426.
14. Gstoettner M, Sekyra K, Walochnik N, et al. Inter- and intraobserver reliability assessment of the Cobb angle: manual versus digital measurement tools. Eur Spine J. 2007;16(10):1587–1592. PMID 17549526.
15. Lam GC, Hill DL, Le LH, Raso JV, Lou EH. Vertebral rotation measurement: a summary and comparison of common radiographic and CT methods. Scoliosis. 2008;3:16. PMC2587463. *(acceso abierto)*
16. Sanders JO, Khoury JG, Kishan S, et al. Predicting scoliosis progression from skeletal maturity: a simplified classification during adolescence. J Bone Joint Surg Am. 2008;90(3):540–553.
17. Silva FE, Lenke LG. Adult degenerative scoliosis: evaluation and management. Neurosurg Focus. 2010;28(3):E1. PMID 20192655. *(acceso abierto)*
18. Schwab F, Ungar B, Blondel B, et al. SRS-Schwab adult spinal deformity classification: a validation study. Spine. 2012;37(12):1077–1082. PMID 22045006.
19. Schwab F, Blondel B, Chay E, et al. The Comprehensive Anatomical Spinal Osteotomy Classification. Neurosurgery. 2014;74(1):112–120.
20. Williams BA, Matsumoto H, McCalla DJ, et al. Development and initial validation of the Classification of Early-Onset Scoliosis (C-EOS). J Bone Joint Surg Am. 2014;96(16):1359–1367. PMID 25143496.
21. Boyer L, Shen J, Parent S, Kadoury S, Aubin CE. Accuracy and precision of seven radiography-based measurement methods of vertebral axial rotation in adolescent idiopathic scoliosis. Spine Deform. 2018;6(4):351–357. PMID 29886904.
22. Negrini S, Donzelli S, Aulisa AG, et al. 2016 SOSORT guidelines. Scoliosis Spinal Disord. 2018;13:3. PMID 29435499. *(acceso abierto)*
23. Slattery C, Verma K. Classification in Brief: SRS-Schwab Classification of Adult Spinal Deformity. Clin Orthop Relat Res. 2018;476(9):1890–1894. PMID 29601382.
24. Zhu Y, Yin X, Chen Z, et al. Deep learning in Cobb angle automated measurement on X-rays: a systematic review and meta-analysis. Spine Deform. 2024. PMC11729091. *(acceso abierto)*
25. O'Brien MF, Kuklo TR, Blanke KM, Lenke LG (eds.). Spinal Deformity Study Group Radiographic Measurement Manual. Medtronic Sofamor Danek; 2004/2008. *(acceso abierto en srs.org — **referencia canónica** de definiciones de landmarks: cuando este manual y una fuente secundaria discrepen, gana el manual)*

---

## 17. INSTRUCCIONES DE EJECUCIÓN PARA CLAUDE CODE

1. Inicializa el repositorio con la estructura del §4, `README.md`, `docs/REFERENCES.md`, `docs/OPEN_QUESTIONS.md` y TypeScript en modo `strict`.
2. **Empieza por `core/geometry` y `core/measurements/cobb.ts` con sus tests**, antes de una sola línea de interfaz. No empieces por el modelo de detección: sin motor verificado no hay forma de saber si el automático acierta.
3. Trabaja por fases (§14). Al terminar cada una, ejecuta todos los tests y detente a resumir antes de continuar.
4. Aplica todas las convenciones de `docs/OPEN_QUESTIONS.md`, expuestas en `src/core/config/conventions.ts`. **No resuelvas por tu cuenta ninguna ambigüedad marcada allí.** (La sección H de ese documento, sobre protocolo de concordancia, aplica sólo si se usa la función opcional del §10.5.)
5. Cuando encuentres una ambigüedad nueva no listada, implementa la interpretación más conservadora, márcala con `// AMBIGUO:` y añádela a `OPEN_QUESTIONS.md`.
6. Cada función clínica lleva un comentario de cabecera con la referencia del §16 que la fundamenta.
7. Landmarks automáticos y manuales comparten obligatoriamente el mismo código de cálculo y clasificación. Cualquier duplicación de esa lógica es un error de diseño.
8. Sin dependencias de red, analítica ni servicios en la nube.
9. Prioriza la legibilidad sobre la brevedad: este código será auditado por clínicos, no sólo por ingenieros.
