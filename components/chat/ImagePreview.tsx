"use client";

/**
 * The image preview.
 *
 * Tapping a photo in the conversation opens the photograph itself — the whole
 * visible viewport, the image at its true proportions, nothing cropped and
 * nothing stretched. It arrives with one quiet motion and leaves the same way:
 * a tap anywhere outside, the back control, or Escape.
 *
 * It is a portal to the document body, so no layout in the conversation —
 * however it moves with the keyboard — can ever clip or displace it.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/Icon";

export function ImagePreview({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  // Escape closes — the keyboard's own "back".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      aria-label="Image preview"
      aria-modal="true"
      className="motion-safe:animate-preview-in fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
      role="dialog"
    >
      <button
        aria-label="Close preview"
        className="absolute top-4 left-4 flex size-10 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 motion-safe:active:scale-95"
        onClick={onClose}
        type="button"
      >
        <Icon name="arrowLeft" size={18} />
      </button>

      {/* The photograph is the object: contained, never cropped, never
          stretched — portrait stays portrait, landscape stays landscape. */}
      <img
        alt={alt}
        className="max-h-[86vh] max-w-[92vw] rounded-2xl object-contain shadow-elev-float"
        onClick={(event) => event.stopPropagation()}
        src={src}
      />
    </div>,
    document.body,
  );
}
