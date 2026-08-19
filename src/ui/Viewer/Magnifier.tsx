/**
 * Lupa al colocar puntos. SPEC.md §10.2: "lupa al colocar puntos (crítico
 * para la precisión del platillo)".
 */
import { useEffect, useRef } from 'react';
import type { ImageSource } from '../../imaging/types';
import { applyWindowLevel } from '../../imaging/windowLevel';
import { cropPixelsAround } from '../../imaging/cropPixels';

const SOURCE_CROP_PX = 60;
const DISPLAY_SIZE_PX = 220;
const OFFSET_FROM_POINTER_PX = 24;

interface MagnifierProps {
  image: ImageSource;
  /** Posición del puntero en coordenadas de imagen (px originales). */
  pointerImagePos: { x: number; y: number };
  windowCenter: number | null;
  windowWidth: number | null;
  invertGrayscale: boolean;
}

export function Magnifier({ image, pointerImagePos, windowCenter, windowWidth, invertGrayscale }: MagnifierProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = DISPLAY_SIZE_PX;
    canvas.height = DISPLAY_SIZE_PX;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, DISPLAY_SIZE_PX, DISPLAY_SIZE_PX);

    if (image.kind === 'raster') {
      const halfCrop = SOURCE_CROP_PX / 2;
      const sx = Math.round(pointerImagePos.x - halfCrop);
      const sy = Math.round(pointerImagePos.y - halfCrop);
      ctx.drawImage(image.bitmap, sx, sy, SOURCE_CROP_PX, SOURCE_CROP_PX, 0, 0, DISPLAY_SIZE_PX, DISPLAY_SIZE_PX);
    } else {
      const crop = cropPixelsAround(image.pixelData, image.width, image.height, pointerImagePos.x, pointerImagePos.y, SOURCE_CROP_PX);
      const invert = image.monochrome1 !== invertGrayscale;
      const center = windowCenter ?? image.defaultWindowCenter;
      const width = windowWidth ?? image.defaultWindowWidth;

      // Los píxeles fuera de la imagen (NaN) se pintan como negro puro en
      // vez de arrastrar el NaN hasta el LUT.
      const sanitized = new Float32Array(crop.data.length);
      for (let i = 0; i < crop.data.length; i++) {
        const v = crop.data[i]!;
        sanitized[i] = Number.isNaN(v) ? center - width : v;
      }

      const rgba = applyWindowLevel(sanitized, center, width, invert);
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = crop.size;
      cropCanvas.height = crop.size;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return;
      cropCtx.putImageData(new ImageData(rgba, crop.size, crop.size), 0, 0);
      ctx.drawImage(cropCanvas, 0, 0, crop.size, crop.size, 0, 0, DISPLAY_SIZE_PX, DISPLAY_SIZE_PX);
    }

    // Retícula central: marca exactamente dónde caería el punto.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(DISPLAY_SIZE_PX / 2, 0);
    ctx.lineTo(DISPLAY_SIZE_PX / 2, DISPLAY_SIZE_PX);
    ctx.moveTo(0, DISPLAY_SIZE_PX / 2);
    ctx.lineTo(DISPLAY_SIZE_PX, DISPLAY_SIZE_PX / 2);
    ctx.stroke();
  }, [image, pointerImagePos.x, pointerImagePos.y, windowCenter, windowWidth, invertGrayscale]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: 16,
        top: OFFSET_FROM_POINTER_PX,
        width: DISPLAY_SIZE_PX,
        height: DISPLAY_SIZE_PX,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.6)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }}
    />
  );
}
