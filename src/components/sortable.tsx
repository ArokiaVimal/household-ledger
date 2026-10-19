"use client";
// A list the user reorders by dragging a handle. Uses pointer events, so it works with a finger on a phone as well as a mouse.
import { GripVertical } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

export function SortableList({ ids, onReorder, label, className, children }: { ids: string[]; onReorder: (ids: string[]) => void; label: string; className?: string; children: (id: string, handle: ReactNode) => ReactNode }) {
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const order = drag?.order ?? ids;

  const start = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, order: ids });
  };
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const without = drag.order.filter((i) => i !== drag.id);
    // Insert before the first row whose middle is below the pointer.
    let at = without.length;
    for (let i = 0; i < without.length; i++) {
      const r = rows.current.get(without[i])?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) { at = i; break; }
    }
    const next = [...without.slice(0, at), drag.id, ...without.slice(at)];
    if (next.join() !== drag.order.join()) setDrag({ id: drag.id, order: next });
  };
  const end = () => {
    if (drag && drag.order.join() !== ids.join()) onReorder(drag.order);
    setDrag(null);
  };
  const key = (id: string) => (e: React.KeyboardEvent) => {
    const i = ids.indexOf(id);
    const j = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
    if (j < 0 || j >= ids.length) return;
    e.preventDefault();
    const next = [...ids]; next.splice(i, 1); next.splice(j, 0, id);
    onReorder(next);
  };

  return (
    <ul className={className}>
      {order.map((id) => (
        <li key={id} ref={(el) => { if (el) rows.current.set(id, el); else rows.current.delete(id); }} className={drag?.id === id ? "relative z-10 rounded-xl bg-background shadow-md" : ""}>
          {children(id, <button type="button" aria-label={`Drag to reorder ${label}`} title="Drag to reorder (or use the arrow keys)" onPointerDown={start(id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={key(id)} className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted hover:bg-background active:cursor-grabbing"><GripVertical size={18} aria-hidden /></button>)}
        </li>
      ))}
    </ul>
  );
}
