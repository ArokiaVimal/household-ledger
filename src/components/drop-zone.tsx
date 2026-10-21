"use client";
import { useRef, useState, type DragEvent } from "react";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Drag and drop for one area: spread `bind` on the element and use `over` to highlight it while a file is held above it.
 * `onFile` gets the first dropped file; the caller checks its type and size, exactly as it does for a picked file.
 */
export function useDropZone(onFile: (file: File) => void, disabled = false) {
  const [over, setOver] = useState(false);
  const depth = useRef(0); // enter/leave also fire for children, so count them
  const bind = {
    onDragEnter: (e: DragEvent) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); },
    onDragOver: (e: DragEvent) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: (e: DragEvent) => { if (disabled || !hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); },
    onDrop: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation(); depth.current = 0; setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
  };
  return { over, bind };
}
