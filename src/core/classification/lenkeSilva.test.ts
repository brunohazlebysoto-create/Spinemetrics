import { describe, expect, it } from 'vitest';
import { evaluateLenkeSilva, type LenkeSilvaChecklist } from './lenkeSilva';

const fullChecklist: LenkeSilvaChecklist = {
  anteriorOsteophytes: true,
  subluxationOver2mm: true,
  curveMagnitudeAbove30Or45Deg: true,
  lumbarKyphosis: true,
  globalImbalance: true,
  bendingCorrectionBelow30Percent: true,
};

const emptyChecklist: LenkeSilvaChecklist = {
  anteriorOsteophytes: false,
  subluxationOver2mm: false,
  curveMagnitudeAbove30Or45Deg: false,
  lumbarKyphosis: false,
  globalImbalance: false,
  bendingCorrectionBelow30Percent: false,
};

describe('evaluateLenkeSilva', () => {
  it('nunca deriva el nivel automáticamente: sin selección del clínico, level es null', () => {
    const result = evaluateLenkeSilva({ checklist: fullChecklist, clinicianSelectedLevel: null });
    expect(result.level).toBeNull();
    expect(result.unmetInputs).toContain('clinicianSelectedLevel');
  });

  it('con checklist completa marcada, sin selección, sigue sin fabricar un nivel', () => {
    // Verifica explícitamente que un checklist "todo marcado" (que un
    // algoritmo ingenuo interpretaría como "nivel VI") no produce ningún
    // nivel sin que el clínico lo elija.
    const result = evaluateLenkeSilva({ checklist: fullChecklist, clinicianSelectedLevel: null });
    expect(result.level).toBeNull();
  });

  it('respeta el nivel elegido por el clínico, cualquiera que sea el checklist', () => {
    const result = evaluateLenkeSilva({ checklist: emptyChecklist, clinicianSelectedLevel: 'VI' });
    expect(result.level).toBe('VI');
    expect(result.result).toContain('VI');
  });

  it('registra en la traza el estado de cada criterio del checklist', () => {
    const result = evaluateLenkeSilva({ checklist: fullChecklist, clinicianSelectedLevel: 'I' });
    expect(result.trace.some((t) => t.detail === 'marcado')).toBe(true);
  });

  it('devuelve el checklist original sin modificar', () => {
    const result = evaluateLenkeSilva({ checklist: fullChecklist, clinicianSelectedLevel: 'III' });
    expect(result.checklist).toEqual(fullChecklist);
  });
});
