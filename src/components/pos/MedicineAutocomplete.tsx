// Autocomplete input for medicine names backed by the medicines table.
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MedicineSuggestion {
  id: string;
  name: string;
  unit_price: number;
  stock?: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (m: MedicineSuggestion) => void;
  suggestions: MedicineSuggestion[];
  placeholder?: string;
  inputId?: string;
  onEnterEmpty?: () => void;
}

export function MedicineAutocomplete({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder = "Type medicine name…",
  inputId,
  onEnterEmpty,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    setActiveIdx(0);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (m: MedicineSuggestion) => {
    onSelect(m);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={inputId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnterEmpty?.();
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(filtered[activeIdx]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map((s, i) => {
            const out = s.stock !== undefined && s.stock <= 0;
            const low = s.stock !== undefined && s.stock > 0 && s.stock <= 10;
            return (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                  i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  out && "opacity-60",
                )}
              >
                <span className="truncate font-medium">{s.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  {s.stock !== undefined && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono",
                        out
                          ? "bg-destructive/15 text-destructive"
                          : low
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {out ? "out" : `${s.stock} left`}
                    </span>
                  )}
                  <span className="font-mono text-muted-foreground">
                    {s.unit_price.toFixed(2)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
