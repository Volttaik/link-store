/**
 * Public asset delivery.
 *
 * Only keys under the `public/` prefix are reachable here. Private objects —
 * digital product files — are refused outright and can only be streamed through
 * a verified download grant.
 *
 * When R2 has a public domain configured, browsers are sent straight to R2 by
 * `publicUrlForKey` and never touch this route. It exists for local development
 * and for buckets without a public domain.
 */

import { getObject, contentTypeForKey } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const joined = key.join("/");

  if (!joined.startsWith("public/") || joined.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await getObject(joined);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body as BodyInit, {
    headers: {
      "Content-Type": contentTypeForKey(joined),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
