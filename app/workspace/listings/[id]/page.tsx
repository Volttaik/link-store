import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { ListingForm } from "@/components/workspace/ListingForm";
import { ActionButton, ButtonLink } from "@/components/ui/controls";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { InfoNote } from "@/components/ui/feedback";
import { setListingStatusAction } from "@/app/actions/listings";
import { requireStore } from "@/lib/auth";
import { getOwnedListing, getListingDetail } from "@/lib/server/listings";
import { listAvailableCategories } from "@/lib/server/stores";
import { listingStatusTone, listingTypeMeta } from "@/lib/catalog";
import { formatDateTime, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListingDetail(id);
  return { title: listing ? listing.title : "Listing" };
}

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireStore();
  const { id } = await params;

  // Ownership-checked: another store's listing id resolves to nothing.
  const owned = await getOwnedListing(id, store.id);
  if (!owned) notFound();

  const [detail, categories] = await Promise.all([
    getListingDetail(id),
    listAvailableCategories(store.id),
  ]);

  if (!detail) notFound();

  const meta = listingTypeMeta(detail.type);

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.title}
        description={`${meta.label} · ${detail.viewsCount} ${detail.viewsCount === 1 ? "view" : "views"} · updated ${formatDateTime(detail.createdAt)}`}
        breadcrumb={
          <Link href="/workspace/listings" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            Listing
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              label={detail.status === "active" ? "Published" : detail.status}
              tone={listingStatusTone(detail.status)}
            />
            {detail.status === "active" ? (
              <ActionButton
                action={setListingStatusAction.bind(null, detail.id, "draft")} variant="secondary"
              >
                Unpublish
              </ActionButton>
            ) : (
              <ActionButton
                action={setListingStatusAction.bind(null, detail.id, "active")} variant="primary"
              >
                Publish
              </ActionButton>
            )}
            <ButtonLink
              href={`/listing/${detail.id}`} variant="secondary"
              isDisabled={detail.status !== "active"}
            >
              View public page
            </ButtonLink>
          </div>
        }
      />

      {detail.status !== "active" ? (
        <InfoNote
          title={
            detail.status === "draft"
              ? "This listing is a draft"
              : "This listing is archived"
          }
        >
          Only you can see it. Publish it to make it appear on your storefront and in the
          marketplace.
        </InfoNote>
      ) : null}

      {detail.trackInventory && detail.stock <= 0 ? (
        <InfoNote tone="warning" title="Out of stock">
          Customers cannot add this to their cart while stock is zero. Update stock or turn off
          inventory tracking.
        </InfoNote>
      ) : null}

      {detail.variants.length > 0 ? (
        <Card className="ls-elev-2">
          <Card.Content className="gap-2">
            <p className="text-sm font-semibold">Variant stock</p>
            <div className="flex flex-wrap gap-2">
              {detail.variants.map((variant) => (
                <Chip
                  key={variant.id} size="sm" variant="secondary"
                  color={variant.stock <= 0 ? "danger" : variant.stock <= 5 ? "warning" : "default"}
                >
                  {variant.name}: {formatNumber(variant.stock)}
                </Chip>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      <ListingForm
        key={detail.id}
        listing={detail}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        currency={store.currency}
      />
    </div>
  );
}
