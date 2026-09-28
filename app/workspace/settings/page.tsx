import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";

import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { InfoNote } from "@/components/ui/feedback";
import {
  PayoutDetailsForm,
  ProfileForm,
  PublishToggle,
  SignOutAllDevices,
  DesignTypeForm,
  StoreProfileForm,
  StoreRulesForm,
} from "@/components/workspace/SettingsForms";
import { UrlTabs } from "@/components/workspace/UrlTabs";
import { getUserProfile, requireStore } from "@/lib/auth";
import { isPaystackConfigured, paystackConfig } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getStoreSettings, storeIsPublished, storeSocials } from "@/lib/server/stores";
import { storageStatus } from "@/lib/storage";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "store", label: "Storefront" },
  { key: "payments", label: "Payments" },
  { key: "profile", label: "Profile" },
  { key: "security", label: "Security" },
];

/**
 * Settings.
 *
 * Grouped into the four things a seller actually changes: how the storefront
 * looks, how money moves, who they are, and how they sign in.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const { user, store } = await requireStore();

  const tab = TABS.some((entry) => entry.key === params.tab) ? (params.tab as string) : "store";

  const [profile, settings] = await Promise.all([getUserProfile(user.id), getStoreSettings(store.id)]);
  const storage = storageStatus();
  const isPublished = storeIsPublished(store);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Your storefront, your payout account, your account."
        breadcrumb={
          <span className="text-xs text-muted">
            Workspace <span className="mx-1">/</span> Settings
          </span>
        }
        actions={
          <>
            <Chip variant="secondary" size="sm">
              /@{store.slug}
            </Chip>
            <StatusChip
              label={isPublished ? "public" : "hidden"}
              tone={isPublished ? "success" : "default"}
            />
          </>
        }
      />

      <UrlTabs items={TABS} value={tab} ariaLabel="Settings sections" />

      {tab === "store" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Storefront details</h2>
              <p className="text-sm text-muted">
                Everything here appears on{" "}
                <Link href={`/@${store.slug}`}>
                  /@{store.slug}
                </Link>
                .
              </p>
            </Card.Header>
            
            <Card.Content>
              <StoreProfileForm
                store={{
                  name: store.name,
                  slug: store.slug,
                  tagline: store.tagline,
                  description: store.description,
                  primary_category: store.primary_category,
                  currency: store.currency,
                  contact_email: store.contact_email,
                  contact_phone: store.contact_phone,
                  address: store.address,
                  city: store.city,
                  state: store.state,
                  country: store.country,
                  logo_url: store.logo_url,
                  banner_url: store.banner_url,
                  socials: storeSocials(store),
                }}
              />
            </Card.Content>
          </Card>

          <div className="flex flex-col gap-5">
            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <h2 className="text-lg font-semibold">Visibility</h2>
                <p className="text-sm text-muted">Control whether shoppers can discover you.</p>
              </Card.Header>
              
              <Card.Content>
                <PublishToggle isPublished={isPublished} />
              </Card.Content>
            </Card>

            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <h2 className="text-lg font-semibold">Design type</h2>
                <p className="text-sm text-muted">How your storefront leads.</p>
              </Card.Header>
              
              <Card.Content>
                <DesignTypeForm designType={settings.design_type} />
              </Card.Content>
            </Card>

            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <h2 className="text-lg font-semibold">File storage</h2>
                <p className="text-sm text-muted">Where your uploads are kept.</p>
              </Card.Header>
              
              <Card.Content className="gap-3">
                <StatusChip
                  label={storage.driver === "r2" ? "Cloudflare R2" : "Local disk"}
                  tone={storage.configured ? "success" : "warning"}
                />
                <p className="text-sm text-muted">{storage.message}</p>
                {!storage.configured ? (
                  <InfoNote title="Development storage">
                    Uploads still work right now — files are written under <code>./storage</code> and served
                    through this app. Configure R2 before going live so uploads survive deploys.
                  </InfoNote>
                ) : null}
              </Card.Content>
            </Card>
          </div>

          <Card className="ls-elev-2 lg:col-span-3">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Checkout rules</h2>
              <p className="text-sm text-muted">
                Delivery pricing and stock warnings applied across your store.
              </p>
            </Card.Header>
            
            <Card.Content>
              <StoreRulesForm
                currency={store.currency}
                settings={{
                  low_stock_threshold: Number(settings.low_stock_threshold),
                  order_prefix: settings.order_prefix,
                  shipping_flat_fee: Number(settings.shipping_flat_fee),
                  free_shipping_over:
                    settings.free_shipping_over === null ? null : Number(settings.free_shipping_over),
                  delivery_estimate_min_days: Number(settings.delivery_estimate_min_days ?? 3),
                  delivery_estimate_max_days: Number(settings.delivery_estimate_max_days ?? 5),
                  pickup_location_name: settings.pickup_location_name,
                  pickup_address: settings.pickup_address,
                  pickup_hours: settings.pickup_hours,
                  pickup_instructions: settings.pickup_instructions,
                }}
              />
            </Card.Content>
          </Card>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Payout account</h2>
              <p className="text-sm text-muted">
                Where Link Store sends your settled balance.
              </p>
            </Card.Header>
            
            <Card.Content>
              <PayoutDetailsForm
                settings={{
                  payout_bank_code: settings.payout_bank_code,
                  payout_bank_name: settings.payout_bank_name,
                  payout_account_number: settings.payout_account_number,
                  payout_account_name: settings.payout_account_name,
                }}
              />
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Payment processing</h2>
              <p className="text-sm text-muted">The gateway behind your checkout.</p>
            </Card.Header>
            
            <Card.Content className="gap-3">
              <StatusChip
                label={isPaystackConfigured ? "Paystack connected" : "Paystack not configured"}
                tone={isPaystackConfigured ? "success" : "warning"}
              />
              {isPaystackConfigured ? (
                <>
                  <p className="text-sm text-muted">
                    Card payments and webhooks are handled through Paystack. Payment status is confirmed
                    against Paystack before any order is fulfilled.
                  </p>
                  <p className="text-xs text-muted">
                    Payments are confirmed automatically the moment a customer pays — nothing to
                    set up, nothing to check.
                  </p>
                </>
              ) : (
                <InfoNote tone="warning" title="Paystack keys are missing">
                  Set <code>PAYSTACK_SECRET_KEY</code> and <code>PAYSTACK_PUBLIC_KEY</code> so customers
                  can pay you. Until then checkout will tell shoppers that payment is unavailable rather
                  than pretending the order succeeded.
                </InfoNote>
              )}
            </Card.Content>
          </Card>
        </div>
      ) : null}

      {tab === "profile" ? (
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
      ) : null}

      {tab === "security" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* How the account is entered. There is no password column anywhere on
              this screen because there is no password: a code to the address
              below is the whole credential. */}
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">How you sign in</h2>
              <p className="text-sm text-muted">
                A code sent to your email. Nothing to remember, nothing stored
                that could be stolen.
              </p>
            </Card.Header>
            
            <Card.Content className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl ls-elev-2 bg-surface-secondary px-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon className="text-muted" name="mail" size={15} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {user.email}
                    </span>
                    <span className="block text-xs text-muted">
                      Sign-in codes are sent here
                    </span>
                  </span>
                </span>
                <StatusChip
                  label={profile?.email_verified ? "email verified" : "not verified yet"}
                  tone={profile?.email_verified ? "success" : "warning"}
                />
              </div>

              <p className="text-xs text-muted">
                Signed in since {profile ? formatDateTime(profile.created_at) : "—"}
                {profile?.last_login_at
                  ? ` · last seen ${formatDateTime(profile.last_login_at)}`
                  : ""}
              </p>
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
      ) : null}
    </div>
  );
}
