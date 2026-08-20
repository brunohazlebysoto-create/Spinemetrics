/**
 * Informe exportado en DOCX. SPEC.md §12. Mismo `ReportData` que
 * `reportPdf.ts` (construido por `ui/report.ts`), otra maquetación —
 * `docx` no tiene el límite de codificación WinAnsi de las fuentes
 * estándar de `pdf-lib`, así que aquí no hace falta sanear símbolos.
 * Genera el documento enteramente en el cliente (SPEC.md §11: sin llamada
 * de red en tiempo de ejecución).
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ReportData } from './report';

const MUTED_COLOR = '666666';
const AMBER_COLOR = 'B45309';
const GRAY_COLOR = '6B7280';

function statusColor(status: ReportData['measurements'][number]['status']): string | undefined {
  if (status === 'warning') return AMBER_COLOR;
  if (status === 'unavailable') return GRAY_COLOR;
  return undefined;
}

function headerCell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: MUTED_COLOR, size: 18 })] })] });
}

function bodyCell(text: string, color?: string): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, size: 18, ...(color ? { color } : {}) })] })] });
}

function buildTable(headers: string[], rows: string[][], rowColors?: (string | undefined)[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(headerCell) }),
      ...rows.map((row, i) => new TableRow({ children: row.map((cell) => bodyCell(cell, rowColors?.[i])) })),
    ],
  });
}

export interface AnnotatedImageInput {
  pngBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

export async function generateReportDocx(report: ReportData, annotatedImage?: AnnotatedImageInput): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ text: 'SpineMetrics — Informe de estudio', heading: HeadingLevel.TITLE }));
  children.push(
    new Paragraph({
      children: [new TextRun(`Seudónimo: ${report.patientRef}   ·   Edad: ${report.ageYears} años   ·   Fecha: ${report.date}`)],
    }),
  );
  children.push(new Paragraph({ children: [new TextRun(`Proyecciones analizadas: ${report.views.join(', ') || 'ninguna'}`)] }));

  if (report.measurements.length > 0) {
    children.push(new Paragraph({ text: 'Mediciones', heading: HeadingLevel.HEADING_1 }));
    children.push(
      buildTable(
        ['Parámetro', 'Valor', 'Referencia normal', 'Observación'],
        report.measurements.map((m) => [m.label, m.value, m.reference ?? '—', m.observation ?? '']),
        report.measurements.map((m) => statusColor(m.status)),
      ),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Ámbar = calculado con advertencias. Gris = no calculable (motivo en Observación). SPEC.md §8.1.',
            italics: true,
            color: MUTED_COLOR,
            size: 16,
          }),
        ],
      }),
    );
  }

  if (report.classifications.length > 0) {
    children.push(new Paragraph({ text: 'Clasificaciones', heading: HeadingLevel.HEADING_1 }));
    for (const c of report.classifications) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${c.label}: ${c.result}`, bold: true })] }));
      if (c.traceSummary) children.push(new Paragraph({ children: [new TextRun({ text: c.traceSummary, color: MUTED_COLOR, size: 18 })] }));
      if (c.unmetInputs.length > 0) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: `Datos que faltan: ${c.unmetInputs.join(', ')}`, color: AMBER_COLOR, size: 18 })] }),
        );
      }
    }
  }

  if (annotatedImage) {
    children.push(new Paragraph({ text: 'Imagen anotada', heading: HeadingLevel.HEADING_1 }));
    const maxWidth = 500;
    const scale = Math.min(maxWidth / annotatedImage.widthPx, 1);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: annotatedImage.pngBytes,
            transformation: { width: annotatedImage.widthPx * scale, height: annotatedImage.heightPx * scale },
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Radiografía activa con landmarks, líneas y etiquetas visibles al generar el informe.', italics: true, size: 16, color: MUTED_COLOR }),
        ],
      }),
    );
  }

  if (report.followUp) {
    children.push(new Paragraph({ text: `Comparación seriada (estudio índice: ${report.followUp.indexDate})`, heading: HeadingLevel.HEADING_1 }));
    children.push(
      buildTable(
        ['Parámetro', report.followUp.indexDate, report.date, 'Delta'],
        report.followUp.rows.map((r) => [r.label, r.previous, r.current, `${r.delta}${r.isProgression === true ? ' (progresión >5°)' : ''}`]),
      ),
    );
  }

  if (report.maturity.risser || report.maturity.sanders || report.maturity.triradiateOpen) {
    children.push(new Paragraph({ text: 'Madurez esquelética', heading: HeadingLevel.HEADING_1 }));
    if (report.maturity.sanders) children.push(new Paragraph({ children: [new TextRun(`Sanders (SSMS): ${report.maturity.sanders}`)] }));
    if (report.maturity.risser) children.push(new Paragraph({ children: [new TextRun(`Risser: ${report.maturity.risser}`)] }));
    if (report.maturity.triradiateOpen) {
      children.push(new Paragraph({ children: [new TextRun(`Cartílago trirradiado: ${report.maturity.triradiateOpen}`)] }));
    }
  }

  children.push(new Paragraph({ text: 'Apéndice de convenciones usadas (docs/OPEN_QUESTIONS.md)', heading: HeadingLevel.HEADING_1 }));
  children.push(buildTable(['Ref.', 'Ambigüedad', 'Decisión aplicada'], report.appendix.map((e) => [e.id, e.title, e.decision])));

  children.push(new Paragraph({ text: 'Descargo de responsabilidad', heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph({ children: [new TextRun({ text: report.disclaimer, color: MUTED_COLOR })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Generado: ${report.generatedAt}`, size: 14, color: MUTED_COLOR })] }));

  const doc = new Document({ sections: [{ children }] });
  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return new Uint8Array(arrayBuffer);
}
