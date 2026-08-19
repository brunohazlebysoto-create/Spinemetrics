/**
 * Estado central de la aplicación (Zustand). SPEC.md §3 ("Estado:
 * Zustand"), §10.2 (corrección en vivo, atajos, herramientas del visor).
 *
 * Orquesta `core/measurements` (vía `measurementEngine.ts`) y
 * `landmarkRef.ts` sobre el `Radiograph` activo. No contiene lógica clínica
 * propia: cualquier cálculo vive en `core/`, este módulo sólo decide CUÁNDO
 * recalcular y guarda el historial para deshacer.
 */
import { create } from 'zustand';
import type { Pt } from '../core/geometry/types';
import type { Radiograph, SpinalLevel, VertebraAnnotation } from '../core/models/types';
import type { Calibration } from '../core/calibration/calibration';
import { calibrationFromRuler } from '../core/calibration/calibration';
import { recomputeMeasurementSet, type RecomputeOptions } from './measurementEngine';
import type { MeasurementSet } from '../core/models/types';
import { getLandmarkPoint, setLandmarkPoint, type LandmarkRef } from './landmarkRef';
import { compareSpinalLevels } from './spinalLevelOrder';
import type { ImageSource } from '../imaging/types';
import type { PipelineResult } from '../pipeline/runPipeline';
import { runPipelineInWorker } from '../pipeline/workerClient';

export type ToolMode = 'select' | 'addVertebra' | 'ruler';

export interface LayerVisibility {
  landmarks: boolean;
  derivedLines: boolean;
  labels: boolean;
}

interface CobbTerminalOverride {
  cranial: SpinalLevel;
  caudal: SpinalLevel;
}

export interface AppState {
  image: ImageSource | null;
  radiograph: Radiograph | null;
  calibration: Calibration | undefined;
  measurementSet: MeasurementSet | null;

  /** Metadatos mínimos del `Study` en curso (Fase 2: un único `Radiograph`
   * activo por estudio; SPEC.md §5 permite varios, pero el visor de esta
   * fase no ofrece todavía cambiar entre proyecciones de un mismo
   * estudio). `patientRef` es el seudónimo local (SPEC.md §11), nunca un
   * identificador real. */
  patientRef: string;
  studyDate: string;
  ageYears: number;

  /** SPEC.md §10.2: "Ctrl+Z deshacer ilimitado." Pila de estados previos del
   * `Radiograph`; sólo cubre ediciones de anotaciones, no la calibración ni
   * el estado de la vista (zoom/pan/window-level), que no son "landmarks". */
  history: Radiograph[];

  activeTool: ToolMode;
  /** Nivel elegido antes de empezar a colocar las 4 esquinas de una
   * vértebra nueva con la herramienta `addVertebra`. */
  pendingVertebraLevel: SpinalLevel | null;
  /** Esquinas ya colocadas de la vértebra en construcción, en el orden
   * superior-izquierda, superior-derecha, inferior-izquierda, inferior-derecha. */
  pendingVertebraPoints: Pt[];

  selectedLandmark: LandmarkRef | null;
  /** true mientras el usuario arrastra un landmark. SPEC.md §10.2: "lupa al
   * colocar puntos" — el visor la muestra mientras esto es true o mientras
   * la herramienta activa está a punto de colocar un punto nuevo. */
  isDraggingLandmark: boolean;
  forcedCobbTerminals: CobbTerminalOverride | null;

  zoom: number;
  pan: Pt;
  windowCenter: number | null;
  windowWidth: number | null;
  invertGrayscale: boolean;
  overlaysVisible: boolean;
  layerVisibility: LayerVisibility;
  helpVisible: boolean;

  /**
   * Etapas 0–3, 5 y 8 del pipeline automático (SPEC.md §8), ejecutadas sin
   * ancla de nivel — sólo detección, nunca cálculo (Etapa 4 exige
   * confirmación explícita, ver `applyAutoDetectionAnchor`). `null` antes
   * de importar o si el pipeline aún no ha corrido.
   */
  autoDetection: PipelineResult | null;
  /** true mientras `runPipelineInWorker` está en vuelo (SPEC.md §8: "corre
   * en un Web Worker" — no bloquea el hilo principal, así que hay un hueco
   * real entre importar y tener `autoDetection`). */
  autoDetectionLoading: boolean;

  loadImage: (image: ImageSource, radiograph: Radiograph, calibration?: Calibration) => void;
  /** SPEC.md §8: "se dispara al importar, sin que el usuario pulse nada" y
   * "corre en un Web Worker". Corre las etapas de detección (sin ancla de
   * nivel todavía) en el worker y guarda el resultado en `autoDetection`
   * para que la UI lo muestre. Devuelve la `Promise` para que quien la
   * llame (p. ej. las pruebas) pueda esperar a que termine. */
  runAutoDetection: () => Promise<void>;
  /** Etapa 4: confirma qué nivel corresponde a la banda `bandIndex` de
   * `autoDetection.detectedBands`, vuelve a correr el pipeline (en el
   * worker) con ese ancla y, si produce un resultado, reemplaza las
   * vértebras anotadas del `Radiograph` activo por las detectadas (con su
   * `confidence`), como punto de partida editable — igual que el "bucle de
   * mejora" de SPEC.md §12: cualquier corrección manual posterior marca
   * `edited: true`. */
  applyAutoDetectionAnchor: (bandIndex: number, level: SpinalLevel) => Promise<void>;
  setRadiographView: (view: Radiograph['view']) => void;
  setPatientRef: (patientRef: string) => void;
  setStudyDate: (date: string) => void;
  setAgeYears: (ageYears: number) => void;
  /** Reemplaza el `Radiograph` activo (p. ej. al importar un estudio JSON,
   * SPEC.md §12) conservando la imagen ya cargada, si la hay: el JSON de
   * exportación guarda anotaciones y mediciones, no los píxeles originales. */
  importRadiograph: (radiograph: Radiograph) => void;
  setActiveTool: (tool: ToolMode) => void;

  startAddVertebra: (level: SpinalLevel) => void;
  placeVertebraCorner: (point: Pt) => void;
  cancelAddVertebra: () => void;
  removeVertebra: (level: SpinalLevel) => void;

  /** Movimiento discreto de un landmark (un paso de deshacer completo). */
  updateLandmark: (ref: LandmarkRef, point: Pt) => void;
  /** Captura el estado previo al gesto en el historial. Se llama una vez al
   * empezar un arrastre continuo (Konva `onDragStart`), antes de la
   * primera llamada a `updateLandmarkLive`. */
  beginLandmarkDrag: () => void;
  /** Mueve un landmark y recalcula, sin tocar el historial. Se llama en
   * cada fotograma de un arrastre continuo (Konva `onDragMove`). */
  updateLandmarkLive: (ref: LandmarkRef, point: Pt) => void;
  setIsDraggingLandmark: (dragging: boolean) => void;
  selectLandmark: (ref: LandmarkRef | null) => void;
  /** SPEC.md §10.2: flechas mueven 1 px, Shift+flechas 0.1 px. */
  nudgeSelectedLandmark: (dx: number, dy: number) => void;

  setCalibrationFromRuler: (pxLength: number, knownLengthMm: number) => void;
  setCalibration: (calibration: Calibration | undefined) => void;

  /** `docs/OPEN_QUESTIONS.md` #42: `E` cicla la terminal craneal,
   * `Shift+E` la caudal. */
  cycleCobbTerminal: (role: 'cranial' | 'caudal') => void;
  /** SPEC.md §10.2: "R recalcular desde cero" — descarta cualquier
   * vértebra terminal forzada y vuelve a la selección automática. */
  recalcFromScratch: () => void;

  undo: () => void;

  toggleOverlays: () => void;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Pt) => void;
  setWindowLevel: (center: number, width: number) => void;
  toggleInvertGrayscale: () => void;
  toggleHelp: () => void;
}

const MAX_ZOOM = 8; // SPEC.md §10.2: "zoom hasta 800 %".
const MIN_ZOOM = 0.1;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function recompute(
  radiograph: Radiograph | null,
  calibration: Calibration | undefined,
  forcedCobbTerminals: CobbTerminalOverride | null,
): MeasurementSet | null {
  if (!radiograph) return null;
  const options: RecomputeOptions = {
    ...(calibration ? { calibration } : {}),
    ...(forcedCobbTerminals ? { forcedCobbTerminals } : {}),
  };
  return recomputeMeasurementSet(radiograph, options);
}

export const useAppStore = create<AppState>((set, get) => ({
  image: null,
  radiograph: null,
  calibration: undefined,
  measurementSet: null,
  history: [],

  patientRef: '',
  studyDate: new Date().toISOString().slice(0, 10),
  ageYears: 0,

  activeTool: 'select',
  pendingVertebraLevel: null,
  pendingVertebraPoints: [],

  selectedLandmark: null,
  isDraggingLandmark: false,
  forcedCobbTerminals: null,

  zoom: 1,
  pan: { x: 0, y: 0 },
  windowCenter: null,
  windowWidth: null,
  invertGrayscale: false,
  overlaysVisible: true,
  layerVisibility: { landmarks: true, derivedLines: true, labels: true },
  helpVisible: false,
  autoDetection: null,
  autoDetectionLoading: false,

  loadImage: (image, radiograph, calibration) => {
    set({
      image,
      radiograph,
      calibration,
      history: [],
      forcedCobbTerminals: null,
      selectedLandmark: null,
      activeTool: 'select',
      pendingVertebraLevel: null,
      pendingVertebraPoints: [],
      zoom: 1,
      pan: { x: 0, y: 0 },
      windowCenter: image.kind === 'dicom' ? image.defaultWindowCenter : null,
      windowWidth: image.kind === 'dicom' ? image.defaultWindowWidth : null,
      measurementSet: recompute(radiograph, calibration, null),
      autoDetection: null,
    });
    // SPEC.md §8: "se dispara al importar, sin que el usuario pulse nada."
    // No se espera aquí (loadImage sigue siendo síncrona para quien la
    // llama) — corre en segundo plano y actualiza el estado cuando termina.
    void get().runAutoDetection();
  },

  runAutoDetection: async () => {
    const { image, radiograph } = get();
    if (!image) return;
    set({ autoDetectionLoading: true });
    try {
      const result = await runPipelineInWorker(image, radiograph?.view ?? null);
      // Si se importó otra imagen mientras esta detección estaba en vuelo,
      // descartar el resultado obsoleto en vez de pisar el estado actual.
      if (get().image !== image) return;
      set({ autoDetection: result });
    } catch {
      // Un heurístico best-effort no debe tumbar la importación si falla
      // sobre una imagen atípica: se queda sin detección automática, el
      // flujo manual sigue disponible igual (SPEC.md §8 no es una ruta
      // obligatoria para poder medir).
      if (get().image === image) set({ autoDetection: null });
    } finally {
      if (get().image === image) set({ autoDetectionLoading: false });
    }
  },

  applyAutoDetectionAnchor: async (bandIndex, level) => {
    const { image, radiograph, autoDetection, calibration, history } = get();
    if (!image || !radiograph || !autoDetection) return;
    set({ autoDetectionLoading: true });
    const result = await runPipelineInWorker(image, radiograph.view, { levelAnchor: { bandIndex, level } });
    if (get().image !== image) return; // se importó otra imagen mientras tanto.
    set({ autoDetection: result, autoDetectionLoading: false });
    if (!result.radiograph) return;

    const updated: Radiograph = { ...radiograph, annotations: { ...result.radiograph.annotations } };
    set({
      radiograph: updated,
      history: [...history, radiograph],
      measurementSet: result.measurementSet ?? recompute(updated, calibration, null),
      selectedLandmark: null,
    });
  },

  setRadiographView: (view) => {
    const { radiograph } = get();
    if (!radiograph) return;
    set({ radiograph: { ...radiograph, view } });
  },

  setPatientRef: (patientRef) => set({ patientRef }),
  setStudyDate: (studyDate) => set({ studyDate }),
  setAgeYears: (ageYears) => set({ ageYears }),

  importRadiograph: (radiograph) => {
    const { calibration } = get();
    set({
      radiograph,
      history: [],
      forcedCobbTerminals: null,
      selectedLandmark: null,
      measurementSet: recompute(radiograph, calibration, null),
    });
  },

  setActiveTool: (tool) => set({ activeTool: tool, pendingVertebraLevel: null, pendingVertebraPoints: [] }),

  startAddVertebra: (level) => set({ activeTool: 'addVertebra', pendingVertebraLevel: level, pendingVertebraPoints: [] }),

  placeVertebraCorner: (point) => {
    const { pendingVertebraLevel, pendingVertebraPoints, radiograph } = get();
    if (!pendingVertebraLevel || !radiograph) return;

    const points = [...pendingVertebraPoints, point];
    if (points.length < 4) {
      set({ pendingVertebraPoints: points });
      return;
    }

    const [superiorLeft, superiorRight, inferiorLeft, inferiorRight] = points as [Pt, Pt, Pt, Pt];
    const newVertebra: VertebraAnnotation = {
      level: pendingVertebraLevel,
      superiorEndplate: [superiorLeft, superiorRight],
      inferiorEndplate: [inferiorLeft, inferiorRight],
    };

    const withoutExisting = radiograph.annotations.vertebrae.filter((v) => v.level !== pendingVertebraLevel);
    const vertebrae = [...withoutExisting, newVertebra].sort((a, b) => compareSpinalLevels(a.level, b.level));
    const updated: Radiograph = { ...radiograph, annotations: { ...radiograph.annotations, vertebrae } };

    const { history, calibration, forcedCobbTerminals } = get();
    set({
      radiograph: updated,
      history: [...history, radiograph],
      measurementSet: recompute(updated, calibration, forcedCobbTerminals),
      activeTool: 'select',
      pendingVertebraLevel: null,
      pendingVertebraPoints: [],
    });
  },

  cancelAddVertebra: () => set({ activeTool: 'select', pendingVertebraLevel: null, pendingVertebraPoints: [] }),

  removeVertebra: (level) => {
    const { radiograph, history, calibration, forcedCobbTerminals } = get();
    if (!radiograph) return;
    const vertebrae = radiograph.annotations.vertebrae.filter((v) => v.level !== level);
    const updated: Radiograph = { ...radiograph, annotations: { ...radiograph.annotations, vertebrae } };
    set({
      radiograph: updated,
      history: [...history, radiograph],
      measurementSet: recompute(updated, calibration, forcedCobbTerminals),
      selectedLandmark: null,
    });
  },

  updateLandmark: (ref, point) => {
    // Un solo movimiento discreto (nudge por teclado, ruler, primer punto
    // de pelvis/costilla): se trata como un paso de deshacer completo.
    get().beginLandmarkDrag();
    get().updateLandmarkLive(ref, point);
  },

  beginLandmarkDrag: () => {
    const { radiograph, history } = get();
    if (!radiograph) return;
    set({ history: [...history, radiograph] });
  },

  updateLandmarkLive: (ref, point) => {
    // SPEC.md §10.2: "Al moverlo se recalculan [...] en tiempo real." Se
    // llama en cada fotograma de un arrastre; el historial ya capturó el
    // estado previo al gesto en `beginLandmarkDrag`, así que aquí NO se
    // empuja una entrada nueva por cada fotograma — de lo contrario un solo
    // arrastre de ratón generaría cientos de pasos de "deshacer".
    const { radiograph, calibration, forcedCobbTerminals } = get();
    if (!radiograph) return;
    const updated = setLandmarkPoint(radiograph, ref, point);
    set({ radiograph: updated, measurementSet: recompute(updated, calibration, forcedCobbTerminals) });
  },

  setIsDraggingLandmark: (dragging) => set({ isDraggingLandmark: dragging }),

  selectLandmark: (ref) => set({ selectedLandmark: ref }),

  nudgeSelectedLandmark: (dx, dy) => {
    const { radiograph, selectedLandmark } = get();
    if (!radiograph || !selectedLandmark) return;
    const current = getLandmarkPoint(radiograph, selectedLandmark);
    if (!current) return;
    get().updateLandmark(selectedLandmark, { x: current.x + dx, y: current.y + dy });
  },

  setCalibrationFromRuler: (pxLength, knownLengthMm) => {
    const calibration = calibrationFromRuler(pxLength, knownLengthMm);
    get().setCalibration(calibration);
  },

  setCalibration: (calibration) => {
    const { radiograph, forcedCobbTerminals } = get();
    set({ calibration, measurementSet: recompute(radiograph, calibration, forcedCobbTerminals) });
  },

  cycleCobbTerminal: (role) => {
    const { radiograph, forcedCobbTerminals, measurementSet, calibration } = get();
    if (!radiograph || radiograph.annotations.vertebrae.length === 0) return;
    const levels = [...radiograph.annotations.vertebrae.map((v) => v.level)].sort(compareSpinalLevels);

    const cobbFields = measurementSet?.measurements.cobb as { cranialVertebra?: SpinalLevel | null; caudalVertebra?: SpinalLevel | null } | undefined;
    const current: CobbTerminalOverride = forcedCobbTerminals ?? {
      cranial: cobbFields?.cranialVertebra ?? levels[0]!,
      caudal: cobbFields?.caudalVertebra ?? levels[levels.length - 1]!,
    };

    const currentLevel = role === 'cranial' ? current.cranial : current.caudal;
    const index = levels.indexOf(currentLevel);
    const nextLevel = levels[(index + 1) % levels.length]!;
    const next: CobbTerminalOverride = role === 'cranial' ? { ...current, cranial: nextLevel } : { ...current, caudal: nextLevel };

    set({
      forcedCobbTerminals: next,
      measurementSet: recompute(radiograph, calibration, next),
    });
  },

  recalcFromScratch: () => {
    const { radiograph, calibration } = get();
    set({ forcedCobbTerminals: null, measurementSet: recompute(radiograph, calibration, null) });
  },

  undo: () => {
    const { history, calibration, forcedCobbTerminals } = get();
    if (history.length === 0) return;
    const previous = history[history.length - 1]!;
    set({
      radiograph: previous,
      history: history.slice(0, -1),
      measurementSet: recompute(previous, calibration, forcedCobbTerminals),
    });
  },

  toggleOverlays: () => set((s) => ({ overlaysVisible: !s.overlaysVisible })),
  toggleLayer: (layer) => set((s) => ({ layerVisibility: { ...s.layerVisibility, [layer]: !s.layerVisibility[layer] } })),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  setPan: (pan) => set({ pan }),
  setWindowLevel: (windowCenter, windowWidth) => set({ windowCenter, windowWidth }),
  toggleInvertGrayscale: () => set((s) => ({ invertGrayscale: !s.invertGrayscale })),
  toggleHelp: () => set((s) => ({ helpVisible: !s.helpVisible })),
}));
