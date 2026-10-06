import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ease, item } from "@/lib/motion";
import type { Status } from "@/lib/health";
import { statusLabel } from "@/lib/health";

export function MeshBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="blob-a absolute -left-32 -top-32 h-[55vh] w-[55vh] rounded-full blur-3xl" />
      <div className="blob-b absolute -bottom-40 -right-24 h-[60vh] w-[60vh] rounded-full blur-3xl" />
      <div className="blob-a absolute right-1/3 top-1/3 h-[30vh] w-[30vh] rounded-full blur-3xl opacity-60" />
    </div>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Phantom">
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--cyan)" />
          <stop offset="1" stopColor="var(--indigo)" />
        </linearGradient>
      </defs>
      <path d="M24 4c-9 0-15 7-15 16v20l5-4 5 4 5-4 5 4 5-4 5 4V20C39 11 33 4 24 4z" fill="url(#pg)" />
      <circle cx="18.5" cy="21" r="3" fill="var(--white)" />
      <circle cx="29.5" cy="21" r="3" fill="var(--white)" />
    </svg>
  );
}

export function GlassCard({ children, className, hover = true, onClick }: { children: ReactNode; className?: string; hover?: boolean; onClick?: () => void }) {
  return (
    <motion.div
      variants={item}
      whileHover={hover ? { y: -4, boxShadow: "var(--shadow-lift)" } : undefined}
      transition={{
        y: { type: "spring", stiffness: 300, damping: 25 },
        boxShadow: { duration: 0.25, ease },
      }}
      onClick={onClick}
      className={cn("glass p-5", className)}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({ value, decimals = 0, duration = 1.2, className }: { value: number; decimals?: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => v.toFixed(decimals));
  useEffect(() => {
    const c = animate(mv, value, { duration: reduce ? 0 : duration, ease });
    return () => c.stop();
  }, [value, reduce, mv, duration]);
  return <motion.span className={className}>{text}</motion.span>;
}

export function Ring({ value, size = 160, stroke = 12, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`rg-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--cyan)" />
            <stop offset="1" stopColor="var(--indigo)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#rg-${size})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.001, Math.min(1, value / 100)), opacity: value > 0 ? 1 : 0 }}
          transition={{ duration: 1.4, ease }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function StatusChip({ status }: { status: Status }) {
  const cls =
    status === "normal"
      ? "bg-secondary text-foreground border-cyan/50"
      : status === "watch"
        ? "bg-muted text-foreground border-indigo/25"
        : "bg-destructive/10 text-destructive border-destructive/30";
  return <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", cls)}>{statusLabel[status]}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-2xl", className)} />;
}

export function PrimaryButton({ children, className, ...props }: React.ComponentProps<typeof motion.button>) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-soft transition-opacity disabled:opacity-50 [&_svg.lucide]:text-icon",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function GhostButton({ children, className, ...props }: React.ComponentProps<typeof motion.button>) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl border border-indigo/20 bg-glass px-5 py-3 font-semibold text-foreground disabled:opacity-50", className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-indigo/15 bg-glass px-4 py-3 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan focus:ring-4 focus:ring-cyan/25";
