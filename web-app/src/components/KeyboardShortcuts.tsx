import { useState, useEffect, useCallback } from 'react';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string[];
  label: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
const mod = isMac ? 'Cmd' : 'Ctrl';

const SHORTCUTS: Shortcut[] = [
  { keys: [`${mod}+S`], label: 'Save file' },
  { keys: [`${mod}+P`], label: 'Quick open file' },
  { keys: [`${mod}+\``], label: 'Toggle terminal' },
  { keys: [`${mod}+B`], label: 'Start / stop build' },
  { keys: [`${mod}+?`], label: 'Show keyboard shortcuts' },
  { keys: ['Escape'], label: 'Close modals' },
];

export function useKeyboardShortcuts({
  onToggleTerminal,
  onToggleBuild,
}: {
  onToggleTerminal?: () => void;
  onToggleBuild?: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isModKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd+? / Ctrl+?
      if (isModKey && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // Cmd+` toggle terminal
      if (isModKey && e.key === '`') {
        e.preventDefault();
        onToggleTerminal?.();
        return;
      }

      // Cmd+B toggle build
      if (isModKey && e.key === 'b') {
        e.preventDefault();
        onToggleBuild?.();
        return;
      }

      // Escape closes modal
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      }
    },
    [onToggleTerminal, onToggleBuild, showHelp]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-card shadow-card-hover border border-border w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-primary" />
            <h2 className="text-sm font-heading font-bold text-ink">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink transition-colors p-1 rounded-btn hover:bg-hover"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-1">
          {SHORTCUTS.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between px-2 py-2 rounded-btn hover:bg-hover"
            >
              <span className="text-xs text-ink">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 text-[11px] font-mono bg-hover border border-border rounded text-muted-accessible"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border text-center">
          <span className="text-[11px] text-muted">
            Press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-hover border border-border rounded">Escape</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

export function ShortcutsHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Keyboard shortcuts"
      className="inline-flex items-center justify-center w-7 h-7 rounded-btn text-muted hover:text-ink hover:bg-hover transition-colors text-xs font-bold"
    >
      ?
    </button>
  );
}
