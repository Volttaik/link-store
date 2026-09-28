/**
 * Digital product delivery.
 *
 * A download grant is redeemed here. The file is streamed from private storage
 * (R2 or the local driver) and never exposed by a public URL — the token is the
 * only credential, and the grant's download count and expiry are checked before
 * a single byte is sent.
 */

import { consumeDownload } from "@/lib/server/commerce";
import { getObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const grant = await consumeDownload(token);
  if (!grant.ok) {
    return new Response(grant.error, {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const object = await getObject(grant.key);
  if (!object) {
    return new Response("That file could not be found in storage.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Encode the filename so non-ASCII names survive the header intact.
  const safeName = grant.fileName.replace(/["\\\r\n]/g, "_");

  return new Response(object.body as BodyInit, {
    headers: {
      "Content-Type": grant.contentType ?? object.contentType,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(object.body.byteLength),
      // Digital goods must never be cached by shared caches.
      "Cache-Control": "private, no-store",
    },
  });
}
