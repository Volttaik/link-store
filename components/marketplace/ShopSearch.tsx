"use client";

import { Button, Modal, useOverlayState } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SelectField, SwitchField } from "@/components/ui/field";

export function ShopSearch({ search, category, min, max, stock, currency, categories, onUpdate }: {
  search: string; category: string; min: string; max: string; stock: boolean; currency: string;
  categories: Array<{ id: string; name: string }>;
  onUpdate: (patch: Record<string, string | null>, replace?: boolean) => void;
}) {
  const filters = useOverlayState();
  const [term, setTerm] = useState(search);
  const [minimum, setMinimum] = useState(min);
  const [maximum, setMaximum] = useState(max);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const latestTerm = useRef(search);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  useEffect(() => { if (document.activeElement !== input.current || search === latestTerm.current) setTerm(search); }, [search]);
  useEffect(() => { setMinimum(min); setMaximum(max); }, [min, max]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSearch = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Debounce only user edits. URL synchronization must never schedule another
  // navigation (especially while clearing or another filter is transitioning).
  const editSearch = (value: string) => {
    latestTerm.current = value; setTerm(value); cancelSearch();
    timer.current = setTimeout(() => { timer.current = null; updateRef.current({ q: value.trim() || null }, true); }, 180);
  };
  const active = category !== "all" || Boolean(min || max || stock);
  return <div className="shop-search-tools min-w-0">
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <form role="search" className="shop-search flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-secondary px-4 ring-1 ring-transparent transition-shadow focus-within:ring-accent sm:px-5" onSubmit={event => { event.preventDefault(); cancelSearch(); onUpdate({ q: term.trim() || null }, true); input.current?.blur(); }}>
        <Icon name="search" size={18} className="shrink-0 text-muted" />
        <input ref={input} aria-label="Search products in this shop" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" value={term} onChange={event => editSearch(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none [&::-webkit-search-cancel-button]:appearance-none" />
        {term ? <button type="button" aria-label="Clear product search" onClick={() => { cancelSearch(); latestTerm.current = ""; setTerm(""); onUpdate({ q: null }, true); input.current?.focus(); }} className="ls-focus-ring flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface"><Icon name="x" size={16} /></button> : null}
      </form>
      <Button aria-haspopup="dialog" aria-expanded={filters.isOpen} className="min-h-12 shrink-0 rounded-full px-4" variant={active ? "primary" : "secondary"} onPress={filters.open}><Icon name="filter" size={16} />Filter{active ? <span className="sr-only"> · active</span> : null}</Button>
    </div>
    <Modal isOpen={filters.isOpen} onOpenChange={filters.setOpen}><Modal.Backdrop><Modal.Container size="sm" scroll="inside"><Modal.Dialog><Modal.CloseTrigger /><Modal.Header><Modal.Heading>Refine this shop</Modal.Heading></Modal.Header>
      <Modal.Body className="gap-5">
        <SelectField label="Category" value={category} options={[{ value: "all", label: "All categories" }, ...categories.map(item => ({ value: item.id, label: item.name }))]} onChange={value => onUpdate({ category: value === "all" ? null : value })} />
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); const lower = minimum ? Number(minimum) : null; const upper = maximum ? Number(maximum) : null; if ((lower !== null && (!Number.isFinite(lower) || lower < 0)) || (upper !== null && (!Number.isFinite(upper) || upper < 0)) || (lower !== null && upper !== null && lower > upper)) { setError("Enter a valid price range, with the minimum below the maximum."); return; } setError(""); onUpdate({ min: minimum || null, max: maximum || null }); }}>
          <p className="text-sm font-medium">Price range · {currency}</p><div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted">Minimum<input aria-label="Minimum price" inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base" /></label><label className="text-xs text-muted">Maximum<input aria-label="Maximum price" inputMode="decimal" value={maximum} onChange={event => setMaximum(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base" /></label></div>{error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}<Button type="submit" size="sm" variant="secondary">Apply price</Button>
        </form>
        <SwitchField isSelected={stock} onChange={value => onUpdate({ stock: value ? "1" : null })}>In stock only</SwitchField>
      </Modal.Body><Modal.Footer><Button variant="ghost" onPress={() => { setError(""); setMinimum(""); setMaximum(""); onUpdate({ category: null, min: null, max: null, stock: null }); }}>Clear filters</Button><Button slot="close">Done</Button></Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop></Modal>
  </div>;
}
