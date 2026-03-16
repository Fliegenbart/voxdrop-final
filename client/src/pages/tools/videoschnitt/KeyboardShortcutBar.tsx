interface KeyboardShortcutBarProps {
  canUndo: boolean;
  canRedo: boolean;
}

export function KeyboardShortcutBar({ canUndo, canRedo }: KeyboardShortcutBarProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400 select-none">
      <span><Kbd>Space</Kbd> Play/Pause</span>
      <span><Kbd>I</Kbd>/<Kbd>O</Kbd> In/Out</span>
      <span><Kbd>J</Kbd>/<Kbd>K</Kbd>/<Kbd>L</Kbd> Shuttle</span>
      <span><Kbd>&larr;</Kbd>/<Kbd>&rarr;</Kbd> Frame</span>
      <span><Kbd>M</Kbd> Schnitt</span>
      {canUndo && <span><Kbd>Ctrl+Z</Kbd> Undo</span>}
      {canRedo && <span><Kbd>Ctrl+Y</Kbd> Redo</span>}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px] font-mono">
      {children}
    </kbd>
  );
}
