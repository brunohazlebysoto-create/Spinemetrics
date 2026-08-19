/**
 * Lado del hilo principal del Web Worker del pipeline (SPEC.md §8). Expone
 * `runPipelineInWorker` con la MISMA firma que `runAutomaticPipeline`
 * (`runPipeline.ts`) pero devolviendo una `Promise`, para que llamarlo no
 * bloquee la UI mientras corre la detección.
 *
 * Si `Worker` no está disponible (Node/Vitest, `environment: 'node'` — no
 * hay Web Workers reales fuera del navegador) cae de vuelta a llamar
 * `runAutomaticPipeline` directamente, en el mismo hilo. Así el resto de
 * la aplicación (store.ts, tests) puede depender siempre de esta función
 * sin ramificar según el entorno, y el comportamiento LÓGICO es idéntico
 * en ambos casos — sólo cambia si bloquea el hilo principal o no.
 */
import { runAutomaticPipeline, type PipelineOptions, type PipelineResult } from './runPipeline';
import type { ImageSource } from '../imaging/types';
import type { RadiographView } from '../core/models/types';
import type { PipelineWorkerRequest, PipelineWorkerResponse } from './worker';

let sharedWorker: Worker | null = null;
let nextRequestId = 0;

function getWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return sharedWorker;
}

function runInWorker(image: ImageSource, viewHint: RadiographView | null, options: PipelineOptions): Promise<PipelineResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const requestId = String(nextRequestId++);

    function handleMessage(event: MessageEvent<PipelineWorkerResponse>): void {
      if (event.data.requestId !== requestId) return; // respuesta de otra petición en vuelo.
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result!);
    }
    function handleError(event: ErrorEvent): void {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      reject(new Error(event.message));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    const request: PipelineWorkerRequest = { requestId, image, viewHint, options };
    worker.postMessage(request);
  });
}

export function runPipelineInWorker(
  image: ImageSource,
  viewHint: RadiographView | null,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(runAutomaticPipeline(image, viewHint, options));
  }
  return runInWorker(image, viewHint, options);
}
