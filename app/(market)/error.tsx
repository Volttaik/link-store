"use client";

export default function MarketError({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-lg px-4 py-16 text-center"><h1 className="text-xl font-semibold tracking-tight">We couldn’t load this page</h1><p className="mt-3 text-sm leading-6 text-muted">Please try again. Your shopping session is still here.</p><button type="button" onClick={reset} className="ls-focus-ring mt-6 min-h-11 rounded-full bg-foreground px-6 py-3 text-sm text-background">Try again</button></section>;
}
