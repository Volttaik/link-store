/**
 * Object storage.
 *
 * Cloudflare R2 is the production target (S3-compatible API). Credentials are
 * held server-side only and are never sent to the browser.
 *
 * When R2 is not yet configured the local driver writes files to `./storage`
 * and serves them through `/api/files/…`. That is a real driver, not a stub —
 * uploads keep working end-to-end before infrastructure exists, and switching to
 * R2 is purely a matter of setting environment variables.
 *
 * Key layout:
 *   public/<folder>/<yyyy>/<mm>/<random>.<ext>    — safe to expose
 *   private/<folder>/<yyyy>/<mm>/<random>.<ext>   — only reachable through a
 *                                                   verified download grant
 */

import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { isR2Configured, r2Config, storageDriver } from "./env";
import { randomHex } from "./ids";
import {
  ALLOWED_FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
} from "./uploads";

export { MAX_FILE_BYTES, MAX_IMAGE_BYTES };

const IMAGE_TYPES = new Set<string>(ALLOWED_IMAGE_TYPES);
const FILE_TYPES = new Set<string>(ALLOWED_FILE_TYPES);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/epub+zip": "epub",
  "application/json": "json",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
};

const TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_TYPE).map(([type, ext]) => [ext, type]),
);

/** Best-effort content type for a stored key suffix. */
export function contentTypeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export type StorageVisibility = "public" | "private";

export type StoredObject = {
  key: string;
  /** Reachable URL for public objects; empty string for private objects. */
  url: string;
  fileName: string;
  contentType: string;
  size: number;
};

export type UploadResult =
  | { ok: true; object: StoredObject }
  | { ok: false; error: string };

let s3: S3Client | null = null;

function r2Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
  }
  return s3;
}

/** Absolute URL for a public key, or a server path under the local driver. */
export function publicUrlForKey(key: string): string {
  if (!key) return "";
  if (storageDriver === "local") return `/api/files/${key}`;
  if (r2Config.publicBaseUrl) return `${r2Config.publicBaseUrl}/${key}`;
  // R2 is configured but no public domain was supplied — fall through to the
  // streaming route, which can proxy the object privately.
  return `/api/files/${key}`;
}

function localRoot(): string {
  return path.join(process.cwd(), "storage");
}

function assertSafeKey(key: string): string {
  const normalised = key.replace(/^\/+/, "");
  if (
    !normalised ||
    normalised.includes("..") ||
    !/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(normalised)
  ) {
    throw new Error("Invalid storage key");
  }
  return normalised;
}

function extensionFor(fileName: string, contentType: string): string {
  const fromType = EXTENSION_BY_TYPE[contentType];
  if (fromType) return fromType;

  const fromName = path.extname(fileName).replace(".", "").toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName;

  return "bin";
}

function buildKey(folder: string, visibility: StorageVisibility, ext: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${visibility}/${safeFolderName(folder)}/${year}/${month}/${randomHex(24)}.${ext}`;
}

/** The folder part of a key, exactly as `buildKey` writes it. */
export function safeFolderName(folder: string): string {
  return folder.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "assets";
}

/**
 * True when a storage key sits inside the given upload folder.
 *
 * This is the ownership check behind message media: a sender may only attach
 * objects from their own namespace, so one account can never point a message
 * at another account's files.
 */
export function keyBelongsToFolder(key: string, folder: string): boolean {
  const normalised = key.replace(/^\/+/, "");
  if (!normalised || normalised.includes("..")) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(normalised)) return false;
  return normalised.startsWith(`public/${safeFolderName(folder)}/`);
}

/** The folder every message's media from this user lives in. */
export function messageMediaFolder(userId: string): string {
  return `msg-${userId}`;
}

export type UploadPlan =
  | { ok: true; key: string; contentType: string; maxBytes: number }
  | { ok: false; error: string };

/**
 * Decide where an upload goes and whether it is allowed — without writing it.
 *
 * Both the streaming upload and the signed direct upload resolve their key and
 * their validation here, so a file accepted at the direct-upload door is the
 * same file that would have been accepted through the server. The key is built
 * from the server-decided `folder`, never from anything the client sent, so a
 * caller can never address another account's namespace.
 */
export function planUpload(input: {
  fileName: string;
  contentType: string;
  size: number;
  kind: "image" | "file";
  folder: string;
  visibility: StorageVisibility;
}): UploadPlan {
  const contentType = (input.contentType || "application/octet-stream").toLowerCase();
  const allowed = input.kind === "image" ? IMAGE_TYPES : FILE_TYPES;
  const maxBytes = input.kind === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;

  if (input.size === 0) return { ok: false, error: "That file is empty." };

  if (!allowed.has(contentType)) {
    return {
      ok: false,
      error:
        input.kind === "image"
          ? "Unsupported image format. Use JPEG, PNG, WebP, AVIF or GIF."
          : `Unsupported file type (${contentType || "unknown"}).`,
    };
  }

  if (input.size > maxBytes) {
    return {
      ok: false,
      error: `File is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    };
  }

  return {
    ok: true,
    key: buildKey(input.folder, input.visibility, extensionFor(input.fileName, contentType)),
    contentType,
    maxBytes,
  };
}

/**
 * A short-lived, direct-to-R2 upload URL.
 *
 * The browser PUTs the bytes straight to Cloudflare R2 — the application server
 * never carries them — while the *destination key* is decided here, server-side,
 * from the caller's own namespace. The `content-type` header is signed, so R2
 * rejects a body that does not match the type this server validated. Returns
 * null when R2 is not configured, which tells the caller to use the streaming
 * fallback instead.
 */
export async function createSignedUploadUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  if (storageDriver !== "r2") return null;

  try {
    return await getSignedUrl(
      r2Client(),
      new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
      {
        expiresIn: Math.min(Math.max(input.expiresInSeconds ?? 300, 30), 3600),
        signableHeaders: new Set(["content-type"]),
      },
    );
  } catch {
    // A signing failure is not a broken upload: the caller falls back to the
    // streaming path, which needs no signed URL at all.
    return null;
  }
}

/**
 * Store an uploaded file.
 *
 * `kind` selects the validation rules: images are restricted to safe raster
 * formats, files allow the document/archive/audio types a seller may deliver.
 */
export async function putObject(
  file: File,
  options: { folder: string; visibility: StorageVisibility; kind: "image" | "file" },
): Promise<UploadResult> {
  const plan = planUpload({
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    kind: options.kind,
    folder: options.folder,
    visibility: options.visibility,
  });

  if (!plan.ok) return { ok: false, error: plan.error };

  const contentType = plan.contentType;
  const key = plan.key;
  const body = Buffer.from(await file.arrayBuffer());

  try {
    if (storageDriver === "r2") {
      await r2Client().send(
        new PutObjectCommand({
          Bucket: r2Config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.byteLength,
        }),
      );
    } else {
      const target = path.join(localRoot(), key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    }
  } catch (error) {
    console.error("[uploads] Upload failed", error);
    return { ok: false, error: "Your file could not be uploaded. Please try again." };
  }

  return {
    ok: true,
    object: {
      key,
      url: options.visibility === "public" ? publicUrlForKey(key) : "",
      fileName: file.name,
      contentType,
      size: body.byteLength,
    },
  };
}

/** Read a stored object. Used to stream private downloads. */
export async function getObject(
  rawKey: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const key = assertSafeKey(rawKey);

  try {
    if (storageDriver === "r2") {
      const result = await r2Client().send(
        new GetObjectCommand({ Bucket: r2Config.bucket, Key: key }),
      );

      if (!result.Body) return null;

      const bytes = await result.Body.transformToByteArray();
      return { body: bytes, contentType: result.ContentType ?? "application/octet-stream" };
    }

    const file = await readFile(path.join(localRoot(), key));
    return { body: new Uint8Array(file), contentType: contentTypeForKey(key) };
  } catch {
    return null;
  }
}

export async function deleteObject(rawKey: string): Promise<void> {
  let key: string;
  try {
    key = assertSafeKey(rawKey);
  } catch {
    return;
  }

  try {
    if (storageDriver === "r2") {
      await r2Client().send(new DeleteObjectCommand({ Bucket: r2Config.bucket, Key: key }));
    } else {
      await unlink(path.join(localRoot(), key));
    }
  } catch {
    // Deleting an already-absent object is not an error worth surfacing.
  }
}

export type StorageStatus = {
  driver: "r2" | "local";
  configured: boolean;
  message: string;
};

export function storageStatus(): StorageStatus {
  if (isR2Configured) {
    return {
      driver: "r2",
      configured: true,
      message: `Uploads are stored in Cloudflare R2 (bucket “${r2Config.bucket}”).`,
    };
  }

  return {
    driver: "local",
    configured: false,
    message:
      "Cloudflare R2 is not configured, so uploads are being written to local disk. " +
      "Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME to store files in R2.",
  };
}
