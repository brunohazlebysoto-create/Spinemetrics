# OPEN_QUESTIONS.md — Ambigüedades de definición y umbral

> **Propósito.** La literatura de escoliosis contiene definiciones que parecen precisas pero no lo son al llevarlas a código. Este documento recoge cada punto ambiguo detectado, la decisión por defecto que la aplicación debe implementar y la alternativa razonable. **Claude Code no debe resolver ninguna de estas por su cuenta**: implementa el valor por defecto marcado, deja el comentario `// AMBIGUO: ver OPEN_QUESTIONS #N` en el código, y expón cada decisión como parámetro configurable en `src/core/config/conventions.ts` para que el clínico pueda cambiarla sin tocar la lógica.
>
> **Regla de trazabilidad:** el informe exportado debe imprimir en un apéndice qué convención se usó en cada punto marcado con ★. Sin esto, dos mediciones de la misma radiografía con configuraciones distintas no son comparables y las estadísticas de concordancia pierden sentido.

---

## A. MEDICIÓN DEL ÁNGULO DE COBB

### #1 ★ Línea de platillo: ¿qué borde exactamente?
El método clásico traza la línea a lo largo del platillo vertebral, pero el platillo tiene un espesor cortical visible de 1–3 mm en radiografía digital.
- **Por defecto:** borde **inferior de la sombra cortical superior** para el platillo superior, y **borde superior de la sombra cortical inferior** para el platillo inferior (es decir, la superficie que mira al disco).
- **Alternativa:** línea media de la sombra cortical.
- **Impacto:** 1–2° por curva. Es sistemático, no aleatorio, así que afecta la comparación entre operadores pero poco al seguimiento intraobservador.

### #2 ★ Selección de vértebras terminales cuando dos candidatas están a <2° de inclinación
Cuando dos vértebras adyacentes tienen inclinaciones casi idénticas, la elección es arbitraria y cambia el Cobb.
- **Por defecto:** elegir la más alejada del ápex (curva más incluyente), y marcar el caso como `endplateAmbiguity: true` en la traza.
- **Alternativa:** elegir la que maximiza el ángulo de Cobb (convención de algunos servicios).
- **Regla obligatoria adicional:** en estudios seriados del mismo paciente, **reutilizar siempre las vértebras terminales del estudio índice**, aunque el algoritmo proponga otras. Sin esto, la "progresión" medida es en buena parte ruido de selección.

### #3 Vértebra compartida entre dos curvas adyacentes
Una misma vértebra suele ser terminal caudal de una curva y terminal craneal de la siguiente.
- **Por defecto:** permitirlo (es lo estándar); usar el platillo inferior para una curva y el superior para la otra.

### #4 Umbral de progresión: ¿5° o >5°?
- **Por defecto:** progresión = cambio **estrictamente mayor de 5°** (`Δ > 5.0`). Un cambio de exactamente 5° se reporta como "dentro del error de medición".
- Documentar que este umbral asume el mismo operador y las mismas vértebras terminales; entre operadores distintos el error es mayor y el umbral debería ampliarse.

### #5 ¿Cobb sobre radiografía de pie o en decúbito?
Las clasificaciones están definidas sobre **bipedestación**. Mezclar proyecciones invalida la clasificación.
- **Por defecto:** bloquear la clasificación si la proyección no es `PA_standing`, con mensaje explícito.

---

## B. CLASIFICACIÓN DE LENKE

### #6 ★ ¿Los umbrales son inclusivos o exclusivos?
El artículo original define curva menor estructural como la que "no corrige por debajo de 25°" y cifosis "≥ +20°".
- **Por defecto:** `bending ≥ 25.0°` → estructural; `cifosis ≥ +20.0°` → estructural. Es decir, **inclusivo en ambos**.
- **Punto crítico:** un caso con bending de exactamente 25.0° cambia el tipo de curva y por tanto los niveles de fusión propuestos. Debe existir un test unitario dedicado a este valor exacto.

### #7 ★★ ¿Qué radiografía de flexibilidad usa el criterio de estructuralidad?
Lenke la definió sobre **inclinación lateral en decúbito supino (supine side-bending)**. Muchos servicios usan fulcrum bending o tracción, que producen mayor corrección y por tanto **reclasifican curvas estructurales como no estructurales**.
- **Por defecto:** exigir `BEND_left`/`BEND_right` supinas. Si sólo hay fulcrum o tracción, **calcular igualmente pero marcar la clasificación como `nonStandardFlexibilityFilm: true`** y mostrarlo en rojo en el informe.
- **Esta es la ambigüedad de mayor impacto clínico de toda la lista.** No la resuelvas silenciosamente.

### #8 ★ Modificador lumbar B vs C: tolerancia del "toca"
El modificador B exige que la CSVL "toque" el cuerpo apical entre el borde medial del pedículo y el margen lateral. En píxeles, "tocar" es una decisión de tolerancia.
- **Por defecto:** tolerancia de **±1 mm calibrado**. Si la CSVL cae dentro de esa banda del margen lateral, se asigna B y se marca `borderlineBC: true`.
- **Alternativa:** tolerancia cero (contacto geométrico estricto).

### #9 Ápex lumbar situado en un disco intervertebral
Cuando el ápex es un disco y no un cuerpo, no hay "pedículos de la vértebra apical" ni "margen lateral del cuerpo" únicos.
- **Por defecto:** usar la **vértebra caudal al disco apical** como referencia para el modificador lumbar, y registrarlo en la traza.
- **Alternativa:** promediar la geometría de las dos vértebras adyacentes.

### #43 ★★ Modificador lumbar de Lenke, definición de C: discrepancia entre la redacción de SPEC.md y la literatura
SPEC.md §9.1 Paso 5 dice literalmente: "**C** completamente medial al margen lateral (sin contacto)." Tomada al pie de la letra, "medial al margen lateral" describe una posición **dentro** del cuerpo vertebral, lo cual contradice la definición clínica estándar de Lenke: **C** es la CSVL cayendo **completamente lateral** al cuerpo vertebral apical (fuera de él, sin ningún contacto) — el caso de mayor desviación de curva, no uno intermedio.
- **Por defecto (implementado en `core/classification/lumbarModifier.ts`):** definición clínica estándar — **A** entre los pedículos; **B** toca el cuerpo entre el borde medial del pedículo y el margen lateral; **C** completamente fuera del cuerpo vertebral (lateral a él), sin contacto. Marcado en el código con `// AMBIGUO: ver OPEN_QUESTIONS #43`.
- **No resuelto en silencio:** se implementa la definición de la literatura citada por el propio SPEC.md (Lenke 2001, ref. 11), no una interpretación literal de la frase ambigua. Debe confirmarse contra el artículo original antes de cualquier uso académico.

### #44 Modificador lumbar de Lenke: el modelo de datos no representa un ápex en un disco intervertebral
`docs/OPEN_QUESTIONS.md` #9 (arriba) asume que el ápex de la curva lumbar puede caer en un disco intervertebral, y define una política de resolución ("usar la vértebra caudal al disco apical"). El modelo de datos de la aplicación (`VertebraAnnotation`) sólo anota vértebras — no hay ningún landmark de disco intervertebral — y `determineApexVertebra` (`core/measurements/cobb.ts`) siempre selecciona una vértebra concreta (la más horizontal entre las terminales), nunca una posición intermedia.
- **Por defecto:** la política de #9 (`apexAtDiscPolicy`) queda declarada en `core/config/conventions.ts` pero es un no-op estructural en la implementación actual de `core/classification/lumbarModifier.ts`: no hay ningún caso en que el ápex resuelto sea "un disco" que necesite resolverse a su vértebra caudal.
- **Pendiente:** si en el futuro se añade la capacidad de anotar el ápex como un disco intervertebral (más fiel a la literatura), esta función deberá revisarse para aplicar #9 de verdad.

### #10 Tipo 6: ¿"TL/L mayor que MT" o "mayor por ≥5°"?
- **Por defecto:** exigir **TL/L ≥ MT + 5°** (criterio más citado). Si TL/L es mayor pero por menos de 5°, clasificar como **tipo 3** y marcar `type3vs6Borderline: true`.

### #11 Tipo 4 (triple mayor): qué curva puede ser la mayor
Algunas descripciones permiten que la mayor sea MT o TL/L; otras la restringen.
- **Por defecto:** permitir ambas (MT o TL/L como mayor), con las tres curvas estructurales.

### #12 ★ Modificador sagital T5–T12: bordes exactos
`−` <10°, `N` 10–40°, `+` >40°.
- **Por defecto:** exactamente 10.0° → **N**; exactamente 40.0° → **N**. Es decir, N cubre `[10, 40]` cerrado.

### #13 Niveles de medición de la cifosis según el uso
La aplicación usa tres cifosis distintas y es fácil confundirlas:
| Uso | Niveles |
|---|---|
| Estructuralidad de la curva torácica proximal | T2–T5 |
| Estructuralidad de MT y TL/L | T10–L2 |
| Modificador sagital de Lenke | T5–T12 |
| "Cifosis torácica normal" del informe general | T5–T12 (algunos textos usan T4–T12) |
- **Por defecto:** T5–T12 para el valor general del informe, declarándolo explícitamente. Nunca reutilizar una cifosis calculada para un propósito distinto del que le corresponde.

---

## C. PARÁMETROS SAGITALES Y PÉLVICOS

### #14 ★ Punto de referencia distal del SVA
- **Por defecto:** **ángulo posterosuperior de S1**.
- **Alternativa frecuente:** punto medio del platillo superior de S1 (produce valores sistemáticamente mayores en unos milímetros).
- Debe quedar impreso en el informe cuál se usó.

### #15 Lordosis lumbar: ¿L1–S1 o L1–L5?
- **Por defecto:** **L1 platillo superior → S1 platillo superior**, porque el PI-LL mismatch está definido sobre esa medida.
- Ofrecer L1–L5 como valor secundario informativo, nunca como entrada de la clasificación SRS-Schwab.

### #16 Eje de las cabezas femorales cuando no se superponen
En la radiografía lateral las dos cabezas femorales rara vez coinciden.
- **Por defecto:** ajustar un círculo a cada una y usar el **punto medio entre ambos centros**.
- Marcar advertencia si la distancia entre centros supera 15 mm (indica rotación del paciente y degrada todos los parámetros pélvicos).

### #17 Valores normales de incidencia pélvica en el paciente en crecimiento
La PI media de referencia (~53°, rango ~33–85°) proviene de poblaciones adultas; en el niño la PI aumenta durante el crecimiento.
- **Por defecto:** en pacientes <18 años, **mostrar el valor sin banda de normalidad** y sin colorear como patológico.
- Anotar como pendiente: incorporar tablas normativas pediátricas por edad si se localizan.

### #18 ★ Método de medición de la oblicuidad pélvica
Existen varios métodos sin consenso (Osebold, Maloney, Allen-Ferguson, O'Brien) y no son intercambiables.
- **Por defecto:** **Osebold** (línea de crestas ilíacas respecto a la horizontal), por requerir sólo landmarks bien visibles.
- Obligatorio imprimir el método en el informe.

### #19 Tipos de Roussouly: cortes numéricos
Los cortes de SS (35°, 45°) y la definición del subtipo 3-AP (pelvis antevertida) no están fijados de forma uniforme en la literatura.
- **Por defecto:** Tipo 1 y 2 con SS <35°, Tipo 3 con SS 35–45°, Tipo 4 con SS >45°; 3-AP cuando PI es baja con SS alta.
- **Marcar el resultado de Roussouly siempre como orientativo**, no como dato duro.

---

## D. SRS-SCHWAB, C-EOS Y OTRAS CLASIFICACIONES

### #20 ★ Bordes de los modificadores SRS-Schwab
- PI-LL: `0` <10°, `+` 10–20°, `++` >20°. **Por defecto:** exactamente 10 → `+`; exactamente 20 → `+`.
- SVA: `0` <4 cm, `+` 4–9.5 cm, `++` >9.5 cm. Exactamente 4 → `+`; exactamente 9.5 → `+`.
- PT: `0` <20°, `+` 20–30°, `++` >30°. Exactamente 20 → `+`; exactamente 30 → `+`.
- Convención general: **el borde inferior pertenece a la categoría superior**.

### #21 SRS-Schwab: ápex situado en un disco para decidir T vs L
El descriptor T exige ápex en T9 o superior; L, ápex en T10 o inferior.
- **Por defecto:** si el ápex es el disco T9-T10, clasificar como **L** (criterio conservador) y marcar `apexAtDisc: true`.

### #22 ★★ C-EOS: hueco entre las categorías 2 y 3 de curva
Las categorías publicadas son `2` = 20–50° y `3` = 51–90°. **Los valores entre 50 y 51 (p. ej. 50.4°) no están cubiertos por ninguna categoría.**
- **Por defecto:** tratar el corte como **≤50 → categoría 2; >50 → categoría 3**, eliminando el hueco.
- Documentarlo explícitamente porque es una discrepancia real de la definición publicada, no un error de implementación.

### #23 C-EOS: cómo medir la "cifosis máxima"
No se especifican niveles fijos; es la cifosis máxima de cualquier segmento.
- **Por defecto:** calcular la cifosis máxima por barrido de todos los pares de platillos entre T1 y L2, tomando el valor máximo, y **registrar los niveles usados**.
- **Alternativa:** entrada manual del clínico.

### #24 C-EOS: modificador de progresión, `≥20` o `>20`
- **Por defecto:** `P0` <10°/año, `P1` 10–19.9°/año, `P2` ≥20°/año.
- Requiere dos estudios con fecha; anualizar linealmente y **exigir un intervalo mínimo de 6 meses** entre estudios; por debajo de eso, no calcular el modificador (el ruido de medición domina).

### #45 Neuromuscular (Lonstein-Akbarnia): umbral numérico de "oblicuidad pélvica significativa"
SPEC.md §9.7 dice "Grupo II tronco descompensado con oblicuidad pélvica" y "la oblicuidad pélvica significativa es indicación clave de extender la fusión a la pelvis", pero no define en grados qué cuenta como "significativa" — a diferencia de otros umbrales de la especificación, aquí no hay ningún número.
- **Por defecto (implementado en `core/classification/neuromuscular.ts`):** no se fabrica un corte numérico no publicado. La "oblicuidad pélvica significativa" y el "tronco compensado/descompensado" son entradas explícitas del clínico (booleanas), no derivadas automáticamente del ángulo de oblicuidad pélvica de `measurePelvicObliquity`.
- **Pendiente:** si se localiza un umbral numérico en la fuente primaria de Lonstein-Akbarnia, sustituir la entrada manual por un cálculo automático a partir de `measurePelvicObliquity`.

### #46 Lenke: qué bending (izquierdo/derecho) usar para probar la estructuralidad de cada curva
SPEC.md §9.1 Paso 3 exige el Cobb "en bending" para el criterio coronal de estructuralidad, pero no especifica qué radiografía de bending (izquierda o derecha) corresponde a cada curva menor cuando el estudio tiene ambas. En la práctica clínica se usa el bending que corrige hacia la convexidad de esa curva concreta, pero eso exige conocer la convexidad de cada curva y emparejarla con el lado correcto — SPEC.md no lo detalla y la literatura secundaria consultada tampoco da una regla operacionalizable sin ambigüedad.
- **Por defecto (implementado en `ui/classificationEngine.ts`):** si el estudio tiene ambos bendings, se mide el Cobb de esa curva (mismas vértebras terminales que en bipedestación) en los dos y se usa el **valor más corregido (menor)** de los dos — criterio conservador: exige más corrección real para considerar la curva no estructural, evitando subestimar la estructuralidad. Si sólo hay un bending disponible, se usa ese.
- **Alternativa:** emparejar cada curva con el bending contralateral a su convexidad (más fiel a la práctica clínica, pero exige resolver primero la convexidad-a-lado de forma robusta para curvas con landmarks parcialmente fiables).

### #47 C-EOS/congénita/neuromuscular/Lenke-Silva: cuándo mostrar el clasificador de entrada manual
SPEC.md §9 exige "si falta un dato, no adivinar: devolver `unmetInputs` y ofrecer al usuario completarlo manualmente", pero no dice explícitamente cuándo un clasificador que depende íntegramente de entrada manual (C-EOS, congénita, neuromuscular, Lenke-Silva) debe empezar a aparecer en el panel — a diferencia de Lenke/King-Moe/PUMC, que sólo se muestran si hay al menos una curva coronal detectada, estos cuatro no tienen ningún dato "de imagen" que sirva de guardia natural.
- **Riesgo identificado:** `ageYears` en `store.ts` es un campo obligatorio con valor por defecto `0`, no `number | null` — si C-EOS se activara sólo por `ageYears < 10`, aparecería en todo estudio nuevo sin que el clínico haya tocado nada, sólo porque el campo "Edad" sigue en su valor inicial.
- **Por defecto (implementado en `ui/classificationEngine.ts::applyManualClassifications`):** cada uno de los cuatro exige una elección explícita del clínico antes de aparecer — `etiology` elegido (no `null`) para C-EOS/congénita/neuromuscular (más `ageYears < 10` para C-EOS, ya con etiología fijada), y el interruptor `lenkeSilvaEnabled` para Lenke-Silva. Nunca aparecen sólo por un valor por defecto sin fijar.
- **Alternativa:** mostrarlos siempre que haya `radiograph` cargado, con todos los campos como `unmetInputs`; se descartó por generar ruido en el panel de clasificación para el caso mayoritario (AIS idiopática sin ninguna de estas cuatro entradas).

### #25 King-Moe tipo II: "más rígida por ≥3°"
El criterio original mezcla magnitud y rigidez de forma difícil de operacionalizar.
- **Por defecto:** implementar como criterio de magnitud (torácica > lumbar) y **no** intentar automatizar el componente de rigidez; ofrecer al usuario un conmutador manual.
- Recordar en la UI que King-Moe se incluye por valor histórico y comunicacional, no para decidir niveles de fusión.

### #26 PUMC: bordes de 10° en los subtipos IIb/IIc/IId
- **Por defecto:** IIb si torácica − TL/L ≥10°; IId si TL/L − torácica ≥10°; IIc si |diferencia| <10°.
- Marcar `pumcBorderline: true` cuando la diferencia esté entre 8 y 12°, ya que son los subtipos con peor concordancia entre observadores.

---

## E. VÉRTEBRAS DE REFERENCIA Y ROTACIÓN

### #27 Vértebra estable: desempate
"La más bisectada por la CSVL" puede dar empates.
- **Por defecto:** la más **caudal** entre las empatadas (criterio conservador para la selección de niveles de fusión).

### #28 Vértebra neutra: umbral de simetría pedicular
No hay un umbral numérico publicado.
- **Por defecto:** neutra si la diferencia relativa entre las distancias pediculares a los bordes laterales es <10%. Marcar como convención propia de la aplicación, **no como estándar de la literatura**.

### #29 Perdriolle: interpolación entre valores del torsiómetro
El torsiómetro original da valores discretos.
- **Por defecto:** interpolación lineal entre los valores tabulados, redondeando el resultado a 5°, porque una precisión mayor sería falsa (el error individual del método alcanza ~6°).

### #41 ★★ Perdriolle: valores numéricos de la tabla ratio (d/w) → grados
SPEC.md §7.8 exige mapear el desplazamiento relativo `d/w` a grados "por la tabla de Perdriolle", pero ni SPEC.md ni la bibliografía citada en `docs/REFERENCES.md` reproducen los valores numéricos exactos del torsiómetro original (Perdriolle & Vidal, 1985) — es una plantilla física, no una fórmula publicada en el JBJS/Spine. **No implementar un valor de precisión clínica sin verificar la fuente primaria.**
- **Por defecto (implementado en `core/measurements/rotation.ts`, `DEFAULT_PERDRIOLLE_TABLE`):** tabla de anclaje aproximada, marcada en el código con `// AMBIGUO: ver OPEN_QUESTIONS #41`, con puntos en incrementos de 5° entre 0 y 40° y de 10° entre 40° y 60° (0.00→0°, 0.05→5°, …, 0.40→40°, 0.45→50°, 0.50→60°), interpolada linealmente y redondeada a 5° por `docs/OPEN_QUESTIONS.md` #29. La tabla es un parámetro configurable de la función, no una constante fija: cualquier centro puede sustituirla por la tabla impresa en su propio torsiómetro.
- **Obligatorio:** todo resultado de `measurePerdriolleRotation` lleva la advertencia `perdriolleTableUnverified` y no debe usarse con fines de publicación académica hasta confirmar los valores contra el torsiómetro físico o la fuente primaria (ver también sección I, punto añadido más abajo).
- **Alternativa:** introducir manualmente el valor leído directamente del torsiómetro físico (bypass de la tabla), registrando `source: 'perdriolleManual'`.

### #30 Nash-Moe como variable numérica
- **Decisión firme, no configurable:** Nash-Moe se registra como grado ordinal (0–IV) y **nunca se convierte a grados ni entra en ningún cálculo**. Su error interobservador (hasta ~9°) lo hace inservible para seguimiento cuantitativo.

### #31 RVAD de Mehta: qué platillo y qué puntos costales
- **Por defecto:** perpendicular al **platillo inferior** de la vértebra apical; punto medio de la cabeza costal y punto medio del cuello costal, según la descripción original.
- Sensibilidad alta a la colocación: exigir zoom mínimo del 400% para colocar estos puntos y advertirlo.

### #42 Atajo `E` ("ciclar vértebra terminal"): qué terminal cicla y en qué sentido
SPEC.md §10.2 dice sólo "`E` ciclar vértebra terminal", sin especificar si cicla la terminal craneal o la caudal, en qué dirección, ni cómo se combinan ambas si el usuario quiere corregir las dos. No es una ambigüedad clínica (no cambia ningún cálculo ya hecho, sólo qué vértebras alimentan `measureCobb`), pero condiciona la interacción del atajo.
- **Por defecto (implementado en `src/ui/store.ts`, `cycleCobbTerminal`):** `E` avanza la terminal **craneal** a la siguiente vértebra anotada (en orden craneal→caudal, con vuelta circular); `Shift+E` avanza la terminal **caudal**. Cada pulsación fija el resultado en `forcedCobbTerminals`, exactamente el mismo mecanismo que reutiliza las terminales del estudio índice en el seguimiento seriado (#2).
- **Alternativa:** un único atajo que cicla ambas terminales a la vez sobre el conjunto de pares válidos que producen cambio de signo (más fiel a "un candidato completo cada vez", pero exige exponer la lista completa de pares candidatos desde `core/measurements/cobb.ts`, no sólo el mejor).

---

## F. MADUREZ ESQUELÉTICA

### #32 ★★ Risser americano vs francés
No son equivalentes: el sistema francés asigna los grados más tarde. Un "Risser 3" significa cosas distintas según el sistema.
- **Decisión firme:** el campo Risser **no puede guardarse sin especificar el sistema**. Debe ser un campo obligatorio en la interfaz, no un valor por defecto silencioso.

### #33 Sanders original (1–8) vs Simplified Sanders (SSMS)
Son escalas distintas y a menudo se citan intercambiablemente.
- **Por defecto:** implementar la escala de **8 estadios**, etiquetando el campo con el nombre completo del sistema usado y una guía visual integrada.

### #34 Umbral del escoliómetro para derivación: 5° o 7°
- **Por defecto:** **7°** como umbral de derivación (criterio original, menos falsos positivos), mostrando simultáneamente que con 5° la sensibilidad es mayor.
- Presentar ambos, no elegir en silencio.

---

## G. CALIBRACIÓN Y GEOMETRÍA DE IMAGEN

### #35 ★ Corrección de magnificación en radiografía convencional
La magnificación depende de la distancia foco-detector y de la profundidad del objeto, que no se conoce con exactitud.
- **Por defecto:** aplicar corrección sólo si el DICOM aporta `DistanceSourceToDetector` y `DistanceSourceToPatient`; en caso contrario **no corregir** y marcar las distancias como `uncorrectedMagnification: true`.
- Nunca estimar la magnificación con un valor fijo asumido.

### #36 Convención de signos
- **Decisión firme:** coronal positivo = **derecha del paciente**; sagital positivo = **anterior**. La aplicación debe detectar imágenes espejadas (lateralidad invertida) comparando marcadores DICOM y, si hay conflicto, **detenerse y preguntar** en lugar de asumir.

### #37 Imágenes con instrumentación previa
Los tornillos y barras ocultan platillos y falsean tanto la detección automática como la manual.
- **Por defecto:** permitir la medición pero marcar el estudio como `instrumented: true` y excluirlo por defecto de las estadísticas de concordancia.

---

## H. PROTOCOLO DEL ESTUDIO DE CONCORDANCIA

### #38 ★★ Qué cuenta como "caso válido" para comparar automático vs manual
- **Por defecto:** se excluyen del análisis estadístico los casos con `instrumented: true`, `unblinded: true` (ver #39), calibración ausente cuando se comparan distancias, o menos de 12 vértebras identificables.
- Los criterios de exclusión deben fijarse **antes** de empezar a medir, no después de ver los resultados.

### #39 ★★ Integridad del cegamiento
Si el resultado automático se consulta antes de terminar la medición manual, la comparación deja de ser independiente.
- **Decisión firme:** la aplicación registra con marca de tiempo si el panel automático fue abierto antes de cerrar la medición manual. Si ocurre, el caso se marca `unblinded: true` de forma **irreversible** y se excluye por defecto.
- Esta salvaguarda es la que hace que los resultados de concordancia sean publicables.

### #40 Tolerancias de concordancia por parámetro
Qué diferencia se considera aceptable no es lo mismo para cada medida.
- **Por defecto:** Cobb y demás ángulos vertebrales ±5°; parámetros pélvicos ±5°; distancias (SVA, balance coronal, translación apical) ±10 mm; clasificaciones: concordancia exacta de la nomenclatura completa, más un cálculo secundario de concordancia sólo del tipo principal (p. ej. Lenke 1 vs 1, ignorando modificadores).

---

## I. PENDIENTES DE VERIFICAR EN FUENTE PRIMARIA

Estos puntos se implementaron a partir de fuentes secundarias y **deben confirmarse en el artículo original antes de cualquier uso académico**:

1. Subtipos exactos y cortes numéricos de la clasificación PUMC.
2. Cortes numéricos precisos de los tipos de Roussouly y definición formal del subtipo 3-AP.
3. Redacción literal del criterio de rigidez del King-Moe tipo II.
4. Rangos exactos de las categorías de curva y cifosis del C-EOS (ver la discontinuidad del #22).
5. Definición operacional de la "cifosis máxima" en el C-EOS.
6. Umbrales pediátricos normativos de incidencia pélvica por edad.
7. Valores numéricos exactos de la tabla ratio (d/w) → grados del torsiómetro de Perdriolle (ver #41): la implementación actual usa una tabla aproximada de anclaje, no los valores impresos en el instrumento físico original.
8. Definición de C en el modificador lumbar de Lenke (ver #43): se implementó la definición estándar de la literatura en vez de la redacción literal de SPEC.md §9.1, que parece contener un error de transcripción.

**Referencia canónica recomendada para resolver la mayoría de las definiciones de landmarks:** *Spinal Deformity Study Group Radiographic Measurement Manual* (O'Brien, Kuklo, Blanke, Lenke), de acceso abierto en srs.org. Cuando este manual y una fuente secundaria discrepen, **gana el manual**.
