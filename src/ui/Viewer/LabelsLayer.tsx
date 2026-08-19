/**
 * Etiquetas de nivel ("T5", "L1"...) junto a cada vértebra anotada.
 * SPEC.md §3, capa "etiquetas"; §10.2 "capas conmutables".
 */
import { Text } from 'react-konva';
import { useAppStore } from '../store';

const LABEL_OFFSET_PX = 8;
const FONT_SIZE_PX = 14;

interface LabelsLayerProps {
  zoom: number;
}

export function LabelsLayer({ zoom }: LabelsLayerProps): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const layerVisible = useAppStore((s) => s.layerVisibility.labels);
  const overlaysVisible = useAppStore((s) => s.overlaysVisible);

  if (!radiograph || !layerVisible || !overlaysVisible) return null;

  const fontSize = FONT_SIZE_PX / zoom;
  const offset = LABEL_OFFSET_PX / zoom;

  return (
    <>
      {radiograph.annotations.vertebrae.map((v) => {
        const anchor = v.superiorEndplate[0];
        return (
          <Text
            key={v.level}
            x={anchor.x - offset - fontSize * 2}
            y={anchor.y - offset}
            text={v.level}
            fontSize={fontSize}
            fill="#e8e8ea"
            listening={false}
          />
        );
      })}
    </>
  );
}
