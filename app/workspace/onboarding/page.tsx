import { redirect } from "next/navigation";

import { StoreOnboardingForm } from "@/components/workspace/StoreOnboardingForm";
import { Card } from "@heroui/react/card";
import { PageHeader } from "@/components/ui/atoms";
import { PatternSurface } from "@/components/visual/BackgroundPattern";
import { requireUser, getStoreForUser } from "@/lib/auth";
import { STORE_CATEGORIES } from "@/lib/catalog";

export const metadata = { title: "Create your store" };

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser("/workspace/onboarding");
  const existing = await getStoreForUser(user.id);

  // One storefront per seller account — if it exists, the workspace is ready.
  if (existing) redirect("/workspace");

  return (
    <div className="space-y-6">
      <PatternSurface id="onboarding-pattern" className="rounded-2xl ls-elev-2 bg-surface" patternClassName="text-accent/10"
      >
        <div className="px-6 py-10 sm:px-10">
          <PageHeader title="Create your storefront" description="Pick the handle that becomes your public link. You can change almost everything later, but the handle is the one thing your customers will remember."
          />
        </div>
      </PatternSurface>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
        <Card className="ls-elev-2">
          <Card.Header className="flex-col items-start gap-1">
            <p className="text-sm font-semibold">Store details</p>
            <p className="text-xs text-muted">
              Only the name and handle are required. Everything else makes your storefront more
              useful.
            </p>
          </Card.Header>
          <Card.Content>
            {/* The store's own category vocabulary — the same values the
                settings form loads, the shop filter matches and the storefront
                reads, so a category chosen here is one the rest of the platform
                recognises. */}
            <StoreOnboardingForm
              defaultEmail={user.email}
              defaultName={user.name}
              categories={STORE_CATEGORIES}
            />
          </Card.Content>
        </Card>

        <aside className="space-y-4">
          <Card className="ls-elev-2">
            <Card.Content className="gap-3 text-sm">
              <p className="font-semibold">What happens next</p>
              <ol className="space-y-3 text-muted">
                <li>
                  <span className="font-medium text-foreground">1. Your link is reserved.</span> Nobody
                  else can take your handle once you create the store.
                </li>
                <li>
                  <span className="font-medium text-foreground">2. Add listings.</span> Products, a
                  food menu, services, events with tickets, or digital files — mix them freely.
                </li>
                <li>
                  <span className="font-medium text-foreground">3. Publish.</span> Your storefront goes
                  live once at least one listing is published, so visitors never land on a dead end.
                </li>
              </ol>
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Content className="gap-2 text-sm text-muted">
              <p className="font-semibold text-foreground">Handles</p>
              <p>
                3–30 characters. Lowercase letters, numbers and <code>.</code> <code>_</code>{" "}
                <code>-</code>. Reserved words like <code>admin</code>, <code>cart</code> and{" "}
                <code>login</code> are not available.
              </p>
            </Card.Content>
          </Card>
        </aside>
      </div>
    </div>
  );
}
