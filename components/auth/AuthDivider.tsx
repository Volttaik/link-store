/**
 * Separates the two ways in. Purely visual, so it is hidden from readers.
 *
 * A word in a field of space rather than a rule line — the sections it sits
 * between are already separated by spacing and depth.
 */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div aria-hidden="true" className="flex items-center justify-center py-1">
      <span className="text-[11px] font-medium tracking-[0.18em] text-muted uppercase">
        {label}
      </span>
    </div>
  );
}
