import type { MetadataRoute } from "next";

/** The site's canonical origin — same source the metadata and share cards use. */
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5000";

/**
 * robots.txt — the crawler's front door.
 *
 * Everything public is open to search engines; everything private (accounts,
 * workspace, checkout, admin, the API) is politely closed. The sitemap is
 * named here so crawlers find the full map of the marketplace in one fetch.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/workspace",
          "/api/",
          "/cart",
          "/checkout",
          "/orders",
          "/messages",
          "/settings",
          "/sign-in",
          "/sign-up",
          "/verify",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
