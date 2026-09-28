import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { ButtonLink } from "@/components/ui/controls";
import { notFound } from "next/navigation";

import { Gallery } from "@/components/marketplace/Gallery";
import { PurchasePanel, TicketPurchasePanel } from "@/components/marketplace/PurchasePanel";
import { MessageSellerButton } from "@/components/marketplace/MessageSellerButton";
import { ImageTint } from "@/components/visual/AdaptiveTint";
import { GradientField, SvgBackdrop } from "@/components/visual/Atmosphere";
import { RatingStars, StatusChip } from "@/components/ui/atoms";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { getCurrentUser } from "@/lib/auth";
import { getStoreById } from "@/lib/server/stores";
import { listTicketTypes } from "@/lib/server/events";
import { getListingDetail, incrementListingViews } from "@/lib/server/listings";
import { getListingRating, listListingReviews } from "@/lib/server/management";
import { recordAnalyticsEvent } from "@/lib/server/insights";
import { listingTypeMeta, ordersInThread } from "@/lib/catalog";
import { describeListingAttributes } from "@/lib/listing-fields";
import { formatDate, formatDuration, formatRelative, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListingDetail(id);
  return {
    title: listing ? listing.title : "Listing",
    description: listing?.subtitle ?? listing?.description?.slice(0, 150) ?? undefined,
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getListingDetail(id);

  if (!detail) notFound();

  const [user, store] = await Promise.all([getCurrentUser(), getStoreById(detail.storeId)]);
  const isOwner = Boolean(user && store && store.user_id === user.id);

  // Drafts and archived listings are visible only to the seller who owns them.
  if ((detail.status !== "active" || !detail.storePublished) && !isOwner) {
    notFound();
  }

  const [reviews, rating, ticketTypes] = await Promise.all([
    listListingReviews(id, 5),
    getListingRating(id),
    // A ticket listing sells admission to its event — the ticket picker is the
    // only way it is ever bought. Tickets never enter a cart.
    detail.type === "event_ticket" && detail.eventId
      ? listTicketTypes(detail.eventId)
      : Promise.resolve([]),
  ]);

  if (!isOwner) {
    await Promise.all([
      incrementListingViews(id),
      recordAnalyticsEvent({
        storeId: detail.storeId,
        listingId: id,
        eventType: "listing_view",
        userId: user?.id ?? null,
      }),
    ]);
  }

  const meta = listingTypeMeta(detail.type);
  const attributes = detail.attributes as Record<string, unknown>;

  /** The photo whose dominant hue the top of this page is tinted with. */
  const heroImage = detail.images[0]?.image_url ?? null;

  return (
    /*
     * The page takes its colour philosophy from the listing's own photography.
     * `ImageTint` publishes the image's palette as CSS variables on this section,
     * so anything below can key off the same hue — and it draws the restrained
     * wash behind the top of the page. The wash is non-interactive so it cannot
     * sit in the way of anything.
     */
    <ImageTint
      className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6"
      src={heroImage}
      strength={0.6}
    >

      <div className="relative mb-5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Link href={`/@${detail.storeSlug}`} className="text-muted">
          {detail.storeName}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{meta.plural}</span>
        <span aria-hidden="true">/</span>
        <span className="truncate">{detail.title}</span>
      </div>

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* The product image sits in a soft gradient atmosphere drawn from the
            LinkStore continuum (and biased by the photo above) — depth around
            the hero of the page rather than a flat white box. */}
        <div className="relative isolate overflow-hidden rounded-2xl p-2 sm:p-3">
          <GradientField className="absolute inset-0 -z-10" opacity={0.45} />
          <SvgBackdrop className="-z-10" variant="quiet" />
          <Gallery images={detail.images} title={detail.title} />
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="primary">
                {meta.label}
              </Chip>
              {detail.categoryName ? (
                <Chip size="sm" variant="secondary">
                  {detail.categoryName}
                </Chip>
              ) : null}
              {detail.status !== "active" ? (
                <StatusChip
                  label={detail.status === "draft" ? "Draft, visible only to you" : "Archived"} tone="warning"
                />
              ) : null}
            </div>

            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {detail.title}
            </h1>

            {detail.subtitle ? (
              <p className="text-sm text-muted">{detail.subtitle}</p>
            ) : null}

            {/*
              The way in when the thing is agreed rather than clicked.

              A service whose seller accepts questions, and anything arranged in
              the thread — every rental by default — offers the conversation here,
              before the buyer has committed to anything. The purchase panel below
              stays exactly where it is: the thread is the way most people will
              buy this, not the only way.
            */}
            {/* A rental is arranged in its own panel below — one way in, one
                action — while an ask-first service leads with the thread. */}
            {!isOwner &&
            detail.type !== "rental" &&
            (ordersInThread(detail) || attributes.serviceChat === true) ? (
              <div className="flex flex-col gap-2 rounded-2xl ls-elev-2 bg-surface-secondary/60 p-4">
                <p className="text-[13px] font-medium text-foreground">Ask the seller first</p>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Send your question about this listing and they will answer in the thread.
                </p>
                <MessageSellerButton
                  fullWidth
                  storeId={detail.storeId}
                  listingId={detail.id}
                  sellerName={detail.storeName}
                  variant="primary"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <RatingStars rating={rating.average} count={rating.count} />
              <span className="text-xs text-muted">
                {detail.viewsCount} {detail.viewsCount === 1 ? "view" : "views"}
              </span>
            </div>
          </div>

          {/*
            The way this kind of listing is actually transacted.

            A product is bought here and now. A rental is never "purchased"
            through the marketplace — it is opened, reviewed and agreed with the
            owner in the conversation, and paid later through the payment
            request the owner sends there. A ticket is bought as admission, one
            ticket per head, straight from the event — never in a cart.
          */}
          {detail.type === "rental" ? (
            <Card className="ls-elev-2">
              <Card.Content>
                <RentalPanel
                  price={detail.price}
                  currency={detail.currency}
                  rentUnit={(attributes.rentUnit as string | undefined) ?? null}
                  storeId={detail.storeId}
                  listingId={detail.id}
                  sellerName={detail.storeName}
                  ownerVisible={isOwner}
                />
              </Card.Content>
            </Card>
          ) : detail.type === "event_ticket" ? (
            <Card className="ls-elev-2">
              <Card.Content>
                {detail.eventId && ticketTypes.length > 0 ? (
                  <TicketPurchasePanel
                    defaultExpanded
                    currency={detail.currency}
                    eventId={detail.eventId}
                    ticketTypes={ticketTypes}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold tracking-tight">
                        {formatMoney(detail.price, detail.currency)}
                      </span>
                      <span className="text-sm text-muted">per ticket</span>
                    </div>
                    <InfoNote title="Tickets are sold from the event" tone="primary">
                      Admissions to this event go on sale from the event&apos;s own page, where
                      each ticket is bought directly and issued individually with its own QR
                      code. Tickets are never placed in the shopping cart.
                    </InfoNote>
                  </div>
                )}
              </Card.Content>
            </Card>
          ) : (
            <Card className="ls-elev-2">
              <Card.Content>
                <PurchasePanel
                  listingId={detail.id}
                  type={detail.type}
                  currency={detail.currency}
                  basePrice={detail.price}
                  variants={detail.variants}
                  trackInventory={detail.trackInventory}
                  stock={detail.stock}
                  fulfilment={detail.fulfilment}
                  isSignedIn={Boolean(user)}
                />
              </Card.Content>
            </Card>
          )}

          {/*
           * The seller behind the listing.
           *
           * Every product on Link Store belongs to a store, so the way out of
           * a product page is always: open the store it came from.
           */}
          <Card className="ls-elev-2">
            <Card.Content className="gap-3">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                Sold by
              </p>

              <div className="flex flex-row items-center gap-4">
                <Avatar size="lg">
                  {detail.storeLogoUrl ?? undefined ? (
                  <Avatar.Image
                    alt=""
                    className="object-contain p-2"
                    src={detail.storeLogoUrl ?? undefined}
                  />
                  ) : null}
                  <Avatar.Fallback>{detail.storeName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{detail.storeName}</p>
                  <p className="truncate text-xs text-muted">@{detail.storeSlug}</p>
                  {detail.storeTagline ? (
                    <p className="mt-0.5 truncate text-xs text-muted">{detail.storeTagline}</p>
                  ) : null}
                </div>
              </div>

              <ButtonLink fullWidth href={`/@${detail.storeSlug}`} size="md" variant="secondary">
                Open Store
              </ButtonLink>

              {/* Every listing can be talked about, not only the ones sold
                  through conversation — the quiet way to ask. */}
              {!isOwner && !(ordersInThread(detail) || attributes.serviceChat === true) ? (
                <MessageSellerButton
                  fullWidth
                  listingId={detail.id}
                  sellerName={detail.storeName}
                  storeId={detail.storeId}
                  label={`Message ${detail.storeName}`}
                  variant="secondary"
                />
              ) : null}

              <p className="text-xs text-muted">
                See everything else {detail.storeName} sells, and follow their latest listings.
              </p>
            </Card.Content>
          </Card>

          {/* Type-specific facts */}
          <Card className="ls-elev-2">
            <Card.Header className="pb-0">
              <p className="text-sm font-semibold">Details</p>
            </Card.Header>
            <Card.Content className="gap-2 text-sm">
              <Fact label="Fulfilment" value={humanize(detail.fulfilment)} />
              <Fact label="Listed" value={formatDate(detail.createdAt)} />
              {detail.sku ? <Fact label="SKU" value={detail.sku} /> : null}
              {detail.durationMinutes ? (
                <Fact label="Duration" value={formatDuration(detail.durationMinutes)} />
              ) : null}
              {detail.serviceMode ? (
                <Fact label="Delivery" value={humanize(detail.serviceMode)} />
              ) : null}
              {detail.prepTimeMinutes ? (
                <Fact label="Prep time" value={formatDuration(detail.prepTimeMinutes)} />
              ) : null}
              {detail.trackInventory ? <Fact label="In stock" value={String(detail.stock)} /> : null}
              {detail.storeCity ? (
                <Fact label="Located in"
                  value={[detail.storeCity, detail.storeCountry].filter(Boolean).join(", ")}
                />
              ) : null}
              {/* The listing's own fields, in its own words: the type's schema
                  supplies the label, and choice values are resolved to the
                  option a buyer actually picked. */}
              {describeListingAttributes(detail.type, attributes)
                .filter(({ key }) => !["currency", "prepTimeMinutes", "durationMinutes"].includes(key))
                .map(({ key, label, value }) => (
                  <Fact key={key} label={label} value={value} />
                ))}
            </Card.Content>
          </Card>
        </div>
      </div>

      {detail.description ? (
        <Card className="mt-8 ls-elev-2">
          <Card.Header>
            <p className="text-sm font-semibold">About this {meta.label.toLowerCase()}</p>
          </Card.Header>
          <Card.Content className="whitespace-pre-line text-sm text-foreground dark:text-muted">
            {detail.description}
          </Card.Content>
        </Card>
      ) : null}

      {detail.fulfilment === "digital" ? (
        <div className="mt-6">
          <InfoNote tone="primary" title="Instant digital delivery">
            After your payment is verified you will be able to download{" "}
            {detail.digitalAssets.length > 0 ? detail.digitalAssets[0].file_name : "your files"}{" "}
            from your order page. Files are stored privately and are never exposed publicly.
          </InfoNote>
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">Reviews</h2>
          <RatingStars rating={rating.average} count={rating.count} size="md" />
        </div>

        {reviews.length === 0 ? (
          <EmptyState
            compact title="No reviews yet" description="Reviews come from customers with a verified paid order, so they appear once someone has bought and reviewed this listing."
          />
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id} className="ls-elev-2">
                <Card.Content className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <Avatar.Fallback>{(review.customer_name ?? "Customer").slice(0, 1).toUpperCase()}</Avatar.Fallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {review.customer_name ?? "Verified customer"}
                      </span>
                      <Chip size="sm" variant="secondary" color="success">
                        Verified purchase
                      </Chip>
                    </div>
                    <RatingStars rating={review.rating} />
                  </div>
                  {review.title ? <p className="text-sm font-semibold">{review.title}</p> : null}
                  {review.body ? (
                    <p className="text-sm text-foreground dark:text-muted">{review.body}</p>
                  ) : null}
                  <p className="text-xs text-muted">{formatRelative(review.created_at)}</p>
                </Card.Content>
              </Card>
            ))}
          </div>
        )}

        

        <p className="text-xs text-muted">
          Only customers with a paid order for this store can leave a review.
        </p>
      </div>
    </ImageTint>
  );
}

/**
 * The rental's own panel — the listing is opened and reviewed here, and the
 * deal is agreed with the owner in the conversation.
 *
 * There is deliberately no buy button and no cart: a rental is an agreement
 * about dates, terms and a price, so the only action is the conversation. When
 * the terms are settled, the owner sends a payment request in that same chat —
 * at the agreed amount, without changing the advertised rent on the listing.
 */
function RentalPanel({
  price,
  currency,
  rentUnit,
  storeId,
  listingId,
  sellerName,
  ownerVisible,
}: {
  price: number;
  currency: string;
  rentUnit: string | null;
  storeId: string;
  listingId: string;
  sellerName: string;
  ownerVisible: boolean;
}) {
  const clean = rentUnit?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const period =
    clean === "day" || clean === "daily"
      ? "per day"
      : clean === "week" || clean === "weekly"
        ? "per week"
        : clean === "month" || clean === "monthly"
          ? "per month"
          : "per period";

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tracking-tight">{formatMoney(price, currency)}</span>
        <span className="text-sm text-muted">{period}</span>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl ls-elev-2 bg-surface-secondary/60 p-4">
        <p className="text-[13px] font-medium text-foreground">Agreed with the owner first</p>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Tell them the dates and what you need. Availability, terms and any deposit are settled
          in the conversation — nothing is charged here.
        </p>
        {ownerVisible ? null : (
          <MessageSellerButton
            fullWidth
            label="Contact Seller"
            listingId={listingId}
            sellerName={sellerName}
            storeId={storeId}
            variant="primary"
          />
        )}
      </div>

      <ul className="space-y-1.5 text-xs text-muted">
        <li>· Rentals are arranged in the conversation, not bought through the cart.</li>
        <li>· When the terms are agreed, the owner sends a payment request right there in the chat.</li>
        <li>· The advertised rent stays as listed; the agreed amount is what you pay.</li>
      </ul>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
