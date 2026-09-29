"use client";

import { Avatar, Badge, Button, Drawer, Dropdown, Label, Link, SearchField, useOverlayState } from "@heroui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { AuthTriggerButton } from "@/components/auth/AuthTriggerButton";
import { BrandMark, Icon, Wordmark, type IconName } from "@/components/ui/Icon";
import { MARKETPLACE_SECTIONS } from "@/lib/catalog";
import type { SessionUser } from "@/lib/types";
import type { UserState } from "@/lib/user-state";

import { ThemeToggle } from "./ThemeToggle";

const PRIMARY_LINKS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/products", label: "Marketplace", icon: "marketplace" },
  { href: "/stores", label: "Stores", icon: "shop" },
  { href: "/events", label: "Events", icon: "events" },
];

/**
 * A labelled segment of the mobile menu.
 *
 * Sections are separated by their heading and the drawer's own row spacing so
 * options never read as one undifferentiated pile, and rows are tall enough
 * that the menu fills the drawer instead of bunching at the top.
 */
function MenuSegment({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="px-2 pb-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">
          {title}
        </span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

const MENU_ROW =
  "flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm no-underline transition-colors";

const ACCOUNT_ROW =
  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] no-underline transition-colors";

/**
 * The public site header.
 *
 * HeroUI v3 ships navigation primitives rather than a fixed navbar component,
 * so this is composed from them directly: `SearchField` for search, `Dropdown`
 * for the account menu, `Drawer` for the mobile menu.
 */
export function MarketplaceNavbar({
  user,
  userState,
  cartCount,
  messageCount = 0,
}: {
  user: SessionUser | null;
  /**
   * Who this person is: `guest`, `account` (signed in, no workspace) or
   * `workspace` (owns one). The account menu and the header CTA are built from
   * it, so a buyer is never handed seller controls and a stranger is asked to
   * create an account — not a store.
   */
  userState: UserState;
  cartCount: number;
  /** Unread conversations — a real count, refreshed by the message stream. */
  messageCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const mobileNav = useOverlayState();
  const [, startTransition] = useTransition();

  /*
   * Sign out, in place. The action ends the session, drops the browser-side
   * shopping identity and revalidates every layout — so the header, the menus
   * and every account-specific surface flip to the signed-out state at once,
   * with no manual refresh and no stale cache of the previous account.
   */
  const signOut = () => {
    mobileNav.close();
    startTransition(async () => {
      const { signOutAction } = await import("@/app/actions/auth");
      try {
        await signOutAction();
        // In place: the revalidated layouts render the signed-out experience
        // and the router lands on the marketplace home — no browser reload.
        router.push("/");
        router.refresh();
      } catch {
        // If the action truly failed, the sign-out route still ends the
        // session — and reloads only in that fallback.
        window.location.assign("/logout");
      }
    });
  };

  // The three states, once, for every choice below.
  const isGuest = userState.kind === "guest";
  const isOwner = userState.kind === "workspace";

  const submitSearch = (value: string) => {
    const term = value.trim();
    mobileNav.close();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  };

  return (
    /*
     * The header is solid base white — furniture that is always on screen, with
     * no glass and nothing to announce. The identity arrives in motion: the
     * logo's accent-trio gradient, and the colour moving around the active
     * link's edge.
     */
    <header className="bg-surface shadow-elev-2 sticky top-0 z-40 isolate">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        {/* A true circle, matching the bottom navigation's active geometry:
            equal width and height with a full radius. A HeroUI button here would
            impose its own rounded-rectangle radius, so this is a plain control
            sized to a perfect circle. */}
        <button
          type="button"
          aria-label="Open menu"
          className={`ls-focus-ring flex size-8 flex-none aspect-square items-center justify-center rounded-full border-0 p-0 transition-colors lg:hidden motion-safe:active:scale-95 ${
            mobileNav.isOpen
              ? "ls-edge bg-surface shadow-elev-2"
              : "hover:bg-surface-secondary/60"
          }`}
          onClick={() => mobileNav.open()}
        >
          <Icon name="menu" size={17} />
        </button>

        {/* The platform name lives in the header at every width — the mark alone
            is not enough to tell a first-time visitor what this place is. */}
        <Link href="/" className="flex shrink-0 items-center gap-2 text-foreground no-underline">
          <BrandMark />
          {/* Below 360px the mark carries the brand on its own: the full name
              here would squeeze the menu button and push the row into a
              horizontal scroll. Every real phone width keeps the wordmark. */}
          <Wordmark className="hidden min-[360px]:inline" />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {PRIMARY_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              /*
               * The active destination is a raised white pill with the accent
               * trio moving around its edge — a neutral control animated by
               * colour rather than filled with it. Inactive links are quiet ink
               * that warms on hover.
               */
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-lg px-2.5 py-1.5 text-[13px] no-underline transition-colors ${
                  isActive
                    ? "ls-edge bg-surface font-semibold text-foreground shadow-elev-1"
                    : "text-muted hover:bg-surface/70 hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-auto hidden w-full min-w-0 max-w-sm md:block">
          <SearchField
            aria-label="Search Link Store"
            value={query}
            onChange={setQuery}
            onSubmit={() => submitSearch(query)}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search products, stores and events" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Search"
            className="md:hidden"
            onPress={() => router.push("/search")}
          >
            <Icon name="search" size={17} />
          </Button>

          <ThemeToggle size="sm" />

          {user ? (
            <Badge.Anchor>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label={`Messages${messageCount > 0 ? `, ${messageCount} unread` : ""}`}
                onPress={() => router.push("/messages")}
              >
                <Icon name="message" size={17} />
              </Button>
              {messageCount > 0 ? (
                <Badge color="accent" size="sm">
                  {messageCount > 9 ? "9+" : messageCount}
                </Badge>
              ) : null}
            </Badge.Anchor>
          ) : null}

          {/*
            Cart is a destination of the mobile bottom navigation, so the
            header's copy is shown only where that navigation is not: below
            `lg` it would be a second control doing the first one's job, and it
            was one of the controls pushing the guest header wider than a
            phone.

            The badge lives inside the same responsive wrapper as its button.
            When the button is hidden the badge must vanish with it — otherwise
            the count is left floating, unanchored, over the theme toggle.
          */}
          <div className="hidden lg:flex">
            <Badge.Anchor>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                onPress={() => router.push("/cart")}
              >
                <Icon name="cart" size={17} />
              </Button>
              {cartCount > 0 ? (
                <Badge color="accent" size="sm">
                  {cartCount > 9 ? "9+" : cartCount}
                </Badge>
              ) : null}
            </Badge.Anchor>
          </div>

          {user ? (
            <Dropdown>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Account menu"
                className="ml-2 rounded-full p-0 motion-safe:animate-settle"
              >
                <Avatar className="size-7">
                  {user.avatarUrl ? <Avatar.Image alt={user.name} src={user.avatarUrl} /> : null}
                  <Avatar.Fallback>{user.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
                </Avatar>
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  onAction={(key) => {
                    const target = String(key);
                    if (target === "/logout") {
                      signOut();
                      return;
                    }
                    if (target.startsWith("/")) router.push(target);
                  }}
                >
                  <Dropdown.Item id="identity" textValue={user.name} isDisabled>
                    <div className="flex flex-col">
                      <Label>{user.name}</Label>
                      <span className="text-xs text-muted">{user.email}</span>
                    </div>
                  </Dropdown.Item>

                  {/* Your Account — available to every signed-in person, with or
                      without a workspace. Messaging, purchases and orders live
                      here because they belong to the account, not to a store. */}
                  <Dropdown.Item id="account-header" textValue="Your Account" isDisabled>
                    <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">
                      Your Account
                    </span>
                  </Dropdown.Item>
                  <Dropdown.Item id="/settings" textValue="Profile & settings">
                    <Icon name="account" size={15} className="shrink-0 text-muted" />
                    <Label>Profile &amp; settings</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="/orders" textValue="My orders">
                    <Icon name="receipt" size={15} className="shrink-0 text-muted" />
                    <Label>My orders</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="/tickets" textValue="My tickets">
                    <Icon name="ticket" size={15} className="shrink-0 text-muted" />
                    <Label>My tickets</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="/messages" textValue="Messages">
                    <Icon name="message" size={15} className="shrink-0 text-muted" />
                    <Label>Messages</Label>
                  </Dropdown.Item>
                  {user.role === "admin" ? (
                    <Dropdown.Item id="/admin" textValue="Platform admin">
                      <Icon name="shield" size={15} className="shrink-0 text-muted" />
                      <Label>Platform admin</Label>
                    </Dropdown.Item>
                  ) : null}

                  {/* Your Workspace — only for an account that owns one. */}
                  {isOwner ? (
                    <>
                      <Dropdown.Item id="workspace-header" textValue="Your Workspace" isDisabled>
                        <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">
                          Your Workspace
                        </span>
                      </Dropdown.Item>
                      <Dropdown.Item id="/workspace" textValue="Workspace">
                        <Icon name="workspace" size={15} className="shrink-0 text-muted" />
                        <Label>Workspace</Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="/workspace/settings" textValue="Store management">
                        <Icon name="shop" size={15} className="shrink-0 text-muted" />
                        <Label>Store management</Label>
                      </Dropdown.Item>
                    </>
                  ) : null}

                  {/* The optional seller gateway. Offered to an account that has
                      not created a workspace — never assumed, never automatic. */}
                  {!isOwner ? (
                    <Dropdown.Item id="/workspace/onboarding" textValue="Create Workspace">
                      <Icon name="plus" size={15} className="shrink-0 text-muted" />
                      <Label>Create Workspace</Label>
                    </Dropdown.Item>
                  ) : null}

                  <Dropdown.Item id="/logout" textValue="Sign out" variant="danger">
                    <Icon name="signOut" size={15} className="shrink-0 text-danger" />
                    <Label>Sign out</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : (
            /*
             * The signed-out controls sit in their own row, clear of the theme
             * toggle and the icons beside it. The extra left margin keeps the
             * pair from crowding those controls (and from ever visually merging
             * with the theme switch), and — since the cluster is pushed to the
             * right edge — it also carries Create account farther toward that
             * edge. Sizes, shape, type and motion are untouched.
             */
            <div className="ml-3 flex shrink-0 items-center gap-1.5 sm:ml-5">
              <AuthTriggerButton
                className="hidden shrink-0 motion-safe:animate-settle sm:flex"
                label="Log in"
                mode="sign-in"
                size="sm"
                variant="ghost"
              />
              {/*
                One predictable control, sized by the design system — not by
                the length of its label. On the narrowest screens it says the
                shorter of the two names, so the header can never be pushed
                wider than the phone it is on.
              */}
              <AuthTriggerButton
                className="shrink-0 motion-safe:animate-settle"
                label="Create account"
                mobileLabel="Sign up"
                mode="sign-up"
                size="sm"
              />
            </div>
          )}
        </div>
      </div>

      <Drawer isOpen={mobileNav.isOpen} onOpenChange={mobileNav.setOpen}>
        <Drawer.Backdrop>
          <Drawer.Content placement="left">
            <Drawer.Dialog className="flex w-[19rem] flex-col sm:max-w-[19rem]">
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading className="flex items-center gap-2">
                  <BrandMark />
                  <Wordmark />
                </Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="flex flex-col gap-0 p-0">
                {/* Welcome — greets whoever is actually signed in. Guests get the
                    same line without a name rather than an invented one. */}
                <div className="p-3">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {user ? `Welcome, ${user.name}` : "Welcome to Link Store"}
                  </p>
                </div>

                <div className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto p-3">
                  <MenuSegment title="Browse">
                    {PRIMARY_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => mobileNav.close()}
                        className={`${MENU_ROW} text-foreground hover:bg-surface-secondary`}
                      >
                        <Icon name={link.icon} size={16} className="shrink-0 text-muted" />
                        {link.label}
                      </Link>
                    ))}
                  </MenuSegment>

                  <MenuSegment title="Categories">
                    {MARKETPLACE_SECTIONS.map((section) => (
                      <Link
                        key={section.slug}
                        href={`/${section.slug}`}
                        onClick={() => mobileNav.close()}
                        className={`${MENU_ROW} text-muted hover:bg-surface-secondary hover:text-foreground`}
                      >
                        <Icon name={section.icon} size={16} className="shrink-0" />
                        {section.label}
                      </Link>
                    ))}
                  </MenuSegment>
                </div>

                {/* Account — a profile card, not another list of links. */}
                <div className="p-3 pt-1">
                  <div className="rounded-2xl bg-surface p-3 shadow-elev-2">
                    <div className="flex items-center gap-2.5">
                      {user ? (
                        <Avatar className="size-9 shrink-0">
                          {user.avatarUrl ? (
                            <Avatar.Image alt={user.name} src={user.avatarUrl} />
                          ) : null}
                          <Avatar.Fallback>
                            {user.name.slice(0, 2).toUpperCase()}
                          </Avatar.Fallback>
                        </Avatar>
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                          <Icon name="account" size={18} />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {user ? user.name : "Not signed in"}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {user ? user.email : "Sign in to buy, message sellers and track orders."}
                        </p>
                      </div>
                    </div>

                    {user ? (
                      <div className="mt-2.5 flex flex-col gap-0.5 pt-0.5">
                        <Link
                          href="/settings"
                          onClick={() => mobileNav.close()}
                          className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                        >
                          <Icon name="account" size={15} className="shrink-0 text-muted" />
                          Profile &amp; settings
                        </Link>
                        <Link
                          href="/orders"
                          onClick={() => mobileNav.close()}
                          className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                        >
                          <Icon name="receipt" size={15} className="shrink-0 text-muted" />
                          My orders
                        </Link>
                        <Link
                          href="/tickets"
                          onClick={() => mobileNav.close()}
                          className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                        >
                          <Icon name="ticket" size={15} className="shrink-0 text-muted" />
                          My tickets
                        </Link>
                        <Link
                          href="/messages"
                          onClick={() => mobileNav.close()}
                          className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                        >
                          <Icon name="message" size={15} className="shrink-0 text-muted" />
                          Messages
                          {messageCount > 0 ? (
                            <span className="ml-auto rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent tabular-nums">
                              {messageCount > 9 ? "9+" : messageCount}
                            </span>
                          ) : null}
                        </Link>
                        {isOwner ? (
                          <>
                            <Link
                              href="/workspace"
                              onClick={() => mobileNav.close()}
                              className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                            >
                              <Icon name="workspace" size={15} className="shrink-0 text-muted" />
                              Workspace
                            </Link>
                            <Link
                              href="/workspace/settings"
                              onClick={() => mobileNav.close()}
                              className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                            >
                              <Icon name="shop" size={15} className="shrink-0 text-muted" />
                              Store management
                            </Link>
                          </>
                        ) : (
                          <Link
                            href="/workspace/onboarding"
                            onClick={() => mobileNav.close()}
                            className={`${ACCOUNT_ROW} text-foreground hover:bg-surface-secondary`}
                          >
                            <Icon name="plus" size={15} className="shrink-0 text-muted" />
                            Create Workspace
                          </Link>
                        )}
                        <button
                          className={`${ACCOUNT_ROW} w-full text-left text-danger hover:bg-danger/10`}
                          onClick={signOut}
                          type="button"
                        >
                          <Icon name="signOut" size={15} className="shrink-0" />
                          Sign out
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2.5 flex flex-col gap-2 pt-0.5">
                        <AuthTriggerButton
                          after={() => mobileNav.close()}
                          fullWidth
                          label="Log in"
                          mode="sign-in"
                          variant="secondary"
                        />
                        <AuthTriggerButton
                          after={() => mobileNav.close()}
                          fullWidth
                          label="Create account"
                          mode="sign-up"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </header>
  );
}
