/**
 * Media helpers for the chat surfaces.
 *
 * The chat only ever offers what the backend actually accepts — these read the
 * same constraint lists the upload API enforces, so the attachment interaction
 * can never advertise a file type that would be refused.
 */

import {
  ALLOWED_FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  IMAGE_ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
} from "@/lib/uploads";

/** What the picker offers for photos, video and audio — exactly the supported media. */
export const MEDIA_ACCEPT_ATTRIBUTE = [
  IMAGE_ACCEPT_ATTRIBUTE,
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
].join(",");

/** What the picker offers for documents and other files. */
export const FILE_ACCEPT_ATTRIBUTE = ALLOWED_FILE_TYPES.join(",");

/** Every type a message may carry — the composer's fallback accept list. */
export const MESSAGE_ACCEPT_ATTRIBUTE = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_FILE_TYPES].join(",");

export function isImage(type: string): boolean {
  return type.startsWith("image/");
}

export function isVideo(type: string): boolean {
  return type.startsWith("video/");
}

export function isAudio(type: string): boolean {
  return type.startsWith("audio/");
}

/** The upload ceiling for one file, whichever kind it is. */
export function maxBytesFor(type: string): number {
  return isImage(type) ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Yesterday", or the day itself — one divider per day, no more. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}
