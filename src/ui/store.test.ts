import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';
import type { CobbMeasurement } from '../core/measurements/cobb';
import type { Radiograph, VertebraAnnotation } from '../core/models/types';
import type { DicomImageSource, RasterImageSource } from '../imaging/types';

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

function makeImage(): RasterImageSource {
  return { kind: 'raster', bitmap: {} as ImageBitmap, width: 400, height: 800 };
}

function makeRadiograph(vertebrae: VertebraAnnotation[] = []): Radiograph {
  return { id: 'r1', view: 'PA_standing', annotations: { vertebrae } };
}

function tilted(centerY: number, tiltDeg: number, xCenter = 200): VertebraAnnotation['superiorEndplate'] {
  const rad = (tiltDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * 20;
  const dy = Math.sin(rad) * 20;
  return [
    { x: xCenter - dx, y: centerY - dy },
    { x: xCenter + dx, y: centerY + dy },
  ];
}

function makeVertebra(level: VertebraAnnotation['level'], centerY: number, tiltDeg: number): VertebraAnnotation {
  return { level, superiorEndplate: tilted(centerY - 15, tiltDeg), inferiorEndplate: tilted(centerY + 15, tiltDeg) };
}

describe('loadImage', () => {
  it('fija la imagen, el radiograph y recalcula el measurementSet', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]);
    useAppStore.getState().loadImage(makeImage(), radiograph);
    const state = useAppStore.getState();
    expect(state.radiograph).toBe(radiograph);
    expect(state.measurementSet).not.toBeNull();
    expect(state.measurementSet!.measurements.cobb!.status).toBe('ok');
    expect(state.history).toHaveLength(0);
  });

  it('usa el window/level por defecto de una imagen DICOM', () => {
    useAppStore.getState().loadImage(
      { kind: 'dicom', width: 10, height: 10, pixelData: new Float32Array(100), defaultWindowCenter: 40, defaultWindowWidth: 400, monochrome1: false },
      makeRadiograph(),
    );
    const state = useAppStore.getState();
    expect(state.windowCenter).toBe(40);
    expect(state.windowWidth).toBe(400);
  });
});

describe('añadir vértebra manualmente (herramienta addVertebra)', () => {
  it('acumula 4 esquinas y crea la vértebra ordenada por nivel', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T12', 200, -15)]));
    useAppStore.getState().startAddVertebra('T5');
    expect(useAppStore.getState().activeTool).toBe('addVertebra');

    useAppStore.getState().placeVertebraCorner({ x: 180, y: 0 }); // superior-izq
    useAppStore.getState().placeVertebraCorner({ x: 220, y: 4 }); // superior-der (10°)
    useAppStore.getState().placeVertebraCorner({ x: 180, y: 30 }); // inferior-izq
    useAppStore.getState().placeVertebraCorner({ x: 220, y: 30 }); // inferior-der

    const state = useAppStore.getState();
    expect(state.activeTool).toBe('select');
    const levels = state.radiograph!.annotations.vertebrae.map((v) => v.level);
    expect(levels).toEqual(['T5', 'T12']); // orden craneal→caudal
    expect(state.measurementSet!.measurements.cobb!.status).toBe('ok');
  });
});

describe('updateLandmark + undo', () => {
  it('mueve un landmark, marca edited, y undo lo revierte', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]);
    useAppStore.getState().loadImage(makeImage(), radiograph);

    useAppStore.getState().updateLandmark({ kind: 'vertebraEndplate', level: 'T5', which: 'superior', side: 'right' }, { x: 999, y: 999 });
    let state = useAppStore.getState();
    expect(state.radiograph!.annotations.vertebrae[0]!.superiorEndplate[1]).toEqual({ x: 999, y: 999 });
    expect(state.radiograph!.annotations.vertebrae[0]!.edited).toBe(true);
    expect(state.history).toHaveLength(1);

    useAppStore.getState().undo();
    state = useAppStore.getState();
    expect(state.radiograph!.annotations.vertebrae[0]!.superiorEndplate[1]).not.toEqual({ x: 999, y: 999 });
    expect(state.history).toHaveLength(0);
  });

  it('undo sin historial no hace nada', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph());
    useAppStore.getState().undo();
    expect(useAppStore.getState().history).toHaveLength(0);
  });
});

describe('beginLandmarkDrag + updateLandmarkLive — un arrastre es un único paso de deshacer', () => {
  it('varias llamadas a updateLandmarkLive tras un beginLandmarkDrag no añaden más de una entrada al historial', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]);
    useAppStore.getState().loadImage(makeImage(), radiograph);

    const ref = { kind: 'vertebraEndplate' as const, level: 'T5' as const, which: 'superior' as const, side: 'right' as const };
    useAppStore.getState().beginLandmarkDrag();
    useAppStore.getState().updateLandmarkLive(ref, { x: 500, y: 1 });
    useAppStore.getState().updateLandmarkLive(ref, { x: 600, y: 2 });
    useAppStore.getState().updateLandmarkLive(ref, { x: 700, y: 3 });

    const state = useAppStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.radiograph!.annotations.vertebrae[0]!.superiorEndplate[1]).toEqual({ x: 700, y: 3 });
    expect(state.radiograph!.annotations.vertebrae[0]!.edited).toBe(true);

    useAppStore.getState().undo();
    const afterUndo = useAppStore.getState();
    expect(afterUndo.history).toHaveLength(0);
    expect(afterUndo.radiograph!.annotations.vertebrae[0]!.superiorEndplate[1]).not.toEqual({ x: 700, y: 3 });
  });
});

describe('nudgeSelectedLandmark — SPEC.md §10.2 flechas 1px / Shift 0.1px', () => {
  it('mueve el landmark seleccionado el delta indicado', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 10)]);
    useAppStore.getState().loadImage(makeImage(), radiograph);
    const ref = { kind: 'vertebraEndplate' as const, level: 'T5' as const, which: 'superior' as const, side: 'left' as const };
    useAppStore.getState().selectLandmark(ref);
    const before = useAppStore.getState().radiograph!.annotations.vertebrae[0]!.superiorEndplate[0];

    useAppStore.getState().nudgeSelectedLandmark(1, 0);
    const after = useAppStore.getState().radiograph!.annotations.vertebrae[0]!.superiorEndplate[0];
    expect(after.x).toBeCloseTo(before.x + 1, 6);

    useAppStore.getState().nudgeSelectedLandmark(0.1, 0);
    const after2 = useAppStore.getState().radiograph!.annotations.vertebrae[0]!.superiorEndplate[0];
    expect(after2.x).toBeCloseTo(before.x + 1.1, 6);
  });

  it('no hace nada sin landmark seleccionado', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10)]));
    useAppStore.getState().nudgeSelectedLandmark(1, 0);
    expect(useAppStore.getState().history).toHaveLength(0);
  });
});

describe('cycleCobbTerminal — docs/OPEN_QUESTIONS.md #42', () => {
  it("'E' (craneal) avanza a la siguiente vértebra anotada, con vuelta circular", () => {
    const radiograph = makeRadiograph([
      makeVertebra('T5', 0, 10),
      makeVertebra('T8', 100, 1),
      makeVertebra('T12', 200, -15),
    ]);
    useAppStore.getState().loadImage(makeImage(), radiograph);
    const cobb = useAppStore.getState().measurementSet!.measurements.cobb as CobbMeasurement;
    expect(cobb.cranialVertebra).toBe('T5');

    useAppStore.getState().cycleCobbTerminal('cranial');
    let state = useAppStore.getState();
    expect(state.forcedCobbTerminals!.cranial).toBe('T8');
    let updatedCobb = state.measurementSet!.measurements.cobb as CobbMeasurement;
    expect(updatedCobb.cranialVertebra).toBe('T8');

    useAppStore.getState().cycleCobbTerminal('cranial');
    useAppStore.getState().cycleCobbTerminal('cranial');
    state = useAppStore.getState();
    // T5 → T8 → T12 → T5 (vuelta circular).
    expect(state.forcedCobbTerminals!.cranial).toBe('T5');
  });

  it("recalcFromScratch descarta la terminal forzada", () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]);
    useAppStore.getState().loadImage(makeImage(), radiograph);
    useAppStore.getState().cycleCobbTerminal('caudal');
    expect(useAppStore.getState().forcedCobbTerminals).not.toBeNull();

    useAppStore.getState().recalcFromScratch();
    expect(useAppStore.getState().forcedCobbTerminals).toBeNull();
  });
});

describe('calibración', () => {
  it('setCalibrationFromRuler recalcula las distancias', () => {
    const radiograph = makeRadiograph([
      { ...makeVertebra('C7', 0, 0), centroid: { x: 220, y: 0 } },
      makeVertebra('T5', 100, 10),
      makeVertebra('T12', 200, -15),
    ]);
    let pelvisRadiograph = radiograph;
    pelvisRadiograph = {
      ...pelvisRadiograph,
      annotations: {
        ...pelvisRadiograph.annotations,
        pelvis: {
          femoralHeads: { left: { center: { x: 160, y: 500 }, radius: 15 }, right: { center: { x: 240, y: 500 }, radius: 15 } },
          s1Endplate: [
            { x: 180, y: 400 },
            { x: 220, y: 400 },
          ],
        },
      },
    };
    useAppStore.getState().loadImage(makeImage(), pelvisRadiograph);
    expect(useAppStore.getState().measurementSet!.measurements.coronalBalance!.status).toBe('unavailable');

    useAppStore.getState().setCalibrationFromRuler(100, 10); // 10 px/mm
    const state = useAppStore.getState();
    expect(state.calibration).toBeDefined();
    expect(state.measurementSet!.measurements.coronalBalance!.status).toBe('ok');
  });
});

describe('estado de vista: zoom, capas, overlays, window/level', () => {
  it('el zoom se acota entre 0.1 y 8 (SPEC.md §10.2, hasta 800%)', () => {
    useAppStore.getState().setZoom(100);
    expect(useAppStore.getState().zoom).toBe(8);
    useAppStore.getState().setZoom(-5);
    expect(useAppStore.getState().zoom).toBe(0.1);
  });

  it('toggleOverlays y toggleLayer invierten sus flags', () => {
    const before = useAppStore.getState().overlaysVisible;
    useAppStore.getState().toggleOverlays();
    expect(useAppStore.getState().overlaysVisible).toBe(!before);

    const beforeLayer = useAppStore.getState().layerVisibility.labels;
    useAppStore.getState().toggleLayer('labels');
    expect(useAppStore.getState().layerVisibility.labels).toBe(!beforeLayer);
  });

  it('toggleInvertGrayscale y toggleHelp invierten sus flags', () => {
    expect(useAppStore.getState().invertGrayscale).toBe(false);
    useAppStore.getState().toggleInvertGrayscale();
    expect(useAppStore.getState().invertGrayscale).toBe(true);

    expect(useAppStore.getState().helpVisible).toBe(false);
    useAppStore.getState().toggleHelp();
    expect(useAppStore.getState().helpVisible).toBe(true);
  });

  it('setWindowLevel fija centro y anchura', () => {
    useAppStore.getState().setWindowLevel(50, 350);
    const state = useAppStore.getState();
    expect(state.windowCenter).toBe(50);
    expect(state.windowWidth).toBe(350);
  });
});

describe('detección automática (SPEC.md §8, sin modelo entrenado)', () => {
  function makeSyntheticSpineDicom(): DicomImageSource {
    const width = 200;
    const height = 800;
    const pixelData = new Float32Array(width * height).fill(100);
    let y = 40;
    for (let i = 0; i < 8; i++) {
      for (let yy = y; yy < y + 40; yy++) {
        for (let xx = 50; xx < 150; xx++) pixelData[yy * width + xx] = 800;
      }
      y += 52;
    }
    return { kind: 'dicom', width, height, pixelData, defaultWindowCenter: 450, defaultWindowWidth: 700, monochrome1: false };
  }

  it('loadImage dispara la detección automática sin que el usuario haga nada (SPEC.md §8)', () => {
    useAppStore.getState().loadImage(makeSyntheticSpineDicom(), makeRadiograph());
    const state = useAppStore.getState();
    expect(state.autoDetection).not.toBeNull();
    expect(state.autoDetection!.detectedBands.length).toBeGreaterThan(0);
    // Etapa 4 sin ancla: nunca hay measurementSet automático fabricado.
    expect(state.autoDetection!.measurementSet).toBeNull();
  });

  it('una imagen sin ninguna estructura detectable no rompe la importación', () => {
    const flat: DicomImageSource = { kind: 'dicom', width: 50, height: 50, pixelData: new Float32Array(2500).fill(100), defaultWindowCenter: 100, defaultWindowWidth: 50, monochrome1: false };
    useAppStore.getState().loadImage(flat, makeRadiograph());
    expect(useAppStore.getState().radiograph).not.toBeNull();
  });

  it('applyAutoDetectionAnchor confirma un nivel y carga las vértebras detectadas', () => {
    useAppStore.getState().loadImage(makeSyntheticSpineDicom(), makeRadiograph());
    const bandCount = useAppStore.getState().autoDetection!.detectedBands.length;
    expect(bandCount).toBeGreaterThan(0);

    useAppStore.getState().applyAutoDetectionAnchor(0, 'T4');
    const state = useAppStore.getState();

    expect(state.autoDetection!.levelLabeling.uncertain).toBe(false);
    expect(state.radiograph!.annotations.vertebrae.length).toBe(bandCount);
    expect(state.radiograph!.annotations.vertebrae[0]!.level).toBe('T4');
    expect(state.radiograph!.annotations.vertebrae[0]!.confidence).toBeDefined();
    expect(state.measurementSet).not.toBeNull();
    expect(state.measurementSet!.source).toBe('auto');
    expect(state.history).toHaveLength(1); // se puede deshacer con Ctrl+Z.
  });

  it('las vértebras autodetectadas se pueden corregir a mano después (bucle de mejora, SPEC.md §12)', () => {
    useAppStore.getState().loadImage(makeSyntheticSpineDicom(), makeRadiograph());
    useAppStore.getState().applyAutoDetectionAnchor(0, 'T4');
    const level = useAppStore.getState().radiograph!.annotations.vertebrae[0]!.level;

    useAppStore.getState().updateLandmark({ kind: 'vertebraEndplate', level, which: 'superior', side: 'left' }, { x: 10, y: 10 });

    const corrected = useAppStore.getState().radiograph!.annotations.vertebrae.find((v) => v.level === level)!;
    expect(corrected.superiorEndplate[0]).toEqual({ x: 10, y: 10 });
  });
});
