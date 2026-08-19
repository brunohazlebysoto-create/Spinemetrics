/**
 * Atajos de teclado del visor. SPEC.md §10.2: "`E` ciclar vértebra
 * terminal, `R` recalcular desde cero, `Espacio` ocultar/mostrar overlays,
 * flechas mover 1 px, `Shift`+flechas 0.1 px, `Ctrl+Z` deshacer ilimitado,
 * `?` panel de ayuda." `docs/OPEN_QUESTIONS.md` #42 documenta el reparto
 * craneal/caudal de `E`/`Shift+E`.
 */
import { useEffect } from 'react';
import { useAppStore } from '../store';

const NUDGE_PX = 1;
const FINE_NUDGE_PX = 0.1;

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTextInputTarget(e.target)) return;
      const store = useAppStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.undo();
        return;
      }

      switch (e.key) {
        case 'e':
        case 'E':
          e.preventDefault();
          store.cycleCobbTerminal(e.shiftKey ? 'caudal' : 'cranial');
          return;
        case 'r':
        case 'R':
          e.preventDefault();
          store.recalcFromScratch();
          return;
        case ' ':
          e.preventDefault();
          store.toggleOverlays();
          return;
        case '?':
          e.preventDefault();
          store.toggleHelp();
          return;
        case 'ArrowUp':
          e.preventDefault();
          store.nudgeSelectedLandmark(0, e.shiftKey ? -FINE_NUDGE_PX : -NUDGE_PX);
          return;
        case 'ArrowDown':
          e.preventDefault();
          store.nudgeSelectedLandmark(0, e.shiftKey ? FINE_NUDGE_PX : NUDGE_PX);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          store.nudgeSelectedLandmark(e.shiftKey ? -FINE_NUDGE_PX : -NUDGE_PX, 0);
          return;
        case 'ArrowRight':
          e.preventDefault();
          store.nudgeSelectedLandmark(e.shiftKey ? FINE_NUDGE_PX : NUDGE_PX, 0);
          return;
        default:
          return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
