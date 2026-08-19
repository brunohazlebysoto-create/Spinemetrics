/**
 * Entrada del Web Worker del pipeline automático. SPEC.md §8: "Corre en un
 * Web Worker." Este archivo es deliberadamente un envoltorio delgado:
 * TODA la lógica vive en `runPipeline.ts` (ya probado en Node vía
 * `vitest.config.ts`, `environment: 'node'`) — aquí sólo se recibe el
 * mensaje, se llama a `runAutomaticPipeline` y se devuelve el resultado.
 * Nunca añadir lógica de negocio aquí: no se puede probar unitariamente un
 * Worker real fuera del navegador.
 */
import { runAutomaticPipeline } from './runPipeline';
import type { PipelineOptions, PipelineResult } from './runPipeline';
import type { ImageSource } from '../imaging/types';
import type { RadiographView } from '../core/models/types';

export interface PipelineWorkerRequest {
  requestId: string;
  image: ImageSource;
  viewHint: RadiographView | null;
  options: PipelineOptions;
}

export interface PipelineWorkerResponse {
  requestId: string;
  result?: PipelineResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<PipelineWorkerRequest>) => {
  const { requestId, image, viewHint, options } = event.data;
  try {
    const result = runAutomaticPipeline(image, viewHint, options);
    const response: PipelineWorkerResponse = { requestId, result };
    self.postMessage(response);
  } catch (err) {
    const response: PipelineWorkerResponse = { requestId, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};
