import { Link } from "@heroui/react/link";

import { ReceiptScanner } from "@/components/workspace/ReceiptScanner";
import { PageHeader } from "@/components/ui/atoms";
import { InfoNote } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { requireStore } from "@/lib/auth";

export const metadata = { title: "Verify a receipt" };

export const dynamic = "force-dynamic";

/**
 * The seller's receipt verifier.
 *
 * A customer shows their receipt QR; this page turns the code into what the
 * seller needs to decide “is this a legitimate order belonging to this person?”
 * — the order, the buyer, the items, the amount, the status — and nothing more.
 * The code is only a lookup key: the answer is re-read from the database and
 * scoped to this seller's store, so a code from another shop resolves to
 * nothing here.
 *
 * For pickup orders this is also the handover point: collection is recorded
 * once, and a completed pickup cannot be collected again.
 */
export default async function VerifyReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Ownership gate: only a signed-in seller with a store reaches this page.
  await requireStore();
  const { code } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Verify a receipt"
        description="Scan or enter the code on a customer's receipt to confirm the order before handing anything over."
        breadcrumb={
          <Link
            href="/workspace/orders"
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            All orders
          </Link>
        }
      />

      <ReceiptScanner initialCode={code ?? ""} />

      <InfoNote title="How verification works">
        A receipt QR carries only its code — no name, no address, no amount. Every scan is checked
        live against your orders on the server: the right shop, the real order, its true payment and
        fulfilment state. Pickup orders can be marked as collected here exactly once. Contact
        details are shown masked — enough to recognise your customer, nothing more.
      </InfoNote>
    </div>
  );
}
