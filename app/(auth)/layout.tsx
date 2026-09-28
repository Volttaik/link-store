/**
 * The authentication group.
 *
 * Its own route group on purpose: signing in is not shopping, so it does not
 * wear the marketplace navigation. What it provides is the backdrop — one
 * centred column on a bare page. The card itself, brand mark included, is drawn
 * by the screen inside it, so this layout never competes with it.
 */

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      {children}
    </main>
  );
}
