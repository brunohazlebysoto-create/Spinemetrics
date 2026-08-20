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

  it('loadImage dispara la detección automática sin que el usuario haga nada (SPEC.md §8)', async () => {
    useAppStore.getState().loadImage(makeSyntheticSpineDicom(), makeRadiograph());
    // `runAutoDetection` corre en segundo plano (Web Worker en el navegador,
    // ver `pipeline/workerClient.ts`); en Node cae de vuelta al mismo hilo,
    // pero sigue siendo asíncrona — se espera explícitamente su propia
    // Promise en vez de asumir que ya terminó al volver `loadImage`.
    await useAppStore.getState().runAutoDetection();
    const state = useAppStore.getState();
    expect(state.autoDetection).not.toBeNull();
    expect(state.autoDetection!.detectedBands.length).toBeGreaterThan(0);
    // Etapa 4 sin ancla: nunca hay measurementSet automático fabricado.
    expect(state.autoDetection!.measurementSet).toBeNull();
  });

  it('una imagen sin ninguna estructura detectable no rompe la importación', async () => {
    const flat: DicomImageSource = { kind: 'dicom', width: 50, height: 50, pixelData: new Float32Array(2500).fill(100), defaultWindowCenter: 100, defaultWindowWidth: 50, monochrome1: false };
    useAppStore.getState().loadImage(flat, makeRadiograph());
    await useAppStore.getState().runAutoDetection();
    expect(useAppStore.getState().radiograph).not.toBeNull();
  });

  it('applyAutoDetectionAnchor confirma un nivel y carga las vértebras detectadas', async () => {
    useAppStore.getState().loadImage(makeSyntheticSpineDicom(), makeRadiograph());
    await useAppStore.getState().runAutoDetection();
    const bandCount = useAppStore.getState().autoDetection!.detectedBands.length;
    expect(bandCount).toBeGreaterThan(0);

    await useAppStore.getState().applyAutoDetectionAnchor(0, 'T4');
    const state = useAppStore.getState();

    expect(state.autoDetection!.levelLabeling.uncertain).toBe(false);
    expect(state.radiograph!.annotations.vertebrae.length).toBe(bandCount);
    expect(state.radiograph!.annotations.vertebrae[0]!.level).toBe('T4');
    expect(state.radiograph!.annotations.vertebrae[0]!.confidence).toBeDefined();
    expect(state.measurementSet).not.toBeNull();
    expect(state.measurementSet!.source).toBe('auto');
    expect(state.history).toHaveLength(1); // se puede deshacer con Ctrl+Z.
  });

  it('las vértebras autodetectadas se pueden corregir a mano después (bucle de mejora, SPEC.md §12)', async () => {
    useAppStore.getState().loadImage(makeSyntheticSpineDicom(), makeRadiograph());
    await useAppStore.getState().runAutoDetection();
    await useAppStore.getState().applyAutoDetectionAnchor(0, 'T4');
    const level = useAppStore.getState().radiograph!.annotations.vertebrae[0]!.level;

    useAppStore.getState().updateLandmark({ kind: 'vertebraEndplate', level, which: 'superior', side: 'left' }, { x: 10, y: 10 });

    const corrected = useAppStore.getState().radiograph!.annotations.vertebrae.find((v) => v.level === level)!;
    expect(corrected.superiorEndplate[0]).toEqual({ x: 10, y: 10 });
  });
});

describe('multi-radiografía del estudio (SPEC.md §5, §9)', () => {
  function mtCurve(): VertebraAnnotation[] {
    return [
      makeVertebra('T6', 0, 12),
      makeVertebra('T7', 30, 18),
      makeVertebra('T8', 60, 2),
      makeVertebra('T9', 90, -15),
      makeVertebra('T10', 120, -22),
      makeVertebra('T11', 150, -8),
    ];
  }

  function paRadiograph(): Radiograph {
    return { id: 'pa', view: 'PA_standing', annotations: { vertebrae: mtCurve() } };
  }

  it('addRadiographToStudy añade una radiografía sin activarla y recalcula la clasificación de la activa con ella', () => {
    useAppStore.getState().loadImage(makeImage(), paRadiograph());
    const before = useAppStore.getState().measurementSet!.classifications.lenke as unknown as { sagittalModifier: string | null };
    expect(before.sagittalModifier).toBeNull();

    const lat: Radiograph = {
      id: 'lat',
      view: 'LAT_standing',
      annotations: { vertebrae: [makeVertebra('T5', 0, 20), makeVertebra('T12', 200, -30)] },
    };
    useAppStore.getState().addRadiographToStudy(makeImage(), lat);

    const state = useAppStore.getState();
    expect(state.otherRadiographs).toHaveLength(1);
    expect(state.radiograph!.id).toBe('pa'); // sigue activa la PA, la lateral no se activa sola.
    const after = state.measurementSet!.classifications.lenke as unknown as { sagittalModifier: string | null };
    expect(after.sagittalModifier).not.toBeNull();
  });

  it('switchActiveRadiograph intercambia la activa con otherRadiographs[index] (imagen, anotaciones y calibración)', () => {
    const pa = paRadiograph();
    const paImage = makeImage();
    useAppStore.getState().loadImage(paImage, pa);

    const lat: Radiograph = { id: 'lat', view: 'LAT_standing', annotations: { vertebrae: [] } };
    const latImage = makeImage();
    useAppStore.getState().addRadiographToStudy(latImage, lat);

    useAppStore.getState().switchActiveRadiograph(0);
    let state = useAppStore.getState();
    expect(state.radiograph!.id).toBe('lat');
    expect(state.image).toBe(latImage);
    expect(state.otherRadiographs).toHaveLength(1);
    expect(state.otherRadiographs[0]!.radiograph.id).toBe('pa');
    expect(state.otherRadiographs[0]!.image).toBe(paImage);

    useAppStore.getState().switchActiveRadiograph(0);
    state = useAppStore.getState();
    expect(state.radiograph!.id).toBe('pa');
    expect(state.image).toBe(paImage);
  });

  it('switchActiveRadiograph no hace nada si la entrada no tiene imagen (radiografía importada sin recargarla)', () => {
    useAppStore.getState().loadImage(makeImage(), paRadiograph());
    useAppStore.getState().importStudy([paRadiograph(), { id: 'lat', view: 'LAT_standing', annotations: { vertebrae: [] } }]);
    expect(useAppStore.getState().otherRadiographs[0]!.image).toBeUndefined();

    useAppStore.getState().switchActiveRadiograph(0);
    expect(useAppStore.getState().radiograph!.id).toBe('pa'); // no cambia: sin imagen no se puede activar.
  });

  it('importStudy reparte la primera radiografía como activa y el resto en otherRadiographs', () => {
    const pa = paRadiograph();
    const lat: Radiograph = { id: 'lat', view: 'LAT_standing', annotations: { vertebrae: [] } };
    useAppStore.getState().importStudy([pa, lat]);
    const state = useAppStore.getState();
    expect(state.radiograph).toBe(pa);
    expect(state.otherRadiographs).toHaveLength(1);
    expect(state.otherRadiographs[0]!.radiograph).toBe(lat);
  });
});

describe('entradas manuales de clasificación (SPEC.md §9.5–§9.7, §9.9)', () => {
  function mtCurve(): VertebraAnnotation[] {
    return [
      makeVertebra('T6', 0, 12),
      makeVertebra('T7', 30, 18),
      makeVertebra('T8', 60, 2),
      makeVertebra('T9', 90, -15),
      makeVertebra('T10', 120, -22),
      makeVertebra('T11', 150, -8),
    ];
  }

  it('setManualClassificationInputs aplica un parche parcial y recalcula: elegir etiología congénita activa Winter/McMaster', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph(mtCurve()));
    expect(useAppStore.getState().measurementSet!.classifications.congenital).toBeUndefined();

    useAppStore.getState().setManualClassificationInputs({ etiology: 'congenital', congenitalFormationFailure: { kind: 'partialWedge' } });

    const state = useAppStore.getState();
    expect(state.manualClassificationInputs.etiology).toBe('congenital');
    expect(state.measurementSet!.classifications.congenital).toBeDefined();
    const congenital = state.measurementSet!.classifications.congenital as unknown as { mainType: string | null };
    expect(congenital.mainType).toBe('I');
  });

  it('un parche posterior conserva los campos previos no tocados (parche parcial, no reemplazo completo)', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph(mtCurve()));
    useAppStore.getState().setManualClassificationInputs({ etiology: 'congenital' });
    useAppStore.getState().setManualClassificationInputs({ congenitalFormationFailure: { kind: 'partialWedge' } });

    const inputs = useAppStore.getState().manualClassificationInputs;
    expect(inputs.etiology).toBe('congenital'); // sigue puesto del primer parche.
    expect(inputs.congenitalFormationFailure).toEqual({ kind: 'partialWedge' });
  });

  it('setAgeYears recalcula: C-EOS aparece/desaparece al cruzar el umbral de 10 años (SPEC.md §9.5)', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph(mtCurve()));
    useAppStore.getState().setManualClassificationInputs({ etiology: 'idiopathic' });
    useAppStore.getState().setAgeYears(6);
    expect(useAppStore.getState().measurementSet!.classifications.ceos).toBeDefined();

    useAppStore.getState().setAgeYears(16);
    expect(useAppStore.getState().measurementSet!.classifications.ceos).toBeUndefined();
  });
});
