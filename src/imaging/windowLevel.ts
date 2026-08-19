/**
 * Window/level (VOI LUT lineal) sobre píxeles DICOM ya escalados por
 * `RescaleSlope`/`RescaleIntercept`. SPEC.md §3 ("window/level, VOI LUT"),
 * §10.2 ("window/level, inversión de escala de grises").
 *
 * Pura: produce un buffer RGBA de 8 bits listo para `ImageData`, sin tocar
 * el DOM. `ui/Viewer` es quien lo vuelca a un `<canvas>`.
 */

/**
 * `invert` combina dos señales independientes: `MONOCHROME1` del DICOM
 * (donde los valores altos son oscuros por convención) y la inversión de
 * escala de grises que el usuario puede activar manualmente — el llamador
 * decide el XOR entre ambas antes de pasar este flag.
 */
export function applyWindowLevel(
  pixelData: Float32Array,
  windowCenter: number,
  windowWidth: number,
  invert: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(pixelData.length * 4));
  const safeWidth = Math.max(1, windowWidth);
  const low = windowCenter - safeWidth / 2;
  const high = windowCenter + safeWidth / 2;
  const range = high - low;

  for (let i = 0; i < pixelData.length; i++) {
    let normalized = (pixelData[i]! - low) / range;
    if (normalized < 0) normalized = 0;
    else if (normalized > 1) normalized = 1;
    if (invert) normalized = 1 - normalized;

    const gray = Math.round(normalized * 255);
    const offset = i * 4;
    out[offset] = gray;
    out[offset + 1] = gray;
    out[offset + 2] = gray;
    out[offset + 3] = 255;
  }

  return out;
}
