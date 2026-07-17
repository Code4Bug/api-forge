import { clsx } from "clsx";

interface StatusPillProps {
  tone?: "green" | "blue" | "amber" | "red" | "zinc";
  children: React.ReactNode;
}

const tones = {
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  blue: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  red: "border-red-400/30 bg-red-400/10 text-red-200",
  zinc: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

export function StatusPill({ tone = "zinc", children }: StatusPillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
