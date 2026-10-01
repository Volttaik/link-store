"use client";

import { useRef, useState } from "react";

export function useFormAttention() {
  const formRef = useRef<HTMLFormElement>(null);
  const [issue, setIssue] = useState<{ message: string; field?: string } | null>(null);
  const attention = (field: string) => ({
    "data-form-field": field,
    className: `rounded-xl scroll-mt-24 ${issue?.field === field ? "ring-2 ring-danger ring-offset-4 ring-offset-background" : ""}`,
  });
  const takeMeThere = () => {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-form-field="${issue?.field}"]`);
    if (!section) return;
    section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    section.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]), textarea, button, [tabindex="0"]')?.focus({ preventScroll: true });
  };
  const clearField = (field: string) => setIssue(previous => previous?.field === field ? null : previous);
  return { formRef, issue, setIssue, attention, takeMeThere, clearField };
}
