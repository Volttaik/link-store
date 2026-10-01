/**
 * The user-state model — account vs. workspace, and what each state may do.
 *
 * Having an account is not the same as owning a workspace. A person can hold a
 * fully valid LINK STORE account and use the platform as a normal buyer —
 * messaging, orders, purchases, tickets, events, settings — without ever
 * creating a store or becoming a seller. A **workspace** is an optional
 * capability attached to an account that unlocks the seller/owner side.
 *
 * This module is deliberately client-safe: it carries only the shape of a
 * person's state and the capability rules, never a database handle. The server
 * resolves a real `UserState` (see `lib/auth.ts`); the interface reads it to
 * decide what to show. Visibility is never security — every guarded route and
 * server action independently enforces the same rules against the session.
 *
 * Three states, and only three:
 *
 *   guest      — no account. Browse what is public; anything that needs an
 *                account asks them to **create an account** first.
 *   account    — signed in, no workspace. A complete, normal user. The seller
 *                gateway is offered, never assumed.
 *   workspace  — signed in and owns a workspace. Seller/owner tools appear —
 *                and the account side (buying, messaging, their own orders)
 *                keeps working exactly as before.
 */

/** Which of the three states a person is in. */
export type UserStateKind = "guest" | "account" | "workspace";

/**
 * Everything the interface needs to know about who is looking at it.
 *
 * `workspaceId` / `workspaceSlug` identify *this user's own* workspace so owner
 * controls can be offered on their own records. They are null whenever
 * `hasWorkspace` is false. Ownership of a *specific* record is never inferred
 * from these alone — it is validated server-side.
 */
export type UserState = {
  kind: UserStateKind;
  isAuthenticated: boolean;
  hasWorkspace: boolean;
  /** The id of the workspace this account owns, if any. */
  workspaceId: string | null;
  /** The public handle of that workspace's storefront (`/@handle`), if any. */
  workspaceSlug: string | null;
  isAdmin: boolean;
};

/** The state of someone who is not signed in. */
export const GUEST_USER_STATE: UserState = {
  kind: "guest",
  isAuthenticated: false,
  hasWorkspace: false,
  workspaceId: null,
  workspaceSlug: null,
  isAdmin: false,
};

/** The state of a signed-in account that has not created a workspace. */
export function accountUserState(user: { isAdmin?: boolean } = {}): UserState {
  return {
    kind: "account",
    isAuthenticated: true,
    hasWorkspace: false,
    workspaceId: null,
    workspaceSlug: null,
    isAdmin: Boolean(user.isAdmin),
  };
}

/** The state of a signed-in account that owns a workspace. */
export function workspaceUserState(workspace: {
  id: string;
  slug: string | null;
  isAdmin?: boolean;
}): UserState {
  return {
    kind: "workspace",
    isAuthenticated: true,
    hasWorkspace: true,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug ?? null,
    isAdmin: Boolean(workspace.isAdmin),
  };
}

/** Narrowing helper: is this person signed in? */
export function isAuthenticated(state: UserState): boolean {
  return state.isAuthenticated;
}

/** Narrowing helper: does this account own a workspace? */
export function hasWorkspace(state: UserState): boolean {
  return state.hasWorkspace;
}

// --- Capability matrix -------------------------------------------------------
//
// The single answer to "what does this feature actually require?".
//
// A surprising number of things people lump under "seller functionality" need
// only an account (or nothing at all), and a few need a workspace. Every feature
// is declared once here so no surface has to guess. `account` means "must be
// signed in"; `workspace` means "must own a workspace". Both false = public.

export type Capability =
  // Public — no account, no workspace.
  | "browseMarketplace"
  | "viewProduct"
  | "viewStore"
  | "viewEvent"
  | "createAccount"
  // Account layer — signed in, but no workspace needed.
  | "messaging"
  | "buyProduct"
  | "viewMyOrders"
  | "manageOwnProfile"
  | "saveFavorites"
  | "createWorkspace"
  // Workspace layer — signed in AND owns a workspace.
  | "createProduct"
  | "createEvent"
  | "manageStore"
  | "manageSellerOrders"
  | "manageInventory"
  | "manageDiscounts"
  | "viewCustomers"
  | "viewAnalytics"
  | "viewFinance";

export type CapabilityRequirement = {
  /** Must be signed in. */
  account: boolean;
  /** Must own a workspace. */
  workspace: boolean;
};

export const CAPABILITIES: Record<Capability, CapabilityRequirement> = {
  // Public.
  browseMarketplace: { account: false, workspace: false },
  viewProduct: { account: false, workspace: false },
  viewStore: { account: false, workspace: false },
  viewEvent: { account: false, workspace: false },
  createAccount: { account: false, workspace: false },

  // Account layer.
  messaging: { account: true, workspace: false },
  buyProduct: { account: true, workspace: false },
  viewMyOrders: { account: true, workspace: false },
  manageOwnProfile: { account: true, workspace: false },
  saveFavorites: { account: true, workspace: false },
  createWorkspace: { account: true, workspace: false },

  // Workspace layer.
  createProduct: { account: true, workspace: true },
  createEvent: { account: true, workspace: true },
  manageStore: { account: true, workspace: true },
  manageSellerOrders: { account: true, workspace: true },
  manageInventory: { account: true, workspace: true },
  manageDiscounts: { account: true, workspace: true },
  viewCustomers: { account: true, workspace: true },
  viewAnalytics: { account: true, workspace: true },
  viewFinance: { account: true, workspace: true },
};

/**
 * May a person in this state use this capability?
 *
 * The pure rule behind every navigation choice, button and guard. The server
 * applies the same rule to authorise the action itself.
 */
export function capabilityAllowed(capability: Capability, state: UserState): boolean {
  const requirement = CAPABILITIES[capability];
  if (requirement.account && !state.isAuthenticated) return false;
  if (requirement.workspace && !state.hasWorkspace) return false;
  return true;
}

/**
 * Why a capability is refused — so an interface can say "create an account" to a
 * guest and "create a workspace" to a signed-in account, rather than a dead end.
 */
export type CapabilityBlock = "none" | "account" | "workspace";

export function capabilityBlock(capability: Capability, state: UserState): CapabilityBlock {
  if (capabilityAllowed(capability, state)) return "none";
  const requirement = CAPABILITIES[capability];
  if (requirement.account && !state.isAuthenticated) return "account";
  return "workspace";
}
