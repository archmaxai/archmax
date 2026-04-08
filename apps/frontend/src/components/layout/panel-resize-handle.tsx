import { useState, useRef, useCallback, useEffect } from "react";

export function useResizablePanel(
  key: string,
  defaultWidth: number,
  min = 180,
  max = 480,
) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const n = Number(saved);
        if (!isNaN(n)) return Math.max(min, Math.min(max, n));
      }
    } catch {}
    return defaultWidth;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(width));
    } catch {}
  }, [key, width]);

  const widthRef = useRef(width);
  widthRef.current = width;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function onMouseMove(ev: MouseEvent) {
        setWidth(
          Math.max(min, Math.min(max, startW + ev.clientX - startX)),
        );
      }

      function onMouseUp() {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [min, max],
  );

  return { width, onMouseDown };
}

export function PanelResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="group/resize relative w-px shrink-0 bg-border z-10">
      <div
        onMouseDown={onMouseDown}
        className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize flex items-center justify-center"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors group-hover/resize:bg-ring/40 group-active/resize:bg-ring/60" />
      </div>
    </div>
  );
}
