import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';
import { recomputeMeasurementSet } from './measurementEngine';
import { db, listSelfMeasurementCases, saveStudy, type StoredStudy } from '../storage/db';
import type { CobbMeasurement } from '../core/measurements/cobb';
import type { Radiograph, VertebraAnnotation } from '../core/models/types';
import type { DicomImageSource, RasterImageSource } from '../imaging/types';

const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  await db.studies.clear();
  await db.selfMeasurementCases.clear();
});

function placeVertebra(level: VertebraAnnotation['level'], corners: [number, number][]): void {
  useAppStore.getState().startAddVertebra(level);
  for (const [x, y] of corners) useAppStore.getState().placeVertebraCorner({ x, y });
}

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

describe('madurez esquelética y contexto clínico (SPEC.md §7.11, §5)', () => {
  it('setMaturity aplica un parche parcial sin tocar los campos no mencionados', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([]));
    useAppStore.getState().setMaturity({ sanders: 4 });
    useAppStore.getState().setMaturity({ risserSystem: 'US' });
    useAppStore.getState().setMaturity({ risser: 2 });

    const maturity = useAppStore.getState().maturity;
    expect(maturity.sanders).toBe(4);
    expect(maturity.risserSystem).toBe('US');
    expect(maturity.risser).toBe(2);
  });

  it('borrar el sistema de Risser (docs/OPEN_QUESTIONS.md #32) también borra el grado: no puede quedar huérfano', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([]));
    useAppStore.getState().setMaturity({ risserSystem: 'FR', risser: 3 });
    expect(useAppStore.getState().maturity.risser).toBe(3);

    useAppStore.getState().setMaturity({ risserSystem: undefined, risser: undefined });
    const maturity = useAppStore.getState().maturity;
    expect(maturity.risserSystem).toBeUndefined();
    expect(maturity.risser).toBeUndefined();
    expect('risser' in maturity).toBe(false); // nunca una clave `undefined` explícita en el estado.
  });

  it('setClinical aplica un parche parcial (scoliometerATR, instrumented)', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([]));
    useAppStore.getState().setClinical({ scoliometerATR: 8 });
    useAppStore.getState().setClinical({ instrumented: true });

    const clinical = useAppStore.getState().clinical;
    expect(clinical.scoliometerATR).toBe(8);
    expect(clinical.instrumented).toBe(true);
  });

  it('maturity y clinical persisten al cargar una imagen nueva sobre la misma sesión, igual que manualClassificationInputs', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([]));
    useAppStore.getState().setMaturity({ sanders: 6 });
    useAppStore.getState().setClinical({ instrumented: true });

    useAppStore.getState().loadImage(makeImage(), makeRadiograph([]));
    expect(useAppStore.getState().maturity.sanders).toBe(6);
    expect(useAppStore.getState().clinical.instrumented).toBe(true);
  });
});

describe('seguimiento seriado (SPEC.md §10.4)', () => {
  function curveT5T12(): VertebraAnnotation[] {
    return [makeVertebra('T5', 0, 20), makeVertebra('T12', 200, -20)];
  }

  // Terminales "naturales" (mayor inclinación de cada lado) son T3/L1, no
  // T5/T12: sirve para comprobar que heredar del estudio índice realmente
  // sustituye la selección automática, en vez de coincidir con ella.
  function widerCurve(): VertebraAnnotation[] {
    return [
      makeVertebra('T3', 0, 25),
      makeVertebra('T5', 60, 20),
      makeVertebra('T8', 150, 2),
      makeVertebra('T12', 260, -20),
      makeVertebra('L1', 320, -25),
    ];
  }

  async function seedIndexStudy(patientRef: string, localId: string, terminalsCurve: VertebraAnnotation[]): Promise<StoredStudy> {
    const radiograph = makeRadiograph(terminalsCurve);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const study: StoredStudy = {
      localId,
      patientRef,
      date: '2025-01-01',
      ageYears: 12,
      radiographs: [radiograph],
      measurementSets: [measurementSet],
    };
    await saveStudy(study);
    return study;
  }

  it('loadPriorStudies consulta los estudios guardados del mismo seudónimo, nunca los de otro', async () => {
    useAppStore.getState().setPatientRef('SM-test1');
    await seedIndexStudy('SM-test1', 'index-1', curveT5T12());
    await seedIndexStudy('SM-other', 'index-2', curveT5T12());

    await useAppStore.getState().loadPriorStudies();
    const prior = useAppStore.getState().priorStudies;
    expect(prior).toHaveLength(1);
    expect(prior[0]!.localId).toBe('index-1');
  });

  it('selectIndexStudy hereda las vértebras terminales del Cobb del estudio índice (docs/OPEN_QUESTIONS.md #2, regla obligatoria)', async () => {
    await seedIndexStudy('SM-test2', 'index-1', curveT5T12());

    // loadImage reinicia priorStudies/selectedIndexStudyId (empieza un
    // estudio nuevo): patientRef y loadPriorStudies van DESPUÉS.
    useAppStore.getState().loadImage(makeImage(), makeRadiograph(widerCurve()));
    useAppStore.getState().setPatientRef('SM-test2');
    await useAppStore.getState().loadPriorStudies();

    const beforeCobb = useAppStore.getState().measurementSet!.measurements.cobb as CobbMeasurement;
    expect([beforeCobb.cranialVertebra, beforeCobb.caudalVertebra]).toEqual(['T3', 'L1']); // selección automática, no la heredada.

    useAppStore.getState().selectIndexStudy('index-1');

    const state = useAppStore.getState();
    expect(state.selectedIndexStudyId).toBe('index-1');
    expect(state.forcedCobbTerminals).toEqual({ cranial: 'T5', caudal: 'T12' });
    const afterCobb = state.measurementSet!.measurements.cobb as CobbMeasurement;
    expect(afterCobb.cranialVertebra).toBe('T5');
    expect(afterCobb.caudalVertebra).toBe('T12');
  });

  it('selectIndexStudy(null) limpia la selección sin tocar una terminal ya forzada a mano', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph(widerCurve()));
    useAppStore.getState().cycleCobbTerminal('cranial');
    const manualTerminals = useAppStore.getState().forcedCobbTerminals;
    expect(manualTerminals).not.toBeNull();

    useAppStore.getState().selectIndexStudy(null);
    expect(useAppStore.getState().selectedIndexStudyId).toBeNull();
    expect(useAppStore.getState().forcedCobbTerminals).toEqual(manualTerminals);
  });

  it('getPaStandingMeasurementSet devuelve el measurementSet activo cuando la PA es la radiografía activa', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph(curveT5T12()));
    expect(useAppStore.getState().getPaStandingMeasurementSet()).toBe(useAppStore.getState().measurementSet);
  });

  it('getPaStandingMeasurementSet calcula el de la PA aunque no sea la radiografía activa', () => {
    const pa: Radiograph = { id: 'pa', view: 'PA_standing', annotations: { vertebrae: curveT5T12() } };
    const lat: Radiograph = { id: 'lat', view: 'LAT_standing', annotations: { vertebrae: [] } };
    useAppStore.getState().loadImage(makeImage(), pa);
    useAppStore.getState().addRadiographToStudy(makeImage(), lat);
    useAppStore.getState().switchActiveRadiograph(0);

    expect(useAppStore.getState().radiograph!.view).toBe('LAT_standing');
    const paSet = useAppStore.getState().getPaStandingMeasurementSet();
    expect(paSet).not.toBeNull();
    const cobb = paSet!.measurements.cobb as CobbMeasurement;
    expect(cobb.cranialVertebra).toBe('T5');
    expect(cobb.caudalVertebra).toBe('T12');
  });

  it('getPaStandingMeasurementSet devuelve null si el estudio no tiene ninguna PA_standing', () => {
    useAppStore.getState().loadImage(makeImage(), { id: 'lat', view: 'LAT_standing', annotations: { vertebrae: [] } });
    expect(useAppStore.getState().getPaStandingMeasurementSet()).toBeNull();
  });
});

describe('"Medir yo también" (SPEC.md §10.5)', () => {
  it('startSelfMeasurement empieza un trazado propio vacío, independiente del automático', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));
    useAppStore.getState().startSelfMeasurement();

    const state = useAppStore.getState();
    expect(state.selfMeasurementActive).toBe(true);
    expect(state.selfMeasurement!.radiograph.annotations.vertebrae).toEqual([]);
    expect(state.radiograph!.annotations.vertebrae).toHaveLength(2); // el automático no se toca.
  });

  it('mientras está activo, placeVertebraCorner/removeVertebra escriben en el trazado propio, nunca en el automático', () => {
    const automaticRadiograph = makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]);
    useAppStore.getState().loadImage(makeImage(), automaticRadiograph);
    const automaticMeasurementSetBefore = useAppStore.getState().measurementSet;
    const historyLengthBefore = useAppStore.getState().history.length;

    useAppStore.getState().startSelfMeasurement();
    placeVertebra('T5', [[180, 0], [220, 4], [180, 30], [220, 30]]);
    placeVertebra('T12', [[180, 200], [220, 196], [180, 230], [220, 230]]);

    const state = useAppStore.getState();
    expect(state.selfMeasurement!.radiograph.annotations.vertebrae.map((v) => v.level)).toEqual(['T5', 'T12']);
    expect(state.selfMeasurement!.measurementSet).not.toBeNull();
    // El automático queda exactamente igual: ni las vértebras, ni el
    // measurementSet, ni el historial de deshacer se tocan.
    expect(state.radiograph).toBe(automaticRadiograph);
    expect(state.measurementSet).toBe(automaticMeasurementSetBefore);
    expect(state.history).toHaveLength(historyLengthBefore);

    useAppStore.getState().removeVertebra('T12');
    expect(useAppStore.getState().selfMeasurement!.radiograph.annotations.vertebrae.map((v) => v.level)).toEqual(['T5']);
    expect(useAppStore.getState().radiograph!.annotations.vertebrae).toHaveLength(2); // sigue intacto.
  });

  it('cancelSelfMeasurement descarta el trazado propio sin guardar nada', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));
    useAppStore.getState().startSelfMeasurement();
    placeVertebra('T5', [[180, 0], [220, 4], [180, 30], [220, 30]]);

    useAppStore.getState().cancelSelfMeasurement();
    const state = useAppStore.getState();
    expect(state.selfMeasurementActive).toBe(false);
    expect(state.selfMeasurement).toBeNull();
  });

  it('finishSelfMeasurement guarda un caso completo (propio + automático) sólo cuando hay algo trazado', async () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));

    useAppStore.getState().startSelfMeasurement();
    await useAppStore.getState().finishSelfMeasurement(); // sin nada trazado: no debe guardar caso.
    expect(await listSelfMeasurementCases()).toHaveLength(0);
    expect(useAppStore.getState().selfMeasurementActive).toBe(false);

    useAppStore.getState().startSelfMeasurement();
    placeVertebra('T5', [[180, 0], [220, 4], [180, 30], [220, 30]]);
    placeVertebra('T12', [[180, 200], [220, 196], [180, 230], [220, 230]]);
    await useAppStore.getState().finishSelfMeasurement();

    const cases = await listSelfMeasurementCases();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.own.measurements.cobb!.status).toBe('ok');
    expect(cases[0]!.automatic.measurements.cobb!.status).toBe('ok');

    // El trazado propio sigue disponible para mostrar la tabla, aunque el
    // modo ya no esté activo.
    const state = useAppStore.getState();
    expect(state.selfMeasurementActive).toBe(false);
    expect(state.selfMeasurement).not.toBeNull();
  });

  it('integridad del cegamiento: reactivar overlays a mitad de la medición propia marca el caso unblinded (docs/OPEN_QUESTIONS.md #39)', async () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));
    useAppStore.getState().startSelfMeasurement();
    expect(useAppStore.getState().overlaysVisible).toBe(false);
    expect(useAppStore.getState().selfMeasurementUnblinded).toBe(false);

    useAppStore.getState().toggleOverlays(); // consulta el automático a mitad de camino.
    expect(useAppStore.getState().overlaysVisible).toBe(true);
    expect(useAppStore.getState().selfMeasurementUnblinded).toBe(true);

    // Es irreversible para esta medición: apagar overlays otra vez no lo limpia.
    useAppStore.getState().toggleOverlays();
    expect(useAppStore.getState().selfMeasurementUnblinded).toBe(true);

    placeVertebra('T5', [[180, 0], [220, 4], [180, 30], [220, 30]]);
    placeVertebra('T12', [[180, 200], [220, 196], [180, 230], [220, 230]]);
    await useAppStore.getState().finishSelfMeasurement();

    const cases = await listSelfMeasurementCases();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.unblinded).toBe(true);
  });

  it('sin consultar el automático, el caso guardado queda unblinded: false', async () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));
    useAppStore.getState().startSelfMeasurement();
    placeVertebra('T5', [[180, 0], [220, 4], [180, 30], [220, 30]]);
    placeVertebra('T12', [[180, 200], [220, 196], [180, 230], [220, 230]]);
    await useAppStore.getState().finishSelfMeasurement();

    const cases = await listSelfMeasurementCases();
    expect(cases[0]!.unblinded).toBe(false);
  });

  it('el caso guardado copia clinical.instrumented y cuenta las vértebras identificables del trazado propio (docs/OPEN_QUESTIONS.md #38)', async () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));
    useAppStore.getState().setClinical({ instrumented: true });
    useAppStore.getState().startSelfMeasurement();
    placeVertebra('T5', [[180, 0], [220, 4], [180, 30], [220, 30]]);
    placeVertebra('T12', [[180, 200], [220, 196], [180, 230], [220, 230]]);
    await useAppStore.getState().finishSelfMeasurement();

    const cases = await listSelfMeasurementCases();
    expect(cases[0]!.instrumented).toBe(true);
    expect(cases[0]!.identifiableVertebraeCount).toBe(2);
  });

  it('startSelfMeasurement reinicia selfMeasurementUnblinded para el siguiente intento', () => {
    useAppStore.getState().loadImage(makeImage(), makeRadiograph([makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)]));
    useAppStore.getState().startSelfMeasurement();
    useAppStore.getState().toggleOverlays();
    expect(useAppStore.getState().selfMeasurementUnblinded).toBe(true);

    useAppStore.getState().cancelSelfMeasurement();
    useAppStore.getState().startSelfMeasurement();
    expect(useAppStore.getState().selfMeasurementUnblinded).toBe(false);
  });
});
