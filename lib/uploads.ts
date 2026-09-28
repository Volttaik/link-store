/**
 * Upload constraints, shared by the browser uploader and the server that
 * enforces them. The browser copy is for feedback; the server copy is the one
 * that decides.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * SVG is deliberately excluded: it can carry scripts and these files are served
 * from our own origin.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/epub+zip",
  "application/json",
  "text/plain",
  "text/csv",
  "text/markdown",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "video/mp4",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.apple.keynote",
  "application/postscript",
] as const;

export const IMAGE_ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_TYPES.join(",");
