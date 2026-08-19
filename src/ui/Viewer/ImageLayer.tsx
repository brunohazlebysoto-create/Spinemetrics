/**
 * Capa de imagen del visor. SPEC.md §3 (capas separadas: imagen / landmarks
 * / líneas derivadas / etiquetas), §10.2 (window/level, inversión de escala
 * de grises).
 */
import { useEffect, useRef } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { DicomImageSource, ImageSource } from '../../imaging/types';
import { applyWindowLevel } from '../../imaging/windowLevel';

interface ImageLayerProps {
  image: ImageSource;
  windowCenter: number | null;
  windowWidth: number | null;
  invertGrayscale: boolean;
}

export function ImageLayer({ image, windowCenter, windowWidth, invertGrayscale }: ImageLayerProps): JSX.Element {
  if (image.kind === 'raster') {
    return <KonvaImage image={image.bitmap} x={0} y={0} width={image.width} height={image.height} listening={false} />;
  }

  return (
    <DicomImageLayer
      image={image}
      windowCenter={windowCenter ?? image.defaultWindowCenter}
      windowWidth={windowWidth ?? image.defaultWindowWidth}
      invertGrayscale={invertGrayscale}
    />
  );
}

interface DicomImageLayerProps {
  image: DicomImageSource;
  windowCenter: number;
  windowWidth: number;
  invertGrayscale: boolean;
}

function DicomImageLayer({ image, windowCenter, windowWidth, invertGrayscale }: DicomImageLayerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeRef = useRef<Konva.Image>(null);
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
  const canvas = canvasRef.current;

  useEffect(() => {
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // MONOCHROME1 ya invierte por convención DICOM; si el usuario además
    // activa la inversión manual, se cancelan entre sí (XOR).
    const invert = image.monochrome1 !== invertGrayscale;
    const rgba = applyWindowLevel(image.pixelData, windowCenter, windowWidth, invert);
    ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
    nodeRef.current?.getLayer()?.batchDraw();
  }, [canvas, image, windowCenter, windowWidth, invertGrayscale]);

  return <KonvaImage ref={nodeRef} image={canvas} x={0} y={0} width={image.width} height={image.height} listening={false} />;
}
