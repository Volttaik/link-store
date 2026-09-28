/**
 * Signed direct-upload endpoint.
 *
 * The browser asks here before it sends a file. This route does the two things
 * only the server may do:
 *
 *   1. authorize the caller (only a signed-in user) and decide the destination
 *      namespace from *their* identity — a profile picture under their user id,
 *      a store asset under their own store, message media under their own
 *      conversation namespace. The client never chooses a key, so it can never
 *      point an upload at another account's objects.
 *   2. validate the file's declared type and size against the same rules the
 *      streaming upload enforces.
 *
 * If Cloudflare R2 is configured it returns a short-lived presigned PUT URL, so
 * the bytes travel straight from the browser to R2 and never through this
 * server. When R2 is not configured (local development) it answers
 * `{ direct: false }` and the client uses `/api/uploads` instead — the same
 * validation, the same key layout, a different pipe.
 */

import { NextResponse } from "next/server";

import { getCurrentUser, getStoreForUser } from "@/lib/auth";
import {
  createSignedUploadUrl,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  messageMediaFolder,
  planUpload,
  publicUrlForKey,
  type StorageVisibility,
} from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }

  let payload: {
    fileName?: string;
    contentType?: string;
    size?: number;
    kind?: string;
    folder?: string;
    visibility?: string;
    purpose?: string;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const kind = payload.kind === "file" ? "file" : "image";
  const folder = String(payload.folder ?? "assets");
  const visibility: StorageVisibility =
    kind === "file" && payload.visibility === "private" ? "private" : "public";

  const purposeRaw = payload.purpose;
  const purpose =
    purposeRaw === "avatar" || purposeRaw === "message" ? purposeRaw : "store";

  // Same three namespaces as the streaming route: a profile picture and message
  // media belong to the user; everything else is a store asset and needs one.
  let storageFolder: string;
  if (purpose === "avatar") {
    if (kind !== "image") {
      return NextResponse.json({ error: "Profile pictures must be images." }, { status: 400 });
    }
    storageFolder = `avatar-${user.id}`;
  } else if (purpose === "message") {
    storageFolder = messageMediaFolder(user.id);
  } else {
    const store = await getStoreForUser(user.id);
    storageFolder = store ? `${store.id}-${folder}` : `pre${user.id}-${folder}`;
  }

  const plan = planUpload({
    fileName: String(payload.fileName ?? "upload"),
    contentType: String(payload.contentType ?? ""),
    size: Number(payload.size ?? 0),
    kind,
    folder: storageFolder,
    visibility,
  });

  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: 400 });
  }

  const uploadUrl = await createSignedUploadUrl({
    key: plan.key,
    contentType: plan.contentType,
  });

  // No R2: the client sends the file through the server route instead. The
  // answer is explicit so the browser knows which pipe to use.
  if (!uploadUrl) {
    return NextResponse.json({ direct: false });
  }

  return NextResponse.json({
    direct: true,
    uploadUrl,
    method: "PUT",
    key: plan.key,
    url: visibility === "public" ? publicUrlForKey(plan.key) : "",
    fileName: String(payload.fileName ?? "upload"),
    contentType: plan.contentType,
    size: Number(payload.size ?? 0),
    limits: { image: MAX_IMAGE_BYTES, file: MAX_FILE_BYTES },
  });
}
