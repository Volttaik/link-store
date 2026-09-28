"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import type { UserState } from "@/lib/user-state";

import { FloatingBottomNav, type FloatingNavItem } from "@/components/layout/FloatingBottomNav";

/**
 * The marketplace's mobile navigation — the few destinations a shopper actually
 * moves between, rendered in the shared floating pill.
 *
 * These are top-level places, not shortcuts: Marketplace is the whole catalogue
 * and Shops is shop discovery. Search deliberately is *not* here even though it
 * used to be — the header already owns search at every width, and a duplicated
 * action is a wasted destination.
 */
export function MarketplaceBottomNav({
  cartCount,
  userState,
}: {
  cartCount: number;
  /** Guest, account (no workspace) or workspace owner — decides the last slot. */
  userState: UserState;
}) {
  const pathname = usePathname();
  const { open } = useAuth();
  const isOwner = userState.kind === "workspace";
  const isGuest = userState.kind === "guest";

  // Five destinations, five different glyphs — `home`, `marketplace`,
  // `storefront`, `cart` and `dashboard` are five distinct icons, so the pill is
  // readable at a glance instead of being five copies of the same shopping bag.
  const items: FloatingNavItem[] = [
    { href: "/", label: "Home", icon: "home", active: pathname === "/" },
    {
      href: "/products",
      label: "Marketplace",
      icon: "marketplace",
      active: pathname.startsWith("/products"),
    },
    {
      href: "/stores",
      label: "Shops",
      icon: "shop",
      active: pathname.startsWith("/stores") || pathname.startsWith("/@"),
    },
    {
      href: "/cart",
      label: "Cart",
      icon: "cart",
      badge: cartCount,
      active: pathname.startsWith("/cart"),
    },
    // The fifth slot follows who is looking. A stranger is asked to sign in; a
    // signed-in buyer gets their account hub (never a seller dashboard they have
    // no use for); a workspace owner gets their workspace.
    isGuest
      ? {
          // No account yet: the overlay opens over whatever is on screen.
          label: "Sign in",
          icon: "account",
          onPress: () => open("sign-in"),
        }
      : isOwner
        ? {
            href: "/workspace",
            label: "Workspace",
            icon: "workspace",
            active: pathname.startsWith("/workspace") || pathname.startsWith("/admin"),
          }
        : {
            href: "/settings",
            label: "Account",
            icon: "account",
            active: pathname.startsWith("/settings"),
          },
  ];

  return <FloatingBottomNav ariaLabel="Primary" items={items} />;
}
