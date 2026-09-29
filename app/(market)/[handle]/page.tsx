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
import { formatDate, formatRelative } from "@/lib/format";

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
   * Only used when there is no cover — a cover fills the header as the real
   * image and the ambient wash stands down for it.
   */
  const tintSource =
    store.banner_url ??
    store.logo_url ??
    sections.flatMap((section) => section.items)[0]?.imageUrl ??
    events[0]?.coverImageUrl ??
    null;

  return (
    <div>
      {/*
        Store header: a split composition. The store's identity stands on one
        side, the cover photo is the hero of the other, and the two meet along
        a diagonal slash that is the shape of the header itself. The photo
        carries no scrim, no fade and no decoration — the layout solves
        legibility, so the seller's photograph is seen exactly as uploaded.
      */}
      <PatternSurface
        id="storefront-header"
        className="ls-tone bg-surface ls-elev-2"
        patternClassName="text-accent/10"
        tintSrc={store.banner_url ? null : tintSource}
        tintStrength={0.8}
      >
        {/*
          The cover photo's region — the right half of the composition from `lg`
          up, a band across the top on small screens. It is always present, so
          the header always reads as two clear regions: the store's identity on
          one side, the cover area on the other. The slash between them is
          structural — it is the region's own slanted edge (`.store-slash`),
          with the seam (`.store-slash-seam`) and the identity side's cast depth
          (`.store-slash-depth`) riding the same diagonal — never an overlay on
          the image. The photograph paints exactly as uploaded: fitted, raw,
          with no scrim, fade or blur over it.
        */}
        <div
          aria-hidden="true"
          className="relative h-56 w-full sm:h-72 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[54%]"
        >
          <div className="store-slash-depth store-slash absolute inset-0" />
          <div className="store-slash-seam store-slash absolute inset-0" />
          <div className="store-slash absolute inset-0 overflow-hidden">
            {store.banner_url ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                src={store.banner_url}
              />
            ) : (
              /* No cover uploaded: the region stands as the shop's own quiet
                 panel — tone and the orb motif standing in for the photograph,
                 so the split is still the shape of the header. */
              <div className="ls-tone relative h-full w-full bg-surface-secondary/50">
                <ThreeOrbs className="absolute -top-8 right-2 h-56 w-56 opacity-70 sm:h-72 sm:w-72" />
              </div>
            )}
          </div>
        </div>
        {/* The identity region — the store's signboard, on its own plate so the
            left half reads as a designed storefront identity area rather than
            as bare text beside a photograph. Clear of the slash at every width,
            so nothing is ever placed over the cover. */}
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:py-14 lg:pr-[54%]">
          <div className="rounded-3xl bg-surface p-6 shadow-elev-2 ring-1 ring-foreground/8 sm:p-7">
            <div className="flex flex-col items-start gap-5">
            {/* The store's mark, on the profile-picture system: fitted
                proportionally inside its plate with room to breathe — square
                stays square, wide stays wide, and nothing is stretched,
                cropped or clipped at the edges. */}
            {/* The sign plate: the mark raised on the identity surface, so the
                logo reads as the shop's sign rather than as a loose image. */}
            <Avatar
              size="lg"
              className="h-20 w-20 shrink-0 text-xl shadow-elev-2 ring-1 ring-foreground/8 sm:h-24 sm:w-24"
            >
              {store.logo_url ?? undefined ? (
              <Avatar.Image alt="" className="object-contain p-2" src={store.logo_url ?? undefined} />
              ) : null}
              <Avatar.Fallback>{store.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
            </Avatar>

            <div className="w-full min-w-0 space-y-3">
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

              {/* The one flourish of the accent trio, under the name: the
                  identity area's signature, kept to a hairline. */}
              <span
                aria-hidden="true"
                className="block h-1 w-12 rounded-full bg-gradient-to-r from-iris-deep via-iris to-milk"
              />

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                <RatingStars rating={rating.average} count={rating.count} />
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
                    stats={[{ value: formatRelative(neighbour.createdAt), label: "joined" }]}
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
