import Link from "next/link";

import { Card } from "@heroui/react/card";

import { PageHeader } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { ProfileForm, SignOutAllDevices } from "@/components/workspace/SettingsForms";
import { getUserProfile, getUserState, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

/**
 * Account management.
 *
 * This is the account layer, not the workspace layer: who a person is, how they
 * sign in, and the optional gateway into becoming a seller. It needs only an
 * account — a person can manage everything here without ever creating a
 * workspace, and the platform is complete for them without one.
 *
 * Store identity, products, orders-as-sales and payouts live in the workspace
 * (`/workspace`), which is a separate management environment for accounts that
 * choose to own one.
 */
export default async function AccountSettingsPage() {
  const user = await requireUser("/settings");
  const userState = await getUserState();
  const profile = await getUserProfile(user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
      <PageHeader
        title="Your account"
        description="Your profile and how you sign in. Create a workspace whenever you want to sell — it is optional."
      />

      {/* The optional seller gateway. Clear about what it unlocks and that it is
          a choice, never a required step to use the platform. */}
      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <h2 className="text-lg font-semibold">Your workspace</h2>
          <p className="text-sm text-muted">
            {userState.hasWorkspace
              ? "You own a workspace — your store, products, events and sales live there."
              : "A workspace is where you sell and manage your own content. You do not need one to use Rush Cart."}
          </p>
        </Card.Header>
        <Card.Content className="gap-3">
          {userState.hasWorkspace ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/workspace"
                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background no-underline transition-opacity hover:opacity-90"
              >
                <Icon name="workspace" size={15} />
                Open workspace
              </Link>
              <Link
                href="/workspace/settings"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-surface-secondary"
              >
                <Icon name="shop" size={15} />
                Store management
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/workspace/onboarding"
                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background no-underline transition-opacity hover:opacity-90"
              >
                <Icon name="plus" size={15} />
                Create Workspace
              </Link>
              <span className="text-xs text-muted">Optional — only if you want to sell.</span>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <h2 className="text-lg font-semibold">Your profile</h2>
          <p className="text-sm text-muted">
            Signed in since {profile ? formatDateTime(profile.created_at) : "—"}
            {profile?.last_login_at ? ` · last seen ${formatDateTime(profile.last_login_at)}` : ""}
          </p>
        </Card.Header>
        <Card.Content>
          <ProfileForm
            user={{
              name: user.name,
              email: user.email,
              phone: profile?.phone ?? null,
              avatarUrl: user.avatarUrl,
            }}
          />
        </Card.Content>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="ls-elev-2 lg:col-span-2">
          <Card.Header className="flex-col items-start gap-1">
            <h2 className="text-lg font-semibold">How you sign in</h2>
            <p className="text-sm text-muted">
              A code sent to your email. Nothing to remember, nothing stored that could be stolen.
            </p>
          </Card.Header>
          <Card.Content className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl ls-elev-2 bg-surface-secondary px-4 py-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className="text-muted" name="mail" size={15} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{user.email}</span>
                  <span className="block text-xs text-muted">Sign-in codes are sent here</span>
                </span>
              </span>
            </div>
          </Card.Content>
        </Card>

        <Card className="ls-elev-2">
          <Card.Header className="flex-col items-start gap-1">
            <h2 className="text-lg font-semibold">Sessions</h2>
            <p className="text-sm text-muted">Sign out everywhere at once.</p>
          </Card.Header>
          <Card.Content>
            <SignOutAllDevices />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
