/**
 * Recorta una región cuadrada de un array de píxeles DICOM alrededor de un
 * centro dado, rellenando con `NaN` fuera de los bordes de la imagen (el
 * llamador decide qué hacer con esos píxeles — la lupa los pinta como
 * fondo neutro). Pura: usada por `ui/Viewer/Magnifier.tsx` para no
 * duplicar la aritmética de recorte con bordes entre el componente y sus
 * pruebas.
 */
export interface PixelCrop {
  size: number;
  data: Float32Array;
}

export function cropPixelsAround(
  pixelData: Float32Array,
  imageWidth: number,
  imageHeight: number,
  centerX: number,
  centerY: number,
  size: number,
): PixelCrop {
  const half = Math.floor(size / 2);
  const startX = Math.round(centerX) - half;
  const startY = Math.round(centerY) - half;
  const data = new Float32Array(size * size).fill(NaN);

  for (let row = 0; row < size; row++) {
    const srcY = startY + row;
    if (srcY < 0 || srcY >= imageHeight) continue;
    for (let col = 0; col < size; col++) {
      const srcX = startX + col;
      if (srcX < 0 || srcX >= imageWidth) continue;
      data[row * size + col] = pixelData[srcY * imageWidth + srcX]!;
    }
  }

  return { size, data };
}
