import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";

import { PageHeader, RatingStars, StatTile, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { ReviewModeration } from "@/components/workspace/ReviewModeration";
import { UrlPagination } from "@/components/workspace/UrlPagination";
import { WorkspaceFilterBar } from "@/components/workspace/WorkspaceFilterBar";
import { requireStore } from "@/lib/auth";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { countReviews, getStoreRating, listReviews } from "@/lib/server/management";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "hidden", label: "Hidden" },
];

/** How a review is standing, in the words the moderation controls use. */
const TAB_LABELS: Record<string, string> = {
  all: "Everything",
  published: "Published",
  hidden: "Hidden",
};

const PAGE_SIZE = 15;

/**
 * Reviews.
 *
 * Buyers can only review what they actually bought, so every row here traces
 * back to a real delivered order.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { store } = await requireStore();

  const status = TABS.some((tab) => tab.key === params.status) ? (params.status as string) : "all";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);

  const [total, rating] = await Promise.all([countReviews(store.id, status), getStoreRating(store.id)]);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  const reviews = await listReviews(store.id, {
    status,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  const publishedCount = status === "published" ? total : await countReviews(store.id, "published");
  const hiddenCount = status === "hidden" ? total : await countReviews(store.id, "hidden");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reviews" description="Feedback from customers who bought from your store."
        breadcrumb={
          <span className="text-xs text-muted">
            Workspace <span className="mx-1">/</span> Management <span className="mx-1">/</span> Reviews
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Store rating"
          value={
            rating.average === null ? "—" : `${rating.average.toFixed(1)} / 5`
          }
          hint={rating.count === 0 ? "No published reviews yet" : `${formatNumber(rating.count)} published`}
        />
        <StatTile label="Published" value={formatNumber(publishedCount)} hint="Visible on your storefront" />
        <StatTile label="Hidden" value={formatNumber(hiddenCount)} hint="Not shown to shoppers" />
      </div>

      <Card className="ls-elev-2">
        <Card.Header className="flex flex-col items-start gap-3">
          <div>
            <h2 className="text-lg font-semibold">All reviews</h2>
            <p className="text-sm text-muted">
              {rating.count > 0
                ? `${formatPercent((publishedCount / Math.max(publishedCount + hiddenCount, 1)) * 100)} of reviews are published.`
                : "Reviews appear here once customers rate a purchase."}
            </p>
          </div>
        </Card.Header>
        
        <Card.Content className="gap-5">
          <WorkspaceFilterBar
            basePath="/workspace/reviews"
            facets={[
              {
                kind: "select",
                key: "status",
                label: "Review state",
                description: "Published reviews are shown on your storefront.",
                value: status,
                options: TABS.map((tab) => ({
                  value: tab.key,
                  label:
                    tab.key === "all"
                      ? `${TAB_LABELS.all} · ${formatNumber(publishedCount + hiddenCount)}`
                      : `${TAB_LABELS[tab.key]} · ${formatNumber(tab.key === "published" ? publishedCount : hiddenCount)}`,
                })),
              },
            ]}
          />

          {reviews.length === 0 ? (
            <EmptyState icon="star"
              title={status === "all" ? "No reviews yet" : `No ${status} reviews`} description="Customers can review items they have purchased and received. Their feedback will land here for you to moderate."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {reviews.map((review) => (
                <div key={review.id} className="flex flex-col gap-3 pb-4 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{review.title ?? "Untitled review"}</span>
                        <StatusChip
                          label={review.status}
                          tone={review.status === "published" ? "success" : "default"}
                        />
                      </div>
                      <p className="text-xs text-muted">
                        {review.customer_name ?? "Customer"} · {formatDate(review.created_at)}
                        {review.listing_title ? ` · ${review.listing_title}` : ""}
                      </p>
                    </div>
                    <RatingStars rating={review.rating} />
                  </div>

                  {review.body ? (
                    <p className="text-sm text-foreground dark:text-muted">{review.body}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {review.listing_slug ? (
                      <Chip size="sm" variant="secondary">
                        {review.listing_slug}
                      </Chip>
                    ) : (
                      <span className="text-xs text-muted">Store review</span>
                    )}
                    <ReviewModeration
                      reviewId={review.id}
                      status={review.status}
                      customerName={review.customer_name ?? ""}
                    />
                  </div>
                </div>
              ))}

              <UrlPagination
                page={currentPage}
                totalPages={totalPages}
                summary={`Showing ${reviews.length} of ${total} reviews`}
              />
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
