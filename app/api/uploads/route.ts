/**
 * Upload endpoint.
 *
 * Runs as a route handler rather than a server action so that binary bodies are
 * not subject to the server-action size limit, and so the same code path serves
 * images and digital product files.
 *
 * Authorization is mandatory: only a signed-in user may upload, and every key
 * is namespaced — store assets by the store, avatars by the user — so one
 * account can never address another's objects.
 */

import { NextResponse } from "next/server";

import { getCurrentUser, getStoreForUser } from "@/lib/auth";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, messageMediaFolder, putObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  const kind = formData.get("kind") === "file" ? "file" : "image";
  const folder = String(formData.get("folder") ?? "assets");
  // Digital-product files are private; everything else is a public asset.
  const visibility = kind === "file" && formData.get("visibility") === "private" ? "private" : "public";

  // Three namespaces: a profile picture and message media belong to the user
  // (no store needed), everything else is a store asset and needs the store.
  const purposeRaw = formData.get("purpose");
  const purpose =
    purposeRaw === "avatar" || purposeRaw === "message" ? purposeRaw : "store";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }

  let storageFolder: string;
  if (purpose === "avatar") {
    if (kind !== "image") {
      return NextResponse.json({ error: "Profile pictures must be images." }, { status: 400 });
    }
    storageFolder = `avatar-${user.id}`;
  } else if (purpose === "message") {
    // Message media: images, audio, video and documents — always public so both
    // parties in the conversation can render them, namespaced to the sender.
    storageFolder = messageMediaFolder(user.id);
  } else {
    const store = await getStoreForUser(user.id);
    // During onboarding the store does not exist yet, so the images for it are
    // namespaced by the user who is about to own that store. Either way the
    // namespace belongs to the uploader — one account can never address
    // another's objects.
    storageFolder = store ? `${store.id}-${folder}` : `pre${user.id}-${folder}`;
  }

  const result = await putObject(file, {
    folder: storageFolder,
    visibility,
    kind,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    key: result.object.key,
    url: result.object.url,
    fileName: result.object.fileName,
    contentType: result.object.contentType,
    size: result.object.size,
    limits: { image: MAX_IMAGE_BYTES, file: MAX_FILE_BYTES },
  });
}
