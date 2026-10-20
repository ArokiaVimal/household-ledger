"use client";
import { useEffect, useRef, type HTMLAttributes } from "react";

/**
 * A row that scrolls sideways. On a touch screen you swipe it. With a mouse the wheel moves it left and right, and hovering near
 * either end glides it that way, so nothing needs shift-scrolling or a scroll bar. Taps and clicks are untouched.
 */
export function HScroll({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflowing = () => el.scrollWidth > el.clientWidth + 1;
    const onWheel = (e: WheelEvent) => {
      if (!overflowing() || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const next = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + e.deltaY));
      if (next !== el.scrollLeft) { e.preventDefault(); el.scrollLeft = next; }
    };
    let raf = 0, speed = 0;
    const step = () => { if (speed) { el.scrollLeft += speed; raf = requestAnimationFrame(step); } else raf = 0; };
    const onMove = (e: MouseEvent) => {
      if (!overflowing()) { speed = 0; return; }
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, edge = Math.min(80, r.width / 4);
      speed = x < edge ? -Math.ceil((edge - x) / 9) : x > r.width - edge ? Math.ceil((x - (r.width - edge)) / 9) : 0;
      if (speed && !raf) raf = requestAnimationFrame(step);
    };
    const stop = () => { speed = 0; };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", stop);
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("mousedown", stop);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("wheel", onWheel); el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", stop); el.removeEventListener("touchstart", stop); el.removeEventListener("mousedown", stop); };
  }, []);
  return <div ref={ref} className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`} {...rest}>{children}</div>;
}
