import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** 是否显示默认标题栏，默认 true */
  showHeader?: boolean;
};

export function Drawer({
  open,
  title,
  onClose,
  children,
  className = "",
  showHeader = true,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[5000]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative ml-auto flex h-full w-full max-w-[36rem] flex-col border-l border-zinc-800 bg-[#0f141b] text-zinc-100 shadow-2xl ${className}`}
      >
        {showHeader && (
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={onClose}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </section>
    </div>,
    document.body,
  );
}
