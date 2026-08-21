"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
  hint?: string;
  group?: string;
};

export function FilterCombobox({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel = "All",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((row) => row.value === value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((row) => {
      const haystack = `${row.label} ${row.hint ?? ""} ${row.group ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);

  const items = useMemo(() => {
    const rows: { value: string; label: string; hint?: string; group?: string }[] = [
      { value: "", label: emptyLabel },
      ...filtered,
    ];
    return rows;
  }, [emptyLabel, filtered]);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const row of items) {
      const key = row.group ?? "";
      if (!seen.includes(key)) seen.push(key);
    }
    return seen.map((group) => ({
      group,
      rows: items.filter((row) => (row.group ?? "") === group),
    }));
  }, [items]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-index="${highlight}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function select(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const next = items[highlight];
      if (next) select(next.value);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-[12rem]", className)}>
      <div className="relative">
        <Input
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          className="bg-background pr-8"
        />
        <ChevronsUpDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
      </div>
      {open ? (
        <div
          ref={listRef}
          role="listbox"
          className="bg-popover absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg py-1 shadow-md ring-1 ring-foreground/10"
        >
          {groups.map(({ group, rows }) => (
            <div key={group || "all"}>
              {group ? (
                <div className="text-muted-foreground px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase">
                  {group}
                </div>
              ) : null}
              {rows.map((row) => {
                const index = items.indexOf(row);
                const active = row.value === value;
                return (
                  <button
                    key={`${row.value}-${row.label}`}
                    type="button"
                    role="option"
                    data-index={index}
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm",
                      index === highlight ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => select(row.value)}
                  >
                    <Check className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    {row.hint ? <span className="text-muted-foreground text-xs tabular-nums">{row.hint}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
          {!filtered.length ? (
            <p className="text-muted-foreground px-2.5 py-2 text-sm">No matches.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
