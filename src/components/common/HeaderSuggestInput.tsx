import {
  useMemo,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

type HeaderSuggestInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
};

export function HeaderSuggestInput({
  value,
  options,
  onChange,
  className = "",
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: HeaderSuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const query = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return options;
    return options.filter((item) => item.toLowerCase().includes(query));
  }, [options, query]);

  function update(next: string) {
    onChange(next);
    setOpen(Boolean(next.trim()));
    setIndex(0);
  }

  function insert(next: string) {
    update(next);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((current) => (current + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex(
          (current) => (current - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insert(suggestions[index]);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div className="relative min-w-0">
      <input
        {...props}
        value={value}
        onChange={(event) => update(event.target.value)}
        onFocus={(event) => {
          setOpen(Boolean(suggestions.length));
          onFocus?.(event);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setOpen(false), 120);
          onBlur?.(event);
        }}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-44 w-full overflow-auto rounded border border-zinc-700 bg-[#111821] py-1 shadow-xl">
          {suggestions.map((item, suggestionIndex) => (
            <button
              key={item}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(item)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${suggestionIndex === index ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-300 hover:bg-zinc-800"}`}
            >
              <span>{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
