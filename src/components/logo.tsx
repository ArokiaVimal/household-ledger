import { useId } from "react";
import { cn } from "@/lib/cn";

/** Brand mark: two overlapping circles (two people), the overlap is what is shared. Same artwork as app/icon.svg. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Personal Finance App" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d52e0" /><stop offset="1" stopColor="#4a2fc2" /></linearGradient>
        <clipPath id={`c${id}`}><circle cx="196" cy="256" r="118" /></clipPath>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#g${id})`} />
      <circle cx="196" cy="256" r="118" fill="#ffffff" />
      <circle cx="316" cy="256" r="118" fill="#d9d3f5" />
      <circle cx="316" cy="256" r="118" fill="#3a2399" clipPath={`url(#c${id})`} />
    </svg>
  );
}
