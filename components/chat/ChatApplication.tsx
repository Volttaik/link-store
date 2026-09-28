"use client";

/**
 * The chat application's viewport.
 *
 * Chat is a standalone messaging application inside the platform, and this is
 * its window: a single, fixed region that owns the whole visible viewport and
 * divides it into three independent areas —
 *
 *     ChatApplication
 *       ├── ConversationHeader   fixed, never moves
 *       ├── MessageViewport      the only region that scrolls or resizes
 *       └── ChatComposer         anchored to the bottom of the viewport
 *
 * The one thing this component must get right is *which* viewport it fills.
 * A page measured in `100vh`/`100dvh` sits in the layout viewport — but when
 * the mobile keyboard opens, many browsers (iOS Safari above all) do not
 * shrink the layout viewport at all; they pan the *visual* viewport up to
 * reveal the focused field. The whole page then slides upward and the header
 * disappears behind the top of the screen — precisely the bug this component
 * exists to end.
 *
 * So the application is anchored to the **visual** viewport instead: its
 * height is exactly the visible height, and its top follows the visible top
 * (`window.visualViewport`, with a plain fallback where it does not exist).
 * When the keyboard opens, the application becomes shorter — the header stays
 * where it was, the composer rises to sit directly above the keyboard, and
 * only the message viewport gives up height. Nothing else in the chat is ever
 * moved by a keyboard.
 *
 * The application also refuses to let the *document* move: while chat is
 * mounted, page scroll is locked and any pan is cancelled. The message
 * viewport — and only the message viewport — is a scroll container. There is
 * no body scroll, no page scroll and no chat-shell scroll to fight it.
 *
 * Finally it notices the keyboard as a state (`data-keyboard` on the root),
 * so regions that behave differently around it — the composer dropping the
 * home-indicator inset, for instance — can react without each of them
 * listening to viewport events again.
 */

import { useEffect, useState } from "react";

/**
 * How far the visible height must fall before it counts as a keyboard rather
 * than an ordinary change of window size.
 */
const KEYBOARD_EDGE = 120;

export function ChatApplication({ children }: { children: React.ReactNode }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  /* ------------------------------------------------------------------ */
  /* The document holds still                                            */
  /* ------------------------------------------------------------------ */

  // The page is not the scroller here and must never behave like one: lock it
  // for as long as the chat is on screen, and undo exactly what was done when
  // the chat leaves — the platform's own pages scroll normally again.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const htmlOverflow = html.style.overflow;
    const bodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    window.scrollTo(0, 0);

    return () => {
      html.style.overflow = htmlOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* The visible viewport, followed exactly                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let tallest = 0;

    const apply = () => {
      const height = viewport ? viewport.height : window.innerHeight;
      const top = viewport ? viewport.offsetTop : 0;
      tallest = Math.max(tallest, height);

      root.style.setProperty("--chat-vv-height", `${Math.round(height)}px`);
      root.style.setProperty("--chat-vv-top", `${Math.round(top)}px`);

      // A keyboard, not a window resize: either the visible height fell well
      // below the layout viewport (browsers that pan rather than resize), or
      // it fell well below the tallest recent height while the caret sits in
      // a field (browsers that shrink the content viewport too). An ordinary
      // desktop window resize moves both together and is never mistaken.
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        (active.isContentEditable || /^(input|textarea)$/i.test(active.tagName));
      const fellFromLayout = window.innerHeight - height > KEYBOARD_EDGE;
      const fellWhileTyping = typing && tallest - height > KEYBOARD_EDGE;
      setKeyboardOpen(fellFromLayout || fellWhileTyping);

      // Some browsers pan the page itself to reach the focused field. The
      // application follows the visual viewport above, so the pan must never
      // also move the document underneath it.
      window.scrollTo(0, 0);
    };

    apply();
    window.addEventListener("resize", apply);
    // `scroll` is the visual viewport being panned — the keyboard case.
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);

    return () => {
      window.removeEventListener("resize", apply);
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
    };
  }, []);

  return (
    <div
      className="chat-application fixed inset-x-0 top-[var(--chat-vv-top)] flex h-[var(--chat-vv-height)] min-h-0 flex-col overflow-hidden bg-background"
      data-keyboard={keyboardOpen ? "open" : "closed"}
    >
      {children}
    </div>
  );
}
