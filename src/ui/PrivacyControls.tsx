/**
 * SPEC.md §11: "opción de borrado completo." `storage/db.ts` ya exponía
 * `deleteAllStudies`/`deleteAllSelfMeasurementCases`, pero ninguna parte de
 * la interfaz los llamaba — esta es la única forma de alcanzarlos. Siempre
 * visible en la barra de herramientas (no depende de haber cargado una
 * radiografía): es un control de privacidad, no de la sesión de trabajo en
 * curso.
 *
 * Tras borrar recarga la página en vez de intentar limpiar cada campo del
 * store a mano: es la única forma de garantizar que no quede ningún dato
 * en memoria (imagen cargada, anotaciones, estudios previos ya
 * consultados) después de un borrado que el usuario pidió que fuera
 * completo — parchear el estado campo a campo arriesga olvidar uno.
 */
import { useState } from 'react';
import { deleteAllSelfMeasurementCases, deleteAllStudies } from '../storage/db';

export function PrivacyControls(): JSX.Element {
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAll(): Promise<void> {
    const confirmed = window.confirm(
      'Esto borra permanentemente todos los estudios guardados y todos los casos de "Medir yo también" en este ' +
        'dispositivo (SPEC.md §11). No se puede deshacer. ¿Continuar?',
    );
    if (!confirmed) return;

    setDeleting(true);
    await Promise.all([deleteAllStudies(), deleteAllSelfMeasurementCases()]);
    window.location.reload();
  }

  return (
    <button type="button" onClick={() => void handleDeleteAll()} disabled={deleting} title="SPEC.md §11: opción de borrado completo">
      {deleting ? 'Borrando…' : 'Borrar todos los datos locales'}
    </button>
  );
}
