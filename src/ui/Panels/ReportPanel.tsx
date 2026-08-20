/**
 * Exportación del informe (SPEC.md §12): PDF y DOCX generados enteramente
 * en el cliente, sin llamada de red (SPEC.md §11). Reutiliza exactamente
 * los mismos datos que el resto de la interfaz — `ui/report.ts` construye
 * el `ReportData` a partir del `measurementSet`/`maturity`/comparación
 * seriada ya calculados por el store, nunca recalcula nada por su cuenta.
 *
 * La "imagen anotada" (punto 4) se captura del `Stage` de Konva activo
 * (`store.ts::stageRef`), encajando la imagen igual que al importarla
 * (`Viewer/fitImage.ts::computeFitZoomPan`) para que la captura sea
 * reproducible en vez de depender del zoom/pan que el usuario tenga en ese
 * momento — el zoom/pan se restaura después, la captura nunca deja el
 * visor en un estado distinto del que tenía el usuario.
 */
import { useState } from 'react';
import { useAppStore } from '../store';
import { buildReportData } from '../report';
import { generateReportPdf } from '../reportPdf';
import { generateReportDocx } from '../reportDocx';
import { computeFollowUpDeltas, paStandingMeasurementSet } from '../followUp';
import { computeFitZoomPan } from '../Viewer/fitImage';
import type { Radiograph } from '../../core/models/types';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downloadFile(bytes: Uint8Array, filename: string, mimeType: string): void {
  // `.slice()` copia a un `Uint8Array` respaldado por un `ArrayBuffer`
  // concreto: `pdf-lib`/`docx` pueden devolver uno tipado sobre
  // `ArrayBufferLike` (admite `SharedArrayBuffer`), que `BlobPart` rechaza.
  const blob = new Blob([bytes.slice()], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportPanel(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const otherRadiographs = useAppStore((s) => s.otherRadiographs);
  const measurementSet = useAppStore((s) => s.measurementSet);
  const patientRef = useAppStore((s) => s.patientRef);
  const ageYears = useAppStore((s) => s.ageYears);
  const studyDate = useAppStore((s) => s.studyDate);
  const maturity = useAppStore((s) => s.maturity);
  const priorStudies = useAppStore((s) => s.priorStudies);
  const selectedIndexStudyId = useAppStore((s) => s.selectedIndexStudyId);
  const image = useAppStore((s) => s.image);
  const [status, setStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState<'pdf' | 'docx' | null>(null);

  if (!radiograph || !measurementSet) return null;

  function buildFollowUpInput(): { indexDate: string; rows: ReturnType<typeof computeFollowUpDeltas> } | null {
    const indexStudy = priorStudies.find((s) => s.localId === selectedIndexStudyId);
    if (!indexStudy) return null;
    const indexSet = paStandingMeasurementSet(indexStudy);
    if (!indexSet || !measurementSet) return null;
    return { indexDate: indexStudy.date, rows: computeFollowUpDeltas(indexSet, measurementSet) };
  }

  /** Best-effort: si no hay `Stage` montado (p. ej. un `Study` importado sin
   * volver a cargar la imagen, `StudyIO.tsx`), el informe se genera igual,
   * sólo sin la sección de imagen anotada — nunca bloquea la exportación. */
  async function captureAnnotatedImage(): Promise<{ pngBytes: Uint8Array; widthPx: number; heightPx: number } | null> {
    const { stageRef, image: currentImage, zoom: originalZoom, pan: originalPan, setZoom, setPan } = useAppStore.getState();
    if (!stageRef || !currentImage) return null;

    const { zoom: fitZoom, pan: fitPan } = computeFitZoomPan(currentImage.width, currentImage.height, stageRef.width(), stageRef.height());
    setZoom(fitZoom);
    setPan(fitPan);
    // Dos frames de animación: Konva repinta de forma asíncrona tras cambiar zoom/pan.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const pixelRatio = 2;
    const dataUrl = stageRef.toDataURL({ mimeType: 'image/png', pixelRatio });
    setZoom(originalZoom);
    setPan(originalPan);

    return { pngBytes: dataUrlToUint8Array(dataUrl), widthPx: stageRef.width() * pixelRatio, heightPx: stageRef.height() * pixelRatio };
  }

  async function handleExport(format: 'pdf' | 'docx'): Promise<void> {
    setGenerating(format);
    setStatus(null);
    try {
      const allRadiographs: Radiograph[] = [radiograph!, ...otherRadiographs.map((e) => e.radiograph)];
      const report = buildReportData({
        patientRef: patientRef || 'sin-seudónimo',
        ageYears,
        date: studyDate,
        radiographs: allRadiographs,
        measurementSet: measurementSet!,
        maturity,
        followUp: buildFollowUpInput(),
      });

      const capture = await captureAnnotatedImage();
      const filenameBase = `spinemetrics-${patientRef || 'informe'}-${studyDate}`;

      if (format === 'pdf') {
        const bytes = await generateReportPdf(report, capture?.pngBytes);
        downloadFile(bytes, `${filenameBase}.pdf`, 'application/pdf');
      } else {
        const bytes = await generateReportDocx(
          report,
          capture ? { pngBytes: capture.pngBytes, widthPx: capture.widthPx, heightPx: capture.heightPx } : undefined,
        );
        downloadFile(bytes, `${filenameBase}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
      setStatus(`${format.toUpperCase()} generado.`);
    } catch (e) {
      setStatus(e instanceof Error ? `No se pudo generar el informe: ${e.message}` : 'No se pudo generar el informe.');
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div style={{ padding: 16, borderTop: '1px solid #26282e' }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Informe (SPEC.md §12)
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a8f98' }}>
        Mediciones, clasificaciones, madurez esquelética, comparación seriada (si hay estudio índice elegido) e imagen
        anotada — generado localmente, sin envío de datos.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void handleExport('pdf')} disabled={generating !== null}>
          {generating === 'pdf' ? 'Generando…' : 'Exportar PDF'}
        </button>
        <button type="button" onClick={() => void handleExport('docx')} disabled={generating !== null}>
          {generating === 'docx' ? 'Generando…' : 'Exportar DOCX'}
        </button>
      </div>
      {!image && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>Sin imagen cargada: el informe se generará sin la sección de imagen anotada.</p>}
      {status && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>{status}</p>}
    </div>
  );
}
