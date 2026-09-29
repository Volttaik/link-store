"use client";

import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Label,
  SearchField,
  Tooltip,
  useOverlayState,
} from "@heroui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";

import { toggleStorePublishedAction } from "@/app/actions/store";
import { FloatingBottomNav, type FloatingNavItem } from "@/components/layout/FloatingBottomNav";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { NavButton } from "@/components/ui/controls";
import { SvgBackdrop } from "@/components/visual/Atmosphere";
import { FocusRegion } from "@/components/visual/FocusRegion";
import { WorkspaceSectionDisplay } from "@/components/workspace/WorkspaceSectionDisplay";
import type { WorkspaceContextData } from "@/lib/workspace-context";
import {
  mobileNavItems,
  navItemHref,
  navItemMatches,
  resolveActiveNav,
  type NavContext,
  type WorkspaceNavItem,
} from "@/lib/workspace-nav";
import type { SessionUser } from "@/lib/types";

type StoreSummary = {
  name: string;
  slug: string;
  isPublished: boolean;
} | null;

/**
 * One destination in the menu — SECTION A's unit.
 *
 * An icon-forward tile: a large icon and a small label, so the module names — Listing,
 * Drafts, Services, Food, Rentals — *are* the architecture now, and a column of
 * glyphs cannot say "Services is not a filter of Listing".
 *
 * Every dimension is controlled: the box is fixed (never
 * wider, never content-sized), its label truncates on one line with the full
 * name in the tooltip, and the button hugs its icon — so no destination, however
 * named, can ever change the sidebar's geometry or nudge SECTION B.
 */
const NAV_TILE =
  "group relative flex h-[3.5rem] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 transition-[background-color,color,transform] duration-150 ls-focus-ring motion-safe:active:scale-95";

/**
 * The workspace shell.
 *
 * The side menu is one glass panel in two independent sections: the header and
 * an icon-forward navigation rail (SECTION A) beside the section display
 * (SECTION B — the secondary area), in a strict two-track grid so the rail can
 * never move the display. Below `lg` the same panel opens as a drawer from the
 * header button, and the five most-used destinations stay in the floating
 * bottom nav.
 */
export function WorkspaceShell({
  user,
  store,
  nav,
  contextData = null,
  homeHref,
  label = "Workspace",
  children,
}: {
  user: SessionUser;
  store: StoreSummary;
  nav: WorkspaceNavItem[];
  /** Real per-section data for the display. Omit for a menu-only shell. */
  contextData?: WorkspaceContextData | null;
  homeHref: string;
  label?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mobileNav = useOverlayState();
  const [copied, setCopied] = useState(false);
  const [publishPending, startPublish] = useTransition();
  const [, startSignOut] = useTransition();
  const [publishNotice, setPublishNotice] = useState<{ failed: boolean; text: string } | null>(null);

  const navContext: NavContext = useMemo(() => ({ storeSlug: store?.slug ?? null }), [store?.slug]);

  const current = useMemo(
    () => resolveActiveNav(nav, pathname, new URLSearchParams(searchParams.toString()), navContext),
    [nav, pathname, searchParams, navContext],
  );

  const currentItem = useMemo(
    () => nav.find((item) => item.key === current.itemKey) ?? null,
    [nav, current.itemKey],
  );

  useEffect(() => {
    mobileNav.close();
    setPickedKey(null);
    setNavTerm("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Which section the display is showing. Picking an area in the menu does not
  // navigate — it points the display at that area, and the Open button in the
  // display is what actually enters the page. Until something is picked, the
  // display follows the page you are on.
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  /**
   * The menu's own search.
   *
   * This menu is long on purpose — a broad marketplace is managed from it — and
   * the answer to a long menu is to be able to search it, not to collapse it
   * back into one page. Typing filters the destinations by name and by the words
   * registered against them, so `products` finds Listing and `booking` finds
   * Services.
   */
  const [navTerm, setNavTerm] = useState("");

  const visibleNav = useMemo(
    () => nav.filter((item) => navItemMatches(item, navTerm)),
    [nav, navTerm],
  );

  const displayItem = useMemo(
    () => nav.find((item) => item.key === pickedKey) ?? currentItem ?? nav[0] ?? null,
    [nav, pickedKey, currentItem],
  );

  const viewingDisplay = displayItem != null && displayItem.key === currentItem?.key;

  /**
   * Publish or unpublish from the shell itself.
   *
   * The state of the shop is the one thing a seller needs to see and change from
   * anywhere in the workspace, so the switch lives in the menu rather than three
   * clicks into settings. The action is the same one settings uses — including
   * its refusal to publish a storefront with nothing live in it, which is
   * reported here in the same words.
   */
  function togglePublished() {
    setPublishNotice(null);
    startPublish(async () => {
      const result = await toggleStorePublishedAction();

      if (result?.error) setPublishNotice({ failed: true, text: result.error });
      else setPublishNotice({ failed: false, text: result?.message ?? "Updated." });

      router.refresh();
    });
  }

  async function copyStoreLink() {
    if (!store) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/@${store.slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  /**
   * The menu's header. Leads with the seller's avatar so the menu opens on a
   * face rather than a line of text, then says whose workspace it is, what they
   * sell as, and whether the storefront is live.
   */
  const menuHeader = (
    <header className="px-1 pt-1">
      <div className="flex items-center gap-3.5">
        <Avatar className="size-12 shrink-0 rounded-2xl">
          {user.avatarUrl ? <Avatar.Image alt={user.name} src={user.avatarUrl} /> : null}
          <Avatar.Fallback className="text-[13px]">{user.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted uppercase">
            {store ? "Your workspace" : label}
          </p>
          <p className="mt-1.5 truncate text-[17px] leading-tight font-semibold tracking-tight text-foreground">
            {user.name}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {store ? (
          <>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                store.isPublished
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  store.isPublished ? "bg-success" : "bg-warning"
                }`}
              />
              {store.isPublished ? "Storefront live" : "Not public yet"}
            </span>
            <span className="min-w-0 truncate text-[12px] text-muted">@{store.slug}</span>

            {/* Once the shop is live, the switch shrinks to an eye: the eye says
                the shop is *visible*, and pressing it hides the shop. One icon
                beside the status it controls — never a long button. */}
            {store.isPublished ? (
              <button
                aria-label="Hide storefront"
                className="ls-focus-ring ml-auto flex size-8 shrink-0 items-center justify-center rounded-full bg-iris/15 text-iris-deep transition-[background-color,transform] hover:bg-iris/25 motion-safe:active:scale-95 disabled:opacity-60"
                disabled={publishPending}
                onClick={() => void togglePublished()}
                title="Storefront is live. Hide it."
                type="button"
              >
                <Icon name={publishPending ? "eyeOff" : "eye"} size={15} />
              </button>
            ) : null}
          </>
        ) : (
          <span className="min-w-0 truncate text-[12px] text-muted">{user.email}</span>
        )}
      </div>

      {/* Publishing: while the shop is hidden there is one clear button to
          make it live. Once live, the switch shrinks to the eye in the row
          above — the menu gets quieter as the shop gets stronger. */}
      {store && !store.isPublished ? (
        <div className="mt-3">
          {/* An important action, so the accent trio runs around its edge. */}
          <Button
            fullWidth
            className="ls-edge"
            isPending={publishPending}
            size="sm"
            variant="primary"
            onPress={togglePublished}
          >
            <Icon name="eye" size={14} />
            Publish storefront
          </Button>

          {publishNotice ? (
            <p
              className={`mt-2 text-[11.5px] leading-relaxed ${
                publishNotice.failed ? "text-danger" : "text-success"
              }`}
              role="status"
            >
              {publishNotice.text}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Spacing alone separates the sections of the menu header — no rule
          line anywhere in the sidebar. */}
    </header>
  );

  /**
   * SECTION A — the main navigation rail.
   *
   * Icon-forward tiles: a large icon and a small label in a fixed-size button,
   * inside a fixed-width track. The list scrolls *inside* the rail — so the
   * number of destinations changes nothing outside it, and SECTION B beside it
   * can never be pushed, squeezed or resized by any button here.
   *
   * Pressing a destination points SECTION B at that area; it never navigates,
   * so the menu can be used to look around without leaving the page you are on.
   *
   * The state hierarchy is deliberate and neutral: the page you are *on* is
   * marked only by its icon changing colour and glowing softly — no border,
   * no frame around the tile. The area merely *previewed* is a soft tonal
   * wash, and idle destinations are quiet ink that warms on hover.
   */
  function navRail() {
    return (
      <nav aria-label={label} className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4" data-menu-list>
        {visibleNav.map((item) => {
          const isPicked = displayItem?.key === item.key;
          const isCurrent = currentItem?.key === item.key;
          // A real unread count, kept honest by the message stream.
          const unread = item.key === "messages" ? (contextData?.unreadMessages ?? 0) : 0;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPickedKey(item.key)}
              aria-current={isCurrent ? "page" : undefined}
              aria-pressed={isPicked}
              title={unread > 0 ? `${item.label} · ${unread} unread` : item.label}
              className={`${NAV_TILE} ${
                isCurrent
                  ? "font-semibold text-foreground"
                  : isPicked
                    ? "font-medium text-foreground"
                    : "font-medium text-muted hover:text-foreground"
              }`}
            >
              <span
                className={`relative flex size-8 items-center justify-center rounded-full transition-colors ${
                  isCurrent
                    ? "ls-edge bg-surface shadow-elev-2"
                    : isPicked
                      ? "bg-surface-secondary/70 shadow-elev-1"
                      : "group-hover:bg-surface-secondary/50"
                }`}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  className={`shrink-0 ${isCurrent ? "ls-active-glow" : ""}`}
                />
                {unread > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[8.5px] leading-none font-semibold text-accent-foreground tabular-nums">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate text-[9.5px] leading-none">{item.label}</span>
            </button>
          );
        })}

        {visibleNav.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] leading-snug text-muted">No match.</p>
        ) : null}
      </nav>
    );
  }

  /**
   * The sidebar container, in two independent sections:
   *
   *   1. SECTION A — the main navigation rail (in the fixed track).
   *   2. SECTION B — the secondary area (the section display, in the flexible
   *      track — the controlled layout region).
   *
   * Head + body: identity, store state and the menu's search stay fixed at the
   * top; below them sits one strict two-track grid. The fixed rail track is the
   * guarantee — SECTION A's buttons can never reach across it to move SECTION B,
   * not by growing, not by scrolling, not however long their names are.
   *
   * No account card sits below the display — those actions live in the header's
   * account menu.
   */
  function sideMenu(onNavigate?: () => void) {
    return (
      <div className="ls-menu w-full">
        {/* Head: identity, store state, and the menu's search. */}
        <div data-area="head">
          {menuHeader}

          <div className="mt-3">
            <SearchField
              aria-label={`Search ${label.toLowerCase()}`}
              variant="secondary"
              value={navTerm}
              onChange={setNavTerm}
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input className="w-full" placeholder="Search the menu" />
                {navTerm ? <SearchField.ClearButton /> : null}
              </SearchField.Group>
            </SearchField>
          </div>
        </div>

        <div data-area="body">
          {/* SECTION A — the main navigation: an icon-forward rail. */}
          <div data-area="nav">{navRail()}</div>

          {/* SECTION B — the secondary area: what this workspace is made of, and
              the way into the page behind the menu. Its own region, its own
              white surface, its own scroll — structurally independent of
              SECTION A. */}
          {contextData && displayItem ? (
            <div data-area="display">
            <WorkspaceSectionDisplay
              key={displayItem.key}
              contextData={contextData}
              item={displayItem}
              onNavigate={onNavigate}
              onOpen={onNavigate}
              openHref={navItemHref(displayItem, navContext)}
              showOpen={!viewingDisplay}
              storeName={store?.name ?? null}
              storePublished={store?.isPublished ?? false}
            />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  /*
   * Sign out, in place. The action ends the session, drops the browser-side
   * shopping identity and revalidates every layout, so the workspace and the
   * account surfaces it carries are gone from the screen immediately — no
   * manual refresh, and nothing of this account left for the next one.
   */
  const signOut = () => {
    startSignOut(async () => {
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

  const accountMenu = (
    <Dropdown>
      <Button isIconOnly variant="ghost" size="sm" aria-label={`Account: ${user.name}`}>
        <Avatar className="size-8">
          {user.avatarUrl ? <Avatar.Image alt={user.name} src={user.avatarUrl} /> : null}
          <Avatar.Fallback className="text-[10px]">{user.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
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
            router.push(target);
          }}
        >
          <Dropdown.Item id="identity" textValue={user.name} isDisabled>
            <div className="flex flex-col">
              <Label>{user.name}</Label>
              <span className="text-xs text-muted">{user.email}</span>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id="/workspace/settings?tab=profile" textValue="Account">
            <Icon name="account" size={15} className="shrink-0 text-muted" />
            <Label>Account</Label>
          </Dropdown.Item>
          <Dropdown.Item id="/workspace/settings" textValue="Store settings">
            <Icon name="settings" size={15} className="shrink-0 text-muted" />
            <Label>Store settings</Label>
          </Dropdown.Item>
          {user.role === "admin" ? (
            <Dropdown.Item id="/admin" textValue="Platform admin">
              <Icon name="shield" size={15} className="shrink-0 text-muted" />
              <Label>Platform admin</Label>
            </Dropdown.Item>
          ) : null}
          <Dropdown.Item id="/logout" textValue="Sign out" variant="danger">
            <Icon name="signOut" size={15} className="shrink-0 text-danger" />
            <Label>Sign out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );

  const trail = [label, currentItem?.label].filter((part): part is string => Boolean(part));

  const bottomNavItems: FloatingNavItem[] = mobileNavItems(nav).map((item) => ({
    href: navItemHref(item, navContext),
    label: item.label,
    icon: item.icon,
    active: currentItem?.key === item.key,
  }));

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/*
       * The side menu: solid base white and neutral — furniture that is always
       * on screen, with no glass. The colour arrives in motion: the trio
       * travelling around the active tile's edge and the quiet orbs behind the
       * menu; SECTION B floats on it in white. The width steps with the viewport
       * so the page beside it is never squeezed at the `lg` breakpoint.
       */}
      <aside
        aria-label={label}
        className="bg-surface shadow-elev-float fixed inset-y-0 left-0 z-30 isolate hidden w-[25rem] flex-col overflow-hidden p-4 lg:flex xl:w-[28rem] 2xl:w-[30rem]"
      >
        {/* A quiet three-orb accent in the accent trio — an environmental
            detail, behind every part of the menu. */}
        <SvgBackdrop className="-z-10" variant="quiet" />
        {sideMenu()}
      </aside>

      {/* Content clears the fixed side menu at every width. */}
      <div className="lg:pl-[25rem] xl:pl-[28rem] 2xl:pl-[30rem]">
        {/* The top bar is solid base white too — the same neutral furniture,
            floating over the content on a soft shadow instead of a rule line. */}
        <header className="bg-surface shadow-elev-2 sticky top-0 z-20 flex h-16 items-center gap-2 px-4 sm:px-6">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Open navigation"
            className="lg:hidden"
            onPress={mobileNav.open}
          >
            <Icon name="menu" size={18} />
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <p className="hidden min-w-0 truncate text-[14px] text-muted md:block">
              {label === "Workspace" ? "Welcome back, " : "Welcome, "}
              <span className="font-semibold text-foreground">{user.name}</span>
            </p>

            <span className="flex min-w-0 items-center gap-2">
              {trail.map((part, index) => (
                <Fragment key={part}>
                  {index > 0 ? (
                    <Icon name="chevronRight" size={14} className="shrink-0 text-muted/60" />
                  ) : null}
                  <span
                    className={`truncate text-[13.5px] ${
                      index === trail.length - 1 ? "font-medium text-foreground" : "text-muted"
                    }`}
                  >
                    {part}
                  </span>
                </Fragment>
              ))}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {store ? (
              <>
                <Tooltip delay={200}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Copy storefront link"
                    onPress={copyStoreLink}
                  >
                    <Icon name={copied ? "check" : "link"} size={16} />
                  </Button>
                  <Tooltip.Content>{copied ? "Link copied" : "Copy storefront link"}</Tooltip.Content>
                </Tooltip>

                <Tooltip delay={200}>
                  <NavButton
                    ariaLabel="Open storefront"
                    href={`/@${store.slug}`}
                    isIconOnly
                    size="sm"
                    variant="ghost"
                  >
                    <Icon name="externalLink" size={16} />
                  </NavButton>
                  <Tooltip.Content>Open storefront</Tooltip.Content>
                </Tooltip>
              </>
            ) : null}

            <ThemeToggle size="sm" />
            {accountMenu}
          </div>
        </header>

        {/* `min-w-0` and horizontal clipping keep one wide card from widening the
            page; the bottom padding clears the floating navigation until the
            sidebar takes over at `lg`. */}
        <main className="mx-auto w-full max-w-7xl min-w-0 overflow-x-clip px-5 py-8 pb-28 sm:px-8 lg:px-10 lg:py-10 lg:pb-14">
          <FocusRegion>{children}</FocusRegion>
        </main>
      </div>

      <FloatingBottomNav ariaLabel={`${label} primary`} items={bottomNavItems} />

      <Drawer isOpen={mobileNav.isOpen} onOpenChange={mobileNav.setOpen}>
        <Drawer.Backdrop>
          <Drawer.Content placement="left">
            {/* HeroUI's own drawer CSS pins a left drawer to `w-80
                max-w-[85vw] sm:w-96` and pads the panel itself, so the width is
                set inline here where those rules cannot win. */}
            <Drawer.Dialog
              aria-label={`${label} navigation`}
              className="flex h-dvh flex-col bg-surface"
              style={{ width: "97vw", maxWidth: "100vw", padding: 0 }}
            >
              <Drawer.CloseTrigger />
              {/* The same two-section panel as the fixed side menu. */}
              <Drawer.Body
                className="flex min-h-0 flex-col"
                style={{ padding: "1.25rem" }}
              >
                {sideMenu(() => mobileNav.close())}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </div>
  );
}
