/**
 * The conversation's quiet ground.
 *
 * A whisper of the platform's identity behind the messages: the orb field at
 * almost invisible contrast, with one faint echo of the three-orb motif in a
 * corner and a smaller one across from it — the same vocabulary the rest of
 * Link Store is decorated in (orbs, the accent trio, gradient fills), spent
 * here at the very edge of perception. The chat should feel like Link Store
 * without any of this ever competing with the words on top of it.
 *
 * This is pure environment, in the tradition of `components/visual/`:
 * `aria-hidden`, `pointer-events-none`, outside the document flow and behind
 * the content layer. It can never grow the page, scroll, push the header or
 * the composer, intercept a click, or change how the keyboard behaves — it
 * only fills the space that is already there.
 */

import { BackgroundPattern } from "@/components/visual/BackgroundPattern";
import { ThreeOrbs } from "@/components/visual/Atmosphere";

export function ChatBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* The orb field, at the very edge of perception. */}
      <div className="absolute inset-0 text-foreground/[0.055] dark:text-foreground/[0.07]">
        <BackgroundPattern id="chat-orb-field" variant="grid" />
      </div>

      {/* One quiet echo of the identity in a corner, and a smaller one
          across from it — static on purpose: the thread is the moving part. */}
      <ThreeOrbs animate={false} className="absolute -top-16 -right-14 h-60 w-60 opacity-[0.06]" />
      <ThreeOrbs animate={false} className="absolute -bottom-20 -left-16 h-44 w-44 opacity-[0.045]" />
    </div>
  );
}
