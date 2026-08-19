# Convención de signos — `core/geometry`

SPEC.md §5, §7.1, §7.4, `docs/OPEN_QUESTIONS.md` #36.

- **Coordenadas:** píxeles de la imagen original. El origen y la dirección de
  los ejes son los de la imagen tal como se cargó; `core/geometry` no asume
  nada sobre orientación anatómica salvo lo descrito abajo.
- **Coronal:** positivo = **derecha del paciente**. `signedDistanceToVerticalLine(p, xLine)`
  devuelve `p.x - xLine`; un resultado positivo significa que `p` está a la
  derecha del paciente respecto a la línea vertical de referencia (CSVL o
  C7PL), siempre que las anotaciones de entrada respeten la convención
  paciente-orientado con la que se cargó la imagen (izquierda del paciente a
  la izquierda de la imagen, como en una PA de pie estándar sin espejar).
- **Sagital:** positivo = **anterior**. El SVA, el balance coronal y la
  translación apical se calculan como distancias con signo siguiendo esta
  convención; en la interfaz (fase 2+) se presentan como valores absolutos
  con una etiqueta de dirección, nunca como número negativo desnudo.
- **Cifosis / lordosis:** internamente cifosis es positiva y lordosis
  negativa (ambas miden inclinación de platillos con `angleBetweenLines`,
  que es una magnitud sin signo — el signo lo asigna la función de medición
  según el tipo de curva, no la primitiva geométrica). En la interfaz (fase
  2+) ambas se muestran como valores absolutos.
- **Detección de lateralidad invertida:** si los marcadores DICOM (p. ej.
  `PatientOrientation`) entran en conflicto con la orientación real de la
  imagen, la aplicación **se detiene y pregunta** en vez de asumir un lado.
  Esa comprobación vive en `core/imaging` (fase 2/3), no en `core/geometry`:
  aquí sólo se documenta la convención que el resto del motor asume como ya
  resuelta.

## Primitivas y su rol

| Función | Uso |
|---|---|
| `angleBetweenLines(l1, l2)` | Ángulo agudo sin signo entre dos líneas. Primitiva de **todos** los ángulos clínicos definidos como "ángulo entre dos líneas": Cobb, TK, LL, SS, PT, PI, pendiente de T1, oblicuidad pélvica, RVA de Mehta. |
| `signedDistanceToVerticalLine(p, xLine)` | Distancia horizontal con signo (+ = derecha del paciente). Balance coronal, translación apical. |
| `signedInclinationFromHorizontal(line)` | Inclinación **con signo** de un platillo, acotada a (-90°, 90°]. Uso interno exclusivo de la selección automática de vértebras terminales del Cobb (detectar el cambio de signo de inclinación a lo largo de la columna) — no es un valor clínico reportable. |
| `perpendicularThrough(line, point)` | Construye la perpendicular a una línea en un punto dado. Incidencia pélvica (perpendicular al platillo de S1 en M) y RVA de Mehta (perpendicular al platillo inferior apical). |
| `verticalThrough` / `horizontalThrough` | Líneas de referencia vertical/horizontal que pasan por un punto, para comparar contra `HORIZONTAL`/`VERTICAL` con `angleBetweenLines`. |

Todas las funciones son puras y no dependen de estado ni de tipos de
`core/models`; sólo conocen `Pt` y `Line`.
