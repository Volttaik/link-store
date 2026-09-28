"use client";

/**
 * Authentication, available anywhere.
 *
 * Mounted once around the whole app, so any component can ask for it:
 *
 *   const auth = useAuth();
 *   auth.open("sign-in");                 // sign in here, over this page
 *   auth.open("sign-up", { next: "/cart" });
 *
 * Nothing navigates to a sign-in *page*: the overlay opens over whatever is on
 * screen, and when it closes the person is still exactly where they were.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { AuthDialog, type AuthStep } from "@/components/auth/AuthDialog";

type Mode = "sign-in" | "sign-up";

type AuthContextValue = {
  isOpen: boolean;
  open: (mode?: Mode, options?: { next?: string }) => void;
  close: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return value;
}

export function AuthProvider({
  children,
  googleEnabled = false,
}: {
  children: ReactNode;
  googleEnabled?: boolean;
}) {
  const [step, setStep] = useState<AuthStep | null>(null);
  const [next, setNext] = useState("");

  const open = useCallback((mode: Mode = "sign-in", options?: { next?: string }) => {
    // Default to the current location: signing in should return you to the
    // thing you were trying to do, not to a dashboard.
    setNext(
      options?.next ??
        (typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`),
    );
    setStep({ kind: mode });
  }, []);

  const close = useCallback(() => setStep(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ isOpen: Boolean(step), open, close }),
    [step, open, close],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog
        googleEnabled={googleEnabled}
        next={next}
        onClose={close}
        onStep={setStep}
        step={step}
      />
    </AuthContext.Provider>
  );
}
