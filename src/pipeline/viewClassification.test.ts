import { describe, expect, it } from 'vitest';
import { classifyView } from './viewClassification';

describe('classifyView', () => {
  it('con metadatos DICOM, confianza alta y no exige confirmación', () => {
    const result = classifyView('PA_standing');
    expect(result.view).toBe('PA_standing');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.source).toBe('dicomMetadata');
  });

  it('sin metadatos, confianza 0 y exige confirmación (nunca fabrica una proyección)', () => {
    const result = classifyView(null);
    expect(result.view).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.source).toBe('none');
  });
});
