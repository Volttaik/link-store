"use client";

import { Button, Card } from "@heroui/react";
import { useEffect } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * What a shopper sees when a marketplace page fails to load.
 *
 * Shoppers have no seller context, so this says what happened, offers a retry
 * and a way back to the catalogue — and never shows a stack trace. Only the
 * page segment is replaced, so the navigation stays mounted.
 */
export default function MarketError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="ls-elev-2">
        <Card.Content className="items-start gap-4 p-6">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <Icon name="alert" size={20} />
          </span>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight">This page didn’t load</h2>
            <p className="text-sm text-muted">
              Something went wrong on our side while loading this. Your cart and orders are
              unaffected.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onPress={reset}>
              Try again
            </Button>
            <Button variant="secondary" onPress={() => window.location.assign("/")}>
              Back to marketplace
            </Button>
          </div>

          {error.digest ? (
            <p className="text-xs text-muted">
              Reference <span className="font-mono">{error.digest}</span> if you need to report it.
            </p>
          ) : null}
        </Card.Content>
      </Card>
    </div>
  );
}
