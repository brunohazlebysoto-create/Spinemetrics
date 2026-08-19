import { describe, expect, it } from 'vitest';
import type * as dicomParser from 'dicom-parser';
import { applyRescale, buildDicomImageSource, computeMinMax, extractCalibration, guessRadiographView, isMultiframe } from './loadDicom';
import type { IImage } from '@cornerstonejs/core/types';

/** Fake mínimo de `dicom-parser.DataSet`: sólo implementa de verdad
 * `string`/`floatString`/`intString`, que es lo único que usa este módulo;
 * el resto de la interfaz se rellena con valores inertes porque TypeScript
 * exige la forma completa. */
function makeFakeDataSet(values: Record<string, string | number>): dicomParser.DataSet {
  const multi: Record<string, string[]> = {};
  for (const [tag, value] of Object.entries(values)) {
    multi[tag] = String(value).split('\\');
  }

  const fake = {
    byteArray: new Uint8Array(),
    byteArrayParser: {} as dicomParser.ByteArrayParser,
    elements: {},
    warnings: [],
    uint16: () => undefined,
    int16: () => undefined,
    uint32: () => undefined,
    int32: () => undefined,
    float: () => undefined,
    double: () => undefined,
    numStringValues: () => undefined,
    string: (tag: string, index = 0) => {
      const parts = multi[tag];
      if (!parts) return undefined;
      const v = parts[index];
      return v === undefined ? undefined : String(v);
    },
    text: () => undefined,
    floatString: (tag: string, index = 0) => {
      const parts = multi[tag];
      if (!parts) return undefined;
      const v = parts[index];
      return v === undefined ? undefined : parseFloat(String(v));
    },
    intString: (tag: string, index = 0) => {
      const parts = multi[tag];
      if (!parts) return undefined;
      const v = parts[index];
      return v === undefined ? undefined : parseInt(String(v), 10);
    },
    attributeTag: () => undefined,
  };
  return fake as unknown as dicomParser.DataSet;
}

describe('extractCalibration — SPEC.md §6', () => {
  it('usa PixelSpacing cuando está presente', () => {
    const dataSet = makeFakeDataSet({ x00280030: '0.2\\0.2' });
    const calibration = extractCalibration(dataSet);
    expect(calibration).not.toBeNull();
    expect(calibration!.method).toBe('dicom');
    expect(calibration!.pxPerMm).toBeCloseTo(5, 6);
  });

  it('corrige la magnificación con ImagerPixelSpacing + SID/SOD', () => {
    const dataSet = makeFakeDataSet({
      x00181164: '0.2\\0.2',
      x00181110: '1000',
      x00181111: '800',
    });
    const calibration = extractCalibration(dataSet);
    expect(calibration!.magnification).toBeCloseTo(1.25, 6);
    expect(calibration!.uncorrectedMagnification).toBeUndefined();
  });

  it('nunca asume un factor fijo sin SID/SOD', () => {
    const dataSet = makeFakeDataSet({ x00181164: '0.2\\0.2' });
    const calibration = extractCalibration(dataSet);
    expect(calibration!.uncorrectedMagnification).toBe(true);
  });

  it('null sin ningún tag de espaciado', () => {
    expect(extractCalibration(makeFakeDataSet({}))).toBeNull();
  });
});

describe('guessRadiographView — pista heurística, no la clasificación real (Fase 3)', () => {
  it('reconoce lateral por ViewPosition', () => {
    expect(guessRadiographView(makeFakeDataSet({ x00185101: 'LL' }))).toBe('LAT_standing');
  });

  it('reconoce PA de pie', () => {
    expect(guessRadiographView(makeFakeDataSet({ x00185101: 'PA' }))).toBe('PA_standing');
  });

  it('reconoce bending por SeriesDescription', () => {
    expect(guessRadiographView(makeFakeDataSet({ x0008103e: 'LEFT BENDING VIEW' }))).toBe('BEND_left');
    expect(guessRadiographView(makeFakeDataSet({ x0008103e: 'RIGHT BENDING VIEW' }))).toBe('BEND_right');
  });

  it('null sin ninguna pista', () => {
    expect(guessRadiographView(makeFakeDataSet({}))).toBeNull();
  });
});

describe('isMultiframe', () => {
  it('true cuando NumberOfFrames > 1', () => {
    expect(isMultiframe(makeFakeDataSet({ x00280008: '12' }))).toBe(true);
  });

  it('false cuando NumberOfFrames es 1 o está ausente', () => {
    expect(isMultiframe(makeFakeDataSet({ x00280008: '1' }))).toBe(false);
    expect(isMultiframe(makeFakeDataSet({}))).toBe(false);
  });
});

describe('applyRescale / computeMinMax', () => {
  it('aplica pendiente e intercepto', () => {
    const out = applyRescale([0, 100, 200], 2, -50);
    expect(Array.from(out)).toEqual([-50, 150, 350]);
  });

  it('computa el mínimo y el máximo', () => {
    const { min, max } = computeMinMax(new Float32Array([5, -3, 10, 0]));
    expect(min).toBe(-3);
    expect(max).toBe(10);
  });
});

describe('buildDicomImageSource', () => {
  function makeFakeImage(overrides: Partial<IImage> = {}): IImage {
    const base: Partial<IImage> = {
      columns: 4,
      rows: 2,
      slope: 1,
      intercept: 0,
      windowCenter: 128,
      windowWidth: 256,
      photometricInterpretation: 'MONOCHROME2',
      getPixelData: () => new Uint16Array([0, 50, 100, 150, 200, 255, 10, 20]),
    };
    return { ...base, ...overrides } as IImage;
  }

  it('usa el window/level de la imagen cuando está presente', () => {
    const source = buildDicomImageSource(makeFakeImage());
    expect(source.kind).toBe('dicom');
    expect(source.width).toBe(4);
    expect(source.height).toBe(2);
    expect(source.defaultWindowCenter).toBe(128);
    expect(source.defaultWindowWidth).toBe(256);
    expect(source.monochrome1).toBe(false);
  });

  it('toma el primer valor cuando windowCenter/windowWidth son arrays (VOI LUT múltiple)', () => {
    const source = buildDicomImageSource(makeFakeImage({ windowCenter: [40, 400], windowWidth: [400, 1500] }));
    expect(source.defaultWindowCenter).toBe(40);
    expect(source.defaultWindowWidth).toBe(400);
  });

  it('estima window/level a partir del rango de píxeles si el DICOM no trae VOI LUT', () => {
    const withoutVoiLut = {
      columns: 4,
      rows: 2,
      slope: 1,
      intercept: 0,
      photometricInterpretation: 'MONOCHROME2',
      getPixelData: () => new Uint16Array([0, 1000]),
    } as IImage;
    const source = buildDicomImageSource(withoutVoiLut);
    expect(source.defaultWindowCenter).toBeCloseTo(500, 6);
    expect(source.defaultWindowWidth).toBeCloseTo(1000, 6);
  });

  it('detecta MONOCHROME1', () => {
    const source = buildDicomImageSource(makeFakeImage({ photometricInterpretation: 'MONOCHROME1' }));
    expect(source.monochrome1).toBe(true);
  });

  it('aplica rescale slope/intercept a los píxeles', () => {
    const source = buildDicomImageSource(
      makeFakeImage({ slope: 2, intercept: -1024, getPixelData: () => new Uint16Array([1024, 1124]) }),
    );
    expect(Array.from(source.pixelData)).toEqual([1024, 1224]);
  });
});
