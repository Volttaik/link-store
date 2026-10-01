"use client";

import { useState } from "react";
import { MediaPlaceholder } from "@/components/ui/atoms";

export function ProductImage({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaPlaceholder label="Photo unavailable" />;
  // Seller-uploaded URLs use the existing media delivery path.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={title} src={src} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02]" />;
}
