/**
 * "Apéndice de convenciones usadas" del informe exportado. SPEC.md §12,
 * punto 7: "los puntos marcados con ★ en `OPEN_QUESTIONS.md`" — resumen de
 * una línea por decisión, fiel al texto de `docs/OPEN_QUESTIONS.md` (no una
 * paráfrasis libre). Estático porque el documento fuente es Markdown fuera
 * del bundle de la aplicación, no datos en tiempo de ejecución — mismo
 * patrón que `core/classification/osteotomies.ts::OSTEOTOMY_REFERENCE_TABLE`
 * (una tabla de referencia de SPEC.md reproducida como código).
 *
 * Si `docs/OPEN_QUESTIONS.md` cambia el texto de una de estas decisiones,
 * este archivo debe actualizarse a la vez — no hay generación automática.
 */
export interface AppendixEntry {
  /** Número de entrada en `docs/OPEN_QUESTIONS.md`, con sus estrellas tal cual aparecen allí. */
  id: string;
  title: string;
  decision: string;
}

export const REPORT_CONVENTIONS_APPENDIX: AppendixEntry[] = [
  { id: '#1 ★', title: 'Línea de platillo', decision: 'Borde inferior de la sombra cortical superior (platillo superior) / borde superior de la sombra cortical inferior (platillo inferior).' },
  { id: '#2 ★', title: 'Vértebras terminales casi empatadas', decision: 'Se elige la más alejada del ápex; en estudios seriados se reutilizan siempre las terminales del estudio índice.' },
  { id: '#6 ★', title: 'Umbrales de estructuralidad de Lenke', decision: 'Inclusivos: bending ≥25.0° y cifosis ≥+20.0° cuentan como estructural.' },
  { id: '#7 ★★', title: 'Radiografía de flexibilidad', decision: 'Se exige bending supino; si sólo hay fulcrum/tracción se calcula igual pero se marca nonStandardFlexibilityFilm.' },
  { id: '#8 ★', title: 'Modificador lumbar B vs C, tolerancia', decision: 'Banda de ±1 mm calibrado alrededor del margen lateral se asigna a B y se marca borderlineBC.' },
  { id: '#43 ★★', title: 'Modificador lumbar de Lenke, definición de C', decision: 'Se implementa la definición clínica estándar de la literatura (Lenke 2001) en vez de la redacción literal de SPEC.md §9.1, que parece contener un error de transcripción.' },
  { id: '#12 ★', title: 'Modificador sagital T5–T12', decision: 'N cubre el intervalo cerrado [10°, 40°] (los bordes exactos cuentan como N).' },
  { id: '#14 ★', title: 'Referencia distal del SVA', decision: 'Ángulo posterosuperior de S1 por defecto.' },
  { id: '#18 ★', title: 'Método de oblicuidad pélvica', decision: 'Osebold (línea de crestas ilíacas respecto a la horizontal).' },
  { id: '#20 ★', title: 'Bordes de los modificadores SRS-Schwab', decision: 'El borde inferior de cada rango pertenece a la categoría superior (p. ej. PI-LL exactamente 10° → "+").' },
  { id: '#22 ★★', title: 'C-EOS, hueco entre categorías 2 y 3 de curva', decision: 'Corte único en 50°: ≤50 → categoría 2; >50 → categoría 3.' },
  { id: '#41 ★★', title: 'Perdriolle, tabla ratio→grados', decision: 'Tabla de anclaje aproximada, no verificada contra el torsiómetro físico original — todo resultado lleva la advertencia perdriolleTableUnverified.' },
  { id: '#32 ★★', title: 'Risser americano vs francés', decision: 'El grado de Risser no puede registrarse sin especificar antes el sistema (americano/francés).' },
  { id: '#35 ★', title: 'Corrección de magnificación', decision: 'Sólo se corrige si el DICOM aporta DistanceSourceToDetector/DistanceSourceToPatient; si no, se marca uncorrectedMagnification, nunca se asume un factor fijo.' },
  { id: '#38 ★★', title: 'Caso válido del estudio de concordancia', decision: 'Se excluyen los casos instrumentados, con cegamiento roto, o con menos de 12 vértebras identificables (calibración ausente en distancias, pendiente).' },
  { id: '#39 ★★', title: 'Integridad del cegamiento', decision: 'Consultar el automático antes de terminar la medición propia marca el caso unblinded de forma irreversible y lo excluye por defecto de la estadística agregada.' },
];
