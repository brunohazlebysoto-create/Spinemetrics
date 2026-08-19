import { describe, expect, it } from 'vitest';
import {
  calibrationFromDicom,
  calibrationFromRuler,
  calibrationFromSphere,
  convertPxToMm,
} from './calibration';

describe('calibrationFromDicom', () => {
  it('usa PixelSpacing cuando está presente (SPEC.md §6)', () => {
    const calibration = calibrationFromDicom({ pixelSpacing: [0.2, 0.2] });
    expect(calibration).not.toBeNull();
    expect(calibration!.method).toBe('dicom');
    expect(calibration!.pxPerMm).toBeCloseTo(5, 6);
    expect(calibration!.uncorrectedMagnification).toBeUndefined();
  });

  it('promedia PixelSpacing no cuadrado', () => {
    const calibration = calibrationFromDicom({ pixelSpacing: [0.1, 0.3] });
    // Espaciado medio 0.2 mm/px → 5 px/mm.
    expect(calibration!.pxPerMm).toBeCloseTo(5, 6);
  });

  it('corrige la magnificación con ImagerPixelSpacing + SID/SOD', () => {
    const calibration = calibrationFromDicom({
      imagerPixelSpacing: [0.2, 0.2],
      distanceSourceToDetector: 1000,
      distanceSourceToPatient: 800,
    });
    expect(calibration).not.toBeNull();
    // magnificación = 1000/800 = 1.25 → espaciado en el paciente = 0.2/1.25 = 0.16 mm/px
    expect(calibration!.magnification).toBeCloseTo(1.25, 6);
    expect(calibration!.pxPerMm).toBeCloseTo(1 / 0.16, 6);
    expect(calibration!.uncorrectedMagnification).toBeUndefined();
  });

  it('nunca asume un factor fijo: sin SID/SOD, marca uncorrectedMagnification', () => {
    const calibration = calibrationFromDicom({ imagerPixelSpacing: [0.2, 0.2] });
    expect(calibration).not.toBeNull();
    expect(calibration!.uncorrectedMagnification).toBe(true);
    expect(calibration!.magnification).toBeUndefined();
    // Espaciado sin corregir: 0.2 mm/px → 5 px/mm.
    expect(calibration!.pxPerMm).toBeCloseTo(5, 6);
  });

  it('devuelve null sin ningún tag de espaciado', () => {
    expect(calibrationFromDicom({})).toBeNull();
    expect(
      calibrationFromDicom({ distanceSourceToDetector: 1000, distanceSourceToPatient: 800 }),
    ).toBeNull();
  });

  it('PixelSpacing tiene prioridad sobre ImagerPixelSpacing', () => {
    const calibration = calibrationFromDicom({
      pixelSpacing: [0.25, 0.25],
      imagerPixelSpacing: [0.2, 0.2],
      distanceSourceToDetector: 1000,
      distanceSourceToPatient: 800,
    });
    expect(calibration!.pxPerMm).toBeCloseTo(4, 6);
    expect(calibration!.magnification).toBeUndefined();
  });
});

describe('calibrationFromRuler / calibrationFromSphere', () => {
  it('calibra a partir de una línea de longitud conocida', () => {
    const calibration = calibrationFromRuler(250, 25);
    expect(calibration.method).toBe('ruler');
    expect(calibration.pxPerMm).toBeCloseTo(10, 6);
  });

  it('calibra a partir de un objeto esférico de diámetro conocido', () => {
    const calibration = calibrationFromSphere(300, 30);
    expect(calibration.method).toBe('sphere');
    expect(calibration.pxPerMm).toBeCloseTo(10, 6);
  });
});

describe('convertPxToMm', () => {
  it('sin calibración: distancia gris con motivo (SPEC.md §8.1)', () => {
    const result = convertPxToMm(100, undefined);
    expect(result.valueMm).toBeNull();
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBeTruthy();
  });

  it('con calibración válida: distancia en mm y estado ok', () => {
    const calibration = calibrationFromRuler(100, 10); // 10 px/mm
    const result = convertPxToMm(250, calibration);
    expect(result.status).toBe('ok');
    expect(result.valueMm).toBeCloseTo(25, 6);
  });

  it('con magnificación no corregida: distancia en ámbar con motivo', () => {
    const calibration = calibrationFromDicom({ imagerPixelSpacing: [0.2, 0.2] })!;
    const result = convertPxToMm(100, calibration);
    expect(result.status).toBe('warning');
    expect(result.valueMm).not.toBeNull();
    expect(result.reason).toBeTruthy();
  });
});
