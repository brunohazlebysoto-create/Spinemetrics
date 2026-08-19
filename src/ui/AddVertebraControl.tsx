/**
 * Selector de nivel + inicio de la herramienta "añadir vértebra" (Fase 2:
 * sin pipeline automático todavía, la anotación manual es el punto de
 * partida — SPEC.md §1, "primero el motor de geometría y la anotación
 * manual").
 */
import { useState } from 'react';
import { useAppStore } from './store';
import type { SpinalLevel } from '../core/models/types';

const LEVELS: SpinalLevel[] = [
  'C7',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
  'L1', 'L2', 'L3', 'L4', 'L5',
  'S1',
];

const CORNER_HINTS = ['superior izquierda', 'superior derecha', 'inferior izquierda', 'inferior derecha'];

export function AddVertebraControl(): JSX.Element {
  const [level, setLevel] = useState<SpinalLevel>('T5');
  const activeTool = useAppStore((s) => s.activeTool);
  const pendingVertebraLevel = useAppStore((s) => s.pendingVertebraLevel);
  const pendingVertebraPoints = useAppStore((s) => s.pendingVertebraPoints);
  const startAddVertebra = useAppStore((s) => s.startAddVertebra);
  const cancelAddVertebra = useAppStore((s) => s.cancelAddVertebra);

  if (activeTool === 'addVertebra' && pendingVertebraLevel) {
    const nextCorner = CORNER_HINTS[pendingVertebraPoints.length] ?? '';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: '#4fd1ff' }}>
          {pendingVertebraLevel}: haz clic en la esquina {nextCorner} ({pendingVertebraPoints.length + 1}/4)
        </span>
        <button type="button" onClick={cancelAddVertebra}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select value={level} onChange={(e) => setLevel(e.target.value as SpinalLevel)}>
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => startAddVertebra(level)}>
        Añadir vértebra
      </button>
    </div>
  );
}
