import { cookies } from "next/headers";

import { LiveUpdates } from "@/components/layout/LiveUpdates";
import { MarketplaceBottomNav } from "@/components/layout/MarketplaceBottomNav";
import { MarketplaceFooter } from "@/components/layout/MarketplaceFooter";
import { MarketplaceNavbar } from "@/components/layout/MarketplaceNavbar";
import { FocusRegion } from "@/components/visual/FocusRegion";
import { getCurrentUser, getUserState } from "@/lib/auth";
import { CART_COOKIE, getCartSummary } from "@/lib/server/commerce";
import { countUnreadThreads } from "@/lib/server/messages";

export default async function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, userState] = await Promise.all([getCurrentUser(), getUserState()]);
  const cookieStore = await cookies();
  const cartToken = cookieStore.get(CART_COOKIE)?.value ?? null;
  // The cart is resolved against the signed-in account, never the bare cookie:
  // one account can never be shown another account's basket.
  const [cart, unreadMessages] = await Promise.all([
    getCartSummary(cartToken, user?.id ?? null),
    user ? countUnreadThreads(user.id) : Promise.resolve(0),
  ]);

  // The bottom padding clears the floating navigation for as long as it exists,
  // which is everything below `lg`.
  return (
    <div className="flex min-h-dvh min-w-0 flex-col pb-24 lg:pb-0">
      <MarketplaceNavbar
        cartCount={cart.itemCount}
        messageCount={unreadMessages}
        user={user}
        userState={userState}
      />
      {/* One stream per signed-in user keeps unread state honest everywhere. */}
      <LiveUpdates enabled={Boolean(user)} />
      {/* Arriving somewhere new sharpens the content in rather than swapping
          the screen — the same focus entrance the Workspace uses, and keyed on
          the path so filtering never re-runs it. */}
      <main className="flex-1">
        <FocusRegion>{children}</FocusRegion>
      </main>
      <MarketplaceFooter />
      <MarketplaceBottomNav cartCount={cart.itemCount} userState={userState} />
    </div>
  );
}
