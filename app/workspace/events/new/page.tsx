import { Button } from "@heroui/react/button";
import { Link } from "@heroui/react/link";
import { ButtonLink } from "@/components/ui/controls";

import { EventForm } from "@/components/workspace/EventForm";
import { PageHeader } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { requireStore } from "@/lib/auth";

export const metadata = { title: "New event" };

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const { store } = await requireStore();

  return (
    <div className="space-y-6">
      <PageHeader title="Create an event" description="Events sell through ticket types, each with its own price and capacity. Tickets are issued after payment is verified."
        breadcrumb={
          <Link href="/workspace/events" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            Events
          </Link>
        }
        actions={
          <ButtonLink href="/workspace/events" variant="secondary" size="sm">
            Cancel
          </ButtonLink>
        }
      />

      <EventForm currency={store.currency} />
    </div>
  );
}
