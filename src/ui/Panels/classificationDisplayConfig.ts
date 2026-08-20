/**
 * Qué claves de `MeasurementSet.classifications` mostrar y con qué etiqueta
 * completa, y en qué orden. SPEC.md §9. Extraído de `ClassificationPanel.tsx`
 * para que `ui/report.ts` (SPEC.md §12, "clasificaciones con nomenclatura
 * completa") pueda reutilizar exactamente las mismas etiquetas sin
 * duplicarlas — misma separación que `measurementDisplayConfig.ts`.
 */

export const CLASSIFICATION_LABELS: Record<string, string> = {
  lenke: 'Lenke (AIS)',
  kingMoe: 'King-Moe',
  pumc: 'PUMC',
  srsSchwab: 'SRS-Schwab (adulto)',
  roussouly: 'Roussouly',
  ceos: 'C-EOS (inicio precoz)',
  congenital: 'Congénita (Winter/McMaster)',
  neuromuscular: 'Neuromuscular (Lonstein-Akbarnia)',
  lenkeSilva: 'Lenke-Silva (degenerativa del adulto)',
};

export const CLASSIFICATION_ORDER: string[] = [
  'lenke',
  'kingMoe',
  'pumc',
  'srsSchwab',
  'roussouly',
  'ceos',
  'congenital',
  'neuromuscular',
  'lenkeSilva',
];
