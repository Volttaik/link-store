"use client";

import { Button, Card, Chip } from "@heroui/react";
import { useState } from "react";

import { BackgroundPattern } from "@/components/visual/BackgroundPattern";

export function Gallery({
  images,
  title,
  fallbackLabel = "No photo yet",
}: {
  images: Array<{ id: string; image_url: string; alt: string | null }>;
  title: string;
  fallbackLabel?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  return (
    <div className="space-y-3">
      {/*
       * The product photograph is a surface, so it is clipped by the media
       * system rather than left to whatever its parent happens to do. This is
       * the product view, where the reported defect was: a full-bleed image
       * inside a rounded card, whose corners were the card's guess rather than
       * the platform's rule.
       */}
      <Card className="overflow-hidden ls-elev-2">
        <Card.Content className="p-0">
          <div className="media-frame-lg relative aspect-[4/3] w-full overflow-hidden">
            {active ? (
              <img
                alt={active.alt ?? title}
                className="z-0 h-full w-full object-cover"
                src={active.image_url}
              />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center bg-default">
                <div className="absolute inset-0 text-muted/70">
                  <BackgroundPattern id="gallery-empty" />
                </div>
                <span className="relative text-sm font-medium text-muted">
                  {fallbackLabel}
                </span>
              </div>
            )}

            {images.length > 1 ? (
              <Chip className="absolute top-3 right-3 bg-surface/90 text-foreground" size="sm" variant="primary">
                {activeIndex + 1} / {images.length}
              </Chip>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <Button
              key={image.id}
              isIconOnly variant="ghost"
              className={`h-16 w-16 overflow-hidden p-0 ${
                index === activeIndex ? "ring-2 ring-accent" : ""
              }`}
              aria-label={`Show image ${index + 1}`}
              onPress={() => setActiveIndex(index)}
            >
              <img
                alt=""
                className="media-frame h-16 w-16 object-cover"
                src={image.image_url}
              />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
