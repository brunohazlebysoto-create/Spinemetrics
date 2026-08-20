/**
 * Informe exportado en PDF. SPEC.md §12. Genera el PDF enteramente en el
 * cliente con `pdf-lib` (sin canvas del DOM, sin llamada de red en tiempo
 * de ejecución — SPEC.md §11, "procesamiento exclusivamente local") a
 * partir de un `ReportData` ya construido por `ui/report.ts` — este módulo
 * sólo maqueta, no decide qué contenido va (esa decisión vive en
 * `report.ts`, donde se puede probar sin PDF de por medio).
 *
 * La imagen anotada (SPEC.md §12 punto 4) se recibe como PNG ya
 * rasterizado (`ui/Panels/ReportPanel.tsx` la captura del `Stage` de Konva,
 * que sí necesita DOM) — `pngBytes` es opcional porque el informe debe
 * poder generarse igual sin visor activo (p. ej. desde un `Study`
 * importado sin imagen, ver `StudyIO.tsx`).
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from 'pdf-lib';
import type { ReportData } from './report';

const PAGE_WIDTH = 595.28; // A4 en puntos.
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK: RGB = rgb(0.1, 0.1, 0.12);
const MUTED: RGB = rgb(0.4, 0.4, 0.45);
const AMBER: RGB = rgb(0.7, 0.5, 0.05);
const GRAY: RGB = rgb(0.45, 0.47, 0.5);

/** La fuente estándar Helvetica de `pdf-lib` sólo codifica WinAnsi: unos
 * pocos símbolos usados en el resto de la interfaz (grados, "más/menos",
 * comparadores) no tienen glifo ahí y `pdf-lib` lanza en vez de omitirlos
 * en silencio. Se sustituyen por su equivalente ASCII sólo en esta capa de
 * maquetación — `ui/report.ts` conserva el texto real para HTML/pantalla. */
const PDF_SAFE_REPLACEMENTS: [RegExp, string][] = [
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/±/g, '+/-'],
  [/→/g, '->'],
  [/[–—]/g, '-'],
  [/[’‘]/g, "'"],
  [/[“”]/g, '"'],
  [/Δ/g, 'delta'],
  [/★★/g, '(**)'],
  [/★/g, '(*)'],
];

/** Cualquier otro carácter fuera de WinAnsi (símbolos matemáticos u
 * ordinales raros que puedan colarse en un futuro texto) se sustituye por
 * `?` en vez de dejar que `pdf-lib` lance — nunca se omite contenido en
 * silencio, sólo el glifo exacto. */
function sanitizeForPdf(text: string): string {
  const replaced = PDF_SAFE_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
  // eslint-disable-next-line no-control-regex -- WinAnsi (CP1252) imprimible: ASCII + Latin-1 extendido usado por el español.
  return replaced.replace(/[^ -~ -ÿ]/g, '?');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (text === '') return [''];
  const words = sanitizeForPdf(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current === '') {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

class PdfWriter {
  private constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private page: PDFPage,
    private y: number,
  ) {}

  static async create(): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return new PdfWriter(doc, font, bold, page, PAGE_HEIGHT - MARGIN);
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(height: number): void {
    if (this.y - height < MARGIN) this.newPage();
  }

  heading(text: string): void {
    this.ensureSpace(24);
    this.page.drawText(sanitizeForPdf(text), { x: MARGIN, y: this.y, size: 15, font: this.bold, color: INK });
    this.y -= 22;
  }

  subheading(text: string): void {
    this.ensureSpace(18);
    this.page.drawText(sanitizeForPdf(text), { x: MARGIN, y: this.y, size: 11, font: this.bold, color: INK });
    this.y -= 16;
  }

  paragraph(text: string, options: { size?: number; color?: RGB; font?: PDFFont } = {}): void {
    const size = options.size ?? 9;
    const font = options.font ?? this.font;
    const color = options.color ?? INK;
    for (const line of wrapText(text, font, size, CONTENT_WIDTH)) {
      this.ensureSpace(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color });
      this.y -= size + 4;
    }
  }

  spacer(height = 8): void {
    this.y -= height;
  }

  /** Tabla simple de columnas proporcionales, con ajuste de línea por
   * celda (nunca trunca contenido clínico en silencio). `rowColors[i]`
   * tiñe la fila `i` completa — SPEC.md §8.1 "semáforo verde/ámbar/gris"
   * también en el informe impreso, no sólo en la interfaz. */
  table(headers: string[], rows: string[][], columnFractions: number[], rowColors?: RGB[]): void {
    const size = 8;
    const rowPad = 4;
    const columnWidths = columnFractions.map((f) => f * CONTENT_WIDTH);
    const columnX: number[] = [];
    let acc = MARGIN;
    for (const w of columnWidths) {
      columnX.push(acc);
      acc += w;
    }

    const drawRow = (cells: string[], font: PDFFont, color: RGB): void => {
      const wrapped = cells.map((cell, i) => wrapText(cell, font, size, columnWidths[i]! - 4));
      const lineCount = Math.max(...wrapped.map((w) => w.length));
      const rowHeight = lineCount * (size + 3) + rowPad;
      this.ensureSpace(rowHeight);
      for (let i = 0; i < cells.length; i++) {
        wrapped[i]!.forEach((line, li) => {
          this.page.drawText(line, { x: columnX[i]!, y: this.y - li * (size + 3), size, font, color });
        });
      }
      this.y -= rowHeight;
    };

    drawRow(headers, this.bold, MUTED);
    rows.forEach((row, i) => drawRow(row, this.font, rowColors?.[i] ?? INK));
  }

  async image(pngBytes: Uint8Array, caption: string): Promise<void> {
    const embedded = await this.doc.embedPng(pngBytes);
    const maxWidth = CONTENT_WIDTH;
    const maxHeight = 320;
    const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height, 1);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    this.ensureSpace(height + 16);
    this.page.drawImage(embedded, { x: MARGIN, y: this.y - height, width, height });
    this.y -= height + 4;
    this.paragraph(caption, { size: 8, color: MUTED });
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function statusColor(status: ReportData['measurements'][number]['status']): RGB {
  if (status === 'ok') return INK;
  if (status === 'warning') return AMBER;
  return GRAY;
}

export async function generateReportPdf(report: ReportData, annotatedImagePngBytes?: Uint8Array): Promise<Uint8Array> {
  const w = await PdfWriter.create();

  w.heading('SpineMetrics — Informe de estudio');
  w.paragraph(`Seudónimo: ${report.patientRef}   ·   Edad: ${report.ageYears} años   ·   Fecha: ${report.date}`);
  w.paragraph(`Proyecciones analizadas: ${report.views.join(', ') || 'ninguna'}`);
  w.spacer(10);

  if (report.measurements.length > 0) {
    w.subheading('Mediciones');
    w.table(
      ['Parámetro', 'Valor', 'Referencia normal', 'Observación'],
      report.measurements.map((m) => [m.label, m.value, m.reference ?? '—', m.observation ?? '']),
      [0.26, 0.14, 0.28, 0.32],
      report.measurements.map((m) => statusColor(m.status)),
    );
    w.paragraph('Ámbar = calculado con advertencias. Gris = no calculable (motivo en Observación). SPEC.md §8.1.', {
      size: 7,
      color: MUTED,
    });
    w.spacer(10);
  }

  if (report.classifications.length > 0) {
    w.subheading('Clasificaciones');
    for (const c of report.classifications) {
      w.paragraph(`${c.label}: ${c.result}`, { size: 9.5 });
      if (c.traceSummary) w.paragraph(c.traceSummary, { size: 8, color: MUTED });
      if (c.unmetInputs.length > 0) w.paragraph(`Datos que faltan: ${c.unmetInputs.join(', ')}`, { size: 8, color: AMBER });
      w.spacer(4);
    }
    w.spacer(6);
  }

  if (annotatedImagePngBytes) {
    w.subheading('Imagen anotada');
    await w.image(annotatedImagePngBytes, 'Radiografía activa con landmarks, líneas y etiquetas visibles al generar el informe.');
    w.spacer(10);
  }

  if (report.followUp) {
    w.subheading(`Comparación seriada (estudio índice: ${report.followUp.indexDate})`);
    w.table(
      ['Parámetro', report.followUp.indexDate, report.date, 'Δ'],
      report.followUp.rows.map((r) => [r.label, r.previous, r.current, `${r.delta}${r.isProgression === true ? ' (progresión >5°)' : ''}`]),
      [0.34, 0.2, 0.2, 0.26],
    );
    w.spacer(10);
  }

  if (report.maturity.risser || report.maturity.sanders || report.maturity.triradiateOpen) {
    w.subheading('Madurez esquelética');
    if (report.maturity.sanders) w.paragraph(`Sanders (SSMS): ${report.maturity.sanders}`);
    if (report.maturity.risser) w.paragraph(`Risser: ${report.maturity.risser}`);
    if (report.maturity.triradiateOpen) w.paragraph(`Cartílago trirradiado: ${report.maturity.triradiateOpen}`);
    w.spacer(10);
  }

  w.subheading('Apéndice de convenciones usadas (docs/OPEN_QUESTIONS.md)');
  w.table(
    ['Ref.', 'Ambigüedad', 'Decisión aplicada'],
    report.appendix.map((e) => [e.id, e.title, e.decision]),
    [0.1, 0.28, 0.62],
  );
  w.spacer(12);

  w.subheading('Descargo de responsabilidad');
  w.paragraph(report.disclaimer, { color: MUTED });
  w.paragraph(`Generado: ${report.generatedAt}`, { size: 7, color: MUTED });

  return w.save();
}
