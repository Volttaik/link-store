import { Avatar } from "@heroui/react/avatar";
import { Chip } from "@heroui/react/chip";
import { ButtonLink } from "@/components/ui/controls";
import { notFound } from "next/navigation";

import { ProfileCard } from "@/components/cards/ProfileCard";

import { RatingStars, SectionHeader } from "@/components/ui/atoms";
import { StorefrontShowcase } from "@/components/marketplace/StorefrontShowcase";
import { MessageSellerButton } from "@/components/marketplace/MessageSellerButton";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { PatternSurface } from "@/components/visual/BackgroundPattern";
import { ThreeOrbs } from "@/components/visual/Atmosphere";
import { getCurrentUser } from "@/lib/auth";
import { getStorefront, storeNeighbourhood } from "@/lib/server/discovery";
import { getStoreRating } from "@/lib/server/management";
import { recordAnalyticsEvent } from "@/lib/server/insights";
import { storeCategoryMeta } from "@/lib/catalog";
import { storeSocials as readSocials } from "@/lib/server/stores";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = decodeURIComponent(handle).replace(/^@/, "").toLowerCase();
  const storefront = await getStorefront(slug);

  return {
    title: storefront ? storefront.store.name : "Storefront",
    description:
      storefront?.store.tagline ??
      storefront?.store.description?.slice(0, 150) ??
      `Shop from @${slug} on Link Store`,
  };
}

/**
 * A seller's public storefront.
 *
 * Sections are not configured anywhere: they are derived from what the seller
 * actually published, so a restaurant shows a menu, a boutique shows products,
 * and an organiser shows events — all from the same engine.
 */
export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const raw = decodeURIComponent(handle);

  // The public address is /@handle; anything without the @ is not a storefront.
  if (!raw.startsWith("@")) notFound();

  const slug = raw.slice(1).toLowerCase();
  const storefront = await getStorefront(slug);

  if (!storefront) notFound();

  const { store, sections, events, card } = storefront;
  const [user, rating, neighbours] = await Promise.all([
    getCurrentUser(),
    getStoreRating(store.id),
    storeNeighbourhood(store.id, 3),
  ]);

  const isOwner = Boolean(user && user.id === store.user_id);

  if (!store.is_published && !isOwner) notFound();

  if (!isOwner) {
    await recordAnalyticsEvent({
      storeId: store.id,
      eventType: "store_view",
      userId: user?.id ?? null,
    });
  }

  const socials = readSocials(store);
  const category = storeCategoryMeta(store.primary_category);
  const hasContent = sections.length > 0 || events.length > 0;
  const { designType } = storefront;

  /**
   * The image whose hue the storefront header takes its atmosphere from: the
   * seller's own banner or logo first, then the first product they published.
   */
  const tintSource =
    store.banner_url ??
    store.logo_url ??
    sections.flatMap((section) => section.items)[0]?.imageUrl ??
    events[0]?.coverImageUrl ??
    null;

  return (
    <div>
      {/* Store header */}
      <PatternSurface
        id="storefront-header"
        className="ls-tone bg-surface ls-elev-2"
        patternClassName="text-accent/10"
        tintSrc={tintSource}
        tintStrength={0.8}
      >
        {/* The shop's own cover, behind its identity: name, mark and details
            sit on top of it, kept legible by a soft scrim. */}
        {store.banner_url ? (
          <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden">
            <img
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              src={store.banner_url}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/35" />
          </div>
        ) : null}
        {/* The shop's pop: the orb motif large in the corner while the shop's
            own colour washes the surface — every storefront feels like itself. */}
        <ThreeOrbs className="absolute -top-8 right-2 -z-10 h-56 w-56 opacity-70 sm:h-72 sm:w-72" />
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar size="lg" className="h-20 w-20 shrink-0 text-xl">
              {store.logo_url ?? undefined ? (
              <Avatar.Image alt="" src={store.logo_url ?? undefined} />
              ) : null}
              <Avatar.Fallback>{store.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{store.name}</h1>
                {!store.is_published ? (
                  <Chip size="sm" color="warning" variant="secondary">
                    Not published
                  </Chip>
                ) : null}
                {category ? (
                  <Chip size="sm" variant="secondary">
                    <span aria-hidden="true" className="mr-1">
                      {category.icon}
                    </span>
                    {category.label}
                  </Chip>
                ) : null}
              </div>

              <p className="text-sm text-muted">
                <span className="font-medium text-foreground dark:text-muted">
                  @{store.slug}
                </span>
                {store.tagline ? ` · ${store.tagline}` : ""}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                <RatingStars rating={rating.average} count={rating.count} />
                <span>
                  {formatNumber(card.publishedListingCount)}{" "}
                  {card.publishedListingCount === 1 ? "item" : "items"}
                </span>
                {events.length > 0 ? (
                  <span>
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </span>
                ) : null}
                <span>Joined {formatDate(card.createdAt)}</span>
                {store.city ? <span>{store.city}</span> : null}
              </div>

              {store.description ? (
                <p className="max-w-3xl text-sm text-muted">{store.description}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {store.contact_phone ? (
                  <Chip size="sm" variant="secondary">
                    {store.contact_phone}
                  </Chip>
                ) : null}
                {store.contact_email ? (
                  <Chip size="sm" variant="secondary">
                    {store.contact_email}
                  </Chip>
                ) : null}
                {Object.entries(socials).map(([network, value]) => (
                  <Chip key={network} size="sm" variant="secondary">
                    {network}: {value}
                  </Chip>
                ))}
                {isOwner ? (
                  <ButtonLink href="/workspace" size="sm" variant="secondary">
                    Manage store
                  </ButtonLink>
                ) : (
                  <MessageSellerButton
                    size="sm"
                    storeId={store.id}
                    sellerName={store.name}
                    label={`Message ${store.name}`}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </PatternSurface>

      <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-10 sm:px-6">
        {!hasContent ? (
          <EmptyState
            icon={category?.icon ?? "storefront"}
            title={
              store.is_published
                ? "Nothing published yet"
                : "This storefront is not open yet"
            }
            description={
              isOwner
                ? "Add your first listing and publish it. Your products, menu, services, events and digital files will appear here automatically, grouped by what they are."
                : "This seller has not published anything yet. Check back soon, or explore other stores on Link Store."
            }
            action={
              isOwner ? (
                <ButtonLink href="/workspace/listings/new" variant="primary">
                  Create your first listing
                </ButtonLink>
              ) : (
                <ButtonLink href="/stores" variant="primary">
                  Browse other stores
                </ButtonLink>
              )
            }
          />
        ) : null}

        {/* The catalogue, as one segmented experience: a pinned segment rail
            plus large product cards that continue sideways instead of being
            shrunk to fit a row. */}
        <StorefrontShowcase
          designType={designType}
          events={events}
          sections={sections}
          storeName={store.name}
        />

        {isOwner && !store.is_published ? (
          <InfoNote tone="warning" title="Your storefront is not public yet">
            Visitors cannot see this page until you publish your store. Publishing requires at least
            one published listing, so nothing here links to a dead end.
          </InfoNote>
        ) : null}

        {neighbours.length > 0 ? (
          <>
            
            <section className="space-y-4">
              <SectionHeader title="Similar stores"
                description={`More sellers in ${category?.label ?? "this category"}`}
              />
              <div className="ls-deal-grid grid gap-4 sm:grid-cols-3">
                {neighbours.map((neighbour) => (
                  <ProfileCard
                    key={neighbour.id}
                    actionLabel="Open shop"
                    avatarUrl={neighbour.logoUrl}
                    caption={
                      [neighbour.city, neighbour.country].filter(Boolean).join(", ") ||
                      neighbour.primaryCategory ||
                      undefined
                    }
                    handle={neighbour.slug}
                    href={`/@${neighbour.slug}`}
                    name={neighbour.name}
                    stats={[
                      { value: neighbour.publishedListingCount, label: "items" },
                      { value: formatRelative(neighbour.createdAt), label: "joined" },
                    ]}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
